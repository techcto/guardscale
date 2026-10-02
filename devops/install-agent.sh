#!/usr/bin/env bash
set -euo pipefail

GUARDSCALE_URL="${GUARDSCALE_URL:-https://guardscale.org}"
GUARDSCALE_ASSET_BASE="${GUARDSCALE_ASSET_BASE:-https://guardscale.s3.us-east-1.amazonaws.com/agent/latest}"
INSTALL_ONLY="${INSTALL_ONLY:-0}"

case "$(uname -m)" in
  x86_64) agent_arch=amd64 ;;
  aarch64|arm64) agent_arch=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [ "$INSTALL_ONLY" != "1" ]; then
  : "${GUARDSCALE_TENANT_ID:?Set GUARDSCALE_TENANT_ID from Nodes > Add node.}"
  : "${GUARDSCALE_AGENT_ID:?Set GUARDSCALE_AGENT_ID from Nodes > Add node.}"
  : "${GUARDSCALE_NODE_ID:?Set GUARDSCALE_NODE_ID from Nodes > Add node.}"
  : "${GUARDSCALE_ENROLLMENT_TOKEN:?Set GUARDSCALE_ENROLLMENT_TOKEN from Nodes > Add node.}"
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
binary="guardscale-linux-$agent_arch"

for asset in "$binary" SHA256SUMS config.example.yaml guardscale.service; do
  curl -fsSLo "$work_dir/$asset" "$GUARDSCALE_ASSET_BASE/$asset"
done
(cd "$work_dir" && grep " $binary\$" SHA256SUMS | sha256sum -c -)

install -m 0755 "$work_dir/$binary" /usr/local/bin/guardscale
install -d -m 0750 /etc/guardscale /var/lib/guardscale
install -m 0644 "$work_dir/config.example.yaml" /etc/guardscale/config.example.yaml
install -m 0644 "$work_dir/guardscale.service" /etc/systemd/system/guardscale.service

if [ "$INSTALL_ONLY" = "1" ]; then
  systemctl daemon-reload
  echo "GuardScale installed but not enrolled. Run the Nodes > Add node bootstrap command after launch."
  exit 0
fi

cp /etc/guardscale/config.example.yaml /etc/guardscale/config.yaml
sed -i \
  -e "s|server-example-1|$GUARDSCALE_NODE_ID|" \
  -e "s|tenant-example|$GUARDSCALE_TENANT_ID|" \
  -e "s|agent-example-1|$GUARDSCALE_AGENT_ID|" \
  -e "s|https://guardscale.org|$GUARDSCALE_URL|" \
  /etc/guardscale/config.yaml
install -m 0600 /dev/null /etc/guardscale/enrollment.token
printf '%s' "$GUARDSCALE_ENROLLMENT_TOKEN" > /etc/guardscale/enrollment.token

/usr/local/bin/guardscale test-config --config /etc/guardscale/config.yaml
systemctl daemon-reload
systemctl enable --now guardscale
systemctl --no-pager --full status guardscale
