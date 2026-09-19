package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadStrict(t *testing.T) {
	p := filepath.Join(t.TempDir(), "c.yaml")
	data := `server:
  id: server-opaque-1
  tenant: tenant-opaque-1
logs:
  apache_access: /tmp/access.log
proxy:
  trusted_cidrs:
    - 10.0.0.0/8
origin:
  protected_hosts:
    - origin.example.com
`
	if err := os.WriteFile(p, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	c, e := Load(p)
	if e != nil {
		t.Fatal(e)
	}
	if c.Server.ID != "server-opaque-1" {
		t.Fatal(c.Server.ID)
	}
}
func TestRejectUnknown(t *testing.T) {
	p := filepath.Join(t.TempDir(), "c.yaml")
	_ = os.WriteFile(p, []byte("server:\n  id: a\n  tenant: b\nlogs:\n  apache_access: x\n  surprise: true\n"), 0600)
	if _, e := Load(p); e == nil {
		t.Fatal("wanted error")
	}
}
