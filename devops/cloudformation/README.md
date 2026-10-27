# GuardScale AWS deployment

Start with the [private-install prerequisites](../../PREREQUISITES.md) for WhatsApp
registration, SES verification, required launch values and current automation limits.
For container-version rollouts, use the [reviewed update command](../../docs/cft-update.md).
No release is needed for the [local hackathon tests](../../docs/hackathon-local-testing.md).

SES incident replies are optional resources in these same main templates. See
[SES configuration and replies](../../docs/email-replies.md) for parameters,
deployment permissions and the normal release/change-set workflow. Existing
verified sender identities are reused; no extra identity or email stack is created.

## WhatsApp queues for private installs and development

Each installation owns its work queue. For a fresh private installation, use
`DeploymentMode=on-premise`, `NotificationMode=aws`, the registered
`WhatsappOriginationId`, and `WhatsappBusinessAccountId`. Leave
`WhatsappEventTopicArn` empty to let the stack create its SNS topic, subscribe its
queue, and configure the WABA event destination. Supply the verified `SesFrom`
and approved WhatsApp template when enabling those notification channels.
Registration and provider approval remain prerequisites.

Localhost testing must use a separate queue; sharing the production queue would
make the two workers compete for replies. The optional
`guardscale-dev-whatsapp-replies.yaml` stack subscribes a short-retention,
encrypted development queue to the existing sender's topic without changing
the production subscription or WABA destination. SNS copies events to both queues,
so development receives a copy of topic traffic; use authorized test recipients
and delete the development stack through CloudFormation when testing ends.
The optional local role can consume only the development queue. A separate sender
and WABA provide stronger isolation when needed.

`guardscale.yaml` defines GuardScale-specific services with least-privilege data access. It expects existing public/private subnets, NAT or VPC endpoints for private Fargate tasks, and version-matched images. `CertificateArn` is optional: leave it empty for HTTP, or provide an issued ACM certificate in the stack region to create an HTTPS listener and redirect HTTP to HTTPS. Copy `guardscale.parameters.example.json` to the gitignored `guardscale.parameters.json` for account-specific values. Passwords and session secrets must still be supplied securely at deployment time and are never stored in either file.

The evidence bucket is encrypted and private; add evidence-retention lifecycle through a reviewed CloudFormation change set when the deploying role permits `s3:PutLifecycleConfiguration`. Production deployments should also add WAF, Secrets Manager values, autoscaling, alarms, SES/WhatsApp configuration, and AgentCore as environment-specific nested stacks.

`guardscale-existing.yaml` attaches to an existing ALB listener. In that deployment mode, configure the ACM certificate on the shared ALB listener rather than in the GuardScale stack.
