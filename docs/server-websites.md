# Server website links and Apache discovery

Website links appear inline beside platform/agent labels on the server detail
page only. There is no separate Websites card or editing form. Apache-discovered
hostnames become HTTPS links; assigned URLs take precedence for matching hosts.
HTTPS is an assumption, not a reachability/TLS check. Administrators can assign
up to 20 full HTTP(S) URLs using the API below, including custom ports or HTTP.
Multiple virtual hosts can share a server. Links open in a new tab
without an opener or referrer. Credentials, query strings, fragments and executable
schemes are rejected; URLs are not fetched or probed by GuardScale.

The real agent discovers hostname suggestions at startup from `ServerName` and
`ServerAlias` directives in `/etc/apache2/sites-enabled/*`,
`/etc/httpd/conf.d/*.conf`, and `/etc/httpd/conf/httpd.conf`. Reads are bounded to
32 files, 64 KiB per file, and 20 names. Only sanitized names leave the host;
configuration paths, file contents and request Host headers are not sent.
Unreadable/missing configuration returns no suggestions rather than invented sites.
Restart the agent after installing this version or changing Apache configuration.

Suggestions are **not verified public URLs**. The parser does not expand variables,
wildcards, nested Includes or conditional Apache configuration, and does not
discover Nginx/IIS sites. Hostnames containing explicit ports are skipped. Apache
may be behind TLS termination, a load balancer or a nonstandard port: an admin
can override the complete URL through the API. Never derive browse links from
attacker-controlled request logs.

REST: administrator `PATCH /api/v1/nodes/{serverId}` with same-origin session and
`{"websiteUrls":["https://example.com/","https://other.example.com/"]}`.
Use `[]` to clear links. Authenticated server responses include `websiteUrls` and
separate `discoveredHosts`; neither is added to the anonymous access-log stream.
The agent cannot overwrite administrator-assigned URLs through its heartbeat.
Incident alerts to the organization’s configured recipients include at most
three assigned links, bounded to 200 characters each, plus the incident link.

The localhost fixture seeds its assigned browse URL only when the field is not
yet set, so subsequent startup does not overwrite edits. Its security website
is http://localhost:8186; non-security fixture uses http://localhost:8184.
Existing customer agents must be upgraded/restarted to send discovery suggestions;
manual website assignment works without an agent update.
