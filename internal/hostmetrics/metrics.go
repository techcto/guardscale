package hostmetrics

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Sample struct {
	IntervalSeconds  int      `json:"interval_seconds"`
	SampledAt        string   `json:"sampled_at"`
	CPUPercent       *float64 `json:"cpu_percent,omitempty"`
	MemoryTotalBytes uint64   `json:"memory_total_bytes"`
	MemoryUsedBytes  uint64   `json:"memory_used_bytes"`
	MemoryPercent    float64  `json:"memory_percent"`
}
type Sampler struct {
	total, idle uint64
	previous    bool
}

func cpuCounters(raw string) (uint64, uint64, error) {
	fields := strings.Fields(strings.SplitN(raw, "\n", 2)[0])
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0, fmt.Errorf("CPU counters unavailable")
	}
	var total, idle uint64
	for i, field := range fields[1:] {
		if i >= 8 {
			break
		}
		n, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return 0, 0, err
		}
		total += n
		if i == 3 || i == 4 {
			idle += n
		}
	}
	return total, idle, nil
}
func memoryCounters(raw string) (uint64, uint64, error) {
	values := map[string]uint64{}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		f := strings.Fields(scanner.Text())
		if len(f) < 2 {
			continue
		}
		n, err := strconv.ParseUint(f[1], 10, 64)
		if err == nil {
			values[strings.TrimSuffix(f[0], ":")] = n
		}
	}
	total := values["MemTotal"]
	if total == 0 || total > 1<<40 {
		return 0, 0, fmt.Errorf("memory counters unavailable")
	}
	available, exists := values["MemAvailable"]
	if !exists {
		available = values["MemFree"] + values["Buffers"] + values["Cached"]
	}
	if available > total {
		available = total
	}
	return total * 1024, (total - available) * 1024, nil
}
func (s *Sampler) Parse(stat, mem string, at time.Time) (Sample, error) {
	total, idle, err := cpuCounters(stat)
	if err != nil {
		return Sample{}, err
	}
	ram, used, err := memoryCounters(mem)
	if err != nil {
		return Sample{}, err
	}
	sample := Sample{SampledAt: at.UTC().Format(time.RFC3339Nano), MemoryTotalBytes: ram, MemoryUsedBytes: used, MemoryPercent: 100 * float64(used) / float64(ram)}
	if s.previous && total > s.total && idle >= s.idle {
		delta := total - s.total
		idleDelta := idle - s.idle
		if idleDelta <= delta {
			busy := 100 * float64(delta-idleDelta) / float64(delta)
			sample.CPUPercent = &busy
		}
	}
	s.total, s.idle, s.previous = total, idle, true
	return sample, nil
}
func (s *Sampler) Read() (Sample, error) {
	stat, err := os.ReadFile("/proc/stat")
	if err != nil {
		return Sample{}, err
	}
	mem, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return Sample{}, err
	}
	return s.Parse(string(stat), string(mem), time.Now())
}
