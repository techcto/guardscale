# GuardScale AWS deployment

`guardscale.yaml` defines GuardScale-specific services with least-privilege data access. It expects existing public/private subnets, NAT or VPC endpoints for private Fargate tasks, and version-matched images. The evidence bucket is encrypted and private; configure an evidence-retention lifecycle after deployment when the deploying role permits `s3:PutLifecycleConfiguration`. Production deployments should add TLS, WAF, Secrets Manager values, autoscaling, alarms, SES/WhatsApp configuration, and AgentCore as environment-specific nested stacks.
