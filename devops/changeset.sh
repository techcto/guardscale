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

aws marketplace-catalog start-change-set \
  --catalog AWSMarketplace \
  --change-set "[{
    \"ChangeType\": \"AddDeliveryOptions\",
    \"Entity\": {
      \"Identifier\": \"$MP_AWS_MARKETPLACE_PRODUCT_ID\",
      \"Type\": \"ContainerProduct@1.0\"
    },
    \"Details\": $DETAILS_JSON_STRING
  }]"
