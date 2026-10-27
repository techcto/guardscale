#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
compose=(docker compose -f devops/local/compose.yml -f devops/local/security.yml --profile local-fixture --profile local-security)
attack_mode=attack
stop_probe(){
  "${compose[@]}" exec -T probe node -e 'fetch("http://127.0.0.1:8080/stop",{method:"POST",signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1);console.log("Suspicious request generation stopped; firewall state is unchanged.")}).catch(()=>process.exit(1))'
}
case "${1:-}" in
  --continuous) test "$#" -eq 1 || exit 1; attack_mode=stream ;;
  --ffuf|--nuclei) test "$#" -eq 1 || exit 1; attack_mode="${1#--}"; compose+=(-f devops/local/tools.yml) ;;
  --verify-ffuf|--verify-nuclei) test "$#" -eq 1 || exit 1; exec node devops/local/test.mjs --security "--${1#--verify-}" ;;
  --stop) test "$#" -eq 1 || exit 1; stop_probe; exit ;;
  --verify)
    test "$#" -eq 1 || { echo 'Usage: bash attack.sh [--verify|--stop]' >&2; exit 1; }
    exec node devops/local/test.mjs --security
    ;;
  '') test "$#" -eq 0 || exit 1 ;;
  *) echo 'Usage: bash attack.sh [--ffuf|--nuclei|--verify|--verify-ffuf|--verify-nuclei|--stop]. Arbitrary targets are not accepted.' >&2; exit 1 ;;
esac
trap 'trap - INT TERM; stop_probe; exit 130' INT TERM
if [ "$attack_mode" = stream ]; then
  echo 'Local-only continuous test: one suspicious request/second for at most 30 minutes. Ctrl+C or bash attack.sh --stop stops requests.'
  "${compose[@]}" exec -T probe node /scripts/attack-client.mjs stream
  exit
fi
echo 'Disposable local test only: probe 192.0.2.20 → PHP container. No external target.'
echo 'Start first with: npm run local:security'
if [ "$attack_mode" != attack ]; then echo 'Real scanner mode requires: npm run local:security -- --tools'; fi
echo 'Open http://localhost:8185/incidents as root / test. Review the new alert and choose Block source temporarily.'
echo 'At most 180 harmless suspicious requests over 3 minutes; Ctrl+C stops this run.'
"${compose[@]}" exec -T probe node /scripts/attack-client.mjs "$attack_mode"
# A failed request alone is not proof of blocking: verify kernel membership and
# that the same website is reachable independently from the control-plane container.
"${compose[@]}" exec -T site ipset test guardscale_temporary 192.0.2.20
"${compose[@]}" exec -T web node -e 'fetch("http://site",{signal:AbortSignal.timeout(5000)}).then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))'
echo 'VERIFIED: source IP is in the temporary block set; the website remains reachable from the control plane.'
echo 'Suspicious requests stopped. Waiting for the existing block to expire (at most 15 minutes).'
"${compose[@]}" exec -T probe node /scripts/attack-client.mjs recover
echo 'RECOVERED: the probe can reach the website again. Review the incident for the agent execution/expiry audit.'
