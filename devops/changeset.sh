#!/usr/bin/env bash
set -euo pipefail

: "${MP_AWS_MARKETPLACE_PRODUCT_ID:?Set MP_AWS_MARKETPLACE_PRODUCT_ID to the GuardScale Marketplace product ID.}"
: "${RELEASE_VERSION:?Set RELEASE_VERSION to the release version.}"
: "${MP_AWS_ECR:?Set MP_AWS_ECR to the ECR registry.}"
: "${GUARDSCALE_REPOSITORY_PREFIX:=solodev/guardian}"

DETAILS_JSON="$(jq -n \
  --arg version "$RELEASE_VERSION" \
  --arg web "$MP_AWS_ECR/$GUARDSCALE_REPOSITORY_PREFIX-web:$RELEASE_VERSION" \
  --arg api "$MP_AWS_ECR/$GUARDSCALE_REPOSITORY_PREFIX-api:$RELEASE_VERSION" \
  --arg worker "$MP_AWS_ECR/$GUARDSCALE_REPOSITORY_PREFIX-worker:$RELEASE_VERSION" \
  --arg agent "$MP_AWS_ECR/$GUARDSCALE_REPOSITORY_PREFIX-agent:$RELEASE_VERSION" \
  '{
    Version: {
      VersionTitle: $version,
      ReleaseNotes: ("GuardScale " + $version + ": coordinated-swarm detection, incident response, and container updates.")
    },
    DeliveryOptions: [{
      DeliveryOptionTitle: "ECS container images",
      Details: {
        EcrDeliveryOptionDetails: {
          ContainerImages: [$web, $api, $worker, $agent],
          CompatibleServices: ["ECS"],
          Description: "GuardScale web, api, worker, and agent containers for Amazon ECS.",
          UsageInstructions: "Deploy the GuardScale containers with the CloudFormation templates and instructions at https://github.com/techcto/guardscale/tree/main/devops/cloudformation"
        }
      }
    }]
  }')"

DETAILS_JSON_STRING="$(printf '%s' "$DETAILS_JSON" | jq 'tostring')"

submit_marketplace() {
aws marketplace-catalog start-change-set \
  --catalog AWSMarketplace \
  --client-request-token "guardscale-$RELEASE_VERSION" \
  --change-set "[{
    \"ChangeType\": \"AddDeliveryOptions\",
    \"Entity\": {
      \"Identifier\": \"$MP_AWS_MARKETPLACE_PRODUCT_ID\",
      \"Type\": \"ContainerProduct@1.0\"
    },
    \"Details\": $DETAILS_JSON_STRING
  }]"
}

# A preceding Marketplace version can retain the product lock for ~50 minutes.
# Retry only that transient conflict; report other failures immediately.
submission_error="$(mktemp)"
trap 'rm -f "$submission_error"' EXIT
for attempt in $(seq 1 61); do
  if submit_marketplace 2>"$submission_error"; then exit 0; fi
  if ! grep -q 'ResourceInUseException' "$submission_error" || [ "$attempt" -eq 61 ]; then
    cat "$submission_error" >&2
    exit 1
  fi
  echo "Marketplace product is locked by a preceding submission; retry $attempt/60 in 60 seconds."
  sleep 60
done
