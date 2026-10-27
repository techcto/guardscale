package agentruntime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEC2IdentityBoundToInstanceAndSelectedTags(t *testing.T) {
	id := "i-123456"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/latest/api/token" {
			if r.Method != "PUT" {
				t.Error("token must use PUT")
			}
			w.Write([]byte("token"))
			return
		}
		if r.Header.Get("X-aws-ec2-metadata-token") != "token" {
			t.Error("missing token")
		}
		switch r.URL.Path {
		case "/latest/meta-data/instance-id":
			w.Write([]byte(id))
		case "/latest/meta-data/tags/instance/Name":
			w.Write([]byte("Customer website"))
		case "/latest/meta-data/tags/instance/Environment":
			w.Write([]byte("production"))
		case "/latest/meta-data/tags/instance/Application", "/latest/meta-data/tags/instance/Project", "/latest/meta-data/tags/instance/Service", "/latest/meta-data/tags/instance/Stack", "/latest/meta-data/tags/instance/aws:cloudformation:stack-name":
			http.NotFound(w, r)
		default:
			t.Errorf("unexpected metadata request: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	name, tags := readEC2Identity(context.Background(), server.Client(), server.URL, id)
	if name != "Customer website" || len(tags) != 2 || tags[1] != "Environment=production" {
		t.Fatalf("unexpected identity %q %v", name, tags)
	}
	name, tags = readEC2Identity(context.Background(), server.Client(), server.URL, "i-other")
	if name != "" || tags != nil {
		t.Fatal("metadata from a different instance must not be attributed")
	}
}
