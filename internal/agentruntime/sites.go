package agentruntime

import (
	"bufio"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var configuredHost = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$`)

func configuredHostname(value string) string {
	host := strings.ToLower(strings.Trim(value, `"'`))
	if strings.Contains(host, "://") {
		u, err := url.Parse(host)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Path != "" && u.Path != "/" || u.RawQuery != "" || u.Fragment != "" {
			return ""
		}
		host = u.Host
	}
	if strings.Contains(host, ":") {
		name, port, err := net.SplitHostPort(host)
		n, portErr := strconv.Atoi(port)
		if err != nil || portErr != nil || n < 1 || n > 65535 {
			return ""
		}
		host = name
	}
	host = strings.TrimSuffix(host, ".")
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || host == "localhost.localdomain" || strings.HasSuffix(host, ".ec2.internal") || net.ParseIP(host) != nil || len(host) > 253 || !configuredHost.MatchString(host) {
		return ""
	}
	return host
}

// Configured hostname suggestions only. No shell commands, DNS lookups, requests,
// log-derived Host headers, config paths or raw configuration leave the host.
func apacheHosts(patterns []string) []string {
	seen := map[string]bool{}
	visited := map[string]bool{}
	type pendingConfig struct {
		pattern, root string
		depth         int
	}
	queue := []pendingConfig{}
	for _, pattern := range patterns {
		root := filepath.Dir(pattern)
		for _, prefix := range []string{"/etc/httpd", "/etc/apache2", "/etc/nginx"} {
			if strings.HasPrefix(pattern, prefix+"/") {
				root = prefix
				break
			}
		}
		queue = append(queue, pendingConfig{pattern: pattern, root: root})
	}
	count := 0
	for len(queue) > 0 {
		pending := queue[0]
		queue = queue[1:]
		files, _ := filepath.Glob(pending.pattern)
		for _, name := range files {
			canonical, err := filepath.EvalSymlinks(name)
			if err != nil || visited[canonical] {
				continue
			}
			visited[canonical] = true
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
			nginxNames := false
			root := pending.root
			for scan.Scan() {
				line, _, _ := strings.Cut(scan.Text(), "#")
				fields := strings.Fields(line)
				if len(fields) == 0 {
					continue
				}
				if strings.EqualFold(fields[0], "ServerRoot") && len(fields) == 2 {
					candidate := strings.Trim(fields[1], `"'`)
					if filepath.IsAbs(candidate) && !strings.ContainsAny(candidate, "$\x00") {
						root = candidate
					}
				}
				if (strings.EqualFold(fields[0], "Include") || strings.EqualFold(fields[0], "IncludeOptional")) && len(fields) == 2 && pending.depth < 8 && len(queue) < 256 {
					include := strings.Trim(strings.TrimSuffix(fields[1], ";"), `"'`)
					if include != "" && !strings.ContainsAny(include, "$\x00") {
						if !filepath.IsAbs(include) {
							include = filepath.Join(root, include)
						}
						queue = append([]pendingConfig{{pattern: include, root: root, depth: pending.depth + 1}}, queue...)
					}
					continue
				}
				nginx := fields[0] == "server_name" || nginxNames
				if !nginx && (len(fields) < 2 || (!strings.EqualFold(fields[0], "ServerName") && !strings.EqualFold(fields[0], "ServerAlias"))) {
					continue
				}
				names := fields[1:]
				if nginxNames {
					names = fields
				}
				nginxNames = nginx && !strings.Contains(line, ";")
				if nginx {
					// Ignore all directives after the end of server_name.
					joined, _, _ := strings.Cut(strings.Join(names, " "), ";")
					names = strings.Fields(joined)
				}
				for _, field := range names {
					field = strings.TrimSuffix(field, ";")
					host := configuredHostname(field)
					if host != "" && len(seen) < 20 {
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
	return apacheHosts([]string{"/etc/apache2/sites-enabled/*", "/etc/apache2/apache2.conf", "/etc/httpd/conf.d/*.conf", "/etc/httpd/conf/httpd.conf", "/etc/nginx/sites-enabled/*", "/etc/nginx/conf.d/*.conf", "/etc/nginx/nginx.conf"})
}
