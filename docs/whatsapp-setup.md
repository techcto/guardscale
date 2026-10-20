# WhatsApp setup (launch-time configuration)

Sender registration and SES From verification are prerequisites: see
[PREREQUISITES.md](../PREREQUISITES.md). Supply `WhatsappOriginationId` and
`SesFrom` through CloudFormation at launch. Update the stack to change them.
The app no longer saves sender overrides; existing overrides are ignored.
Organizations manage recipients in Settings → Notifications. Admin → Settings
provides verification only, not registration or a sender editor.


Pass `NotificationMode=aws`, `WhatsappAlertTemplate`, and `WhatsappTemplateLanguage` as well.

For automatic routing, supply `WhatsappBusinessAccountId=waba-…` and leave
`WhatsappEventTopicArn` blank. CloudFormation creates the topic, publishing policy,
queue subscription and WABA binding. The sender must belong to the registered WABA.
An existing different event destination is never overwritten. If already configured,
pass that topic ARN instead; its owner must maintain the publishing policy and WABA
association. No console AWS edits or app registration are necessary for managed routing.

For an existing stack, use CloudFormation's **Create change set → current stack**,
select the matching updated template (not an ownership migration template), and
set the launch parameters. Review and execute the change set. A version-only
`cmd.sh cft-update` intentionally preserves these parameters; it does not enable
routing by itself. Expect task-definition updates and a rolling service deployment.

Outputs include `WhatsappEventTopicArn`, `WhatsappOriginationId`, `SesFrom`,
`NotificationMode`, `WhatsappAlertTemplate`, `WhatsappTemplateLanguage`, and `AwsRegion`.
Use the effective topic output for local real-delivery tests, not the blank input.
Outputs contain configuration, never passwords or AWS access keys. Actual SES
verification, sandbox restrictions and approved WhatsApp templates remain prerequisites.

Deleting the managed binding detaches only its exact stack-owned topic before the
topic is deleted; it does not unregister the WABA/phone or alter a replacement
destination. Moving a binding to another WABA/topic requires a separately reviewed
migration. One WABA cannot be independently owned by multiple installations.

Send channel tests from Settings → Notifications. For WhatsApp round-trip verification, use Admin → Settings → Messaging verification, reply with the entire Verify code within ten minutes, then check again. Provider acceptance is not delivery confirmation. Log mode delivers nothing. Email alerts link to the authenticated console; email-reply commands are not supported.

Test real incident → alert → authorized Protect reply → agent block → expiry separately.

Offline regression command: npx tsx --test src/lib/whatsapp-*.test.ts src/lib/notifications.test.ts

Infrastructure regression checks (no AWS calls):

```bash
node --test devops/cloudformation/messaging.test.cjs
PYTHONDONTWRITEBYTECODE=1 python3 devops/cloudformation/whatsapp-destination.test.py
```

After changing the handler, regenerate its inline templates with
`node devops/cloudformation/wire-messaging.cjs`. Run `cfn-lint` on all five templates.
