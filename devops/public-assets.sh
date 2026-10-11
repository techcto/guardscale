#!/usr/bin/env bash
set -euo pipefail
: "${GUARDSCALE_CFT_BUCKET:?Set the deployment assets bucket}"
# Match SmartDetector: publishing never changes infrastructure or bucket policy.
url="https://${GUARDSCALE_CFT_BUCKET}.s3.${AWS_REGION:-us-east-1}.amazonaws.com/cloudformation/guardscale.yaml"
if ! curl --fail --silent --show-error --head "$url" >/dev/null; then
  echo 'Release assets are not publicly readable. Review the CloudFormation-managed policy; no policy changes were attempted.' >&2
  exit 1
fi
