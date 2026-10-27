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

func TestConfiguredHostSkipsLocalDefaultsAndPreservesNamedHostsWithPorts(t *testing.T) {
	for input, expected := range map[string]string{
		"localhost": "", "localhost:80": "", "localhost.localdomain": "",
		"foo.localhost": "", "127.0.0.1": "", "[::1]:80": "",
		"ip-172-31-35-220.ec2.internal": "",
		"Example.com:443":               "example.com", "https://Example.com:443": "example.com",
		"www.example.com.": "www.example.com", "example.com:99999": "",
		"https://user:pass@example.com": "", "https://example.com/private": "",
		"example.com:bad": "", "*.example.com": "", "${HOST}": "",
	} {
		if got := configuredHostname(input); got != expected {
			t.Errorf("configuredHostname(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestApacheHostsFollowsBoundedCustomIncludes(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "httpd.conf")
	vhosts := filepath.Join(dir, "Vhosts")
	if err := os.Mkdir(vhosts, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(root, []byte("ServerRoot \""+dir+"\"\nServerName localhost\nIncludeOptional Vhosts/*\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(vhosts, "www.spacemade.com"), []byte("ServerName www.spacemade.com:80\nServerAlias staging.spacemade.com origin.spacemade.com\nServerName spacemade.com\nInclude \""+root+"\"\n"), 0600); err != nil {
		t.Fatal(err)
	}
	hosts := apacheHosts([]string{root})
	expected := []string{"origin.spacemade.com", "spacemade.com", "staging.spacemade.com", "www.spacemade.com"}
	if len(hosts) != len(expected) {
		t.Fatalf("unexpected hosts: %v", hosts)
	}
	for i := range expected {
		if hosts[i] != expected[i] {
			t.Fatalf("unexpected hosts: %v", hosts)
		}
	}
}
