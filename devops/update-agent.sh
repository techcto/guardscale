#!/usr/bin/env bash
set -euo pipefail
set +x
[[ $EUID -eq 0 ]] || { echo 'Run this updater with sudo.' >&2; exit 1; }
test -f /etc/guardscale/config.yaml
test -f /etc/guardscale/enrollment.token
case "$(uname -m)" in x86_64) arch=amd64;; aarch64|arm64) arch=arm64;; *) echo 'Unsupported architecture' >&2;exit 1;; esac
base=https://guardscale.s3.us-east-1.amazonaws.com/agent
version=${GUARDSCALE_AGENT_VERSION:-latest}
if [[ $version == latest ]]; then
  pointer=$(curl --retry 3 -fsS --connect-timeout 10 --max-time 60 "$base/latest/release.json")
  version=$(printf '%s' "$pointer" | sed -nE 's/^[[:space:]]*\{[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)"[[:space:]]*\}[[:space:]]*$/\1/p')
fi
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release pointer/version' >&2;exit 1; }
case "${GUARDSCALE_AUTO_UPDATE:-0}" in 0|1) ;; *) echo 'GUARDSCALE_AUTO_UPDATE must be 0 or 1' >&2;exit 1;; esac
install -d -m 0750 /var/lib/guardscale-updater
exec 9>/var/lib/guardscale-updater/update.lock
flock -n 9 || { echo 'Another update is running' >&2;exit 1; }
work=$(mktemp -d)
changed=0
cleanup(){
  result=$?
  if [[ $result -ne 0 && $changed -eq 1 ]]; then
    echo 'Update failed; restoring the previous binary.' >&2
    mv -f /usr/local/bin/guardscale.previous /usr/local/bin/guardscale
    systemctl restart guardscale.service || echo 'Previous binary restored; check the service manually.' >&2
  fi
  rm -rf -- "$work"
  rm -f /usr/local/bin/guardscale.next
  exit "$result"
}
trap cleanup EXIT
cd "$work"
binary=guardscale-linux-$arch
for asset in "$binary" SHA256SUMS guardscale-update.service guardscale-update.timer; do
  curl --retry 3 -fsSLo "$asset" --connect-timeout 10 --max-time 120 "$base/$version/$asset"
done
for asset in "$binary" guardscale-update.service guardscale-update.timer; do
  awk -v file="$asset" '$2==file{print}' SHA256SUMS | sha256sum --check --strict -
done
chmod 0755 "$binary"
candidate_version=$("./$binary" version)
[[ $candidate_version == "GuardScale $version (linux/$arch)" ]] || { echo 'Candidate version or architecture mismatch' >&2;exit 1; }
printf '%s\n' "$candidate_version"
"./$binary" test-config --config /etc/guardscale/config.yaml
cp -p /usr/local/bin/guardscale /usr/local/bin/guardscale.previous
install -m 0755 "$binary" /usr/local/bin/guardscale.next
mv -f /usr/local/bin/guardscale.next /usr/local/bin/guardscale
changed=1
systemctl restart guardscale.service
for _ in $(seq 1 10); do sleep 1;systemctl is-active --quiet guardscale.service;done
changed=0
install -m 0644 guardscale-update.service /etc/systemd/system/guardscale-update.service
install -m 0644 guardscale-update.timer /etc/systemd/system/guardscale-update.timer
systemctl daemon-reload
if [[ ${GUARDSCALE_AUTO_UPDATE:-0} == 1 ]]; then systemctl enable --now guardscale-update.timer;fi
/usr/local/bin/guardscale version
echo 'Existing configuration and enrollment preserved. Auto-update timer changes only when explicitly enabled.'
