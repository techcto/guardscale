# GuardScale AWS deployment

`guardscale.yaml` defines GuardScale-specific services with least-privilege data access. It expects existing public/private subnets, NAT or VPC endpoints for private Fargate tasks, and version-matched images. `CertificateArn` is optional: leave it empty for HTTP, or provide an issued ACM certificate in the stack region to create an HTTPS listener and redirect HTTP to HTTPS. Copy `guardscale.parameters.example.json` to the gitignored `guardscale.parameters.json` for account-specific values. Passwords and session secrets must still be supplied securely at deployment time and are never stored in either file.

The evidence bucket is encrypted and private; configure an evidence-retention lifecycle after deployment when the deploying role permits `s3:PutLifecycleConfiguration`. Production deployments should also add WAF, Secrets Manager values, autoscaling, alarms, SES/WhatsApp configuration, and AgentCore as environment-specific nested stacks.

`guardscale-existing.yaml` attaches to an existing ALB listener. In that deployment mode, configure the ACM certificate on the shared ALB listener rather than in the GuardScale stack.
