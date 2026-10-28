package apache

import "testing"

func TestCloudFrontThenALBChoosesViewerAndIgnoresSpoofedLeftEntry(t *testing.T) {
	p, _ := New([]string{"10.0.1.0/24", "198.51.100.0/24"}, nil)
	r, err := p.ParseGuardScale("2026-10-28T08:00:00-0400\t192.0.2.99, 203.0.113.20, 198.51.100.10\t10.0.1.10\twww.example.com\tGET\t/.env\t404\t0\t1\t-\tUA\tmissing")
	if err != nil {
		t.Fatal(err)
	}
	if r.ClientIP != "203.0.113.20" || !r.TrustedProxy || r.PeerIP != "10.0.1.10" {
		t.Fatalf("unexpected trusted chain: %+v", r)
	}
}

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

func TestCMSCombinedProxyChain(t *testing.T) {
	line := `172.31.5.159 - - [28/Oct/2026:12:00:00 +0000] "GET /.env.local HTTP/1.1" 403 123 "-" "Scanner" "192.0.2.99, 203.0.113.20, 198.51.100.10" "172.31.5.159" "www.example.com" 12`
	for _, trusted := range []bool{true, false} {
		cidrs := []string(nil)
		want := "172.31.5.159"
		if trusted {
			cidrs = []string{"172.31.5.0/24", "198.51.100.0/24"}
			want = "203.0.113.20"
		}
		p, _ := New(cidrs, nil)
		r, err := p.ParseCombined(line)
		if err != nil {
			t.Fatal(err)
		}
		if r.ClientIP != want || r.PeerIP != "172.31.5.159" || r.Host != "www.example.com" || r.Duration.Milliseconds() != 12 {
			t.Fatalf("unexpected request: %+v", r)
		}
	}
}
