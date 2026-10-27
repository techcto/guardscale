#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
compose=(docker compose -f docker-compose.yml -f devops/local/main-test-server.yml --profile test-server)
mode=${1:-start}
if [ "$#" -gt 2 ] || { [ "$#" -eq 2 ] && [ "$2" != --tools ]; }; then echo 'Optional second argument: --tools' >&2; exit 1; fi
if [ "$mode" = start-prod ]; then compose+=(-f devops/local/main-test-server-prod.yml); fi
if [ "${2:-}" = --tools ]; then compose+=(-f devops/local/main-test-server-tools.yml); fi
case "$mode" in
  start|start-prod)
    if [ "${2:-}" = --tools ]; then git submodule status --recursive; fi
    "${compose[@]}" build test-site test-probe
    "${compose[@]}" run --rm --no-deps test-enroll
    "${compose[@]}" up --force-recreate --no-deps -d test-site test-probe
    if [ "$mode" = start-prod ]; then
      echo 'Test server: http://localhost:8186. Review local-php-fixture-prod at https://guardscale.org/servers.'
    else
      main_address=$("${compose[@]}" port guardscale-web 3000)
      echo "Test server: http://localhost:8186. Review local-php-fixture in your MAIN app at http://${main_address}."
    fi
    echo 'No attack started. When ready: bash test-server.sh attack'
    ;;
  attack)
    trap 'bash test-server.sh stop-attack; exit 130' INT TERM
    "${compose[@]}" exec -T test-probe node /scripts/attack-client.mjs stream
    ;;
  ffuf|nuclei) "${compose[@]}" exec -T test-probe node /scripts/attack-client.mjs "$mode" ;;
  stop-attack)
    "${compose[@]}" exec -T test-probe node -e 'fetch("http://127.0.0.1:8080/stop",{method:"POST"}).then(r=>{if(!r.ok)process.exit(1)})'
    ;;
  stop) "${compose[@]}" stop test-site test-probe ;;
  logs) "${compose[@]}" logs -f test-site test-probe ;;
  *) echo 'Usage: bash test-server.sh [start|start-prod|attack|ffuf|nuclei|stop-attack|stop|logs] [--tools]' >&2; exit 1 ;;
esac
