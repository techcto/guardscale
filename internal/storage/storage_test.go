package storage

import "testing"

func TestTenantIsolation(t *testing.T) {
	s := NewMemory()
	_ = s.UpsertServer(Server{TenantID: "tenant-a", ID: "same"})
	_ = s.UpsertServer(Server{TenantID: "tenant-b", ID: "same"})
	a, _ := s.Servers("tenant-a")
	if len(a) != 1 || a[0].TenantID != "tenant-a" {
		t.Fatalf("cross tenant result: %#v", a)
	}
	if _, e := s.Server("tenant-c", "same"); e == nil {
		t.Fatal("cross-tenant lookup succeeded")
	}
}
