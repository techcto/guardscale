# Hackathon local testing

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
