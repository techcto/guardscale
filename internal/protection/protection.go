package protection

import (
	"context"
	"fmt"
	"sync"
	"time"
)

var allowed = map[string]bool{"temporary_path_protection": true, "reload_php": true, "restart_php": true, "reload_web": true, "restore": true}

type Action struct {
	ID, IncidentID, Name, Reason string
	Start, Expiry                time.Time
	DryRun                       bool
	Result                       string
}
type Executor interface {
	Apply(context.Context, Action) error
	Rollback(context.Context, Action) error
}
type Engine struct {
	mu           sync.Mutex
	enabled, dry bool
	active       map[string]Action
	exec         Executor
}

func New(enabled, dry bool, e Executor) *Engine {
	return &Engine{enabled: enabled, dry: dry, active: map[string]Action{}, exec: e}
}
func (e *Engine) Apply(ctx context.Context, a Action) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !allowed[a.Name] {
		return fmt.Errorf("action %q is not allowlisted", a.Name)
	}
	if !e.enabled && !e.dry {
		return fmt.Errorf("protection disabled")
	}
	if a.Expiry.IsZero() || !a.Expiry.After(time.Now()) {
		return fmt.Errorf("action requires future expiry")
	}
	a.DryRun = e.dry
	if !a.DryRun && e.exec != nil {
		if err := e.exec.Apply(ctx, a); err != nil {
			return err
		}
	}
	e.active[a.ID] = a
	return nil
}
func (e *Engine) Expire(ctx context.Context, now time.Time) []Action {
	e.mu.Lock()
	defer e.mu.Unlock()
	var out []Action
	for id, a := range e.active {
		if !now.Before(a.Expiry) {
			if !a.DryRun && e.exec != nil {
				_ = e.exec.Rollback(ctx, a)
			}
			delete(e.active, id)
			out = append(out, a)
		}
	}
	return out
}
func (e *Engine) Active() []Action {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]Action, 0, len(e.active))
	for _, a := range e.active {
		out = append(out, a)
	}
	return out
}
