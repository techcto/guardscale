#!/usr/bin/env bash
set -euo pipefail
# Never trace enrollment credentials, including when invoked by cloud-init.
set +x

GUARDSCALE_URL="${GUARDSCALE_URL:-https://guardscale.org}"
GUARDSCALE_ASSET_BASE="${GUARDSCALE_ASSET_BASE:-https://guardscale.s3.us-east-1.amazonaws.com/agent/latest}"
case "${GUARDSCALE_AUTO_UPDATE:-0}" in 0|1) ;; *) echo 'GUARDSCALE_AUTO_UPDATE must be 0 or 1' >&2;exit 2;; esac
INSTALL_ONLY="${INSTALL_ONLY:-0}"

usage() {
  cat <<'EOF'
Usage: sudo env GUARDSCALE_ENROLLMENT_KEY='<tenant>.<token>' bash install-agent.sh

Optional overrides: GUARDSCALE_NODE_ID, GUARDSCALE_AGENT_ID, GUARDSCALE_URL,
GUARDSCALE_ASSET_BASE. EC2 instance identity is detected automatically.
For EC2 boot: --ssm-parameter /guardscale/ORG/enrollment (requires AWS_REGION,
AWS CLI, and an instance role permitted to read that SecureString parameter).
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --enrollment-key) GUARDSCALE_ENROLLMENT_KEY="${2:-}"; shift 2 ;;
    --ssm-parameter) GUARDSCALE_ENROLLMENT_SSM_PARAMETER="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$(uname -m)" in
  x86_64) agent_arch=amd64 ;;
  aarch64|arm64) agent_arch=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

instance_id() {
  local imds_token value
  imds_token="$(curl -fsS --connect-timeout 1 --max-time 2 -X PUT \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
    http://169.254.169.254/latest/api/token 2>/dev/null || true)"
  if [ -n "$imds_token" ]; then
    value="$(curl -fsS --connect-timeout 1 --max-time 2 \
      -H "X-aws-ec2-metadata-token: $imds_token" \
      http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)"
    if [ -n "$value" ]; then printf '%s' "$value"; return; fi
  fi
  if [ "${GUARDSCALE_REQUIRE_EC2_IDENTITY:-0}" = "1" ]; then
    echo 'EC2 instance identity is unavailable; refusing fallback identity.' >&2
    return 1
  fi
  if [ -s /etc/machine-id ]; then
    printf 'machine-%s' "$(sha256sum /etc/machine-id | cut -c1-16)"
  else
    printf 'host-%s' "$(hostname | sha256sum | cut -c1-16)"
  fi
}

if [ "$INSTALL_ONLY" != "1" ]; then
  if [ -n "${GUARDSCALE_ENROLLMENT_SSM_PARAMETER:-}" ]; then
    if [ -n "${GUARDSCALE_ENROLLMENT_KEY:-}" ]; then echo 'Choose a direct key or SSM parameter, not both.' >&2; exit 2; fi
    command -v aws >/dev/null || { echo 'AWS CLI is required for SSM enrollment.' >&2; exit 1; }
    : "${AWS_REGION:=${AWS_DEFAULT_REGION:-}}"
    : "${AWS_REGION:?Set AWS_REGION for the enrollment parameter.}"
    GUARDSCALE_ENROLLMENT_KEY="$(aws ssm get-parameter --name "$GUARDSCALE_ENROLLMENT_SSM_PARAMETER" --with-decryption --region "$AWS_REGION" --query Parameter.Value --output text)"
  fi
  if [ -n "${GUARDSCALE_ENROLLMENT_KEY:-}" ]; then
    case "$GUARDSCALE_ENROLLMENT_KEY" in
      *.*) GUARDSCALE_TENANT_ID="${GUARDSCALE_ENROLLMENT_KEY%%.*}"; GUARDSCALE_ENROLLMENT_TOKEN="${GUARDSCALE_ENROLLMENT_KEY#*.}" ;;
      *) echo "GUARDSCALE_ENROLLMENT_KEY is invalid." >&2; exit 2 ;;
    esac
  fi
  : "${GUARDSCALE_TENANT_ID:?Set the enrollment key shown in Servers > Connect server.}"
  : "${GUARDSCALE_ENROLLMENT_TOKEN:?Set the enrollment key shown in Servers > Connect server.}"
  GUARDSCALE_NODE_ID="${GUARDSCALE_NODE_ID:-$(instance_id)}"
  GUARDSCALE_AGENT_ID="${GUARDSCALE_AGENT_ID:-agent-${GUARDSCALE_NODE_ID}}"
  case "$GUARDSCALE_TENANT_ID:$GUARDSCALE_NODE_ID:$GUARDSCALE_AGENT_ID" in
    *[!a-zA-Z0-9._:-]*) echo "Derived identity contains unsupported characters." >&2; exit 2 ;;
  esac
fi

if [ "$INSTALL_ONLY" = "1" ] && [ -e /etc/guardscale/enrollment.token ]; then
  echo 'Refusing AMI preparation: this machine already contains enrollment credentials. Use a clean image builder.' >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
binary="guardscale-linux-$agent_arch"

# Resolve latest once; all files in this install then come from one immutable release.
if [[ $GUARDSCALE_ASSET_BASE == */latest ]]; then
  release_pointer=$(curl --retry 3 -fsS --connect-timeout 10 --max-time 60 "$GUARDSCALE_ASSET_BASE/release.json")
  release_version=$(printf '%s' "$release_pointer" | sed -nE 's/^[[:space:]]*\{[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)"[[:space:]]*\}[[:space:]]*$/\1/p')
  [[ $release_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release pointer' >&2;exit 1; }
  GUARDSCALE_ASSET_BASE="${GUARDSCALE_ASSET_BASE%/latest}/$release_version"
fi

for asset in "$binary" SHA256SUMS config.example.yaml guardscale.service guardscale-update.service guardscale-update.timer; do
  curl --retry 5 --retry-delay 2 --connect-timeout 10 --max-time 120 -fsSLo "$work_dir/$asset" "$GUARDSCALE_ASSET_BASE/$asset"
done
for asset in "$binary" config.example.yaml guardscale.service guardscale-update.service guardscale-update.timer; do
  (cd "$work_dir" && awk -v file="$asset" '$2==file{print}' SHA256SUMS | sha256sum --check --strict -)
done

install -m 0755 "$work_dir/$binary" /usr/local/bin/guardscale
install -d -m 0750 /etc/guardscale /var/lib/guardscale /var/lib/guardscale-updater
install -m 0644 "$work_dir/config.example.yaml" /etc/guardscale/config.example.yaml
install -m 0644 "$work_dir/guardscale.service" /etc/systemd/system/guardscale.service
install -m 0644 "$work_dir/guardscale-update.service" /etc/systemd/system/guardscale-update.service
install -m 0644 "$work_dir/guardscale-update.timer" /etc/systemd/system/guardscale-update.timer

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
/usr/local/bin/guardscale enroll --config /etc/guardscale/config.yaml
systemctl daemon-reload
systemctl enable guardscale
systemctl restart guardscale
if [[ ${GUARDSCALE_AUTO_UPDATE:-0} == 1 ]]; then systemctl enable --now guardscale-update.timer;fi
systemctl --no-pager --full status guardscale
echo "GuardScale agent started for node $GUARDSCALE_NODE_ID. Registration is confirmed by the first accepted heartbeat in your console."
