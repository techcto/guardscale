package agentruntime

import (
	"context"
	"encoding/json"
	"github.com/techcto/guardscale/internal/config"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestInspectionPollDoesNotWaitForThirtySecondHeartbeat(t *testing.T) {
	var heartbeats atomic.Int32
	completed := make(chan bool, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/agents/credential":
			json.NewEncoder(w).Encode(map[string]any{"registered": true, "tenantId": "test", "agentId": "test-agent", "serverId": "poll-regression"})
		case "/api/v1/agents/heartbeat":
			heartbeats.Add(1)
			w.WriteHeader(202)
		case "/api/v1/agents/commands":
			if r.Method == http.MethodGet {
				json.NewEncoder(w).Encode(map[string]any{"commands": []map[string]string{{"id": "inspection", "kind": "inspect_server", "expiresAt": time.Now().Add(20 * time.Second).UTC().Format(time.RFC3339Nano)}}})
				return
			}
			var body struct {
				Status string `json:"status"`
			}
			json.NewDecoder(r.Body).Decode(&body)
			completed <- body.Status == "complete"
			w.WriteHeader(202)
		default:
			w.WriteHeader(202)
		}
	}))
	defer server.Close()
	dir := t.TempDir()
	token := filepath.Join(dir, "token")
	if err := os.WriteFile(token, []byte("test-enrollment"), 0600); err != nil {
		t.Fatal(err)
	}
	c := config.Default()
	c.Server.ID = "poll-regression"
	c.Server.Tenant = "test"
	c.ControlPlane.Endpoint = server.URL
	c.ControlPlane.AgentID = "test-agent"
	c.ControlPlane.TokenFile = token
	c.ControlPlane.HeartbeatSeconds = 30
	c.ControlPlane.MetricsSeconds = 0
	c.Storage.StateDir = dir
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- collect(ctx, c) }()
	select {
	case ok := <-completed:
		if !ok {
			t.Fatal("inspection did not complete")
		}
	case <-ctx.Done():
		t.Fatal("inspection waited for the 30s heartbeat")
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if heartbeats.Load() != 1 {
		t.Fatalf("unexpected heartbeat count: %d", heartbeats.Load())
	}
}
