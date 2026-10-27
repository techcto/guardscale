package agentupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const ReleaseBase = "https://guardscale.s3.us-east-1.amazonaws.com/agent"

var stableVersion = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

type Result struct {
	Current         string `json:"current"`
	Available       string `json:"available"`
	UpdateAvailable bool   `json:"update_available"`
	Updated         bool   `json:"updated"`
}
type Manager struct {
	Base, Current, Arch, Binary string
	Client                      *http.Client
	Validate                    func(context.Context, string, string) error
	Restart                     func(context.Context) error
	Healthy                     func(context.Context) error
}

func newer(candidate, current string) (bool, error) {
	if !stableVersion.MatchString(candidate) || !stableVersion.MatchString(current) {
		return false, errors.New("updates require a release-versioned binary; bootstrap a released agent first")
	}
	a, b := strings.Split(candidate, "."), strings.Split(current, ".")
	for i := range a {
		x, e := strconv.ParseUint(a[i], 10, 64)
		if e != nil {
			return false, e
		}
		y, e := strconv.ParseUint(b[i], 10, 64)
		if e != nil {
			return false, e
		}
		if x != y {
			return x > y, nil
		}
	}
	return false, nil
}
func (m Manager) fetch(ctx context.Context, path string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(m.Base, "/")+"/"+path, nil)
	if err != nil {
		return nil, err
	}
	client := m.Client
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("release download returned HTTP %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("release artifact exceeds size limit")
	}
	return data, nil
}

// Use a single atomic release pointer followed by immutable versioned assets.
// Callers serialize installation and provide fixed, local service-control hooks.
func (m Manager) Run(ctx context.Context, target string, check bool) (Result, error) {
	result := Result{Current: m.Current}
	if target == "" || target == "latest" {
		raw, err := m.fetch(ctx, "latest/release.json", 4096)
		if err != nil {
			return result, err
		}
		var release struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(raw, &release) != nil {
			return result, errors.New("invalid release pointer")
		}
		target = release.Version
	}
	target = strings.TrimPrefix(target, "v")
	if !stableVersion.MatchString(target) {
		return result, errors.New("invalid stable release version")
	}
	result.Available = target
	available, err := newer(target, m.Current)
	if err != nil {
		return result, err
	}
	result.UpdateAvailable = available
	if check || !available {
		return result, nil
	}
	if m.Arch != "amd64" && m.Arch != "arm64" {
		return result, errors.New("unsupported agent architecture")
	}
	if m.Validate == nil || m.Restart == nil || m.Healthy == nil {
		return result, errors.New("update service hooks are required")
	}
	info, err := os.Lstat(m.Binary)
	if err != nil {
		return result, err
	}
	if !info.Mode().IsRegular() {
		return result, errors.New("installed agent must be a regular file")
	}
	filename := "guardscale-linux-" + m.Arch
	sums, err := m.fetch(ctx, target+"/SHA256SUMS", 65536)
	if err != nil {
		return result, err
	}
	expected := ""
	for _, line := range strings.Split(string(sums), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 && f[1] == filename {
			if expected != "" {
				return result, errors.New("duplicate artifact checksum")
			}
			expected = f[0]
		}
	}
	digest, err := hex.DecodeString(expected)
	if err != nil || len(digest) != sha256.Size {
		return result, errors.New("missing or invalid artifact checksum")
	}
	data, err := m.fetch(ctx, target+"/"+filename, 64*1024*1024)
	if err != nil {
		return result, err
	}
	actual := sha256.Sum256(data)
	if hex.EncodeToString(actual[:]) != expected {
		return result, errors.New("agent checksum mismatch; installed agent unchanged")
	}
	stage, err := os.CreateTemp(filepath.Dir(m.Binary), ".guardscale-candidate-")
	if err != nil {
		return result, err
	}
	staged := stage.Name()
	defer os.Remove(staged)
	if _, err = stage.Write(data); err == nil {
		err = stage.Sync()
	}
	closeErr := stage.Close()
	if err != nil {
		return result, err
	}
	if closeErr != nil {
		return result, closeErr
	}
	if err = os.Chmod(staged, 0755); err != nil {
		return result, err
	}
	if err = m.Validate(ctx, staged, target); err != nil {
		return result, fmt.Errorf("candidate validation failed: %w", err)
	}
	backup, err := os.CreateTemp(filepath.Dir(m.Binary), ".guardscale-backup-")
	if err != nil {
		return result, err
	}
	backupName := backup.Name()
	defer os.Remove(backupName)
	old, err := os.Open(m.Binary)
	if err != nil {
		backup.Close()
		return result, err
	}
	_, copyErr := io.Copy(backup, old)
	old.Close()
	if copyErr == nil {
		copyErr = backup.Sync()
	}
	backup.Close()
	if copyErr != nil {
		return result, copyErr
	}
	if err = os.Chmod(backupName, info.Mode().Perm()); err != nil {
		return result, err
	}
	previous := m.Binary + ".previous"
	if err = os.Rename(backupName, previous); err != nil {
		return result, err
	}
	if err = os.Rename(staged, m.Binary); err != nil {
		return result, err
	}
	serviceCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 45*time.Second)
	defer cancel()
	failure := m.Restart(serviceCtx)
	if failure == nil {
		failure = m.Healthy(serviceCtx)
	}
	if failure != nil {
		if err = os.Rename(previous, m.Binary); err != nil {
			return result, fmt.Errorf("update failed and rollback rename failed: %w", err)
		}
		rollbackCtx, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if err = m.Restart(rollbackCtx); err != nil {
			return result, fmt.Errorf("previous binary restored but service restart failed: %w", err)
		}
		return result, errors.New("updated service failed startup checks; previous agent restored")
	}
	result.Updated = true
	return result, nil
}
