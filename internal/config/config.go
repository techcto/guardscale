// Package config loads and strictly validates Guardian's dependency-free YAML subset.
package config

import (
	"bufio"
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Server     Server
	Logs       Logs
	Proxy      Proxy
	Origin     Origin
	Admin      Admin
	Health     Health
	Detection  Detection
	Protection Protection
	Storage    Storage
}
type Server struct{ ID, Tenant string }
type Logs struct{ ApacheAccess, ApacheError, PHPError, PHPSlow string }
type Proxy struct{ TrustedCIDRs []string }
type VerificationHeader struct{ Name, SecretFile string }
type Origin struct {
	ProtectedHosts      []string
	VerificationHeaders []VerificationHeader
}
type Admin struct{ ProtectedHosts []string }
type Health struct{ ProtectedPaths []string }
type Detection struct {
	Warning504Percent, Critical504Percent, Emergency504Percent float64
	TrafficMultiplierWarning                                   float64
	ExpensiveQueryParameters                                   []string
}
type Protection struct {
	Enabled, DryRun   bool
	DefaultTTLSeconds int
}
type Storage struct {
	StateDir                       string
	MaxEvidenceLines, MaxIncidents int
}

func Default() Config {
	return Config{
		Detection:  Detection{Warning504Percent: 2, Critical504Percent: 10, Emergency504Percent: 30, TrafficMultiplierWarning: 5, ExpensiveQueryParameters: []string{"table_filter"}},
		Protection: Protection{DryRun: true, DefaultTTLSeconds: 300},
		Storage:    Storage{StateDir: "./guardian-state", MaxEvidenceLines: 500, MaxIncidents: 20},
	}
}

// Load supports the intentionally small YAML shape documented in configs/config.example.yaml.
// Unknown keys fail closed so configuration mistakes are never silently ignored.
func Load(path string) (Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return Config{}, err
	}
	defer f.Close()
	c := Default()
	s := bufio.NewScanner(f)
	section, subsection := "", ""
	var currentHeader *VerificationHeader
	for line := 1; s.Scan(); line++ {
		raw := strings.TrimSpace(strings.SplitN(s.Text(), "#", 2)[0])
		if raw == "" {
			continue
		}
		indent := len(s.Text()) - len(strings.TrimLeft(s.Text(), " "))
		if indent == 0 && strings.HasSuffix(raw, ":") {
			section = strings.TrimSuffix(raw, ":")
			subsection = ""
			currentHeader = nil
			continue
		}
		if indent == 2 && strings.HasSuffix(raw, ":") {
			subsection = strings.TrimSuffix(raw, ":")
			continue
		}
		if strings.HasPrefix(raw, "- ") {
			v := unquote(strings.TrimSpace(strings.TrimPrefix(raw, "- ")))
			if strings.Contains(v, ":") && section == "origin" && subsection == "verification_headers" {
				p := strings.SplitN(v, ":", 2)
				c.Origin.VerificationHeaders = append(c.Origin.VerificationHeaders, VerificationHeader{})
				currentHeader = &c.Origin.VerificationHeaders[len(c.Origin.VerificationHeaders)-1]
				if strings.TrimSpace(p[0]) != "name" {
					return c, fmt.Errorf("line %d: verification header entries start with name", line)
				}
				currentHeader.Name = unquote(strings.TrimSpace(p[1]))
				continue
			}
			if err := appendList(&c, section, subsection, v); err != nil {
				return c, fmt.Errorf("line %d: %w", line, err)
			}
			continue
		}
		p := strings.SplitN(raw, ":", 2)
		if len(p) != 2 {
			return c, fmt.Errorf("line %d: expected key: value", line)
		}
		key, val := strings.TrimSpace(p[0]), unquote(strings.TrimSpace(p[1]))
		if currentHeader != nil && indent >= 6 {
			if key != "secret_file" {
				return c, fmt.Errorf("line %d: unknown verification header key %q", line, key)
			}
			currentHeader.SecretFile = val
			continue
		}
		if err := setScalar(&c, section, key, val); err != nil {
			return c, fmt.Errorf("line %d: %w", line, err)
		}
	}
	if err := s.Err(); err != nil {
		return c, err
	}
	return c, c.Validate()
}

