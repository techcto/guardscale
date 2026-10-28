package agentruntime

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/techcto/guardscale/internal/agentupdate"
	"github.com/techcto/guardscale/internal/config"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type credentialFile struct {
	Endpoint string `json:"endpoint"`
	Tenant   string `json:"tenant"`
	AgentID  string `json:"agent_id"`
	ServerID string `json:"server_id"`
	Secret   string `json:"secret"`
}

func writePrivateFile(path string, value []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".guardscale-credential-*")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if err = file.Chmod(0600); err == nil {
		_, err = file.Write(value)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, path)
}
func credentialFor(c config.Config, secret string) credentialFile {
	return credentialFile{Endpoint: strings.TrimRight(c.ControlPlane.Endpoint, "/"), Tenant: c.Server.Tenant, AgentID: c.ControlPlane.AgentID, ServerID: c.Server.ID, Secret: secret}
}
func readCredential(path string, c config.Config) (*credentialFile, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var value credentialFile
	if json.Unmarshal(raw, &value) != nil || len(value.Secret) != 64 {
		return nil, errors.New("invalid saved agent credential")
	}
	if _, err := hex.DecodeString(value.Secret); err != nil {
		return nil, errors.New("invalid saved agent credential")
	}
	if value != credentialFor(c, value.Secret) {
		return nil, errors.New("saved credential belongs to a different control plane or server")
	}
	return &value, nil
}

func registerCredential(ctx context.Context, c config.Config, authorization, secret string) (bool, error) {
	payload, _ := json.Marshal(map[string]string{"server_id": c.Server.ID, "secret": secret})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.ControlPlane.Endpoint, "/")+"/api/v1/agents/credential", bytes.NewReader(payload))
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Server.Tenant+"."+c.ControlPlane.AgentID+"."+authorization)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("credential redirects are not allowed") }}
	response, err := client.Do(req)
	if err != nil {
		return false, errors.New("agent credential registration could not reach the control plane")
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusUnauthorized {
		return false, nil
	}
	if response.StatusCode != 200 {
		return false, fmt.Errorf("agent credential registration returned HTTP %d", response.StatusCode)
	}
	var result struct {
		Registered bool   `json:"registered"`
		Tenant     string `json:"tenantId"`
		AgentID    string `json:"agentId"`
		ServerID   string `json:"serverId"`
	}
	if json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result) != nil || !result.Registered || result.Tenant != c.Server.Tenant || result.AgentID != c.ControlPlane.AgentID || result.ServerID != c.Server.ID {
		return false, errors.New("control plane returned an invalid credential acknowledgement")
	}
	return true, nil
}

func operatingCredential(ctx context.Context, c config.Config, rotate bool) (string, error) {
	endpoint, err := url.Parse(c.ControlPlane.Endpoint)
	if err != nil || endpoint.User != nil || endpoint.Fragment != "" || endpoint.Host == "" {
		return "", errors.New("invalid agent control plane URL")
	}
	local := endpoint.Hostname() == "localhost" || endpoint.Hostname() == "127.0.0.1" || endpoint.Hostname() == "::1" || endpoint.Hostname() == "web" || endpoint.Hostname() == "guardscale-web"
	if endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && local) {
		return "", errors.New("agent credentials require HTTPS outside local development")
	}
	if err := os.MkdirAll(c.Storage.StateDir, 0750); err != nil {
		return "", err
	}
	unlock, err := agentupdate.Lock(filepath.Join(c.Storage.StateDir, "credential.lock"))
	if err != nil {
		return "", err
	}
	defer unlock()
	activePath, pendingPath := filepath.Join(c.Storage.StateDir, "agent-credential.json"), filepath.Join(c.Storage.StateDir, "agent-credential.pending.json")
	active, err := readCredential(activePath, c)
	if err != nil {
		return "", err
	}
	pending, err := readCredential(pendingPath, c)
	if err != nil {
		return "", err
	}
	if active != nil && pending == nil && !rotate {
		return active.Secret, nil
	}
	if pending == nil {
		random := make([]byte, 32)
		if _, err := rand.Read(random); err != nil {
			return "", err
		}
		value := credentialFor(c, hex.EncodeToString(random))
		pending = &value
		raw, _ := json.Marshal(value)
		if err := writePrivateFile(pendingPath, raw); err != nil {
			return "", err
		}
	}
	// Try the saved candidate first: a previous request may have committed but lost
	// its reply. The secret is durable locally before any server-side key changes.
	accepted, err := registerCredential(ctx, c, pending.Secret, pending.Secret)
	if err != nil {
		return "", err
	}
	if !accepted {
		previous := ""
		if active != nil {
			previous = active.Secret
		} else {
			raw, err := os.ReadFile(c.ControlPlane.TokenFile)
			if err != nil {
				return "", err
			}
			previous = strings.TrimSpace(string(raw))
		}
		if previous == "" {
			return "", errors.New("agent enrollment credential is empty")
		}
		accepted, err = registerCredential(ctx, c, previous, pending.Secret)
		if err != nil {
			return "", err
		}
		if !accepted {
			return "", errors.New("agent enrollment rejected; request administrator recovery, not a shared-key fallback")
		}
	}
	raw, _ := json.Marshal(pending)
	if err := writePrivateFile(activePath, raw); err != nil {
		return "", err
	}
	if err := os.Remove(pendingPath); err != nil {
		return "", err
	}
	return pending.Secret, nil
}

// Enroll is the privileged installer/updater path. Replace the bootstrap file
// with the per-agent secret, so an installed host does not retain the org key.
func Enroll(ctx context.Context, c config.Config, rotate bool) error {
	secret, err := operatingCredential(ctx, c, rotate)
	if err != nil {
		return err
	}
	return writePrivateFile(c.ControlPlane.TokenFile, []byte(secret))
}
