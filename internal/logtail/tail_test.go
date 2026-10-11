package logtail

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFollowBufferedLinesPartialWritesAndRotation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "access.log")
	if err := os.WriteFile(path, []byte("one\ntwo\nthree\npartial"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	out := make(chan string, 16)
	go func() { _ = Follow(ctx, path, true, out) }()
	next := func(want string) {
		t.Helper()
		select {
		case got := <-out:
			if got != want {
				t.Fatalf("got %q want %q", got, want)
			}
		case <-time.After(3 * time.Second):
			t.Fatalf("missing %q", want)
		}
	}
	next("one")
	next("two")
	next("three")
	select {
	case got := <-out:
		t.Fatalf("incomplete line emitted: %q", got)
	case <-time.After(300 * time.Millisecond):
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.WriteString(" done\nfour\n")
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	next("partial done")
	next("four")
	if err := os.Rename(path, path+".1"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("new file first line\nnew file second line\n"), 0600); err != nil {
		t.Fatal(err)
	}
	next("new file first line")
	next("new file second line")
}
