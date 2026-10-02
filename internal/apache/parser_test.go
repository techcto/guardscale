package apache

import "testing"

func TestTrustedXFF(t *testing.T) {
	p, _ := New([]string{"10.0.0.0/8"}, nil)
	r, e := p.ParseGuardScale("2026-01-01T00:00:00Z\t192.0.2.4, 10.2.3.4\t10.1.1.1\torigin.example.com\tGET\t/archive?page=90\t504\t10\t15000\t-\tExampleBrowser/1\tmissing")
	if e != nil {
		t.Fatal(e)
	}
	if r.ClientIP != "192.0.2.4" {
		t.Fatal(r.ClientIP)
	}
}
func TestUntrustedSpoof(t *testing.T) {
	p, _ := New([]string{"10.0.0.0/8"}, nil)
	r, _ := p.ParseGuardScale("2026-01-01T00:00:00Z\t192.0.2.4\t203.0.113.9\torigin.example.com\tGET\t/\t200\t10\t1\t-\tUA\tvalid")
	if r.ClientIP != "203.0.113.9" {
		t.Fatal(r.ClientIP)
	}
}
func TestCombinedRemovesQueryValues(t *testing.T) {
	p, _ := New(nil, nil)
	r, err := p.ParseCombined(`203.0.113.1 - - [02/Oct/2026:12:00:00 +0000] "GET /secret?token=value HTTP/1.1" 200 123 "https://private.example/" "Raw User Agent"`)
	if err != nil {
		t.Fatal(err)
	}
	if r.Path != "/secret" {
		t.Fatalf("path=%q", r.Path)
	}
}
func FuzzGuardScale(f *testing.F) {
	f.Add("bad")
	p, _ := New(nil, nil)
	f.Fuzz(func(t *testing.T, s string) { _, _ = p.ParseGuardScale(s) })
}
