package agentruntime

import (
	"context"
	"fmt"
	"github.com/techcto/guardscale/internal/agentclient"
	"github.com/techcto/guardscale/internal/apache"
	"github.com/techcto/guardscale/internal/config"
	"github.com/techcto/guardscale/internal/logtail"
	"github.com/techcto/guardscale/internal/uploader"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type logEntry struct {
	ID      string          `json:"id"`
	Source  string          `json:"source"`
	At      string          `json:"at"`
	Message string          `json:"message"`
	Request *apache.Request `json:"-"`
}

var secretValue = regexp.MustCompile(`(?i)(authorization|cookie|password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+`)
var sensitiveLine = regexp.MustCompile(`(?i)(authorization|cookie|password|passwd|secret|token|api[_-]?key)\s*["']?\s*[:=]`)
var queryValue = regexp.MustCompile(`([?&][a-zA-Z0-9_.-]+=)[^\s&"']+`)
var emailValue = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
var ipValue = regexp.MustCompile(`\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b`)

func redact(line string) string {
	if sensitiveLine.MatchString(line) {
		return "[credential-bearing log content withheld]"
	}
	line = secretValue.ReplaceAllString(line, "$1=[redacted]")
	line = queryValue.ReplaceAllString(line, "${1}[redacted]")
	line = emailValue.ReplaceAllString(line, "[email]")
	line = ipValue.ReplaceAllString(line, "[ip]")
	r := []rune(line)
	if len(r) > 1000 {
		line = string(r[:1000]) + " [truncated]"
	}
	return line
}
func sourcePath(configured string, candidates ...string) string {
	if configured != "" {
		if _, err := os.Stat(configured); err == nil {
			return configured
		}
	}
	for _, p := range candidates {
		matches, _ := filepath.Glob(p)
		for _, m := range matches {
			if _, err := os.Stat(m); err == nil {
				return m
			}
		}
	}
	return configured
}
func collect(ctx context.Context, c config.Config) error {
	token, err := os.ReadFile(c.ControlPlane.TokenFile)
	if err != nil {
		return fmt.Errorf("read enrollment token: %w", err)
	}
	if strings.TrimSpace(string(token)) == "" || c.ControlPlane.Endpoint == "" || c.ControlPlane.AgentID == "" {
		return fmt.Errorf("control plane enrollment is incomplete")
	}
	auth := c.Server.Tenant + "." + c.ControlPlane.AgentID + "." + strings.TrimSpace(string(token))
	client := agentclient.Client{Endpoint: c.ControlPlane.Endpoint, Token: auth, ServerID: c.Server.ID, DiscoveredHosts: discoverApacheHosts()}
	client.DisplayName, client.Tags = ec2Identity(ctx, c.Server.ID)
	response := newResponder(c, client)
	go response.deliver(ctx)
	queue := uploader.Queue{Dir: filepath.Join(c.Storage.StateDir, "log-outbox"), Endpoint: strings.TrimRight(c.ControlPlane.Endpoint, "/"), Token: auth, MaxItems: 100}
	sources := map[string]string{
		"apache_access": sourcePath(c.Logs.ApacheAccess, "/var/log/apache2/access.log", "/var/log/httpd/access_log"),
		"apache_error":  sourcePath(c.Logs.ApacheError, "/var/log/apache2/error.log", "/var/log/httpd/error_log"),
		"php_error":     sourcePath(c.Logs.PHPError, "/var/log/php-fpm/www-error.log", "/var/log/php-fpm/error.log", "/var/log/php*-fpm.log", "/var/log/php_errors.log", "/var/log/php/error.log", "/var/log/apache2/php-error.log"),
		"php_slow":      sourcePath(c.Logs.PHPSlow, "/var/log/php-fpm/www-slow.log", "/var/log/php*-fpm.slow.log"),
	}
	response.c.Logs = config.Logs{ApacheAccess: sources["apache_access"], ApacheError: sources["apache_error"], PHPError: sources["php_error"], PHPSlow: sources["php_slow"]}
	parser, err := apache.New(c.Proxy.TrustedCIDRs, c.Origin.ProtectedHosts)
	if err != nil {
		return err
	}
	entries := make(chan logEntry, 1024)
	for source, path := range sources {
		if path == "" {
			continue
		}
		source, path := source, path
		slog.Info("following log source", "source", source, "path", path)
		go func() {
			lines := make(chan string, 32)
			go func() {
				if err := logtail.Follow(ctx, path, false, lines); err != nil && ctx.Err() == nil {
					slog.Error("log source unavailable", "source", source, "error", err)
				}
			}()
			for {
				select {
				case <-ctx.Done():
					return
				case line := <-lines:
					var request *apache.Request
					message := redact(line)
					if source == "apache_access" {
						r, e := parser.ParseGuardScale(line)
						if e != nil {
							r, e = parser.ParseCombined(line)
						}
						if e == nil {
							request = &r
							message = fmt.Sprintf("%s %s status=%d duration_ms=%d", r.Method, redact(r.Path), r.Status, r.Duration.Milliseconds())
						} else {
							message = "Unrecognized access log format; configure supported combined or GuardScale format"
						}
					}
					now := time.Now().UTC()
					entry := logEntry{ID: fmt.Sprintf("%s-%d", source, now.UnixNano()), Source: source, At: now.Format(time.RFC3339Nano), Message: message, Request: request}
					select {
					case entries <- entry:
					case <-ctx.Done():
						return
					}
				}
			}
		}()
	}
	if err := client.Heartbeat(ctx); err != nil {
		slog.Warn("heartbeat failed", "error", err)
	}
	heartbeatSeconds := c.ControlPlane.HeartbeatSeconds
	if heartbeatSeconds < 1 {
		heartbeatSeconds = 30
	}
	heartbeat := time.NewTicker(time.Duration(heartbeatSeconds) * time.Second)
	defer heartbeat.Stop()
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	batch := make([]logEntry, 0, 50)
	flush := func() {
		if len(batch) > 0 {
			if err := queue.Enqueue("/api/v1/agents/logs", map[string]any{"server_id": c.Server.ID, "entries": batch}); err != nil {
				slog.Error("log spool failed", "error", err)
				return
			}
			batch = make([]logEntry, 0, 50)
		}
		uploadCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		if err := queue.Flush(uploadCtx); err != nil {
			slog.Warn("log upload deferred; bounded spool retained", "error", err)
		}
	}
	for {
		select {
		case <-ctx.Done():
			if len(batch) > 0 {
				_ = queue.Enqueue("/api/v1/agents/logs", map[string]any{"server_id": c.Server.ID, "entries": batch})
			}
			return nil
		case e := <-entries:
			if e.Request != nil {
				response.add(*e.Request)
			}
			batch = append(batch, e)
			if len(batch) >= 50 {
				flush()
			}
		case <-tick.C:
			flush()
		case <-heartbeat.C:
			if err := client.Heartbeat(ctx); err != nil {
				slog.Warn("heartbeat failed", "error", err)
			}
			response.evaluate(ctx)
			response.poll(ctx)
		}
	}
}
