#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${GUARDIAN_EXISTING_CFT_TEMPLATE:-$ROOT_DIR/devops/cloudformation/guardian-existing.yaml}"
STACK_NAME="${GUARDIAN_EXISTING_STACK_NAME:-guardian-existing-addon}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-}"
VERSION="${GUARDIAN_VERSION:-latest}"

usage() {
  cat <<'EOF'
Usage:
  ./cft-existing.sh test       Run offline template checks
  ./cft-existing.sh validate   Validate with AWS CloudFormation
  ./cft-existing.sh publish    Build and push web/api/worker images to ECR
  ./cft-existing.sh deploy     Deploy Guardian.US onto the existing cluster/ALB
  ./cft-existing.sh events     Show recent add-on stack events
  ./cft-existing.sh outputs    Show add-on stack outputs

Required deployment values:
  GUARDIAN_EXISTING_VPC_ID
  GUARDIAN_EXISTING_CLUSTER        Existing ECS cluster name or ARN
  GUARDIAN_EXISTING_ALB_SG         Existing ALB security group ID
  GUARDIAN_EXISTING_LISTENER_ARN   Existing HTTP or HTTPS listener ARN
  GUARDIAN_EXISTING_SUBNETS        Comma-separated ECS service subnet IDs
  GUARDIAN_HOST_HEADER             Dedicated hostname, for example guardian.us
  GUARDIAN_WEB_IMAGE               Published web image URI
  GUARDIAN_API_IMAGE               Published api image URI
  GUARDIAN_WORKER_IMAGE            Published worker image URI
  GUARDIAN_ROOT_PASSWORD           Root operator password (>=12 chars)
  GUARDIAN_SESSION_SECRET          Session signing secret (>=32 chars)

Required for publish:
  MP_AWS_ECR                       ECR registry to push to (account.dkr.ecr.region.amazonaws.com)

Optional values:
  GUARDIAN_DESIRED_COUNT
  GUARDIAN_ASSIGN_PUBLIC_IP        ENABLED or DISABLED
  GUARDIAN_ROOT_USER
  GUARDIAN_DEPLOYMENT_MODE         on-premise (default) or saas
  GUARDIAN_WHATSAPP_ORIGINATION_ID
  GUARDIAN_NOTIFICATION_RECIPIENTS
  GUARDIAN_SES_FROM
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_STARTER_PRICE_ID
  STRIPE_SCALE_PRICE_ID
  GUARDIAN_API_LISTENER_PRIORITY
  GUARDIAN_WEB_LISTENER_PRIORITY
  GUARDIAN_VERSION                 Image tag to publish/deploy (default: latest)
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
    'GuardianTable'; do
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
  local repo_prefix="${GUARDIAN_REPOSITORY_PREFIX:-solodev/guardian}"
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

  : "${GUARDIAN_EXISTING_VPC_ID:?Set GUARDIAN_EXISTING_VPC_ID before deploying.}"
  : "${GUARDIAN_EXISTING_CLUSTER:?Set GUARDIAN_EXISTING_CLUSTER before deploying.}"
  : "${GUARDIAN_EXISTING_ALB_SG:?Set GUARDIAN_EXISTING_ALB_SG before deploying.}"
  : "${GUARDIAN_EXISTING_LISTENER_ARN:?Set GUARDIAN_EXISTING_LISTENER_ARN before deploying.}"
  : "${GUARDIAN_EXISTING_SUBNETS:?Set GUARDIAN_EXISTING_SUBNETS before deploying.}"
  : "${GUARDIAN_HOST_HEADER:?Set GUARDIAN_HOST_HEADER before deploying.}"
  : "${GUARDIAN_WEB_IMAGE:?Set GUARDIAN_WEB_IMAGE before deploying.}"
  : "${GUARDIAN_API_IMAGE:?Set GUARDIAN_API_IMAGE before deploying.}"
  : "${GUARDIAN_WORKER_IMAGE:?Set GUARDIAN_WORKER_IMAGE before deploying.}"
  : "${GUARDIAN_ROOT_PASSWORD:?Set GUARDIAN_ROOT_PASSWORD before deploying.}"
  : "${GUARDIAN_SESSION_SECRET:?Set GUARDIAN_SESSION_SECRET before deploying.}"

  local parameters=(
    "VpcId=$GUARDIAN_EXISTING_VPC_ID"
    "Cluster=$GUARDIAN_EXISTING_CLUSTER"
    "LoadBalancerSecurityGroup=$GUARDIAN_EXISTING_ALB_SG"
    "ListenerArn=$GUARDIAN_EXISTING_LISTENER_ARN"
    "ServiceSubnets=$GUARDIAN_EXISTING_SUBNETS"
    "HostHeader=$GUARDIAN_HOST_HEADER"
    "WebImage=$GUARDIAN_WEB_IMAGE"
    "ApiImage=$GUARDIAN_API_IMAGE"
    "WorkerImage=$GUARDIAN_WORKER_IMAGE"
    "RootPassword=$GUARDIAN_ROOT_PASSWORD"
    "SessionSecret=$GUARDIAN_SESSION_SECRET"
  )

  [[ -n "${GUARDIAN_ROOT_USER:-}" ]] && parameters+=("RootUsername=$GUARDIAN_ROOT_USER")
  [[ -n "${GUARDIAN_DEPLOYMENT_MODE:-}" ]] && parameters+=("DeploymentMode=$GUARDIAN_DEPLOYMENT_MODE")
  [[ -n "${GUARDIAN_DESIRED_COUNT:-}" ]] && parameters+=("DesiredCount=$GUARDIAN_DESIRED_COUNT")
  [[ -n "${GUARDIAN_ASSIGN_PUBLIC_IP:-}" ]] && parameters+=("AssignPublicIp=$GUARDIAN_ASSIGN_PUBLIC_IP")
  [[ -n "${GUARDIAN_WHATSAPP_ORIGINATION_ID:-}" ]] && parameters+=("WhatsappOriginationId=$GUARDIAN_WHATSAPP_ORIGINATION_ID")
  [[ -n "${GUARDIAN_NOTIFICATION_RECIPIENTS:-}" ]] && parameters+=("NotificationRecipients=$GUARDIAN_NOTIFICATION_RECIPIENTS")
  [[ -n "${GUARDIAN_SES_FROM:-}" ]] && parameters+=("SesFrom=$GUARDIAN_SES_FROM")
  [[ -n "${STRIPE_SECRET_KEY:-}" ]] && parameters+=("StripeSecretKey=$STRIPE_SECRET_KEY")
  [[ -n "${STRIPE_WEBHOOK_SECRET:-}" ]] && parameters+=("StripeWebhookSecret=$STRIPE_WEBHOOK_SECRET")
  [[ -n "${STRIPE_STARTER_PRICE_ID:-}" ]] && parameters+=("StripeStarterPriceId=$STRIPE_STARTER_PRICE_ID")
  [[ -n "${STRIPE_SCALE_PRICE_ID:-}" ]] && parameters+=("StripeScalePriceId=$STRIPE_SCALE_PRICE_ID")
  [[ -n "${GUARDIAN_API_LISTENER_PRIORITY:-}" ]] && parameters+=("ApiListenerPriority=$GUARDIAN_API_LISTENER_PRIORITY")
  [[ -n "${GUARDIAN_WEB_LISTENER_PRIORITY:-}" ]] && parameters+=("WebListenerPriority=$GUARDIAN_WEB_LISTENER_PRIORITY")

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
