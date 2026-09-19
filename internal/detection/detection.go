package detection

import (
	"fmt"
	"github.com/guardian-us/guardian/internal/apache"
	"github.com/guardian-us/guardian/internal/config"
	"github.com/guardian-us/guardian/internal/phpfpm"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Severity string

const (
	Info     Severity = "info"
	Warning  Severity = "warning"
	Critical Severity = "critical"
)

type Finding struct {
	Name               string             `json:"name"`
	Severity           Severity           `json:"severity"`
	Confidence         float64            `json:"confidence"`
	Evidence           []string           `json:"evidence"`
	FirstSeen          time.Time          `json:"first_seen"`
	LastSeen           time.Time          `json:"last_seen"`
	Metrics            map[string]float64 `json:"metrics"`
	RecommendedActions []string           `json:"recommended_actions"`
}
type Snapshot struct {
	Start       time.Time        `json:"start"`
	End         time.Time        `json:"end"`
	Requests    []apache.Request `json:"-"`
	PHP         []phpfpm.Event   `json:"-"`
	BaselineRPM float64          `json:"baseline_rpm"`
}

func Evaluate(s Snapshot, c config.Config) []Finding {
	if len(s.Requests) == 0 {
		return nil
	}
	first, last := s.Requests[0].Time, s.Requests[len(s.Requests)-1].Time
	mins := last.Sub(first).Minutes()
	if mins < 1 {
		mins = 1
	}
	rpm := float64(len(s.Requests)) / mins
	ips, urls, paths, uas, pages := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]int{}, map[int]bool{}
	fails := 0
	direct := 0
	expensive := 0
	protected := map[string]bool{}
	for _, h := range c.Origin.ProtectedHosts {
		protected[strings.ToLower(h)] = true
	}
	exp := map[string]bool{}
	for _, x := range c.Detection.ExpensiveQueryParameters {
		exp[x] = true
	}
	for _, r := range s.Requests {
		ips[r.ClientIP] = true
		urls[r.URI] = true
		paths[r.Path] = true
		uas[r.UserAgent]++
		if r.Status == 504 {
			fails++
		}
		if protected[strings.ToLower(r.Host)] && !r.OriginVerified {
			direct++
		}
		u, _ := url.Parse(r.URI)
		for k, v := range u.Query() {
			if exp[k] {
				expensive++
			}
			if k == "page" && len(v) > 0 {
				if n, e := strconv.Atoi(v[0]); e == nil {
					pages[n] = true
				}
			}
		}
	}
	base := s.BaselineRPM
	if base < 1 {
		base = 60
	}
	m := map[string]float64{"requests": float64(len(s.Requests)), "rpm": rpm, "unique_ips": float64(len(ips)), "unique_urls": float64(len(urls)), "504_percent": 100 * float64(fails) / float64(len(s.Requests))}
	var out []Finding
	add := func(n string, sev Severity, conf float64, ev string) {
		out = append(out, Finding{Name: n, Severity: sev, Confidence: conf, Evidence: []string{ev}, FirstSeen: first, LastSeen: last, Metrics: m, RecommendedActions: recommend(n)})
	}
	if rpm >= base*c.Detection.TrafficMultiplierWarning && len(s.Requests) >= 100 {
		add("TrafficSpike", Warning, .95, fmt.Sprintf("rate %.0f rpm is %.1fx baseline", rpm, rpm/base))
	}
	if len(s.Requests) >= 20 && m["504_percent"] >= c.Detection.Warning504Percent {
		sev := Warning
		if m["504_percent"] >= c.Detection.Critical504Percent {
			sev = Critical
		}
		add("HTTPFailureSpike", sev, .98, fmt.Sprintf("504 responses %.1f%%", m["504_percent"]))
	}
	if len(urls) >= 100 || float64(len(urls)) > .5*float64(len(s.Requests)) {
		add("UniqueURLStorm", Warning, .9, fmt.Sprintf("%d unique URLs", len(urls)))
	}
	if len(pages) >= 20 {
		max := 0
		for n := range pages {
			if n > max {
				max = n
			}
		}
		if max >= 50 {
			add("PaginationEnumeration", Warning, .95, fmt.Sprintf("%d distinct page values, deepest %d", len(pages), max))
		}
	}
	if direct >= 10 {
		add("DirectOriginAccess", Critical, .99, fmt.Sprintf("%d protected-host requests lacked valid verification", direct))
	}
	if expensive >= 10 {
		add("QueryParameterAbuse", Warning, .9, fmt.Sprintf("%d requests used configured expensive parameter names", expensive))
	}
	maxUA := 0
	for _, n := range uas {
		if n > maxUA {
			maxUA = n
		}
	}
	if len(ips) >= 25 && len(urls) >= 50 && maxUA >= 50 {
		add("DistributedCrawler", Critical, .92, fmt.Sprintf("%d clients traversed %d URLs with a shared UA pattern", len(ips), len(urls)))
	}
	sigs := map[string]int{}
	slow, warn := 0, 0
	for _, e := range s.PHP {
		if e.Kind == "slow" || e.Signature != "" {
			slow++
		}
		if e.Kind == "busy" || e.Kind == "max_children" {
			warn++
		}
		if e.Signature != "" {
			sigs[e.Signature]++
		}
	}
	if slow >= 5 || warn >= 1 {
		add("PHPSaturation", Critical, .9, fmt.Sprintf("%d slow events and %d saturation warnings", slow, warn))
	}
	for sig, n := range sigs {
		if n >= 5 {
			add("SlowStackStorm", Critical, .95, fmt.Sprintf("normalized stack %q repeated %d times", sig, n))
			break
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}
func recommend(n string) []string {
	switch n {
	case "DirectOriginAccess":
		return []string{"verify CDN/origin routing and origin-verification policy"}
	case "PHPSaturation", "SlowStackStorm":
		return []string{"capture evidence before considering a rate-limited PHP-FPM reload"}
	default:
		return []string{"review evidence and consider a temporary dry-run shedding policy"}
	}
}
