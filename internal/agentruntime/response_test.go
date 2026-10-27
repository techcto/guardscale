package agentruntime

import (
	"testing"
	"time"
)

func TestBoundedRenewalRequiresFreshPerSourceCounters(t *testing.T) {
	now := time.Now()
	expiry := now.Add(10 * time.Second)
	cap := now.Add(90 * time.Second)
	for _, tc := range []struct {
		packets, previous uint64
		expiry            time.Time
	}{{2, 0, expiry}, {5, 5, expiry}, {3, 9, expiry}, {10, 0, now.Add(time.Minute)}, {10, 0, now.Add(-time.Second)}} {
		if _, ok := renewalExpiry(now, tc.expiry, cap, 60, tc.packets, tc.previous); ok {
			t.Fatal("renewed without fresh evidence near live expiry")
		}
	}
	next, ok := renewalExpiry(now, expiry, now.Add(40*time.Second), 60, 10, 0)
	if !ok || !next.Equal(now.Add(40*time.Second)) {
		t.Fatal("total duration cap not enforced")
	}
	p, b, ok := blockedCounters("add guardscale_temporary 192.0.2.20 timeout 20 packets 7 bytes 700\nadd guardscale_temporary 192.0.2.21 timeout 20 packets 99 bytes 9900", "192.0.2.20")
	if !ok || p != 7 || b != 700 {
		t.Fatal("per-source counter not parsed")
	}
	if _, _, ok := blockedCounters("add guardscale_temporary 192.0.2.20 timeout 20", "192.0.2.20"); ok {
		t.Fatal("missing counters accepted")
	}
}

func TestProtectionRequiresExplicitBoundedTarget(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "::1", "192.0.2.30"} {
		if permittedTarget(ip, []string{"192.0.2.20/32"}) {
			t.Fatalf("unsafe target accepted: %s", ip)
		}
	}
	if !permittedTarget("192.0.2.20", []string{"192.0.2.20/32"}) {
		t.Fatal("explicit disposable probe denied")
	}
	if permittedTarget("192.0.2.20", nil) || permittedTarget("192.0.2.20", []string{"0.0.0.0/0"}) {
		t.Fatal("unbounded target allowed")
	}
}
