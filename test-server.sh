#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
compose=(docker compose -f docker-compose.yml -f devops/local/main-test-server.yml --profile test-server)
case "${1:-start}" in
  start)
    "${compose[@]}" build test-site
    "${compose[@]}" run --rm --no-deps test-enroll
    "${compose[@]}" up --no-deps -d test-site test-probe
    "${compose[@]}" restart test-site
    main_address=$("${compose[@]}" port guardscale-web 3000)
    echo "Test server: http://localhost:8186. Review local-php-fixture in your MAIN app at http://${main_address}."
    echo 'No attack started. When ready: bash test-server.sh attack'
    ;;
  attack)
    trap 'bash test-server.sh stop-attack; exit 130' INT TERM
    "${compose[@]}" exec -T test-probe node /scripts/attack-client.mjs stream
    ;;
  stop-attack)
    "${compose[@]}" exec -T test-probe node -e 'fetch("http://127.0.0.1:8080/stop",{method:"POST"}).then(r=>{if(!r.ok)process.exit(1)})'
    ;;
  stop) "${compose[@]}" stop test-site test-probe ;;
  logs) "${compose[@]}" logs -f test-site test-probe ;;
  *) echo 'Usage: bash test-server.sh [start|attack|stop-attack|stop|logs]' >&2; exit 1 ;;
esac
