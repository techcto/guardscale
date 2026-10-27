package agentruntime

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"
)

// Read only explicitly selected identity tags. Never fetch IAM credentials or
// arbitrary instance tags, and never follow a metadata redirect or HTTP proxy.
func ec2Identity(ctx context.Context, serverID string) (string, []string) {
	if !strings.HasPrefix(serverID, "i-") {
		return "", nil
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	client := &http.Client{Transport: &http.Transport{Proxy: nil}, Timeout: time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	return readEC2Identity(ctx, client, "http://169.254.169.254", serverID)
}

func readEC2Identity(ctx context.Context, client *http.Client, endpoint, serverID string) (string, []string) {
	request := func(method, path, token string) string {
		req, err := http.NewRequestWithContext(ctx, method, endpoint+path, nil)
		if err != nil {
			return ""
		}
		if token != "" {
			req.Header.Set("X-aws-ec2-metadata-token", token)
		} else {
			req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", "60")
		}
		res, err := client.Do(req)
		if err != nil {
			return ""
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return ""
		}
		b, err := io.ReadAll(io.LimitReader(res.Body, 1025))
		if err != nil || len(b) > 1024 {
			return ""
		}
		return strings.TrimSpace(string(b))
	}
	token := request("PUT", "/latest/api/token", "")
	if token == "" || request("GET", "/latest/meta-data/instance-id", token) != serverID {
		return "", nil
	}
	name := ""
	var tags []string
	for _, key := range []string{"Name", "Environment", "Application", "Project", "Service", "Stack", "aws:cloudformation:stack-name"} {
		value := request("GET", "/latest/meta-data/tags/instance/"+key, token)
		if value == "" || len(value) > 256 || strings.ContainsAny(value, "\r\n\x00") {
			continue
		}
		if key == "Name" {
			name = value
		}
		tags = append(tags, key+"="+value)
	}
	return name, tags
}
