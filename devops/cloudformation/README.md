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

[Launch official local-development WhatsApp routing](../../docs/whatsapp-local-testing.md#3-give-each-local-worker-its-own-whatsapp-reply-queue)

<a href="https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/create/review?stackName=guardscale-dev-whatsapp-YOURNAME&amp;templateURL=https%3A%2F%2Fguardscale.s3.us-east-1.amazonaws.com%2Fcloudformation%2Fguardscale-dev-whatsapp-replies.yaml"><img src="../../assets/launch-dev-whatsapp.svg" width="280" alt="Launch development WhatsApp routing" /></a>

## Stripe ownership

Stripe credentials belong to the main installation template. Fresh installs can
create the retained credential secret using the NoEcho key parameters, or use an
existing ARN. An optional main-stack-owned live/sandbox pair and retained-resource
import path are described in [Stripe ownership](STRIPE-OWNERSHIP.md).
Do not launch a separate secrets stack for new installations.

## Fresh-install prerequisites and validation

Choose the template matching your network: `guardscale.yaml` for standalone
compute/ALB or `guardscale-existing.yaml` for an existing platform. AppHub migration
variants are for explicitly preserved infrastructure, not first-time standalone installs.
Provide real VPC/subnets, network egress, image access, strong root/session secrets,
and an issued certificate for public HTTPS. Billing and messaging are optional.

For managed messaging, the deployment identity needs the full resource lifecycle:
SES receipt-rule creation/read/update/deletion, SNS topic attributes/policies/tags
and subscriptions, KMS key creation/policy/rotation/cleanup, Route 53 records,
Lambda and IAM. Task permissions do not grant these deployment permissions.
Use an approved deployment role; the template does not self-grant user permissions.

Schema validation and conditional contract tests are necessary but are not proof
of a successful fresh AWS install. A full private-install test also needs actual
account inputs, provider registration, deployment and end-to-end delivery checks.
The repository does not claim that every account's IAM, DNS or sender approval is ready.

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
