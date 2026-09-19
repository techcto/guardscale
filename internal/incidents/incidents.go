package incidents

import (
	"encoding/json"
	"fmt"
	"github.com/guardian-us/guardian/internal/apache"
	"github.com/guardian-us/guardian/internal/detection"
	"github.com/guardian-us/guardian/internal/phpfpm"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type State string

const (
	Normal    State = "NORMAL"
	Watch     State = "WATCH"
	Warning   State = "WARNING"
	Protect   State = "PROTECT"
	Survival  State = "SURVIVAL"
	Emergency State = "EMERGENCY"
)

type Transition struct {
	From, To State
	At       time.Time
	Reason   string
}
type Incident struct {
	SchemaVersion          int `json:"schema_version"`
	ID, ServerID, TenantID string
	StartedAt, LastSeen    time.Time
	State                  State
	Detections             []detection.Finding
	Timeline               []Transition
	RequestCount           int
	EvidenceLines          int
}

func StateFor(fs []detection.Finding) State {
	critical, warn := 0, 0
	for _, f := range fs {
		if f.Severity == detection.Critical {
			critical++
		} else if f.Severity == detection.Warning {
			warn++
		}
	}
	if critical >= 4 {
		return Emergency
	}
	if critical >= 2 {
		return Survival
	}
	if critical == 1 {
		return Protect
	}
	if warn >= 2 {
		return Warning
	}
	if warn == 1 {
		return Watch
	}
	return Normal
}
func New(server, tenant string, fs []detection.Finding, now time.Time) Incident {
	id := fmt.Sprintf("inc-%s", now.UTC().Format("20060102T150405.000000000"))
	st := StateFor(fs)
	return Incident{SchemaVersion: 1, ID: id, ServerID: server, TenantID: tenant, StartedAt: now, LastSeen: now, State: st, Detections: fs, Timeline: []Transition{{From: Normal, To: st, At: now, Reason: "correlated detector findings"}}}
}
func WriteBundle(root string, in Incident, req []apache.Request, php []phpfpm.Event, max int) (string, error) {
	dir := filepath.Join(root, "incidents", in.ID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	if len(req) > max {
		req = req[len(req)-max:]
	}
	if len(php) > max {
		php = php[len(php)-max:]
	}
	in.RequestCount = len(req)
	in.EvidenceLines = len(req) + len(php)
	files := map[string]any{"incident.json": in, "traffic.json": redact(req), "application.json": php, "timeline.json": in.Timeline, "actions.json": []any{}}
	for n, v := range files {
		b, e := json.MarshalIndent(v, "", "  ")
		if e != nil {
			return "", e
		}
		if e = os.WriteFile(filepath.Join(dir, n), append(b, '\n'), 0600); e != nil {
			return "", e
		}
	}
	return dir, nil
}
func redact(in []apache.Request) []apache.Request {
	out := make([]apache.Request, len(in))
	for i, r := range in {
		r.URI = redactURI(r.URI)
		r.Referer = ""
		r.UserAgent = fingerprint(r.UserAgent)
		out[i] = r
	}
	return out
}
func redactURI(s string) string {
	if i := strings.IndexByte(s, '?'); i >= 0 {
		return s[:i] + "?<redacted>"
	}
	return s
}
func fingerprint(s string) string {
	if s == "" {
		return ""
	}
	var h uint64 = 1469598103934665603
	for i := range s {
		h ^= uint64(s[i])
		h *= 1099511628211
	}
	return fmt.Sprintf("ua-%016x", h)
}
func List(root string) ([]string, error) {
	e, err := os.ReadDir(filepath.Join(root, "incidents"))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, x := range e {
		if x.IsDir() {
			ids = append(ids, x.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(ids)))
	return ids, nil
}
