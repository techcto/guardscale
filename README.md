# GuardScale

Built as a fresh, independent open-source SaaS application.

[Website](https://guardscale.org) · [GitHub](https://github.com/techcto/guardscale)

GuardScale is an AI-powered infrastructure guardian that detects attacks and application failures, alerts teams via WhatsApp and email, and lets operators safely respond in real time. It is source-available under AGPL-3.0-or-later (see `LICENSE`); a separate commercial license is available for embedding, redistribution, or operation without AGPL obligations (see `COMMERCIAL-LICENSE.md`).

## Why GuardScale exists

Agent-swarm traffic can now pass for ordinary human browsing one request at a time. Coordinated agents can rotate across distributed clients, use plausible browser fingerprints, traverse varied URLs, preserve cookies and referers, and remain below conventional per-IP limits. In aggregate, a short burst can still exhaust web workers, PHP-FPM pools, database capacity, sockets, and file descriptors before traditional controls recognize one offender.

GuardScale correlates behavior at the origin: aggregate velocity, unique-URL traversal, query shapes, pagination depth, shared client patterns, direct-origin bypass, slow-stack repetition, worker saturation, resource pressure, and availability degradation. It never treats a browser version, country, or distributed traffic alone as proof of abuse. The objective is to preserve bounded evidence, explain what happened, and apply only predefined, reversible survival controls.

## Quick start

The hosted application is [guardscale.org](https://guardscale.org). Its `guardscale-apphub` CloudFormation stack runs web, API, and worker services on the shared AppHub ECS Fargate platform. AWS credentials and root launch secrets are private; the local defaults below do not apply to the hosted installation.

Start the complete local stack and open `http://localhost`:

```sh
cp .env.example .env
docker compose up --build -d
```

For local development, the compose defaults are username `root` and password `guardscale-local-change-me`. Replace `GUARDSCALE_ROOT_PASSWORD` and `GUARDSCALE_SESSION_SECRET` in `.env` before exposing the application beyond localhost. Agent enrollment no longer uses a shared token — each organization gets its own enrollment secret, issued from the Nodes page.

Stripe checkout is disabled until `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, and `STRIPE_SCALE_PRICE_ID` are configured. Card data is handled by Stripe Checkout and is never stored by GuardScale.

## Agent development

Requires Go 1.23+. Copy `configs/config.example.yaml`, use opaque server/tenant identifiers, and set local log paths.

```sh
go test ./...
go build -o bin/guardscale ./cmd/guardscale
bin/guardscale test-config --config config.yaml
bin/guardscale replay --config config.yaml --php-slow sample-slow.log sample-access.log
```

The GuardScale log format is tab-separated: RFC3339 timestamp, X-Forwarded-For, immediate peer, Host, method, URI, status, bytes, duration milliseconds, Referer, User-Agent, and verification state (`valid`, `missing`, or `invalid`). Forwarded identity is used only when the immediate peer matches `proxy.trusted_cidrs`; chains are evaluated right-to-left.

Incident bundles are bounded by `storage.max_evidence_lines`. Query values and referers are removed and user agents fingerprinted. Protection ships disabled and dry-run; Phase 1 never mutates Apache, PHP-FPM, or firewall state.

Install the binary at `/usr/local/bin/guardscale`, configuration at `/etc/guardscale/config.yaml`, then install `systemd/guardscale.service`. Its hardening permits only the state directory; future opt-in protection will require separately documented privileges.

For an existing Linux EC2 instance, open **Nodes → Add node** and use the generated values with the checksum-verifying bootstrap installer:

```sh
curl -fsSLo /tmp/install-guardscale.sh https://guardscale.s3.us-east-1.amazonaws.com/agent/latest/install-agent.sh
sudo bash /tmp/install-guardscale.sh --enrollment-key '<tenant-id>.<enrollment-token>'
```

The command is reusable across a fleet. On EC2, the installer uses IMDSv2 to derive a stable node ID from the instance ID and creates the agent ID automatically; non-EC2 Linux hosts use a one-way machine identity. Architecture is detected automatically. The running agent sends a heartbeat every 30 seconds and at most one sanitized request signal per second. Raw log lines, query values, client IPs, referers, and user-agent strings stay on the monitored node.

## AWS Deployment

Install, update, and delete application infrastructure only through formal CloudFormation templates and reviewed change sets. Do not delete individual AWS resources manually. Standalone installations and AppHub installations remain independent deployment choices.

| Installation | Template | Purpose |
| --- | --- | --- |
| Standalone | `devops/cloudformation/guardscale.yaml` | Application and its own load balancer/cluster in an existing VPC |
| Shared platform | `devops/cloudformation/guardscale-existing.yaml` | Attach services to an existing ECS cluster and listener |
| Preserved-data relaunch | `devops/cloudformation/guardscale-apphub-relaunch.yaml` | Create replacement compute using existing storage |
| Data ownership import | `devops/cloudformation/guardscale-apphub-owned-data.yaml` | Import retained storage into the replacement app stack |

The running AppHub installation preserves the original DynamoDB table, evidence bucket, and queues. API and web listener priorities are 600 and 601. Launch parameters must include strong root credentials and a stable session secret; never commit filled parameter files. Certificate and DNS changes must be owned by CloudFormation. Keep the shared platform until all attached app stacks are removed.

## Recovery And Operations

Check `/api/health`, ECS service stability, healthy ALB targets, TLS, login, and agent heartbeats after deployment. Use the Nodes console to confirm enrollment and sanitized telemetry before enabling response actions.

For a replacement stack, apply and verify storage retention first, launch and test new compute, switch traffic through a change set, delete the old stack through CloudFormation, and import its retained storage. Preserve root/session secrets and resource identifiers. The AppHub `RECOVERY.md` workflow and private configuration exporter document this procedure; configuration exports are not database or object-content backups. Scheduled data backups require a separate reviewed deployment and a tested restore path.

See [architecture](docs/architecture.md), [security model](docs/security-model.md), [contributing](CONTRIBUTING.md), and [commercial licensing](COMMERCIAL-LICENSE.md).
