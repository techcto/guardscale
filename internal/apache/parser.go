package apache

import (
	"fmt"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Request struct {
	Time                                                          time.Time `json:"time"`
	ClientIP, PeerIP, Host, Method, URI, Path, UserAgent, Referer string
	Status                                                        int
	Bytes                                                         int64
	Duration                                                      time.Duration
	TrustedProxy, OriginVerified                                  bool
}
type Parser struct {
	trusted   []netip.Prefix
	protected map[string]bool
}

func New(trusted, protected []string) (*Parser, error) {
	p := &Parser{protected: map[string]bool{}}
	for _, s := range trusted {
		x, e := netip.ParsePrefix(s)
		if e != nil {
			return nil, e
		}
		p.trusted = append(p.trusted, x)
	}
	for _, h := range protected {
		p.protected[strings.ToLower(h)] = true
	}
	return p, nil
}
func (p *Parser) trustedPeer(s string) bool {
	a, e := netip.ParseAddr(s)
	if e != nil {
		return false
	}
	for _, n := range p.trusted {
		if n.Contains(a) {
			return true
		}
	}
	return false
}

// ParseGuardian parses tab-separated Guardian format: RFC3339, XFF, peer, host,
// method, URI, status, bytes, duration_ms, referer, UA, verification-valid.
func (p *Parser) ParseGuardian(line string) (Request, error) {
	f := strings.Split(line, "\t")
	if len(f) != 12 {
		return Request{}, fmt.Errorf("guardian format: got %d fields, want 12", len(f))
	}
	t, e := time.Parse(time.RFC3339Nano, f[0])
	if e != nil {
		return Request{}, e
	}
	status, e := strconv.Atoi(f[6])
	if e != nil {
		return Request{}, e
	}
	bytes, e := strconv.ParseInt(f[7], 10, 64)
	if e != nil {
		return Request{}, e
	}
	ms, e := strconv.ParseFloat(f[8], 64)
	if e != nil {
		return Request{}, e
	}
	r := Request{Time: t, PeerIP: f[2], Host: strings.ToLower(f[3]), Method: f[4], URI: f[5], Status: status, Bytes: bytes, Duration: time.Duration(ms * float64(time.Millisecond)), Referer: f[9], UserAgent: f[10], OriginVerified: f[11] == "valid"}
	r.TrustedProxy = p.trustedPeer(r.PeerIP)
	r.ClientIP = r.PeerIP
	if r.TrustedProxy {
		r.ClientIP = clientFromXFF(f[1], p.trusted)
	}
	if u, e := url.ParseRequestURI(r.URI); e == nil {
		r.Path = u.Path
	}
	return r, nil
}
func clientFromXFF(xff string, trusted []netip.Prefix) string {
	parts := strings.Split(xff, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		s := strings.TrimSpace(parts[i])
		a, e := netip.ParseAddr(s)
		if e != nil {
			continue
		}
		ok := false
		for _, n := range trusted {
			if n.Contains(a) {
				ok = true
				break
			}
		}
		if !ok {
			return s
		}
	}
	return ""
}

// ParseCombined supports the common combined log shape; peer identity is never inferred as forwarded.
func (p *Parser) ParseCombined(line string) (Request, error) {
	parts := strings.Split(line, "\"")
	if len(parts) < 6 {
		return Request{}, fmt.Errorf("invalid combined log")
	}
	pre := strings.Fields(parts[0])
	if len(pre) < 4 {
		return Request{}, fmt.Errorf("invalid combined prefix")
	}
	ts := strings.TrimPrefix(strings.Join(pre[3:], " "), "[")
	ts = strings.TrimSuffix(ts, "] ")
	t, e := time.Parse("02/Jan/2006:15:04:05 -0700", ts)
	if e != nil {
		return Request{}, e
	}
	req := strings.Fields(parts[1])
	post := strings.Fields(parts[2])
	if len(req) < 2 || len(post) < 2 {
		return Request{}, fmt.Errorf("invalid combined fields")
	}
	status, e := strconv.Atoi(post[0])
	if e != nil {
		return Request{}, e
	}
	b, _ := strconv.ParseInt(post[1], 10, 64)
	u, _ := url.ParseRequestURI(req[1])
	return Request{Time: t, ClientIP: pre[0], PeerIP: pre[0], Method: req[0], URI: req[1], Path: u.Path, Status: status, Bytes: b, Referer: parts[3], UserAgent: parts[5]}, nil
}
