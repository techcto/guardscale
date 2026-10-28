package agentruntime

import (
	"context"
	"encoding/json"
	"github.com/techcto/guardscale/internal/config"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPrivateCredentialRecoversLostReplyAndRemovesBootstrap(t *testing.T) {
	current := ""
	loseReply := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Server string `json:"server_id"`
			Secret string `json:"secret"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer tenant.agent.")
		if (current == "" && auth != "bootstrap") || (current != "" && auth != current) {
			w.WriteHeader(401)
			return
		}
		current = body.Secret
		if loseReply {
			loseReply = false
			w.WriteHeader(503)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"registered": true, "tenantId": "tenant", "agentId": "agent", "serverId": "server"})
	}))
	defer server.Close()
	dir := t.TempDir()
	c := config.Default()
	c.Server.ID = "server"
	c.Server.Tenant = "tenant"
	c.ControlPlane.AgentID = "agent"
	c.ControlPlane.Endpoint = server.URL
	c.Storage.StateDir = filepath.Join(dir, "state")
	c.ControlPlane.TokenFile = filepath.Join(dir, "bootstrap.token")
	os.WriteFile(c.ControlPlane.TokenFile, []byte("bootstrap"), 0600)
	if _, err := operatingCredential(context.Background(), c, false); err == nil {
		t.Fatal("lost server reply must not look successful")
	}
	if current == "" {
		t.Fatal("test did not register a candidate")
	}
	key, err := operatingCredential(context.Background(), c, false)
	if err != nil || key != current {
		t.Fatalf("durable candidate did not recover: %v", err)
	}
	if err := Enroll(context.Background(), c, false); err != nil {
		t.Fatal(err)
	}
	value, _ := os.ReadFile(c.ControlPlane.TokenFile)
	if string(value) != key || string(value) == "bootstrap" {
		t.Fatal("bootstrap key retained")
	}
	info, _ := os.Stat(filepath.Join(c.Storage.StateDir, "agent-credential.json"))
	if info.Mode().Perm() != 0600 {
		t.Fatal("credential is not private")
	}
	rotated, err := operatingCredential(context.Background(), c, true)
	if err != nil || rotated == key || rotated != current {
		t.Fatalf("rotation failed: %v", err)
	}
	c.Server.ID = "another-server"
	if _, err := operatingCredential(context.Background(), c, false); err == nil {
		t.Fatal("credential reused for another server")
	}
}
