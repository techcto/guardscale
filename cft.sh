#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${GUARDIAN_CFT_TEMPLATE:-$ROOT_DIR/devops/cloudformation/guardian.yaml}"
STACK_NAME="${GUARDIAN_STACK_NAME:-guardian}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-}"
CFT_BUCKET="${GUARDIAN_CFT_BUCKET:-gaurdian-us}"

usage() {
  cat <<'EOF'
Usage:
  ./cft.sh test       Run standalone CFT checks and cfn-lint when installed
  ./cft.sh publish    Upload guardian.yaml and guardian-existing.yaml to S3
  ./cft.sh validate   Validate with AWS CloudFormation
  ./cft.sh deploy     Create a new standalone ECS cluster and ALB
  ./cft.sh events     Show recent stack events
  ./cft.sh outputs    Show stack outputs
  ./cft.sh destroy    Delete the stack and wait for completion

Deploy parameters:
  GUARDIAN_VPC_ID              VPC id
  GUARDIAN_PUBLIC_SUBNETS      Comma-separated public subnet ids
  GUARDIAN_PRIVATE_SUBNETS     Comma-separated private (ECS service) subnet ids
  GUARDIAN_IMAGE_BASE          ECR registry/repository prefix without service suffix, e.g. 709825985650.dkr.ecr.us-east-1.amazonaws.com/solodev/guardian
  GUARDIAN_RELEASE_VERSION     Image tag (default: latest)
  GUARDIAN_CERTIFICATE_ARN     Optional ACM certificate ARN for HTTPS
  GUARDIAN_ROOT_USER           Optional root username (default: root)
  GUARDIAN_ROOT_PASSWORD       Root operator password (>=12 chars)
  GUARDIAN_SESSION_SECRET      Session signing secret (>=32 chars)
  GUARDIAN_CFT_BUCKET          S3 bucket for CFT uploads (default: gaurdian-us)
  AWS_PROFILE                  Optional AWS CLI profile
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

require_template() {
  [[ -f "$TEMPLATE" ]] || die "CloudFormation template not found: $TEMPLATE"
}

offline_test() {
  require_template

  local required
  for required in \
    'AWSTemplateFormatVersion' \
    'AWS::ECS::Cluster' \
    'AWS::ECS::TaskDefinition' \
    'AWS::ECS::Service' \
    'AWS::ElasticLoadBalancingV2::LoadBalancer' \
    'AWS::ElasticLoadBalancingV2::Listener' \
    'ImageBase' \
    'GuardianTable'; do
    grep -q "$required" "$TEMPLATE" || die "Template check failed: missing $required"
  done

  for required_file in \
    "$ROOT_DIR/devops/docker/Dockerfile.web" \
    "$ROOT_DIR/devops/docker/Dockerfile.api" \
    "$ROOT_DIR/devops/docker/Dockerfile.worker" \
    "$ROOT_DIR/package-lock.json"; do
    [[ -f "$required_file" ]] || die "Build input missing: $required_file"
  done

  if command -v cfn-lint >/dev/null 2>&1; then
    cfn-lint -t "$TEMPLATE"
  else
    printf 'Warning: cfn-lint is not installed; static checks passed.\n'
  fi

  printf 'CFT offline test passed: %s\n' "$TEMPLATE"
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
  require_template
  : "${CFT_BUCKET:?Set GUARDIAN_CFT_BUCKET before publishing CFT files.}"

  aws_cli s3 cp "$ROOT_DIR/devops/cloudformation/guardian.yaml" \
    "s3://${CFT_BUCKET}/cloudformation/guardian.yaml" \
    --content-type text/yaml --cache-control no-cache \
    --region "$AWS_REGION" --no-progress
  aws_cli s3 cp "$ROOT_DIR/devops/cloudformation/guardian-existing.yaml" \
    "s3://${CFT_BUCKET}/cloudformation/guardian-existing.yaml" \
    --content-type text/yaml --cache-control no-cache \
    --region "$AWS_REGION" --no-progress
  printf 'Published Guardian.US CFT files to s3://%s/\n' "$CFT_BUCKET"
}

deploy() {
  publish
  validate

  : "${GUARDIAN_VPC_ID:?Set GUARDIAN_VPC_ID before deploying.}"
  : "${GUARDIAN_PUBLIC_SUBNETS:?Set GUARDIAN_PUBLIC_SUBNETS before deploying.}"
  : "${GUARDIAN_PRIVATE_SUBNETS:?Set GUARDIAN_PRIVATE_SUBNETS before deploying.}"
  : "${GUARDIAN_IMAGE_BASE:?Set GUARDIAN_IMAGE_BASE before deploying.}"
  : "${GUARDIAN_ROOT_PASSWORD:?Set GUARDIAN_ROOT_PASSWORD before deploying.}"
  : "${GUARDIAN_SESSION_SECRET:?Set GUARDIAN_SESSION_SECRET before deploying.}"

  local parameters=(
    "VpcId=$GUARDIAN_VPC_ID"
    "PublicSubnets=$GUARDIAN_PUBLIC_SUBNETS"
    "PrivateSubnets=$GUARDIAN_PRIVATE_SUBNETS"
    "ImageBase=$GUARDIAN_IMAGE_BASE"
    "RootPassword=$GUARDIAN_ROOT_PASSWORD"
    "SessionSecret=$GUARDIAN_SESSION_SECRET"
  )

  [[ -n "${GUARDIAN_RELEASE_VERSION:-}" ]] && parameters+=("ReleaseVersion=$GUARDIAN_RELEASE_VERSION")
  [[ -n "${GUARDIAN_CERTIFICATE_ARN:-}" ]] && parameters+=("CertificateArn=$GUARDIAN_CERTIFICATE_ARN")
  [[ -n "${GUARDIAN_ROOT_USER:-}" ]] && parameters+=("RootUsername=$GUARDIAN_ROOT_USER")

  aws_cli cloudformation deploy \
    --template-file "$TEMPLATE" \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides "${parameters[@]}"
}

require_template
case "${1:-test}" in
  test) offline_test ;;
  publish) publish ;;
  validate) validate ;;
  deploy) deploy ;;
  events) aws_cli cloudformation describe-stack-events --stack-name "$STACK_NAME" --region "$AWS_REGION" ;;
  outputs) aws_cli cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs' ;;
  destroy) aws_cli cloudformation delete-stack --stack-name "$STACK_NAME" --region "$AWS_REGION"; aws_cli cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$AWS_REGION" ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
