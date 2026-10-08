```text
 GGGG U   U   A   RRRR  DDDD   SSSS  CCCC   A   L     EEEEE
G     U   U  A A  R   R D   D S     C      A A  L     E
G GGG U   U AAAAA RRRR  D   D  SSS  C     AAAAA L     EEEE
G   G U   U A   A R R   D   D     S C     A   A L     E
 GGG   UUU  A   A R  RR DDDD  SSSS   CCCC A   A LLLLL EEEEE

PROTECT THE ORIGIN. UNDERSTAND THE INCIDENT.
```

# GuardScale

[![CI](https://github.com/techcto/guardscale/actions/workflows/ci.yml/badge.svg)](https://github.com/techcto/guardscale/actions/workflows/ci.yml)
[![Open in GitHub](https://img.shields.io/badge/Open%20in-GitHub-181717?logo=github)](https://github.com/techcto/guardscale)

[Website](https://guardscale.org) · [GitHub](https://github.com/techcto/guardscale)

GuardScale is an AI-powered infrastructure guardian that detects attacks and application failures, alerts teams via WhatsApp and email, and lets operators safely respond in real time. It is open-source under AGPL-3.0-or-later (see `LICENSE`); a separate commercial license is available for embedding, redistribution, or operation without AGPL obligations (see `COMMERCIAL-LICENSE.md`).

<a href="https://guardscale.org"><img src="assets/launch-website.svg" width="200" alt="Visit GuardScale" /></a>
<a href="https://aws.amazon.com/marketplace/pp/prodview-rhtryiryciphg"><img src="assets/launch-marketplace.svg" width="200" alt="Subscribe to GuardScale on AWS Marketplace" /></a>
<a href="https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/create/review?templateURL=https://guardscale.s3.us-east-1.amazonaws.com/cloudformation/guardscale.yaml&amp;stackName=guardscale"><img src="assets/launch-aws.svg" width="200" alt="Launch GuardScale with AWS CloudFormation" /></a>

## The Problem

Agent-swarm traffic can now pass for ordinary human browsing one request at a time. Coordinated agents can rotate across distributed clients, use plausible browser fingerprints, traverse varied URLs, preserve cookies and referers, and remain below conventional per-IP limits. In aggregate, a short burst can still exhaust web workers, PHP-FPM pools, database capacity, sockets, and file descriptors before traditional controls recognize one offender.

GuardScale correlates behavior at the origin: aggregate velocity, unique-URL traversal, query shapes, pagination depth, shared client patterns, direct-origin bypass, slow-stack repetition, worker saturation, resource pressure, and availability degradation. It never treats a browser version, country, or distributed traffic alone as proof of abuse. The objective is to preserve bounded evidence, explain what happened, and apply only predefined, reversible survival controls.

## Hackathon Pitch

**A swarm can look human one request at a time. GuardScale looks at the origin.** The project connects bounded, redacted agent observations to an incident console and an AWS notification workflow so operators can understand pressure before choosing a response. Its safety model separates evidence and explanation from authorization to change infrastructure.

See the [hackathon story and submission checklist](CONTEST-README.md) and [architecture](docs/architecture.md). The conversational-response sections of the contest story describe the intended full workflow; demonstrate only configured, verified runtime features. The current Phase 1 agent is detection-first and does not execute arbitrary shell commands or mutate Apache, PHP-FPM, or firewall state.

## Try GuardScale

Open [guardscale.org](https://guardscale.org), sign in using deployment-owner credentials, and open **Nodes → Add node**. Copy the enrollment command to a supported Linux host, then confirm its heartbeat and sanitized telemetry before investigating incidents. Hosted root credentials are not the local defaults below. No anonymous incident or customer-data access is promised.

`agent → sanitized observations → incident → operator review`

## Core Capabilities

- Go agent with bounded evidence, trusted-proxy handling, redaction, replay, and fleet-friendly enrollment.
- Organization-scoped node inventory, incidents, users, and settings.
- Web/API/worker containers, DynamoDB, S3 evidence storage, and SQS processing.
- AWS notification adapters and optional AI integration that require explicit runtime configuration.
- Stripe billing plumbing; paid checkout remains disabled until configured.
- Standalone and existing-platform CloudFormation deployment paths.

## Local Development

The hosted application is [guardscale.org](https://guardscale.org). Its `guardscale-apphub` CloudFormation stack runs web, API, and worker services on the shared AppHub ECS Fargate platform. AWS credentials and root launch secrets are private; the local defaults below do not apply to the hosted installation.

Start the complete local stack and open `http://localhost`:

```sh
git clone https://github.com/techcto/guardscale.git
cd guardscale
cp .env.example .env
docker compose up --build -d
```

For local development, the compose defaults are username `root` and password `guardscale-local-change-me`. Replace `GUARDSCALE_ROOT_PASSWORD` and `GUARDSCALE_SESSION_SECRET` in `.env` before exposing the application beyond localhost. Agent enrollment no longer uses a shared token — each organization gets its own enrollment secret, issued from the Nodes page.

Stripe checkout is disabled until `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, and `STRIPE_SCALE_PRICE_ID` are configured. Card data is handled by Stripe Checkout and is never stored by GuardScale.

Check the local stack and follow service logs:

```bash
curl --fail http://localhost/api/health
docker compose ps
docker compose logs -f
# Stop without deleting persistent volumes:
docker compose down
```

Docker with Compose is required. Local defaults are for development only; configured AWS notification and AI paths must be verified separately.

## API Examples

Health is public. Operator endpoints use the session cookie issued by login:

```bash
curl --fail http://localhost/api/health
curl --fail-with-body -c /tmp/guardscale-demo.cookies \
  -H 'Content-Type: application/json' \
  -d '{"username":"root","password":"guardscale-local-change-me"}' \
  http://localhost/api/auth/login
curl --fail-with-body -b /tmp/guardscale-demo.cookies \
  http://localhost/api/v1/nodes
```

These credentials apply only to unmodified local Compose defaults. Treat the temporary cookie file as a credential, keep it private, and remove it after the demo. For hosted requests, use `https://guardscale.org` and your own launch/user credentials. Agent ingestion uses a separate organization-scoped enrollment credential; generate it through **Nodes → Add node**, not the operator login API.

## Agent Development

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

## AWS Marketplace And Deployment

[Subscribe on AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-rhtryiryciphg) before launching subscription-gated container images. The **LAUNCH AWS** button opens the standalone template in the CloudFormation console; review the network, certificate, credentials, costs, and change set before submitting. It does not subscribe or deploy automatically.


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

## License

GuardScale is [AGPL-3.0-or-later](LICENSE), with separately negotiated [commercial licensing](COMMERCIAL-LICENSE.md) for maintainer-owned code. AGPL permits commercial hosting; it does not reserve SaaS operation exclusively to the maintainers.
