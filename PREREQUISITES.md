# Before launching GuardScale privately on AWS

This checklist is for a buyer-owned AWS installation with real WhatsApp and email
alerts. It is not required for the [local hackathon tests](docs/hackathon-local-testing.md).
You can launch in log-only mode while provider approval is pending, but that does
not demonstrate real messaging or two-way protection.

## 1. Choose the AWS account and Region

- Subscribe to the applicable Marketplace product before pulling gated images.
- Choose the account and Region that will run GuardScale and its messaging services.
- Use an approved short-lived AWS profile with permission to deploy the reviewed
  CloudFormation stack. Do not share access keys in chat, parameter files or images.
- Prepare the existing VPC/subnets and outbound connectivity required by the
  [deployment template](devops/cloudformation/README.md). For public production
  access, prepare your console hostname, DNS ownership and an issued ACM certificate.
- Wait for the chosen container release to be published before updating a stack.

## 2. Register the WhatsApp business sender

In **AWS End User Messaging Social → Business accounts → Link business account**,
launch the embedded Meta sign-up. Sign in, authorize AWS, and verify control of
the business sender using an SMS or voice code. CloudFormation cannot complete
this interactive consent/verification step for you.

Collect these identifiers from the linked account in AWS:

| Value | Where to find it | How GuardScale uses it |
|---|---|---|
| Business account ID (`waba-…`) | Business accounts | Identifies the registered account; not a substitute for the sender ID |
| AWS sender ID (`phone-number-id-…`) or ARN | Account → Phone numbers | `WhatsappOriginationId` / `GUARDSCALE_WHATSAPP_ORIGINATION_ID` |
| Approved template name | Account → Templates | `WhatsappAlertTemplate` / `GUARDSCALE_WHATSAPP_ALERT_TEMPLATE` |
| Template language | Approved template | `GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE` (currently `en_US` in default CFT deployments) |

Use a separate personal WhatsApp number as the receiving operator. Do not migrate
or unregister your personal WhatsApp account just to receive alerts. Save operator
recipients in each organization's notification settings. Never share verification
PINs or Meta login credentials in screenshots or source control.

For reliable business-initiated alerts, obtain approval for a template compatible
with this adapter: one body text variable and no other required dynamic components.
For a quick test without a template, first message the business sender from your
personal receiving number; ordinary text works within the 24-hour session window.
This session shortcut is not a substitute for production alert-template approval.

AWS instructions: [link a business account](https://docs.aws.amazon.com/end-user-messaging/latest/userguide/nx-whatsapp-gsu-link-waba.html),
[sending rules](https://docs.aws.amazon.com/social-messaging/latest/userguide/whatsapp-send-message.html).

## 3. Verify the email sender in SES

Choose a From address, for example `alerts@example.com`. In **Amazon SES →
Verified identities**, in the chosen Region:

1. For production, verify the sending domain and publish SES's DKIM DNS records.
   Route 53 can host these records, but is not required; use your DNS provider.
2. For a quick test, verifying only that email address is sufficient. Domain
   verification is preferable when sending from multiple addresses.
3. Check **Account dashboard** for sandbox status. In the sandbox, verify the
   receiving test address too. Request production access before sending to arbitrary
   customer addresses. AWS approval cannot be guaranteed by a stack launch.
4. Collect the verified From address for `SesFrom` / `GUARDSCALE_SES_FROM`, the
   receiving address, and the identity/production-access status for this Region.

This From address is not an SES SMTP credential or a requirement to configure a
custom MAIL FROM domain. GuardScale uses the SES API through its AWS task role.
Direct email replies are not implemented; email links to authenticated console
approval. WhatsApp provides the reply → Protect channel.

AWS instructions: [verified identities](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html),
[regional configuration](https://docs.aws.amazon.com/ses/latest/dg/regions.html),
[production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

## 4. Wire the launch configuration

Use the following current parameters when deploying real messaging:

| Parameter | Value |
|---|---|
| `DeploymentMode` | `on-premise` for a private installation |
| `NotificationMode` | `aws`; `log` records an audit without delivering |
| `WhatsappOriginationId` | Registered AWS sender ID, not a telephone number |
| `WhatsappBusinessAccountId` | Registered `waba-…` ID; enables managed SNS routing when topic ARN is blank |
| `WhatsappEventTopicArn` | Leave blank for managed routing; otherwise supply the already-associated existing topic |
| `WhatsappAlertTemplate` | Approved compatible template name |
| `WhatsappTemplateLanguage` | Approved template language, default `en_US` |
| `SesFrom` | SES-verified email From address |
| `NotificationRecipients` | Optional initial recipients; prefer org settings |
| `GuardianModelId` | Optional supported model if real AI inspection is enabled |

**Managed routing:** provide the WABA ID and sender ID, leaving the existing topic
ARN blank. CloudFormation creates a standard SNS topic, account/Region-restricted
publishing policy, source-restricted SQS subscription, and WABA destination binding.
It fails rather than overwriting a different destination. If the WABA already has
a destination, reuse its topic ARN and leave its publishing policy and association
under their existing owner. WABA event publishing is account-wide across its numbers.

SES registration/DNS verification remains a pre-launch requirement; templates pass
the verified From address to all three services. They do not create SES identities
or provide Secrets Manager injection. Never create duplicate resources or overwrite
another application's destination. Routing is opt-in and does not change legacy
stacks until their parameters and template are explicitly updated.

The current templates also require a strong root password and stable session
secret as protected launch parameters. Do not put their values in this checklist,
Git, logs or outputs. Sender IDs/ARNs are configuration, not credentials. Recipient
lists are private organizational configuration. Future secret outputs should expose
only ARNs, never secret values. Production SDK calls use task-role credentials,
not copied AWS keys or SES SMTP passwords.

Most application configuration is injected into tasks by the template; buyers
should not edit container files. CFT outputs are not currently a complete `.env`
export. Local Bedrock credential-file paths never belong in stack outputs.

## 5. Verify after launch

1. Log in as root → **Admin → Settings → Messaging verification**.
2. Check the launch-configured sender and save the active organization's receiving number in Settings → Notifications,
   send a real setup test and reply with the complete `Verify …` line.
3. Confirm the return-path check succeeds. “Provider accepted” alone is not proof
   of delivery or that the queue/worker receives replies.
4. In organization notification settings, configure the receiving email and send
   an email test; verify it arrives in the inbox.
5. Against an explicitly authorized test server, verify incident → alert →
   `Protect <code>` reply → agent applied → automatic expiry/recovery. Confirm
   the agent's policy and organization response settings permit the bounded action.

See [WhatsApp setup](docs/whatsapp-setup.md), [Guardian safety and deployment](docs/guardian.md),
and [reviewed version updates](docs/cft-update.md). A linked WABA, successful stack
launch or local-only test does not by itself establish production readiness.
