package agentruntime

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/techcto/guardscale/internal/agentclient"
	"github.com/techcto/guardscale/internal/apache"
	"github.com/techcto/guardscale/internal/config"
	"github.com/techcto/guardscale/internal/logtail"
)

type signal struct {
	eventType string
	metadata  map[string]string
}

func Run(ctx context.Context, c config.Config) error {
	if c.ControlPlane.Endpoint == "" || c.ControlPlane.AgentID == "" || c.ControlPlane.TokenFile == "" {
		return fmt.Errorf("control_plane endpoint, agent_id, and token_file are required")
	}
	tokenBytes, err := os.ReadFile(c.ControlPlane.TokenFile)
	if err != nil {
		return fmt.Errorf("read enrollment token: %w", err)
	}
	enrollment := strings.TrimSpace(string(tokenBytes))
	if enrollment == "" {
		return fmt.Errorf("enrollment token is empty")
	}
	client := agentclient.Client{Endpoint: c.ControlPlane.Endpoint, Token: c.Server.Tenant + "." + c.ControlPlane.AgentID + "." + enrollment, ServerID: c.Server.ID}
	if err = client.Heartbeat(ctx); err != nil {
		slog.Warn("initial heartbeat failed", "error", err)
	}

	heartbeats := time.NewTicker(time.Duration(c.ControlPlane.HeartbeatSeconds) * time.Second)
	defer heartbeats.Stop()
	lines := make(chan string, 256)
	signals := make(chan signal, 1)
	go func() {
		if err := logtail.Follow(ctx, c.Logs.ApacheAccess, false, lines); err != nil && ctx.Err() == nil {
			slog.Error("access log follower stopped", "error", err)
		}
	}()
	parser, err := apache.New(c.Proxy.TrustedCIDRs, c.Origin.ProtectedHosts)
	if err != nil {
		return err
	}
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case line := <-lines:
				r, parseErr := parser.ParseGuardScale(line)
				if parseErr != nil {
					r, parseErr = parser.ParseCombined(line)
				}
				if parseErr != nil {
					continue
				}
				metadata := map[string]string{"method": r.Method, "path": r.Path, "status": strconv.Itoa(r.Status)}
				if r.Duration > 0 {
					metadata["duration_ms"] = strconv.FormatInt(r.Duration.Milliseconds(), 10)
				}
				s := signal{eventType: "origin.response", metadata: metadata}
				select {
				case signals <- s:
				default:
				}
			}
		}
	}()
	eventTick := time.NewTicker(time.Second)
	defer eventTick.Stop()
	var latest *signal
	for {
		select {
		case <-ctx.Done():
			return nil
		case s := <-signals:
			latest = &s
		case <-eventTick.C:
			if latest != nil {
				if err := client.Event(ctx, latest.eventType, latest.metadata); err != nil {
					slog.Warn("event upload failed", "error", err)
				}
				latest = nil
			}
		case <-heartbeats.C:
			if err := client.Heartbeat(ctx); err != nil {
				slog.Warn("heartbeat failed", "error", err)
			}
		}
	}
}
