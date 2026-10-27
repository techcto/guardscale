# Hackathon local testing

For the real Bedrock + WhatsApp round trip, split server-log console, continuous
local attack and bounded renewal/removal checks, use the
[local incident-response test guide](whatsapp-local-testing.md).

## Start here: no tag, Marketplace wait or AWS account needed

Install Docker with Compose 2.24.4+ (Linux containers) and Node.js 26. Run from
the repository root. The first build downloads images/dependencies and can take
several minutes. Normal local tests do not call billable AWS services.

### Quick app and real-log check

```sh
npm run local:fixture
npm run local:test
```

Open **http://localhost:8183**, log in as **root / test**, and open the connected
`local-php-fixture` server. Browse **http://localhost:8184** to generate real
Apache/PHP logs. The fixture enrolls the real agent automatically; no `.env` or
manual server registration is needed. Playwright checks the SQLite site, log
ingestion, redaction, pause/resume and reconnect controls.

### Hackathon protection demo

```sh
npm run local:security
npm run local:test:security
```

Open **http://localhost:8185** as **root / test**; its sample website is
**http://localhost:8186**. Expect five numbered stages and a final JSON result
with `passed: true`, `block: true`, `expiry: true`, and `operatorUnaffected: true`.
Playwright submits harmless suspicious requests only to that disposable site,
approves the action through the UI, and checks actual blocking and recovery.

For a recording where **you** choose Protect, run `bash attack.sh` after starting
the security fixture instead of the automated test. Open its new incident and
choose **Block source temporarily…**. To stop requests: `bash attack.sh --stop`.

### What this proves—and what it does not

| Test | Local result | Separate live requirement |
|---|---|---|
| Logs and detection | Real PHP/Apache requests and real agent ingestion | None for the local demo |
| Protect | Real temporary iptables/ipset block, UI approval and expiry | Agent policy and kernel support on each production host |
| AI | Default is explicitly `not_configured` | Opt-in Bedrock test below, using an approved session |
| WhatsApp/email | Audit only; nothing delivered | Registered sender, SES identity and actual AWS delivery |
| WhatsApp reply | Signed parsing/authorization covered by unit tests | SNS → SQS → worker round trip must be tested on a deployment |
| CFT updates | Mocked CLI tests; no AWS mutation | Reviewed change set on a dedicated development stack |

The fixture currently uses local SaaS organization/enrollment paths. It is not
a private Marketplace installation rehearsal, an AWS service emulator for
messaging, or proof that production is configured correctly. It never seeds
synthetic access logs; the admin sample-data gate described below is separate.

After editing source, rerun the same startup command to rebuild, then rerun tests.
Do not push a tag just to test code locally. On failure, keep the terminal output;
do not substitute a simulated success for an unavailable kernel/model/provider.

### Common fixes and shutdown

- Docker unavailable: start Docker Desktop/Engine with Linux containers.
- Compose rejects `!override`: update Compose to 2.24.4 or newer.
- Port 8183–8186 busy: stop the conflicting local service; do not stop unrelated projects.
- No server: rerun startup and wait for its enrollment/heartbeat check to succeed.
- Firewall test fails: the Docker Linux kernel needs iptables/ipset support;
  inspect agent logs rather than disabling safety checks or targeting another host.
- AI session expired: refresh the dedicated credential file and rerun the opt-in test.

```sh
docker compose -f devops/local/compose.yml --profile local-fixture logs --tail=80 web site
docker compose -f devops/local/compose.yml -f devops/local/security.yml --profile local-fixture --profile local-security logs --tail=80 web site probe
# Stop only these local projects, preserving volumes (no global docker prune).
docker compose -f devops/local/compose.yml --profile local-fixture down
docker compose -f devops/local/compose.yml -f devops/local/security.yml --profile local-fixture --profile local-security down
```

For AWS deployment updates, use the separate [reviewed CFT update command](cft-update.md).
For real WhatsApp tests, follow [WhatsApp setup](whatsapp-setup.md); an API
"provider accepted" response alone is not proof of phone delivery or a working reply.

Synthetic admin sample data is enabled only with `NODE_ENV=development` and
`GUARDSCALE_DEPLOYMENT_MODE=on-premise`, using in-memory or local DynamoDB storage.
SaaS mode and all production builds (including local production previews) never seed it.
Changing this gate does not delete previously seeded data. The real-agent test fixture,
where available, uses its separate explicit enrollment workflow rather than synthetic logs.

