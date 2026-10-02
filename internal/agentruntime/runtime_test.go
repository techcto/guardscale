package agentruntime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/techcto/guardscale/internal/config"
)

func TestRunSendsHeartbeatAndSanitizedActivity(t *testing.T) {
	events := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tenant-1.agent-1.enroll-secret" {
			t.Errorf("unexpected authorization")
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		if r.URL.Path == "/api/v1/agents/events" {
			events <- payload
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	dir := t.TempDir()
	accessLog := filepath.Join(dir, "access.log")
	if err := os.WriteFile(accessLog, nil, 0600); err != nil {
		t.Fatal(err)
	}
	tokenFile := filepath.Join(dir, "token")
	if err := os.WriteFile(tokenFile, []byte("enroll-secret"), 0600); err != nil {
		t.Fatal(err)
	}
	c := config.Default()
	c.Server.ID = "node-1"
	c.Server.Tenant = "tenant-1"
	c.ControlPlane.Endpoint = server.URL
	c.ControlPlane.AgentID = "agent-1"
	c.ControlPlane.TokenFile = tokenFile
	c.Logs.ApacheAccess = accessLog

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- Run(ctx, c) }()
	time.Sleep(300 * time.Millisecond)
	f, err := os.OpenFile(accessLog, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.WriteString("203.0.113.1 - - [02/Oct/2026:12:00:00 +0000] \"GET /secret?token=value HTTP/1.1\" 200 123 \"https://private.example/\" \"Raw User Agent\"\n")
	_ = f.Close()
	if err != nil {
		t.Fatal(err)
	}

	select {
	case event := <-events:
		metadata := event["metadata"].(map[string]any)
		if metadata["path"] != "/secret" {
			t.Fatalf("path=%v", metadata["path"])
		}
		if _, ok := metadata["client_ip"]; ok {
			t.Fatal("client IP leaked")
		}
		if _, ok := metadata["referer"]; ok {
			t.Fatal("referer leaked")
		}
		if _, ok := metadata["user_agent"]; ok {
			t.Fatal("user agent leaked")
		}
	case <-time.After(4 * time.Second):
		t.Fatal("timed out waiting for sanitized event")
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("runtime did not stop")
	}
}
