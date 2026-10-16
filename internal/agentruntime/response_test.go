package agentruntime

import "testing"

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
