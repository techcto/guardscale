package agentruntime

import (
	"strings"
	"testing"
)

func TestRedaction(t *testing.T) {
	s := redact("error from 203.0.113.8 user@example.com /x?password=bad&token=secret Authorization=Bearer password=hunter2")
	for _, secret := range []string{"203.0.113.8", "user@example.com", "hunter2", "=bad", "=secret"} {
		if strings.Contains(s, secret) {
			t.Fatalf("leaked %q", secret)
		}
	}
}

func TestCredentialHeadersWithSpaces(t *testing.T) {
	for _, line := range []string{"Authorization: Bearer private-value", "Cookie: session=private-value; other=secret", `"password": "private-value"`} {
		if strings.Contains(redact(line), "private-value") {
			t.Fatal("credential leaked")
		}
	}
}
