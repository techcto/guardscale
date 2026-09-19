package protection

import (
	"context"
	"testing"
	"time"
)

func TestTTLExpiry(t *testing.T) {
	e := New(true, true, nil)
	a := Action{ID: "a", Name: "temporary_path_protection", Expiry: time.Now().Add(time.Millisecond)}
	if err := e.Apply(context.Background(), a); err != nil {
		t.Fatal(err)
	}
	if len(e.Expire(context.Background(), time.Now().Add(time.Second))) != 1 || len(e.Active()) != 0 {
		t.Fatal("not expired")
	}
}
func TestRejectShell(t *testing.T) {
	e := New(true, true, nil)
	if e.Apply(context.Background(), Action{ID: "x", Name: "shell", Expiry: time.Now().Add(time.Minute)}) == nil {
		t.Fatal("shell accepted")
	}
}
