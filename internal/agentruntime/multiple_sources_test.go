package agentruntime

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/techcto/guardscale/internal/agentclient"
	"github.com/techcto/guardscale/internal/apache"
	"github.com/techcto/guardscale/internal/config"
)

func sourceRequests(ip string, count int, suspicious bool, now time.Time) []apache.Request {
	var requests []apache.Request
	for i := 0; i < count; i++ {
		uri := "/"
		if suspicious {
			uri = fmt.Sprintf("/local-probe-%d?table_filter=test", i)
		}
		requests = append(requests, apache.Request{Time: now, ClientIP: ip, URI: uri, Path: "/local-probe", Status: 200, UserAgent: "local-test"})
	}
	return requests
}

func TestSourceCooldownDoesNotHideAnotherAddress(t *testing.T) {
	now := time.Now()
	requests := append(sourceRequests("198.51.100.20", 60, true, now), sourceRequests("198.51.100.21", 30, true, now)...)
	requests = append(requests, sourceRequests("198.51.100.22", 40, false, now)...)
	reviews := sourceReviews(requests, config.Default(), map[string]time.Time{"198.51.100.20": now.Add(time.Minute)}, now, 5)
	if len(reviews) != 1 || reviews[0].IP != "198.51.100.21" {
		t.Fatalf("cooldown hid or misattributed another source: %#v", reviews)
	}
	for _, finding := range reviews[0].Findings {
		if finding.Metrics["requests"] != 30 || finding.Metrics["unique_ips"] != 1 {
			t.Fatal("source finding used another address's evidence")
		}
	}
}

func TestDistributedReviewDoesNotInventAProtectionCandidate(t *testing.T) {
	now := time.Now()
	var requests []apache.Request
	for i := 0; i < 30; i++ {
		group := sourceRequests(fmt.Sprintf("198.51.100.%d", i+30), 2, true, now)
		for j := range group {
			group[j].URI = fmt.Sprintf("/local-%d-%d?table_filter=test", i, j)
		}
		requests = append(requests, group...)
	}
	reviews := sourceReviews(requests, config.Default(), map[string]time.Time{}, now, 5)
	if len(reviews) != 1 || reviews[0].IP != "" {
		t.Fatal("distributed evidence must remain a source-less review")
	}
	if len(sourceReviews(requests, config.Default(), map[string]time.Time{}, now, 0)) != 0 {
		t.Fatal("exceeded source review budget")
	}
}

func TestResponderBoundsSourceAlertsAcrossRepeatedEvaluations(t *testing.T) {
	c := config.Default()
	c.Server.ID = "local-test"
	c.Storage.StateDir = t.TempDir()
	r := newResponder(c, agentclient.Client{})
	now := time.Now()
	for i := 0; i < 6; i++ {
		r.requests = append(r.requests, sourceRequests(fmt.Sprintf("198.51.100.%d", i+20), 40, true, now)...)
	}
	r.evaluate(context.Background())
	if len(r.emissions) != 5 || len(r.cooldown) != 5 {
		t.Fatalf("expected five bounded source alerts, got %d", len(r.emissions))
	}
	r.evaluate(context.Background())
	if len(r.emissions) != 5 {
		t.Fatal("repeated evaluation exceeded per-minute alert budget")
	}
}
