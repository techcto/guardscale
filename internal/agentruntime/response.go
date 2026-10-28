package agentruntime

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/techcto/guardscale/internal/agentclient"
	"github.com/techcto/guardscale/internal/apache"
	"github.com/techcto/guardscale/internal/config"
	"github.com/techcto/guardscale/internal/detection"
	"github.com/techcto/guardscale/internal/uploader"
)

type candidate struct {
	IP      string
	Expires time.Time
}
type responder struct {
	c          config.Config
	client     agentclient.Client
	requests   []apache.Request
	candidates map[string]candidate
	cooldown   map[string]time.Time
	renewed    map[string]renewalReceipt
	traffic    map[string]uint64
	emissions  []time.Time
}
type renewalReceipt struct {
	Expiry  time.Time
	Packets uint64
}

func newResponder(c config.Config, client agentclient.Client) *responder {
	r := &responder{c: c, client: client, candidates: map[string]candidate{}, cooldown: map[string]time.Time{}, renewed: map[string]renewalReceipt{}, traffic: map[string]uint64{}}
	b, err := os.ReadFile(filepath.Join(c.Storage.StateDir, "response-candidates.json"))
	if err == nil {
		_ = json.Unmarshal(b, &r.candidates)
	}
	return r
}
func (r *responder) add(request apache.Request) {
	r.requests = append(r.requests, request)
	if len(r.requests) > 1000 {
		r.requests = r.requests[len(r.requests)-1000:]
	}
}
func (r *responder) evaluate(ctx context.Context) {
	now := time.Now().UTC()
	recent := r.requests[:0]
	for _, q := range r.requests {
		if now.Sub(q.Time) < time.Minute {
			recent = append(recent, q)
		}
	}
	r.requests = recent
	if len(recent) < 20 {
		return
	}
	kept := r.emissions[:0]
	for _, at := range r.emissions {
		if now.Sub(at) < time.Minute {
			kept = append(kept, at)
		}
	}
	r.emissions = kept
	// Per-source cooldown never hides a different source. Bound AI/alert fanout.
	for _, review := range sourceReviews(recent, r.c, r.cooldown, now, 5-len(kept)) {
		r.emitReview(now, review.IP, review.Findings, review.BlockReason)
	}
	for key, until := range r.cooldown {
		if now.After(until) {
			delete(r.cooldown, key)
		}
	}
}

type sourceReview struct {
	IP          string
	Findings    []detection.Finding
	BlockReason string
}

func sourceReviews(requests []apache.Request, c config.Config, cooldown map[string]time.Time, now time.Time, limit int) []sourceReview {
	if limit < 1 {
		return nil
	}
	groups := map[string][]apache.Request{}
	for _, request := range requests {
		groups[request.ClientIP] = append(groups[request.ClientIP], request)
	}
	ips := make([]string, 0, len(groups))
	for ip := range groups {
		ips = append(ips, ip)
	}
	sort.Slice(ips, func(i, j int) bool {
		if len(groups[ips[i]]) == len(groups[ips[j]]) {
			return ips[i] < ips[j]
		}
		return len(groups[ips[i]]) > len(groups[ips[j]])
	})
	var reviews []sourceReview
	specific := false
	for _, ip := range ips {
		if len(groups[ip]) < 20 || ip == "" {
			continue
		}
		findings := detection.Evaluate(detection.Snapshot{Start: now.Add(-time.Minute), End: now, Requests: groups[ip]}, c)
		if len(findings) == 0 {
			continue
		}
		specific = true
		if now.Before(cooldown[ip]) || len(reviews) >= limit {
			continue
		}
		reason := ""
		for _, request := range groups[ip] {
			if request.TrustedProxy || request.PeerIP != "" && request.PeerIP != request.ClientIP {
				reason = "proxied_source_requires_edge_or_http_filter"
				break
			}
		}
		reviews = append(reviews, sourceReview{IP: ip, Findings: findings, BlockReason: reason})
	}
	// Distributed evidence without an independently supported source stays advisory.
	if !specific && !now.Before(cooldown[""]) {
		findings := detection.Evaluate(detection.Snapshot{Start: now.Add(-time.Minute), End: now, Requests: requests}, c)
		if len(findings) > 0 {
			reviews = append(reviews, sourceReview{Findings: findings})
		}
	}
	return reviews
}

