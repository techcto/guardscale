package logtail

import (
	"bufio"
	"bytes"
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
	var previous os.FileInfo
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
		st, err := f.Stat()
		if err != nil {
			f.Close()
			return err
		}
		if previous != nil && !os.SameFile(previous, st) {
			offset = 0
		}
		previous = st
		if !fromStart && !initialized {
			offset = st.Size()
			initialized = true
		}
		if offset > st.Size() {
			offset = 0
		}
		_, _ = f.Seek(offset, io.SeekStart)
		s := bufio.NewScanner(f)
		s.Buffer(make([]byte, 4096), 1024*1024)
		// Do not emit incomplete writes. Track consumed lines, not the file
		// descriptor position: Scanner reads ahead into its internal buffer.
		s.Split(func(data []byte, atEOF bool) (int, []byte, error) {
			if i := bytes.IndexByte(data, '\n'); i >= 0 {
				return i + 1, data[:i], nil
			}
			return 0, nil, nil
		})
		for s.Scan() {
			select {
			case out <- s.Text():
			case <-ctx.Done():
				f.Close()
				return ctx.Err()
			}
			offset += int64(len(s.Bytes()) + 1)
		}
		scanErr := s.Err()
		f.Close()
		if scanErr != nil {
			return scanErr
		}
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
