# Real local PHP/Apache fixture

For normal application startup, use [clone, .env and Docker Compose](../../README-TECHNICAL.md#start-the-main-application).
This guide covers an optional separate disposable lab, not the main stack.

For the richer single-container SQLite app and pinned ffuf/nuclei workloads, see
[real-tool and database testing](SCANNERS.md).

Server details include a seeded browse URL and configured Apache hostname
suggestions. See [multiple websites and discovery](../../docs/server-websites.md).

From the repository root (Docker Compose 2.24.4+ and Node required):

```sh
node devops/local/start.mjs
```

Console: http://localhost:8183 ; sample website: http://localhost:8184 .
Sign in as **root / test**. The real server is automatically enrolled into root’s
default **GuardScale** workspace; no organization switch is required. The bootstrap
uses the existing authenticated org and enrollment APIs. The site runs the real
Go agent, collecting real Apache access/error and PHP warning logs. There are no
fabricated log events. Click Catalog, Contact, PHP warning or Apache denial.

Convenient commands: `npm run local:security` starts the security fixture at
http://localhost:8185 with its PHP website at http://localhost:8186, waits for a
fresh real-agent heartbeat, and fails if enrollment is not ready.
`npm run local:test:security` starts Playwright against that running fixture.
The browser automatically clicks the human Protect confirmation and verifies
actual blocking and recovery, printing each stage in your terminal.
`npm run local:fixture` / `npm run local:test` are the non-security equivalents.
The root password is intentionally `test` only in these loopback-bound disposable
fixtures; never copy it into a deployed configuration.

```sh
node devops/local/test.mjs
```

Playwright checks those real sources, newest-first organization logs, top-follow,
anchored older rows, pause/resume, public field allowlisting and reconnect identity.
The homepage retains at most 80 entries; organization activity 150; server 200.
If an inspected row ages out, its identity cannot be retained indefinitely.

## Explicit security test

Interactive demo: after startup, run `bash attack.sh` from the repository root.
It sends at most three bounded bursts from the fixed disposable probe, prints the
console URL, and waits for **your** approval. Choose **Block source temporarily…**
on the new incident. The script stops suspicious requests when access is lost,
verifies actual ipset membership plus independent website reachability, then waits
for automatic recovery. No external URL/IP argument is accepted. Exit code 2 means
the bounded run ended without a block; it is not a successful protection result.
Use Ctrl+C, or `bash attack.sh --stop` from another terminal, to stop request
generation without changing firewall state. A new interactive run explicitly
resumes the probe. Bursts stop when the probe loses access, so short blocks are
not silently missed while sending the rest of a burst. Re-run local startup
before repeat demos to reset the disposable agent's detection cooldown.
`bash attack.sh --verify` instead runs the existing Playwright flow, including
automated UI approval, blocking, expiry and audit checks. Neither mode sends real
external notifications by default. These scripts are not production services.

```sh
node devops/local/start.mjs --security
node devops/local/test.mjs --security
```

This uses a separate project, console 8185 and website 8186. Only its disposable
PHP container receives NET_ADMIN, restores the default NET_RAW socket capability
needed by iptables set-match, and installs firewall packages. A fixed internal probe
at 192.0.2.20 makes 60 bounded harmless missing-page/query requests, only against
the disposable site. No external targets, destructive requests, host networking,
Docker socket mount, host firewall changes or privileged mode are used.

The test exercises detection, explicit AI status, a local-only alert audit,
actual authenticated human approval in the UI, agent firewall application,
automatic expiry and recovery. It also checks that the browser/operator and
control plane remain reachable. It fails if kernel ipset support is unavailable;
it must not silently replace protection with a fake result. No AWS keys are
injected by default: AI is honestly not_configured and email/WhatsApp are NOT
delivered. Real model and messaging validation are separate deployment checks.

Both compositions bind published ports only to 127.0.0.1. The internal agent
network is isolated; web/site additionally have a bridge for loopback publishing.
Runtime secrets are generated locally, ignored by Git and excluded from Docker
build contexts. Enrollment tokens/configuration live only in runtime volumes.
The fixture tests a standalone built application, not dev-HMR hydration. Re-run
startup after source edits to rebuild. It is not included in release services;
its web entrypoint refuses production NODE_ENV.

Stop only these fixtures (no volume deletion):

```sh
docker compose -f devops/local/compose.yml --profile local-fixture down
docker compose -f devops/local/compose.yml -f devops/local/security.yml --profile local-fixture --profile local-security down
```

The test databases are in-memory and reset when their containers stop. Enrollment
volumes and generated passwords remain; bootstrap refreshes enrollment on startup.
See [Guardian deployment and remaining gaps](../../docs/guardian.md).

## Optional real Bedrock test

See [hackathon setup](../../docs/hackathon-local-testing.md) for the dedicated
short-lived credential JSON and ignored `.env` configuration. Then run
`node devops/local/start.mjs --security --bedrock` and
`node devops/local/test.mjs --security --bedrock` from the repository root.
This opt-in mode requires a completed actual Guardian tool loop, not merely an
explicit unavailable status. Inference is billable; notifications stay local-only.
