# Local incident-response testing

For normal application startup, use [clone, .env and Docker Compose](../README-TECHNICAL.md#start-the-main-application).
This guide covers an optional separate disposable lab, not the main stack.

Run these commands from the repository root using Node.js 26, Docker Linux
containers and Compose 2.24.4 or newer. Use one shell environment consistently
(for example WSL Bash); credential-file paths must be accessible to Docker.
No release tag or production deployment is required.

## 1. Start without external messaging

```sh
npm ci
node devops/local/start.mjs --security
```

- Console: <http://localhost:8185>, username `root`, password `test`.
- Disposable PHP/Apache website: <http://localhost:8186>.
- Server page: <http://localhost:8185/servers/local-php-fixture>.

This fixture enrolls a real Go agent. Its firewall capabilities are confined to
the disposable website container. It does not alter the host firewall. The
fixture password is deliberately local-only and must never be used in production.
Refresh the browser after rebuilding: this fixture runs a production-built UI.

## 2. Configure real Bedrock locally

Keep all credentials in the ignored root `.env` or private temporary session
files. Never copy another application's Stripe keys or commit session files.
Start with `.env.example` if you do not already have your local environment file.

```sh
node devops/local/prepare-bedrock.mjs --profile YOUR_PROFILE --apply --verify
```

The helper obtains an expiring STS session, checks real tool use with Nova Lite,
and writes `GUARDSCALE_BEDROCK_CREDENTIALS_PATH`, `GUARDSCALE_AI_MODEL_ID` and
`AWS_REGION` into `.env`. Existing local Stripe settings are preserved. The AWS
profile needs STS and Bedrock invocation access to the selected model/inference
profile. Refresh expired sessions with the same command. Dedicated credentials
are mounted only into the local console, not the monitored PHP server.

## 3. Give each local worker its own WhatsApp reply queue

The official development template is
[`guardscale-dev-whatsapp-replies.yaml`](../devops/cloudformation/guardscale-dev-whatsapp-replies.yaml).
Release publishing provides a stable S3 template URL for the launch button below.

<a href="https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/create/review?stackName=guardscale-dev-whatsapp-YOURNAME&amp;templateURL=https%3A%2F%2Fguardscale.s3.us-east-1.amazonaws.com%2Fcloudformation%2Fguardscale-dev-whatsapp-replies.yaml"><img src="../assets/launch-dev-whatsapp.svg" width="280" alt="Launch development WhatsApp routing" /></a>

Choose a unique developer stack name and the application's Region. Fill the
parameters below, review the proposed resources, and acknowledge IAM role creation.
The button uses Quick Create; for CLI deployment create and review a CREATE change
set first. This development stack is intentional and temporary, not a second app.
It creates a queue, DLQ, SNS subscription and optional developer role. It never
changes the business sender's routing or subscribes localhost to the production queue.
Delete this developer stack through CloudFormation after testing; stop its local
worker first. Short queue retention does not replace deleting the stack.

Do not point localhost at the production SQS queue: workers would compete for
messages. Two developers testing simultaneously also need separate development
queues. The development CFT subscribes an encrypted, short-retention queue to
the existing sender's SNS topic; it does not change the WABA destination.
Topic events are copied to the development queue, including non-test traffic.
Use authorized test recipients and delete the development stack through
CloudFormation after testing.

An AWS administrator must deploy the reviewed
[`guardscale-dev-whatsapp-replies.yaml`](../devops/cloudformation/guardscale-dev-whatsapp-replies.yaml)
with these parameters:

| Parameter | Value |
|---|---|
| `WhatsappEventTopicArn` | The production installation's `WhatsappEventTopicArn` output |
| `LocalDeveloperArn` | Your exact AWS IAM user/role ARN, not another developer's identity |
| `WhatsappSenderId` | Existing registered `phone-number-id-…` |
| `WhatsappBusinessAccountId` | Existing linked `waba-…` |

Use a distinct stack name, such as `guardscale-dev-whatsapp-YOURNAME`. Review
the CloudFormation change set before execution. Deployment requires SNS
subscription-management permissions in addition to the SQS/IAM/CloudFormation
permissions. The optional testing role can consume only its own development
queue and use the selected sender. It cannot consume the production queue.

Save your authorized receiving phone in `.env` in international format:

```dotenv
GUARDSCALE_LOCAL_WHATSAPP_RECIPIENT=+YOUR_AUTHORIZED_NUMBER
```

Then prepare the temporary messaging role session and queue configuration:

```sh
node devops/local/prepare-whatsapp.mjs --profile YOUR_PROFILE --stack YOUR_DEV_STACK --apply
node devops/local/start.mjs --security --bedrock --whatsapp
```

The helper writes a separate messaging credential-file path and queue URL into
the ignored `.env`. Local database credentials remain emulator-only. Refresh
the messaging helper and restart the fixture when its one-hour session expires.
The fixture's WhatsApp sender refuses recipients other than the selected phone.
No public localhost tunnel is needed: the local worker polls its AWS queue.

## 4. Verify the real phone round trip

1. From your receiving phone, send a message to the registered business number.
   This opens WhatsApp's session window; the local overlay sends session text,
   not an approved business-initiated template.
2. In the local console's organization notification settings, enable WhatsApp,
   save only that test recipient and disable email for this test.
3. Use the root WhatsApp setup test and reply on WhatsApp with the entire
   `Verify …` line. It expires in ten minutes and never approves a server block.
4. Confirm the setup shows a verified return path. Provider acceptance alone
   is not proof of delivery or verification.

## 5. Attack, inspect, Protect and Dismiss

Open the server page. Logs appear on the left; incidents, protection activity
and server controls appear on the right. Use the request filter and Pause/Resume.
Pausing the log viewport does not pause server polling or other panels.

For a bounded burst, run `bash attack.sh`. For continued local traffic:

```sh
bash attack.sh --continuous
# In another terminal, stop request generation when finished:
bash attack.sh --stop
```

Continuous mode sends one suspicious request per second to the fixed disposable
site, plus reachability checks, for at most 30 minutes. It accepts no arbitrary
target. Stop requests before shutting the fixture down.

In Settings → Response, enable remote requests, disable dry-run and choose a
short test TTL (for example 60 seconds). Auto Guardian is a separate standing
approval feature; leave it off when testing your own approval.

- **Protect:** reply `Protect` to the WhatsApp alert, or use **Block source
  temporarily…** on its incident page. A one-word phone reply requires exactly
  one current notified incident for that recipient. If several are pending,
  use the code line for the intended incident. An acknowledgement means the
  request was received; **Protected** requires the agent's execution result.
- **Watch:** keep monitoring. It does not remove an existing rule.
- **Dismiss:** close the incident, stop its extensions and request removal of
  its active rule. **Protection removed** requires the agent's acknowledgement;
  an offline agent cannot remove a rule immediately, but its kernel timeout
  still expires. The console exposes the cancellation-pending state.
- **Renewal:** opt in separately under Settings → Response. Near expiry, at
  least three fresh blocked packets for the same source are required. Choose
  a maximum total duration, such as 120 seconds for the demo (hard maximum
  900 seconds). Renewals and blocked counters appear in the activity history.
  Dismiss overrides this policy for the incident.

Blocked connections never reach Apache. During protection, expect firewall
counter events rather than invented HTTP log entries for rejected packets.
After expiry or removal, actual request paths/statuses resume in the log pane.
Sanitized signals exclude sensitive query values and raw access-log identities.

Incidents are grouped by source IP with expandable history. Use **Show all
incident history** to include dismissed incidents; grouping does not erase older
records or prove that a source address identifies a particular person.

## 6. Regression checks and sandbox billing

After starting a fresh real-message fixture, this opt-in browser check generates
an attack, approves through the console, verifies counter-driven renewal, then
dismisses and verifies actual rule removal and no subsequent renewal:

```sh
node devops/local/test.mjs --security --bedrock --response
```

This sends real notifications to the configured test phone and changes only the
disposable fixture's response policy/incident states and restarts its site agent
to reset detector cooldowns. It preserves an ongoing probe process. The separate manual phone
test above is required to prove WhatsApp approvals. If a previous run hit the
probe's cooldown, wait one minute; for agent detection cooldowns, restart the
fixture site or start a fresh fixture before rerunning.

```sh
npm run test:web
node --test devops/stripe/*.test.mjs
node --test devops/cloudformation/messaging.test.cjs
python3 devops/cloudformation/whatsapp-destination.test.py
npm run typecheck
go test ./internal/agentruntime ./internal/agentclient
```

The stock `node devops/local/test.mjs --security --bedrock` test changes fixture
notification recipients to an audit-only test address. Run it without the
WhatsApp overlay, then restore your authorized recipient before a real phone
test. Automated regression tests are distinct from proof of phone delivery.

For the main local billing Compose setup, keep `.env` in sandbox mode with
GuardScale's own `sk_test_…` key and matching local webhook signing secret:

```sh
node devops/stripe/setup-local.mjs --apply
```

This syncs test catalog IDs and refuses live keys. Dev includes 3 servers;
Pro uses the existing internal `starter` identifier and includes 10; Scale
includes 50. Paid overages require explicit opt-in and configured metered prices.
See [Stripe setup](../devops/stripe/README.md) for the complete billing test.