func (r *responder) emitReview(now time.Time, ip string, findings []detection.Finding, blockReason string) {
	digest := sha256.Sum256([]byte(r.c.Server.ID + ip + now.String()))
	id := hex.EncodeToString(digest[:16])
	if ip != "" && blockReason == "" {
		r.candidates[id] = candidate{IP: ip, Expires: now.Add(15 * time.Minute)}
	}
	for key, c := range r.candidates {
		if now.After(c.Expires) {
			delete(r.candidates, key)
		}
	}
	if os.MkdirAll(r.c.Storage.StateDir, 0700) != nil {
		return
	}
	b, _ := json.Marshal(r.candidates)
	if os.WriteFile(filepath.Join(r.c.Storage.StateDir, "response-candidates.json"), b, 0600) != nil {
		return
	}
	// Raw logs stay local; bounded findings and source context are private organization evidence.
	payload := map[string]any{"id": id, "server_id": r.c.Server.ID, "state": "review", "started_at": now.Format(time.RFC3339Nano), "findings": findings}
	payload["request_samples"] = requestSamples(r.requests, ip, now)
	if blockReason != "" {
		payload["protection_blocked_reason"] = blockReason
	}
	if ip != "" {
		if blockReason == "" {
			payload["candidate_id"] = id
		}
		payload["source_ip"] = ip
	}
	if err := r.outbox().Enqueue("/api/v1/agents/incidents", payload); err != nil {
		slog.Warn("incident spool failed", "incident_id", id)
		return
	}
	r.cooldown[ip] = now.Add(5 * time.Minute)
	r.emissions = append(r.emissions, now)
}
func (r *responder) outbox() uploader.Queue {
	return uploader.Queue{Dir: filepath.Join(r.c.Storage.StateDir, "incident-outbox"), Endpoint: r.c.ControlPlane.Endpoint, Token: r.client.Token, MaxItems: 100, Client: &http.Client{Timeout: 40 * time.Second}}
}
func (r *responder) deliver(ctx context.Context) {
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			call, cancel := context.WithTimeout(ctx, 40*time.Second)
			if err := r.outbox().Flush(call); err != nil && ctx.Err() == nil {
				slog.Warn("incident upload deferred; bounded spool retained")
			}
			cancel()
		}
	}
}
func permittedTarget(address string, allowed []string) bool {
	ip, err := netip.ParseAddr(address)
	if err != nil || !ip.Is4() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	for _, s := range allowed {
		p, e := netip.ParsePrefix(s)
		if e == nil && p.Bits() >= 24 && p.Contains(ip) {
			return true
		}
	}
	return false
}
func (r *responder) poll(ctx context.Context) {
	commands, err := r.client.Commands(ctx)
	if err != nil {
		return
	}
	for _, command := range commands {
		if command.Kind == "revoke" {
			c, ok := r.candidates[command.CandidateID]
			if !ok || !permittedTarget(c.IP, r.c.Protection.AllowedCIDRs) {
				_ = r.client.CommandResult(ctx, command.ID, "failed")
				continue
			}
			call, cancel := context.WithTimeout(ctx, 3*time.Second)
			err := exec.CommandContext(call, "ipset", "del", "guardscale_temporary", c.IP, "-exist").Run()
			cancel()
			if err != nil {
				_ = r.client.CommandResult(ctx, command.ID, "failed")
			} else {
				delete(r.renewed, command.ID)
				_ = r.client.CommandResult(ctx, command.ID, "cancelled")
			}
			continue
		}
		if command.Kind == "inspect_server" {
			expiry, e := time.Parse(time.RFC3339Nano, command.ExpiresAt)
			if e != nil || time.Now().After(expiry) {
				_ = r.client.CommandResult(ctx, command.ID, "expired")
				continue
			}
			result := map[string]string{"recent_requests": strconv.Itoa(len(r.requests)), "protection_enabled": strconv.FormatBool(r.c.Protection.Enabled && !r.c.Protection.DryRun)}
			for source, path := range map[string]string{"apache_access": r.c.Logs.ApacheAccess, "apache_error": r.c.Logs.ApacheError, "php_error": r.c.Logs.PHPError, "php_slow": r.c.Logs.PHPSlow} {
				f, e := os.Open(path)
				if e != nil {
					result[source] = "unavailable"
				} else {
					_ = f.Close()
					result[source] = "readable"
				}
			}
			_ = r.client.InspectionResult(ctx, command.ID, result)
			continue
		}
		if command.Kind != "protect" || !r.c.Protection.Enabled || r.c.Protection.DryRun {
			continue
		}
		c, ok := r.candidates[command.CandidateID]
		expiry, e := time.Parse(time.RFC3339Nano, command.ExpiresAt)
		if command.Status == "applied" && e == nil && time.Now().Before(expiry) {
			if ok && permittedTarget(c.IP, r.c.Protection.AllowedCIDRs) {
				r.renew(ctx, command, c.IP, expiry)
			}
			continue
		}
		ttl := int(time.Until(expiry).Seconds())
		if e == nil && ttl < 1 {
			_ = r.client.CommandResult(ctx, command.ID, "expired")
			continue
		}
		if !ok || time.Now().After(c.Expires) || e != nil || ttl > 900 || !permittedTarget(c.IP, r.c.Protection.AllowedCIDRs) {
			_ = r.client.CommandResult(ctx, command.ID, "rejected")
			continue
		}
		// Kernel-enforced timeouts survive agent failure/restart. Scope only inbound HTTP(S).
		run := func(name string, args ...string) error {
			call, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()
			return exec.CommandContext(call, name, args...).Run()
		}
		err = run("ipset", "create", "guardscale_temporary", "hash:ip", "family", "inet", "timeout", "900", "maxelem", "1000", "counters", "-exist")
		if err != nil {
			err = run("ipset", "create", "guardscale_temporary", "hash:ip", "family", "inet", "timeout", "900", "maxelem", "1000", "-exist")
		}
		rule := []string{"INPUT", "-p", "tcp", "-m", "multiport", "--dports", "80,443", "-m", "set", "--match-set", "guardscale_temporary", "src", "-j", "REJECT"}
		if err == nil && run("iptables", append([]string{"-w", "2", "-C"}, rule...)...) != nil {
			err = run("iptables", append([]string{"-w", "2", "-I"}, rule...)...)
		}
		if err == nil {
			err = run("ipset", "add", "guardscale_temporary", c.IP, "timeout", strconv.Itoa(ttl), "-exist")
		}
		status := "applied"
		if err != nil {
			status = "failed"
		}
		_ = r.client.CommandResult(ctx, command.ID, status)
	}
}

