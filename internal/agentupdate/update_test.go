package agentupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVersionOrdering(t *testing.T) {
	for _, tc := range []struct {
		next, current string
		want          bool
		bad           bool
	}{{"0.3.10", "0.3.9", true, false}, {"0.3.9", "0.3.9", false, false}, {"0.3.8", "0.3.9", false, false}, {"0.3.9", "dev", false, true}, {"../evil", "0.3.9", false, true}} {
		got, err := newer(tc.next, tc.current)
		if got != tc.want || (err != nil) != tc.bad {
			t.Fatalf("%+v: %v %v", tc, got, err)
		}
	}
}
func TestVerifiedUpdateAndRollback(t *testing.T) {
	for _, mode := range []string{"success", "checksum", "configuration", "startup", "check-only", "downgrade", "pointer"} {
		t.Run(mode, func(t *testing.T) {
			dir := t.TempDir()
			binary := filepath.Join(dir, "guardscale")
			old := []byte("previous agent")
			candidate := []byte("verified new agent")
			if err := os.WriteFile(binary, old, 0755); err != nil {
				t.Fatal(err)
			}
			config := filepath.Join(dir, "config.yaml")
			os.WriteFile(config, []byte("preserve this configuration"), 0600)
			token := filepath.Join(dir, "enrollment.token")
			os.WriteFile(token, []byte("preserve this enrollment"), 0600)
			digest := sha256.Sum256(candidate)
			expected := hex.EncodeToString(digest[:])
			if mode == "checksum" {
				expected = strings.Repeat("0", 64)
			}
			pointer := "0.3.9"
			if mode == "pointer" {
				pointer = "../../untrusted"
			}
			downloads := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/latest/release.json":
					fmt.Fprintf(w, `{"version":%q}`, pointer)
				case "/0.3.9/SHA256SUMS":
					fmt.Fprintf(w, "%s  guardscale-linux-amd64\n", expected)
				case "/0.3.9/guardscale-linux-amd64":
					downloads++
					w.Write(candidate)
				default:
					t.Errorf("unexpected artifact request %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			validations, restarts := 0, 0
			current := "0.3.8"
			if mode == "downgrade" {
				current = "0.3.10"
			}
			m := Manager{Base: server.URL, Client: server.Client(), Current: current, Arch: "amd64", Binary: binary,
				Validate: func(_ context.Context, path, target string) error {
					validations++
					b, _ := os.ReadFile(path)
					if string(b) != string(candidate) || target != "0.3.9" {
						t.Fatal("candidate not staged correctly")
					}
					if mode == "configuration" {
						return errors.New("bad config")
					}
					return nil
				},
				Restart: func(context.Context) error { restarts++; return nil }, Healthy: func(context.Context) error {
					if mode == "startup" {
						return errors.New("crashed")
					}
					return nil
				},
			}
			result, err := m.Run(context.Background(), "latest", mode == "check-only")
			failed := mode == "checksum" || mode == "configuration" || mode == "startup" || mode == "pointer"
			if (err != nil) != failed {
				t.Fatalf("unexpected result %+v %v", result, err)
			}
			after, _ := os.ReadFile(binary)
			if mode == "success" {
				if string(after) != string(candidate) || !result.Updated || restarts != 1 {
					t.Fatalf("update failed %+v", result)
				}
				backup, _ := os.ReadFile(binary + ".previous")
				if string(backup) != string(old) {
					t.Fatal("rollback backup missing")
				}
			} else if string(after) != string(old) {
				t.Fatal("failed/check-only update changed installed agent")
			}
			if mode == "checksum" && validations != 0 {
				t.Fatal("unverified executable was run")
			}
			if mode == "startup" && restarts != 2 {
				t.Fatal("old service was not restarted on rollback")
			}
			if (mode == "check-only" || mode == "downgrade") && downloads != 0 {
				t.Fatal("check-only or downgrade downloaded an executable")
			}
			preserved, _ := os.ReadFile(config)
			credential, _ := os.ReadFile(token)
			if string(preserved) != "preserve this configuration" || string(credential) != "preserve this enrollment" {
				t.Fatal("configuration or enrollment changed")
			}
			files, _ := filepath.Glob(filepath.Join(dir, ".guardscale-*"))
			if len(files) != 0 {
				t.Fatalf("temporary executable files remain: %v", files)
			}
		})
	}
}

func TestUpdateLockExcludesAnotherInstaller(t *testing.T) {
	file := filepath.Join(t.TempDir(), "lock")
	unlock, err := Lock(file)
	if err != nil {
		t.Fatal(err)
	}
	if other, err := Lock(file); err == nil {
		other()
		t.Fatal("concurrent installer acquired lock")
	}
	unlock()
	again, err := Lock(file)
	if err != nil {
		t.Fatal(err)
	}
	again()
}
