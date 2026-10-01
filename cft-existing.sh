#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${GUARDSCALE_EXISTING_CFT_TEMPLATE:-$ROOT_DIR/devops/cloudformation/guardscale-existing.yaml}"
STACK_NAME="${GUARDSCALE_EXISTING_STACK_NAME:-guardscale-existing-addon}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-}"
VERSION="${GUARDSCALE_VERSION:-latest}"

usage() {
  cat <<'EOF'
Usage:
  ./cft-existing.sh test       Run offline template checks
  ./cft-existing.sh validate   Validate with AWS CloudFormation
  ./cft-existing.sh publish    Build and push web/api/worker images to ECR
  ./cft-existing.sh deploy     Deploy GuardScale onto the existing cluster/ALB
  ./cft-existing.sh events     Show recent add-on stack events
  ./cft-existing.sh outputs    Show add-on stack outputs

Required deployment values:
  GUARDSCALE_EXISTING_VPC_ID
  GUARDSCALE_EXISTING_CLUSTER        Existing ECS cluster name or ARN
  GUARDSCALE_EXISTING_ALB_SG         Existing ALB security group ID
  GUARDSCALE_EXISTING_LISTENER_ARN   Existing HTTP or HTTPS listener ARN
  GUARDSCALE_EXISTING_SUBNETS        Comma-separated ECS service subnet IDs
  GUARDSCALE_HOST_HEADER             Dedicated hostname, for example guardscale.org
  GUARDSCALE_WEB_IMAGE               Published web image URI
  GUARDSCALE_API_IMAGE               Published api image URI
  GUARDSCALE_WORKER_IMAGE            Published worker image URI
  GUARDSCALE_ROOT_PASSWORD           Root operator password (>=12 chars)
  GUARDSCALE_SESSION_SECRET          Session signing secret (>=32 chars)

Required for publish:
  MP_AWS_ECR                       ECR registry to push to (account.dkr.ecr.region.amazonaws.com)

Optional values:
  GUARDSCALE_DESIRED_COUNT
  GUARDSCALE_ASSIGN_PUBLIC_IP        ENABLED or DISABLED
  GUARDSCALE_ROOT_USER
  GUARDSCALE_DEPLOYMENT_MODE         on-premise (default) or saas
  GUARDSCALE_WHATSAPP_ORIGINATION_ID
  GUARDSCALE_NOTIFICATION_RECIPIENTS
  GUARDSCALE_SES_FROM
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_STARTER_PRICE_ID
  STRIPE_SCALE_PRICE_ID
  GUARDSCALE_API_LISTENER_PRIORITY
  GUARDSCALE_WEB_LISTENER_PRIORITY
  GUARDSCALE_VERSION                 Image tag to publish/deploy (default: latest)
  AWS_PROFILE                      Optional AWS CLI profile
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

aws_cli() {
  local command=(aws)
  [[ -n "$AWS_PROFILE" ]] && command+=(--profile "$AWS_PROFILE")
  "${command[@]}" "$@"
}

offline_test() {
  [[ -f "$TEMPLATE" ]] || die "CloudFormation template not found: $TEMPLATE"

  local required
  for required in \
    'AWS::ECS::TaskDefinition' \
    'AWS::ECS::Service' \
    'AWS::ElasticLoadBalancingV2::ListenerRule' \
    'Cluster' \
    'ListenerArn' \
    'HostHeader' \
    'WebImage' \
    'ApiImage' \
    'WorkerImage' \
    'GuardScaleTable'; do
    grep -q "$required" "$TEMPLATE" || die "Template check failed: missing $required"
  done

  if command -v cfn-lint >/dev/null 2>&1; then
    cfn-lint -t "$TEMPLATE"
  else
    printf 'Warning: cfn-lint is not installed; static checks passed.\n'
  fi

  printf 'Existing-cluster CFT offline test passed: %s\n' "$TEMPLATE"
}

validate() {
  offline_test
  local template_path="$TEMPLATE"
  command -v cygpath >/dev/null 2>&1 && template_path="$(cygpath -m "$TEMPLATE")"
  aws_cli cloudformation validate-template \
    --template-body "file://$template_path" \
    --region "$AWS_REGION"
}

publish() {
  : "${MP_AWS_ECR:?Set MP_AWS_ECR before publishing.}"
  local repo_prefix="${GUARDSCALE_REPOSITORY_PREFIX:-solodev/guardian}"
  local service
  for service in web api worker; do
    local repository="${repo_prefix}-${service}"
    aws_cli ecr describe-repositories --repository-names "$repository" >/dev/null 2>&1 \
      || aws_cli ecr create-repository --repository-name "$repository" --image-scanning-configuration scanOnPush=true >/dev/null
    local image="$MP_AWS_ECR/$repository:$VERSION"
    docker buildx build --platform linux/amd64 --provenance=false --sbom=false --push \
      -f "$ROOT_DIR/devops/docker/Dockerfile.$service" -t "$image" "$ROOT_DIR"
    docker buildx imagetools create -t "$MP_AWS_ECR/$repository:latest" "$image"
  done
  printf 'Published web/api/worker images at tag %s to %s\n' "$VERSION" "$MP_AWS_ECR"
}

deploy() {
  validate

  : "${GUARDSCALE_EXISTING_VPC_ID:?Set GUARDSCALE_EXISTING_VPC_ID before deploying.}"
  : "${GUARDSCALE_EXISTING_CLUSTER:?Set GUARDSCALE_EXISTING_CLUSTER before deploying.}"
  : "${GUARDSCALE_EXISTING_ALB_SG:?Set GUARDSCALE_EXISTING_ALB_SG before deploying.}"
  : "${GUARDSCALE_EXISTING_LISTENER_ARN:?Set GUARDSCALE_EXISTING_LISTENER_ARN before deploying.}"
  : "${GUARDSCALE_EXISTING_SUBNETS:?Set GUARDSCALE_EXISTING_SUBNETS before deploying.}"
  : "${GUARDSCALE_HOST_HEADER:?Set GUARDSCALE_HOST_HEADER before deploying.}"
  : "${GUARDSCALE_WEB_IMAGE:?Set GUARDSCALE_WEB_IMAGE before deploying.}"
  : "${GUARDSCALE_API_IMAGE:?Set GUARDSCALE_API_IMAGE before deploying.}"
  : "${GUARDSCALE_WORKER_IMAGE:?Set GUARDSCALE_WORKER_IMAGE before deploying.}"
  : "${GUARDSCALE_ROOT_PASSWORD:?Set GUARDSCALE_ROOT_PASSWORD before deploying.}"
  : "${GUARDSCALE_SESSION_SECRET:?Set GUARDSCALE_SESSION_SECRET before deploying.}"

  local parameters=(
    "VpcId=$GUARDSCALE_EXISTING_VPC_ID"
    "Cluster=$GUARDSCALE_EXISTING_CLUSTER"
    "LoadBalancerSecurityGroup=$GUARDSCALE_EXISTING_ALB_SG"
    "ListenerArn=$GUARDSCALE_EXISTING_LISTENER_ARN"
    "ServiceSubnets=$GUARDSCALE_EXISTING_SUBNETS"
    "HostHeader=$GUARDSCALE_HOST_HEADER"
    "WebImage=$GUARDSCALE_WEB_IMAGE"
    "ApiImage=$GUARDSCALE_API_IMAGE"
    "WorkerImage=$GUARDSCALE_WORKER_IMAGE"
    "RootPassword=$GUARDSCALE_ROOT_PASSWORD"
    "SessionSecret=$GUARDSCALE_SESSION_SECRET"
  )

  [[ -n "${GUARDSCALE_ROOT_USER:-}" ]] && parameters+=("RootUsername=$GUARDSCALE_ROOT_USER")
  [[ -n "${GUARDSCALE_DEPLOYMENT_MODE:-}" ]] && parameters+=("DeploymentMode=$GUARDSCALE_DEPLOYMENT_MODE")
  [[ -n "${GUARDSCALE_DESIRED_COUNT:-}" ]] && parameters+=("DesiredCount=$GUARDSCALE_DESIRED_COUNT")
  [[ -n "${GUARDSCALE_ASSIGN_PUBLIC_IP:-}" ]] && parameters+=("AssignPublicIp=$GUARDSCALE_ASSIGN_PUBLIC_IP")
  [[ -n "${GUARDSCALE_WHATSAPP_ORIGINATION_ID:-}" ]] && parameters+=("WhatsappOriginationId=$GUARDSCALE_WHATSAPP_ORIGINATION_ID")
  [[ -n "${GUARDSCALE_NOTIFICATION_RECIPIENTS:-}" ]] && parameters+=("NotificationRecipients=$GUARDSCALE_NOTIFICATION_RECIPIENTS")
  [[ -n "${GUARDSCALE_SES_FROM:-}" ]] && parameters+=("SesFrom=$GUARDSCALE_SES_FROM")
  [[ -n "${STRIPE_SECRET_KEY:-}" ]] && parameters+=("StripeSecretKey=$STRIPE_SECRET_KEY")
  [[ -n "${STRIPE_WEBHOOK_SECRET:-}" ]] && parameters+=("StripeWebhookSecret=$STRIPE_WEBHOOK_SECRET")
  [[ -n "${STRIPE_STARTER_PRICE_ID:-}" ]] && parameters+=("StripeStarterPriceId=$STRIPE_STARTER_PRICE_ID")
  [[ -n "${STRIPE_SCALE_PRICE_ID:-}" ]] && parameters+=("StripeScalePriceId=$STRIPE_SCALE_PRICE_ID")
  [[ -n "${GUARDSCALE_API_LISTENER_PRIORITY:-}" ]] && parameters+=("ApiListenerPriority=$GUARDSCALE_API_LISTENER_PRIORITY")
  [[ -n "${GUARDSCALE_WEB_LISTENER_PRIORITY:-}" ]] && parameters+=("WebListenerPriority=$GUARDSCALE_WEB_LISTENER_PRIORITY")

  aws_cli cloudformation deploy \
    --template-file "$TEMPLATE" \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides "${parameters[@]}"
}

case "${1:-test}" in
  test) offline_test ;;
  validate) validate ;;
  publish) publish ;;
  deploy) deploy ;;
  events) aws_cli cloudformation describe-stack-events --stack-name "$STACK_NAME" --region "$AWS_REGION" ;;
  outputs) aws_cli cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs' ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
