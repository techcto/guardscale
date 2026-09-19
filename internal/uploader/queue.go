package uploader

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"
)

type Queue struct {
	Dir, Endpoint, Token string
	Client               *http.Client
	MaxItems             int
}
type item struct {
	Path    string          `json:"path"`
	Body    json.RawMessage `json:"body"`
	Created time.Time       `json:"created"`
}

func (q Queue) Enqueue(path string, v any) error {
	if q.MaxItems < 1 {
		q.MaxItems = 100
	}
	if e := os.MkdirAll(q.Dir, 0700); e != nil {
		return e
	}
	b, e := json.Marshal(v)
	if e != nil {
		return e
	}
	x, _ := json.Marshal(item{path, b, time.Now().UTC()})
	name := fmt.Sprintf("%020d.json", time.Now().UnixNano())
	if e = os.WriteFile(filepath.Join(q.Dir, name), x, 0600); e != nil {
		return e
	}
	return q.trim()
}
func (q Queue) trim() error {
	es, e := os.ReadDir(q.Dir)
	if e != nil {
		return e
	}
	sort.Slice(es, func(i, j int) bool { return es[i].Name() < es[j].Name() })
	for len(es) > q.MaxItems {
		_ = os.Remove(filepath.Join(q.Dir, es[0].Name()))
		es = es[1:]
	}
	return nil
}
func (q Queue) Flush(ctx context.Context) error {
	es, e := os.ReadDir(q.Dir)
	if os.IsNotExist(e) {
		return nil
	}
	if e != nil {
		return e
	}
	client := q.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	for _, ent := range es {
		b, e := os.ReadFile(filepath.Join(q.Dir, ent.Name()))
		if e != nil {
			return e
		}
		var x item
		if e = json.Unmarshal(b, &x); e != nil {
			return e
		}
		req, e := http.NewRequestWithContext(ctx, http.MethodPost, q.Endpoint+x.Path, bytes.NewReader(x.Body))
		if e != nil {
			return e
		}
		req.Header.Set("Authorization", "Bearer "+q.Token)
		req.Header.Set("Content-Type", "application/json")
		resp, e := client.Do(req)
		if e != nil {
			return e
		}
		resp.Body.Close()
		if resp.StatusCode/100 != 2 {
			return fmt.Errorf("upload returned %s", resp.Status)
		}
		if e = os.Remove(filepath.Join(q.Dir, ent.Name())); e != nil {
			return e
		}
	}
	return nil
}
