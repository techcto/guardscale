package agentruntime

import (
	"github.com/techcto/guardscale/internal/apache"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

type requestSample struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Status int    `json:"status"`
	Count  int    `json:"count"`
}

// Source-scoped path examples only; query strings, headers and bodies stay local.
func requestSamples(requests []apache.Request, source string, now time.Time) []requestSample {
	counts := map[string]requestSample{}
	for _, request := range requests {
		if now.Sub(request.Time) < 0 || now.Sub(request.Time) > time.Minute || source != "" && request.ClientIP != source {
			continue
		}
		method := strings.ToUpper(request.Method)
		switch method {
		case "GET", "POST", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE":
		default:
			continue
		}
		path, _, _ := strings.Cut(request.Path, "?")
		path, _, _ = strings.Cut(path, "#")
		if !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") || request.Status < 100 || request.Status > 599 {
			continue
		}
		path = strings.Map(func(r rune) rune {
			if unicode.IsControl(r) {
				return -1
			}
			return r
		}, path)
		path = redact(path)
		if !strings.HasPrefix(path, "/") {
			continue
		}
		parts := strings.Split(path, "/")
		sensitive := false
		for i, part := range parts {
			lower := strings.ToLower(part)
			if sensitive || len(part) > 32 {
				parts[i] = "[redacted]"
			}
			sensitive = lower == "token" || lower == "secret" || lower == "password" || lower == "reset-password" || lower == "verify-email" || lower == "api-key"
		}
		path = strings.Join(parts, "/")
		if len(path) > 180 {
			path = path[:180] + "…"
		}
		key := method + " " + path + " " + strconv.Itoa(request.Status)
		sample := counts[key]
		sample.Method = method
		sample.Path = path
		sample.Status = request.Status
		sample.Count++
		counts[key] = sample
	}
	samples := make([]requestSample, 0, len(counts))
	for _, sample := range counts {
		samples = append(samples, sample)
	}
	sort.Slice(samples, func(i, j int) bool {
		if samples[i].Count != samples[j].Count {
			return samples[i].Count > samples[j].Count
		}
		if samples[i].Path != samples[j].Path {
			return samples[i].Path < samples[j].Path
		}
		if samples[i].Method != samples[j].Method {
			return samples[i].Method < samples[j].Method
		}
		return samples[i].Status < samples[j].Status
	})
	if len(samples) > 5 {
		samples = samples[:5]
	}
	return samples
}
