package agentruntime

import (
	"bufio"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var configuredHost = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$`)

// Configured hostname suggestions only. No shell commands, DNS lookups, requests,
// log-derived Host headers, config paths or raw configuration leave the host.
func apacheHosts(patterns []string) []string {
	seen := map[string]bool{}
	count := 0
	for _, pattern := range patterns {
		files, _ := filepath.Glob(pattern)
		for _, name := range files {
			count++
			if count > 32 {
				break
			}
			info, err := os.Stat(name)
			if err != nil || !info.Mode().IsRegular() {
				continue
			}
			file, err := os.Open(name)
			if err != nil {
				continue
			}
			scan := bufio.NewScanner(io.LimitReader(file, 64*1024))
			for scan.Scan() {
				line, _, _ := strings.Cut(scan.Text(), "#")
				fields := strings.Fields(line)
				if len(fields) < 2 || (!strings.EqualFold(fields[0], "ServerName") && !strings.EqualFold(fields[0], "ServerAlias")) {
					continue
				}
				for _, field := range fields[1:] {
					host := strings.ToLower(strings.Trim(field, `"'`))
					if strings.Contains(host, ":") {
						continue
					} // Do not invent a scheme/port.
					if len(host) <= 253 && configuredHost.MatchString(host) && len(seen) < 20 {
						seen[host] = true
					}
				}
			}
			file.Close()
		}
		if count > 32 {
			break
		}
	}
	hosts := make([]string, 0, len(seen))
	for host := range seen {
		hosts = append(hosts, host)
	}
	sort.Strings(hosts)
	return hosts
}

func discoverApacheHosts() []string {
	return apacheHosts([]string{"/etc/apache2/sites-enabled/*", "/etc/httpd/conf.d/*.conf", "/etc/httpd/conf/httpd.conf"})
}
