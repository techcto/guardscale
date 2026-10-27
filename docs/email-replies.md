# SES sending and incident replies

Email infrastructure is part of the main GuardScale installation templates and
uses the normal commit/tag/release → published S3 template → reviewed main-stack
change-set workflow. There is no separate email application stack.

## One-time prerequisites

- An SES-verified sending domain in the same Region as the application. Supply
  its address as `SesFrom`, for example `noreply@your-domain.example`.
- SES production access when sending to unverified recipient addresses.
- A dedicated receiving subdomain and its Route 53 hosted-zone ID. Use a
  subdomain rather than replacing the organization's primary MX record.
- A deployment identity/CloudFormation execution role authorized to create the
  application's SES rules, DNS, SNS/KMS, Lambda and IAM resources. An application
  update cannot grant its deploying user missing IAM permissions.

The main template reuses the verified domain. It does **not** create another SES
identity. Customers whose domain is not verified must complete that prerequisite
before enabling this feature.

## Main-stack configuration

Set these through the reviewed main-stack change set:

| Parameter | Value |
|---|---|
| `NotificationMode` | `aws` |
| `SesFrom` | Address under the existing verified sender domain |
| `EmailRepliesEnabled` | `true` |
| `EmailReplyDomain` | Dedicated subdomain, such as `replies.your-domain.example` |
| `EmailReplyHostedZoneId` | Hosting zone for that subdomain |
| `EmailReplyTopicArn` | Leave blank for main-stack-owned receiving |
| `EmailReplyExistingRuleSetName` | Existing **active** SES receiving rule set, or blank if none is active |

With receiving enabled, the main stack creates the MX record, customer-managed
encryption key, encrypted SNS topic, recipient-specific SES rule and subscription
to its existing work queue. WhatsApp and SES topic grants are kept together in
the queue policy so enabling email does not overwrite WhatsApp delivery.

If no receipt rule set is active, the stack creates and activates its own. Its
activation handler refuses to replace another application's active rule set.
If another set already exists, provide its name; GuardScale adds only its own
subdomain rule. DNS propagation and SES receiving must be verified after update.

All five installation templates are published at versioned and latest S3 paths
by the normal release workflow, including the AppHub owned-data variant. Always
choose the variant matching the deployed stack; do not switch storage ownership
or recreate the application merely to enable email.

## Reply behavior and controls

Enable email notifications and save authorized recipients in organization
settings. Incident messages have a signed, recipient-specific Reply-To address
only when both receiving domain and trusted topic are configured.

Reply with `Protect`, `Watch` or `Dismiss` as the first non-empty line. The reply
address identifies the incident; there is no need to copy a server ID or code.
The command window is 15 minutes after incident detection.

- `Protect` requests the same bounded agent-validated block as WhatsApp/console.
- `Watch` keeps monitoring without removing an active block.
- `Dismiss` stops that incident's renewals and requests agent-confirmed removal.

The worker verifies the exact SES SNS topic and requires passing DMARC, spam and
virus verdicts, an authorized sender and the signed reply address. It rejects
stale messages, automatic responses, attachments and commands found only in
quoted text. It records response metadata, not the raw email body, in incident
history. Repeated delivery of the same SES message is idempotent. SES SNS
receiving is limited to 150 KB messages, including MIME headers.

Email confirmations distinguish **requested** from **agent-confirmed protected**
or **removed**. Provider acceptance is not proof of inbox delivery or successful
firewall execution. No email rule can authorize arbitrary shell commands.

## Local testing

The ignored `.env` needs `GUARDSCALE_SES_FROM`; absence causes the explicit
`GUARDSCALE_SES_FROM is required` error. The development CFT's optional `SesFrom`
and `LocalEmailRecipient` parameters grant sending only from that sender to that
authorized recipient. `prepare-whatsapp.mjs` copies configured email values from
the development stack into `.env` while preserving Stripe and storage settings.

To receive real replies locally, pass the main stack's `EmailReplyTopicArn` and
`EmailReplyDomain` outputs to the developer queue's corresponding parameters.
Each developer retains a separate queue. The SNS subscription delivers copies
without consuming production's queue. Refresh credentials and restart the local
fixture after changing environment settings.

See [local incident-response testing](whatsapp-local-testing.md). First test
outbound inbox delivery. Then trigger a real disposable incident and reply from
the authorized mailbox. Test both agent-confirmed Protect and Dismiss, checking
the console response history and actual probe reachability. Unit tests do not
replace this live mailbox round trip.
