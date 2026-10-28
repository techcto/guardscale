package agentruntime

import (
	"github.com/techcto/guardscale/internal/apache"
	"strings"
	"testing"
	"time"
)

func TestRequestSamplesAreBoundedSourceScopedAndOmitSecrets(t *testing.T) {
	now := time.Now()
	requests := []apache.Request{}
	add := func(ip, path string, status int, at time.Time) {
		requests = append(requests, apache.Request{ClientIP: ip, Path: path, Method: "GET", Status: status, Time: at})
	}
	add("192.0.2.20", "/.env?token=private-value", 404, now)
	add("192.0.2.20", "/.env?token=another-value", 404, now)
	add("192.0.2.21", "/other-source", 404, now)
	add("192.0.2.20", "/stale-request", 404, now.Add(-2*time.Minute))
	add("192.0.2.20", "/reset-password/private-path-token", 404, now)
	got := requestSamples(requests, "192.0.2.20", now)
	if len(got) != 2 || got[0].Path != "/.env" || got[0].Count != 2 {
		t.Fatalf("unexpected samples: %+v", got)
	}
	for _, s := range got {
		if strings.Contains(s.Path, "private") || strings.Contains(s.Path, "?") || strings.Contains(s.Path, "other-source") {
			t.Fatalf("unsafe sample: %+v", s)
		}
	}
	for _, p := range []string{"/a", "/b", "/c", "/d", "/e", "/f"} {
		add("192.0.2.20", p, 404, now)
	}
	if len(requestSamples(requests, "192.0.2.20", now)) != 5 {
		t.Fatal("sample limit not applied")
	}
}
