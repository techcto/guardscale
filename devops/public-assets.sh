#!/usr/bin/env bash
set -euo pipefail

: "${GUARDSCALE_CFT_BUCKET:?Set GUARDSCALE_CFT_BUCKET to the release asset bucket.}"

# Keep writes, ACLs, and bucket listing private. Only versioned installation
# artifacts beneath these two prefixes are readable without AWS credentials.
aws s3api put-public-access-block \
  --bucket "$GUARDSCALE_CFT_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false

current_policy="$(aws s3api get-bucket-policy \
  --bucket "$GUARDSCALE_CFT_BUCKET" \
  --query Policy \
  --output text 2>/dev/null || printf '%s' '{"Version":"2012-10-17","Statement":[]}')"

jq \
  --arg bucket "$GUARDSCALE_CFT_BUCKET" \
  '.Version = "2012-10-17"
   | .Statement = ((.Statement // []) | map(select(.Sid != "GuardScalePublicReleaseAssets")))
   | .Statement += [{
       Sid: "GuardScalePublicReleaseAssets",
       Effect: "Allow",
       Principal: "*",
       Action: "s3:GetObject",
       Resource: [
         ("arn:aws:s3:::" + $bucket + "/cloudformation/*"),
         ("arn:aws:s3:::" + $bucket + "/agent/*")
       ]
     }]' \
  <<<"$current_policy" > /tmp/guardscale-public-assets-policy.json

aws s3api put-bucket-policy \
  --bucket "$GUARDSCALE_CFT_BUCKET" \
  --policy file:///tmp/guardscale-public-assets-policy.json