The sample site now includes a real SQLite-backed catalog, articles, cart/orders
and contact forms in the PHP/Apache container. For pinned ffuf/nuclei workloads,
start with `npm run local:security -- --tools`; see [real scanners and database
tests](../devops/local/SCANNERS.md). Tests use only the disposable site, never an
external target. These helpers are not shown in the production console UI.

## Recommended: real agent and disposable PHP server

Requirements: Docker Compose 2.24.4+ and Node.js 26. From the repository root:

```sh
node devops/local/start.mjs
node devops/local/test.mjs
```

Open http://localhost:8183 and http://localhost:8184. Log in as
`root` with password `test`. Its default **GuardScale** workspace already contains
the real `local-php-fixture` server. Startup waits for its authenticated heartbeat.
Click the sample pages to produce actual Apache access/error and PHP error logs.
Playwright verifies ingestion, newest-first ordering, scroll/pause behavior,
public redaction and reconnect commands. This fixture generates its own secrets;
it does **not** require copying `.env.example`.

The separately enabled security scenario is:

```sh
node devops/local/start.mjs --security
node devops/local/test.mjs --security
```

Use http://localhost:8185 for this separate console. It targets only its disposable
PHP container and tests detection, local alert audit, human Protect approval,
actual temporary firewall block and expiry. It never attacks external servers.
Shortcuts: `npm run local:security`, then `npm run local:test:security`.
Playwright automatically approves Protect through the UI and reports each stage.
The weak test password is deliberately restricted to the loopback-bound fixture.
See [fixture instructions](../devops/local/README.md) for isolation and shutdown.

## What belongs in .env?

For host Next.js development, copy `.env.example` to an ignored `.env.local`
only if it does not already exist, then set unique root/session secrets.
Next.js loads `.env.local`; plain Node/tsx worker commands do not automatically
load it. Use `node --env-file=.env.local --import tsx src/worker/index.ts`
when deliberately running a host worker with a real configured queue.
The example table/queue/bucket names are placeholders, not provisioned AWS resources.
Do not start a cloud worker against those placeholders.

## Bedrock: local versus production

`GUARDSCALE_AI_MODEL_ID` opts into real Guardian inference. `AWS_REGION` and
the server-side AWS SDK credential chain select the AWS identity. On a host,
use an approved short-lived AWS profile/session; in production use the ECS
task role and reviewed CloudFormation parameters/IAM. Never put AWS keys in
agent enrollment commands, images or source control.

The default fixture keeps AI disabled. Enable it explicitly using an approved,
short-lived session JSON outside the repository, readable only by your user and
the intended container. Its schema matches AutoVision:

```json
{"aws_access_key_id":"SESSION_ACCESS_KEY","aws_secret_access_key":"SESSION_SECRET","aws_session_token":"SESSION_TOKEN"}
```

In your ignored root `.env` set `GUARDSCALE_BEDROCK_CREDENTIALS_PATH` to the
absolute host file path, `AWS_REGION=us-east-1`, and optionally
`GUARDSCALE_AI_MODEL_ID=us.amazon.nova-lite-v1:0`. Do not put real keys in `.env`.
Compose reads this file from the repository working directory; the Node wrapper
itself does not load it. From the repository root:

```sh
node devops/local/start.mjs --security --bedrock
node devops/local/test.mjs --security --bedrock
```

The override mounts the session file read-only into the web process only. Local
storage retains dummy credentials; the monitored agent receives no AWS keys.
The test requires completed real Bedrock inspection and recommendation tools;
`not_configured` or `unavailable` fails this opt-in AI test. Refresh expired
sessions and keep the same flags when recreating services. Model invocation
incurs AWS charges. Normal tests remain cloud-independent.
Email/WhatsApp remain local audit only: this override does not enable delivery.
The earlier verified security run used `analysis:not_configured`; the live AWS
test must be run with an approved session before claiming it passed.

For a deliberately configured host instance, set the model in `.env.local`,
authenticate your approved AWS profile, and start Next with that profile:

```sh
AWS_PROFILE=YOUR_DEV_PROFILE npm run dev -- --port 8083
```

Use only dedicated development data/resources. A valid test must show a real
Guardian assessment, an `inspect_server` result from the connected agent, and
the subsequent recommendation. Missing permissions, timeout or unavailable
model must remain visible and must not authorize automatic protection.
Live SES/WhatsApp delivery and trusted incoming replies require separate AWS
configuration and tests with organization-admin configured test recipients.
