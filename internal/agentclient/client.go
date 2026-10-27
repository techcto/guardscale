package agentclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/techcto/guardscale/internal/buildinfo"
	"github.com/techcto/guardscale/internal/hostmetrics"
	"net/http"
	"runtime"
	"strings"
	"time"
)

type Client struct {
	DisplayName               string
	Tags                      []string
	DiscoveredHosts           []string
	Endpoint, Token, ServerID string
	HTTP                      *http.Client
}

func (c Client) post(ctx context.Context, path string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.Endpoint, "/")+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")
	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("%s returned %s", path, resp.Status)
	}
	return nil
}

func (c Client) Heartbeat(ctx context.Context) error {
	payload := map[string]any{
		"agent_version":    buildinfo.Version,
		"server_id":        c.ServerID,
		"platform":         runtime.GOOS + "/" + runtime.GOARCH,
		"discovered_hosts": c.DiscoveredHosts,
	}
	if c.DisplayName != "" {
		payload["display_name"] = c.DisplayName
	}
	if len(c.Tags) > 0 {
		payload["tags"] = c.Tags
	}
	return c.post(ctx, "/api/v1/agents/heartbeat", payload)
}

func (c Client) Event(ctx context.Context, eventType string, metadata map[string]string) error {
	return c.post(ctx, "/api/v1/agents/events", map[string]any{
		"server_id": c.ServerID,
		"type":      eventType,
		"metadata":  metadata,
	})
}

func (c Client) Metrics(ctx context.Context, metrics hostmetrics.Sample) error {
	return c.post(ctx, "/api/v1/agents/metrics", map[string]any{"server_id": c.ServerID, "metrics": metrics})
}

func (c Client) Incident(ctx context.Context, payload any) error {
	return c.post(ctx, "/api/v1/agents/incidents", payload)
}

type Command struct {
	ID             string `json:"id"`
	CandidateID    string `json:"candidateId"`
	ExpiresAt      string `json:"expiresAt"`
	Kind           string `json:"kind"`
	Status         string `json:"status"`
	RenewalEnabled bool   `json:"renewalEnabled"`
	RenewalUntil   string `json:"renewalUntil"`
	RenewalSeconds int    `json:"renewalSeconds"`
	BlockedPackets uint64 `json:"blockedPackets"`
}

func (c Client) Commands(ctx context.Context) ([]Command, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.Endpoint, "/")+"/api/v1/agents/commands?server_id="+c.ServerID, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	h := c.HTTP
	if h == nil {
		h = &http.Client{Timeout: 5 * time.Second}
	}
	r, err := h.Do(req)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return nil, fmt.Errorf("command poll returned %d", r.StatusCode)
	}
	var v struct {
		Commands []Command `json:"commands"`
	}
	err = json.NewDecoder(r.Body).Decode(&v)
	return v.Commands, err
}
func (c Client) CommandResult(ctx context.Context, id, status string) error {
	return c.post(ctx, "/api/v1/agents/commands", map[string]string{"server_id": c.ServerID, "id": id, "status": status})
}
func (c Client) RenewalResult(ctx context.Context, id, expiresAt string, packets uint64) error {
	return c.post(ctx, "/api/v1/agents/commands", map[string]any{"server_id": c.ServerID, "id": id, "status": "renewed", "expires_at": expiresAt, "blocked_packets": packets})
}
func (c Client) InspectionResult(ctx context.Context, id string, result map[string]string) error {
	return c.post(ctx, "/api/v1/agents/commands", map[string]any{"server_id": c.ServerID, "id": id, "status": "complete", "result": result})
}
