package agentruntime

import (
	"os"
	"path/filepath"
	"testing"
)

func TestApacheHostsOnlyReturnsBoundedConfiguredNames(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "site.conf")
	if err := os.WriteFile(file, []byte("<VirtualHost *:80>\nServerName Example.com\nServerAlias www.example.com *.example.com ${HOST} evil.com/path\n# ServerName ignored.example\n</VirtualHost>\nServerName example.com\n"), 0600); err != nil {
		t.Fatal(err)
	}
	hosts := apacheHosts([]string{file})
	if len(hosts) != 2 || hosts[0] != "example.com" || hosts[1] != "www.example.com" {
		t.Fatalf("unexpected hosts: %v", hosts)
	}
	if len(apacheHosts([]string{filepath.Join(dir, "missing")})) != 0 {
		t.Fatal("missing config must not create sites")
	}
}

func TestNginxHostsIncludesMultilineNames(t *testing.T) {
	file := filepath.Join(t.TempDir(), "nginx.conf")
	if err := os.WriteFile(file, []byte("server_name example.org\n www.example.org; root /var/www; # configured names\nserver_name _ *.bad.org $host ~regex;\n"), 0600); err != nil {
		t.Fatal(err)
	}
	hosts := apacheHosts([]string{file})
	if len(hosts) != 2 || hosts[0] != "example.org" || hosts[1] != "www.example.org" {
		t.Fatalf("unexpected names %v", hosts)
	}
}