// Counters belong to this blocked source, not aggregate server traffic. An old
// set without counters cannot renew; its existing kernel timeout still applies.
func blockedCounters(output, ip string) (uint64, uint64, bool) {
	for _, line := range strings.Split(output, "\n") {
		f := strings.Fields(line)
		if len(f) < 3 || f[0] != "add" || f[1] != "guardscale_temporary" || f[2] != ip {
			continue
		}
		var packets, bytes uint64
		found := false
		for i := 3; i+1 < len(f); i++ {
			if f[i] == "packets" {
				v, e := strconv.ParseUint(f[i+1], 10, 64)
				if e != nil {
					return 0, 0, false
				}
				packets = v
				found = true
			}
			if f[i] == "bytes" {
				v, e := strconv.ParseUint(f[i+1], 10, 64)
				if e != nil {
					return 0, 0, false
				}
				bytes = v
			}
		}
		return packets, bytes, found
	}
	return 0, 0, false
}
func renewalExpiry(now, expiry, cap time.Time, seconds int, packets, previous uint64) (time.Time, bool) {
	if !now.Before(expiry) || expiry.Sub(now) > 20*time.Second || seconds < 10 || seconds > 900 || packets < previous || packets-previous < 3 {
		return time.Time{}, false
	}
	next := now.Add(time.Duration(seconds) * time.Second)
	if next.After(cap) {
		next = cap
	}
	return next, next.After(expiry.Add(5 * time.Second))
}
func (r *responder) renew(ctx context.Context, command agentclient.Command, ip string, expiry time.Time) {
	if pending, ok := r.renewed[command.ID]; ok {
		if pending.Expiry.After(expiry) {
			_ = r.client.RenewalResult(ctx, command.ID, pending.Expiry.Format(time.RFC3339Nano), pending.Packets)
			return
		}
		delete(r.renewed, command.ID)
	}
	call, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	output, err := exec.CommandContext(call, "ipset", "save", "guardscale_temporary").Output()
	if err != nil {
		return
	}
	packets, bytes, ok := blockedCounters(string(output), ip)
	if !ok {
		return
	}
	if packets > r.traffic[command.ID] {
		delta := packets - r.traffic[command.ID]
		if r.client.Event(ctx, "protection.traffic", map[string]string{"command_id": command.ID, "blocked_packets": strconv.FormatUint(packets, 10), "new_blocked_packets": strconv.FormatUint(delta, 10), "message": "Firewall rejected " + strconv.FormatUint(delta, 10) + " new packets from the protected source; total " + strconv.FormatUint(packets, 10)}) == nil {
			r.traffic[command.ID] = packets
		}
	}
	if !command.RenewalEnabled {
		return
	}
	cap, e := time.Parse(time.RFC3339Nano, command.RenewalUntil)
	if e != nil {
		return
	}
	next, ok := renewalExpiry(time.Now(), expiry, cap, command.RenewalSeconds, packets, command.BlockedPackets)
	if !ok {
		return
	}
	// Preserve the monotonic packet counter while refreshing only the same source.
	err = exec.CommandContext(call, "ipset", "add", "guardscale_temporary", ip, "timeout", strconv.Itoa(int(time.Until(next).Seconds())), "packets", strconv.FormatUint(packets, 10), "bytes", strconv.FormatUint(bytes, 10), "-exist").Run()
	if err != nil {
		return
	}
	r.renewed[command.ID] = renewalReceipt{Expiry: next, Packets: packets}
	_ = r.client.RenewalResult(ctx, command.ID, next.Format(time.RFC3339Nano), packets)
}
