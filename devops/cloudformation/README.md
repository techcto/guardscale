# Guardian.US AWS deployment

`guardian.yaml` defines Guardian-specific services with least-privilege data access. It expects existing public/private subnets, NAT or VPC endpoints for private Fargate tasks, and three version-matched images. Production deployments should add TLS, WAF, Secrets Manager values, autoscaling, alarms, SES/WhatsApp configuration, and AgentCore as environment-specific nested stacks.
