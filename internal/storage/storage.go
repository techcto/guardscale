package storage

import (
	"errors"
	"sort"
	"sync"
	"time"
)

var ErrNotFound = errors.New("not found")

type Server struct {
	TenantID, ID, AgentID, Name, Status string
	LastHeartbeat                       time.Time
}
type Event struct {
	TenantID, ServerID, AgentID, Type string
	At                                time.Time
	Metadata                          map[string]string
}
type Incident struct {
	TenantID, ServerID, AgentID, ID, State string
	StartedAt, UpdatedAt                   time.Time
	Payload                                []byte
}
type Command struct {
	TenantID, ServerID, ID, Action string
	Parameters                     map[string]string
	CreatedAt, ExpiresAt           time.Time
	Status, Result                 string
}
type Store interface {
	UpsertServer(Server) error
	Server(string, string) (Server, error)
	Servers(string) ([]Server, error)
	PutEvent(Event) error
	PutIncident(Incident) error
	Incident(string, string) (Incident, error)
	Incidents(string) ([]Incident, error)
	PutCommand(Command) error
	Commands(string, string) ([]Command, error)
	UpdateCommand(string, string, string, string) error
}
type Memory struct {
	mu        sync.RWMutex
	servers   map[string]Server
	incidents map[string]Incident
	events    []Event
	commands  map[string]Command
}

func NewMemory() *Memory {
	return &Memory{servers: map[string]Server{}, incidents: map[string]Incident{}, commands: map[string]Command{}}
}
func key(t, id string) string { return t + "\x00" + id }
func (m *Memory) UpsertServer(v Server) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.servers[key(v.TenantID, v.ID)] = v
	return nil
}
func (m *Memory) Server(t, id string) (Server, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.servers[key(t, id)]
	if !ok {
		return v, ErrNotFound
	}
	return v, nil
}
func (m *Memory) Servers(t string) ([]Server, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []Server
	for _, v := range m.servers {
		if v.TenantID == t {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}
func (m *Memory) PutEvent(v Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, v)
	return nil
}
func (m *Memory) PutIncident(v Incident) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.incidents[key(v.TenantID, v.ID)] = v
	return nil
}
func (m *Memory) Incident(t, id string) (Incident, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.incidents[key(t, id)]
	if !ok {
		return v, ErrNotFound
	}
	return v, nil
}
func (m *Memory) Incidents(t string) ([]Incident, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []Incident
	for _, v := range m.incidents {
		if v.TenantID == t {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.After(out[j].StartedAt) })
	return out, nil
}
func (m *Memory) PutCommand(v Command) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.commands[key(v.TenantID, v.ID)] = v
	return nil
}
func (m *Memory) Commands(t, s string) ([]Command, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []Command
	for _, v := range m.commands {
		if v.TenantID == t && v.ServerID == s {
			out = append(out, v)
		}
	}
	return out, nil
}
func (m *Memory) UpdateCommand(t, id, status, result string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.commands[key(t, id)]
	if !ok {
		return ErrNotFound
	}
	v.Status = status
	v.Result = result
	m.commands[key(t, id)] = v
	return nil
}
