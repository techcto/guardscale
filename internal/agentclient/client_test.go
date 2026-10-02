package agentclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHeartbeatUsesBearerAndBoundedPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agents/heartbeat" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer tenant.agent.secret" {
			t.Fatal("missing bearer token")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["server_id"] != "node-1" {
			t.Fatalf("server_id=%v", body["server_id"])
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	c := Client{Endpoint: server.URL, Token: "tenant.agent.secret", ServerID: "node-1"}
	if err := c.Heartbeat(context.Background()); err != nil {
		t.Fatal(err)
	}
}
