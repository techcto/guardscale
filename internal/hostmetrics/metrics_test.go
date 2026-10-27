package hostmetrics

import (
	"math"
	"testing"
	"time"
)

func TestCPUUsesCounterDeltaAndMemoryUsesAvailable(t *testing.T) {
	s := &Sampler{}
	mem := "MemTotal: 1000 kB\nMemAvailable: 400 kB\nMemFree: 100 kB\n"
	first, err := s.Parse("cpu 100 0 100 800 0 0 0 0 25 0\n", mem, time.Now())
	if err != nil || first.CPUPercent != nil {
		t.Fatal("first sample must not invent a CPU reading", err)
	}
	second, err := s.Parse("cpu 125 0 125 850 0 0 0 0 50 0\n", mem, time.Now())
	if err != nil || second.CPUPercent == nil || math.Abs(*second.CPUPercent-50) > .01 {
		t.Fatal("expected 50% busy delta", second, err)
	}
	if second.MemoryTotalBytes != 1024000 || second.MemoryUsedBytes != 614400 || second.MemoryPercent != 60 {
		t.Fatal("incorrect available-memory calculation", second)
	}
	reset, err := s.Parse("cpu 1 0 1 8 0 0 0 0\n", mem, time.Now())
	if err != nil || reset.CPUPercent != nil {
		t.Fatal("counter reset must not report false utilization")
	}
	if _, err = s.Parse("invalid", mem, time.Now()); err == nil {
		t.Fatal("invalid counters accepted")
	}
}
