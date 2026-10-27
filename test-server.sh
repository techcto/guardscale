#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
compose=(docker compose -f docker-compose.yml -f devops/local/main-test-server.yml --profile test-server)
mode=${1:-start}
if [ "$#" -gt 2 ] || { [ "$#" -eq 2 ] && [ "$2" != --tools ] && [ "$2" != --multi ]; }; then echo 'Optional second argument: --tools or --multi' >&2; exit 1; fi
if [ "$mode" = start-prod ]; then compose+=(-f devops/local/main-test-server-prod.yml); fi
if [ "${2:-}" = --tools ] || [ "${2:-}" = --multi ]; then compose+=(-f devops/local/main-test-server-tools.yml); fi
probes=(test-probe)
if [ "${2:-}" = --multi ] || [ "$mode" = multi ]; then
  compose+=(-f devops/local/main-test-server-multi.yml)
  probes+=(test-probe-two test-probe-three)
fi
if { [ "$mode" = stop ] || [ "$mode" = stop-attack ] || [ "$mode" = logs ]; } && [ "${2:-}" != --multi ]; then
  compose+=(-f devops/local/main-test-server-multi.yml)
  probes+=(test-probe-two test-probe-three)
fi
case "$mode" in
  start|start-prod)
    if [ "${2:-}" = --tools ] || [ "${2:-}" = --multi ]; then git submodule status --recursive; fi
    "${compose[@]}" build test-site test-probe
    "${compose[@]}" run --rm --no-deps test-enroll
    "${compose[@]}" up --force-recreate --no-deps -d test-site "${probes[@]}"
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
  multi)
    trap 'bash test-server.sh stop-attack; exit 130' INT TERM
    pids=()
    for entry in test-probe:ffuf test-probe-two:nuclei test-probe-three:ffuf; do
      service=${entry%:*}; tool=${entry#*:}
      "${compose[@]}" exec -T "$service" node --input-type=module -e 'const tool=process.argv[1];const r=await fetch("http://127.0.0.1:8080/"+tool,{method:"POST",signal:AbortSignal.timeout(100000)});const d=await r.json();console.log(JSON.stringify({tool,http:r.status,exitCode:d.exitCode,requests:d.requests,requestLimit:d.requestLimit}));if(!r.ok||d.exitCode!==0)process.exit(1);' "$tool" &
      pids+=("$!")
    done
    failed=0; for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
    exit "$failed"
    ;;
  stop-attack)
    for service in "${probes[@]}"; do
      if [ -n "$("${compose[@]}" ps --status running -q "$service")" ]; then
        "${compose[@]}" exec -T "$service" node -e 'fetch("http://127.0.0.1:8080/stop",{method:"POST"}).then(r=>{if(!r.ok)process.exit(1)})'
      fi
    done
    ;;
  stop) "${compose[@]}" stop test-site "${probes[@]}" ;;
  logs) "${compose[@]}" logs -f test-site "${probes[@]}" ;;
  *) echo 'Usage: bash test-server.sh [start|start-prod|attack|ffuf|nuclei|multi|stop-attack|stop|logs] [--tools|--multi]' >&2; exit 1 ;;
esac
