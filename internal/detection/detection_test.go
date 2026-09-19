package detection

import (
	"fmt"
	"github.com/guardian-us/guardian/internal/apache"
	"github.com/guardian-us/guardian/internal/config"
	"github.com/guardian-us/guardian/internal/phpfpm"
	"testing"
	"time"
)

func TestCombinedAttack(t *testing.T) {
	c := config.Default()
	c.Origin.ProtectedHosts = []string{"origin.example.com"}
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	var rs []apache.Request
	for i := 0; i < 1500; i++ {
		rs = append(rs, apache.Request{Time: start.Add(time.Duration(i) * time.Millisecond * 40), ClientIP: fmt.Sprintf("192.0.2.%d", i%200+1), Host: "origin.example.com", URI: fmt.Sprintf("/archive?page=%d", i%300+1), Path: "/archive", UserAgent: "GenericBrowser/1", Status: map[bool]int{i%3 == 0: 504}[true]})
	}
	for i := range rs {
		if rs[i].Status == 0 {
			rs[i].Status = 200
		}
	}
	var ps []phpfpm.Event
	for i := 0; i < 8; i++ {
		ps = append(ps, phpfpm.Event{Kind: "slow", Signature: "dbquery>columns>navigation"})
	}
	fs := Evaluate(Snapshot{Requests: rs, PHP: ps, BaselineRPM: 55}, c)
	want := map[string]bool{"TrafficSpike": false, "DistributedCrawler": false, "PaginationEnumeration": false, "UniqueURLStorm": false, "DirectOriginAccess": false, "PHPSaturation": false, "SlowStackStorm": false, "HTTPFailureSpike": false}
	for _, f := range fs {
		if _, ok := want[f.Name]; ok {
			want[f.Name] = true
		}
	}
	for n, ok := range want {
		if !ok {
			t.Errorf("missing %s", n)
		}
	}
}
func TestNormalNoCritical(t *testing.T) {
	c := config.Default()
	now := time.Now()
	var rs []apache.Request
	for i := 0; i < 50; i++ {
		rs = append(rs, apache.Request{Time: now.Add(time.Duration(i) * time.Second), ClientIP: "192.0.2.10", URI: "/", Path: "/", Status: 200})
	}
	for _, f := range Evaluate(Snapshot{Requests: rs, BaselineRPM: 50}, c) {
		if f.Severity == Critical {
			t.Fatal(f.Name)
		}
	}
}