func appendList(c *Config, sec, sub, v string) error {
	switch sec + "." + sub {
	case "proxy.trusted_cidrs":
		c.Proxy.TrustedCIDRs = append(c.Proxy.TrustedCIDRs, v)
	case "origin.protected_hosts":
		c.Origin.ProtectedHosts = append(c.Origin.ProtectedHosts, v)
	case "admin.protected_hosts":
		c.Admin.ProtectedHosts = append(c.Admin.ProtectedHosts, v)
	case "health.protected_paths":
		c.Health.ProtectedPaths = append(c.Health.ProtectedPaths, v)
	case "detection.expensive_query_parameters":
		c.Detection.ExpensiveQueryParameters = append(c.Detection.ExpensiveQueryParameters, v)
	default:
		return fmt.Errorf("unknown list %s.%s", sec, sub)
	}
	return nil
}
func setScalar(c *Config, sec, key, v string) error {
	n := func() (float64, error) { return strconv.ParseFloat(v, 64) }
	b := func() (bool, error) { return strconv.ParseBool(v) }
	i := func() (int, error) { return strconv.Atoi(v) }
	switch sec + "." + key {
	case "server.id":
		c.Server.ID = v
	case "server.tenant":
		c.Server.Tenant = v
	case "logs.apache_access":
		c.Logs.ApacheAccess = v
	case "logs.apache_error":
		c.Logs.ApacheError = v
	case "logs.php_error":
		c.Logs.PHPError = v
	case "logs.php_slow":
		c.Logs.PHPSlow = v
	case "detection.warning_504_percent":
		x, e := n()
		c.Detection.Warning504Percent = x
		return e
	case "detection.critical_504_percent":
		x, e := n()
		c.Detection.Critical504Percent = x
		return e
	case "detection.emergency_504_percent":
		x, e := n()
		c.Detection.Emergency504Percent = x
		return e
	case "detection.traffic_multiplier_warning":
		x, e := n()
		c.Detection.TrafficMultiplierWarning = x
		return e
	case "protection.enabled":
		x, e := b()
		c.Protection.Enabled = x
		return e
	case "protection.dry_run":
		x, e := b()
		c.Protection.DryRun = x
		return e
	case "protection.default_ttl_seconds":
		x, e := i()
		c.Protection.DefaultTTLSeconds = x
		return e
	case "storage.state_dir":
		c.Storage.StateDir = v
	case "storage.max_evidence_lines":
		x, e := i()
		c.Storage.MaxEvidenceLines = x
		return e
	case "storage.max_incidents":
		x, e := i()
		c.Storage.MaxIncidents = x
		return e
	default:
		return fmt.Errorf("unknown key %s.%s", sec, key)
	}
	return nil
}
func unquote(v string) string { return strings.Trim(strings.TrimSpace(v), "\"'") }
func (c Config) Validate() error {
	if c.Server.ID == "" || c.Server.Tenant == "" {
		return fmt.Errorf("server.id and server.tenant are required")
	}
	if c.Logs.ApacheAccess == "" {
		return fmt.Errorf("logs.apache_access is required")
	}
	if !(c.Detection.Warning504Percent <= c.Detection.Critical504Percent && c.Detection.Critical504Percent <= c.Detection.Emergency504Percent) {
		return fmt.Errorf("504 thresholds must be ordered warning <= critical <= emergency")
	}
	for _, s := range c.Proxy.TrustedCIDRs {
		if _, e := netip.ParsePrefix(s); e != nil {
			return fmt.Errorf("invalid trusted proxy CIDR %q: %w", s, e)
		}
	}
	for _, h := range c.Origin.VerificationHeaders {
		if h.Name == "" || h.SecretFile == "" {
			return fmt.Errorf("origin verification headers require name and secret_file")
		}
	}
	if c.Storage.MaxEvidenceLines < 1 || c.Storage.MaxIncidents < 1 {
		return fmt.Errorf("storage bounds must be positive")
	}
	return nil
}
func (p Protection) TTL() time.Duration { return time.Duration(p.DefaultTTLSeconds) * time.Second }
