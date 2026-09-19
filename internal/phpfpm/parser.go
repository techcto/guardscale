package phpfpm

import (
	"regexp"
	"strings"
	"time"
)

type Event struct {
	Time                     time.Time `json:"time"`
	Kind, Message, Signature string    `json:",omitempty"`
}

var frame = regexp.MustCompile(`(?m)^\s*(?:\[0x[0-9a-f]+\]\s+)?([A-Za-z_][A-Za-z0-9_:>-]*)\s*\(`)

func Parse(line string, at time.Time) Event {
	l := strings.ToLower(line)
	e := Event{Time: at, Message: line}
	switch {
	case strings.Contains(l, "max_children"):
		e.Kind = "max_children"
	case strings.Contains(l, "seems busy"):
		e.Kind = "busy"
	case strings.Contains(l, "executing too slow"):
		e.Kind = "slow"
	default:
		e.Kind = "info"
	}
	if strings.Contains(line, "|") {
		e.Signature = NormalizeStack(strings.ReplaceAll(line, "|", "\n"))
	}
	return e
}
func NormalizeStack(s string) string {
	m := frame.FindAllStringSubmatch(s, -1)
	names := make([]string, 0, len(m))
	for _, x := range m {
		names = append(names, strings.ToLower(x[1]))
	}
	return strings.Join(names, ">")
}
