#!/bin/sh
set -eu
test "${GUARDSCALE_LOCAL_FIXTURE:-}" = true || { echo 'Local fixture only'; exit 1; }
test -s /runtime/config.yaml
su -s /bin/sh www-data -c 'php /var/www/html/app.php'
guardscale run --config /runtime/config.yaml &
agent_pid=$!
apache2-foreground &
apache_pid=$!
trap 'kill "$agent_pid" "$apache_pid" 2>/dev/null || true; wait' TERM INT EXIT
while kill -0 "$agent_pid" 2>/dev/null && kill -0 "$apache_pid" 2>/dev/null; do sleep 1; done
exit 1
