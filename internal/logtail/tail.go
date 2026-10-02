package logtail

import (
	"bufio"
	"context"
	"errors"
	"io"
	"os"
	"time"
)

// Follow handles truncation/replacement by reopening; missing optional logs are retried.
func Follow(ctx context.Context, path string, fromStart bool, out chan<- string) error {
	var offset int64
	initialized := false
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		f, e := os.Open(path)
		if e != nil {
			if errors.Is(e, os.ErrNotExist) {
				if !wait(ctx) {
					return ctx.Err()
				}
				continue
			}
			return e
		}
		st, _ := f.Stat()
		if !fromStart && !initialized {
			offset = st.Size()
			initialized = true
		}
		if offset > st.Size() {
			offset = 0
		}
		_, _ = f.Seek(offset, io.SeekStart)
		s := bufio.NewScanner(f)
		for s.Scan() {
			select {
			case out <- s.Text():
			case <-ctx.Done():
				f.Close()
				return ctx.Err()
			}
			offset, _ = f.Seek(0, io.SeekCurrent)
		}
		f.Close()
		if !wait(ctx) {
			return ctx.Err()
		}
	}
}
func wait(ctx context.Context) bool {
	t := time.NewTimer(250 * time.Millisecond)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
