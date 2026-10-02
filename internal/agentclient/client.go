package agentclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strings"
	"time"
)

type Client struct {
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
	return c.post(ctx, "/api/v1/agents/heartbeat", map[string]any{
		"server_id": c.ServerID,
		"platform":  runtime.GOOS + "/" + runtime.GOARCH,
	})
}

func (c Client) Event(ctx context.Context, eventType string, metadata map[string]string) error {
	return c.post(ctx, "/api/v1/agents/events", map[string]any{
		"server_id": c.ServerID,
		"type":      eventType,
		"metadata":  metadata,
	})
}
