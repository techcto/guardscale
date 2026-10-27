#!/usr/bin/env bash
set -euo pipefail
[[ ${GUARDSCALE_UPDATER_SANDBOX:-} == 1 && -f /.dockerenv && $EUID -eq 0 ]] || { echo 'Run only in the dedicated disposable test container' >&2;exit 1; }
fixture=$(mktemp -d)
export GUARDSCALE_BOOTSTRAP_FIXTURE="$fixture"
mkdir -p "$fixture/bin" /etc/guardscale /usr/local/bin
printf 'existing-config\n' >/etc/guardscale/config.yaml
printf 'existing-enrollment\n' >/etc/guardscale/enrollment.token
printf '#!/bin/sh\necho old-agent\n' >"$fixture/old-agent"
chmod 755 "$fixture/old-agent"
case "$(uname -m)" in x86_64) binary=guardscale-linux-amd64;; aarch64|arm64) binary=guardscale-linux-arm64;; *) exit 1;; esac
export GUARDSCALE_TEST_ARCH=${binary##*-}
cat >"$fixture/$binary" <<'SCRIPT'
#!/bin/sh
case "$1" in version) echo "GuardScale 0.3.8 (linux/$GUARDSCALE_TEST_ARCH)";; test-config) exit 0;; *) echo new-agent;; esac
SCRIPT
cp /src/systemd/guardscale-update.service /src/systemd/guardscale-update.timer "$fixture/"
printf '{"version":"0.3.8"}\n' >"$fixture/release.json"
(cd "$fixture" && sha256sum "$binary" guardscale-update.service guardscale-update.timer >SHA256SUMS)
cat >"$fixture/bin/curl" <<'SCRIPT'
#!/bin/bash
set -euo pipefail
destination='';args=("$@")
for ((i=0;i<${#args[@]};i++));do if [[ ${args[i]} == -fsSLo ]];then destination=${args[i+1]};fi;done
url=${args[${#args[@]}-1]};asset=${url##*/}
if [[ -n $destination ]];then cp "$GUARDSCALE_BOOTSTRAP_FIXTURE/$asset" "$destination";else cat "$GUARDSCALE_BOOTSTRAP_FIXTURE/$asset";fi
SCRIPT
cat >"$fixture/bin/systemctl" <<'SCRIPT'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >>"$GUARDSCALE_BOOTSTRAP_FIXTURE/systemctl-calls"
if [[ $1 == is-active && -f $GUARDSCALE_BOOTSTRAP_FIXTURE/fail-start && $(/usr/local/bin/guardscale health) == new-agent ]];then exit 1;fi
SCRIPT
printf '#!/bin/sh\nexit 0\n' >"$fixture/bin/sleep"
chmod 755 "$fixture/bin/"*
export PATH="$fixture/bin:$PATH"
cp "$fixture/old-agent" /usr/local/bin/guardscale
bash /src/devops/update-agent.sh >/dev/null
[[ $(/usr/local/bin/guardscale health) == new-agent ]]
cmp /usr/local/bin/guardscale.previous "$fixture/old-agent"
[[ $(cat /etc/guardscale/config.yaml) == existing-config && $(cat /etc/guardscale/enrollment.token) == existing-enrollment ]]
! grep -q '^enable' "$fixture/systemctl-calls"
cp "$fixture/old-agent" /usr/local/bin/guardscale
cp "$fixture/$binary" "$fixture/good-agent"
printf '\ntampered\n' >>"$fixture/$binary"
if bash /src/devops/update-agent.sh >/dev/null 2>&1;then echo 'Tampered binary was accepted' >&2;exit 1;fi
cmp /usr/local/bin/guardscale "$fixture/old-agent"
cp "$fixture/good-agent" "$fixture/$binary"
touch "$fixture/fail-start"
if bash /src/devops/update-agent.sh >/dev/null 2>&1;then echo 'Failed startup was accepted' >&2;exit 1;fi
cmp /usr/local/bin/guardscale "$fixture/old-agent"
rm "$fixture/fail-start"
GUARDSCALE_AUTO_UPDATE=1 bash /src/devops/update-agent.sh >/dev/null
grep -q '^enable --now guardscale-update.timer$' "$fixture/systemctl-calls"
[[ $(cat /etc/guardscale/config.yaml) == existing-config && $(cat /etc/guardscale/enrollment.token) == existing-enrollment ]]
echo 'Bootstrap install, checksum rejection, rollback, enrollment preservation and opt-in timer passed.'
