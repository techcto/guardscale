# GuardScale — Technical README

[Overview](README.md) · [Judge's field guide](docs/JUDGES_FIELD_GUIDE.md) · [AWS architecture](docs/AWS-ARCHITECTURE.md)

## Runtime and reproducibility

The console and HTTP API use Next.js, React and TypeScript on Node.js 26. The
separate worker consumes SQS messages. The monitored Linux host runs the Go agent;
it does not receive the control plane's AWS credentials. Dockerfiles, package-lock.json,
go.mod and go.sum define the build inputs. Use `npm ci` to preserve resolved versions.
Optional scanner submodules are pinned Git references with their own licenses.

```sh
git clone --recurse-submodules https://github.com/techcto/guardscale.git
cd guardscale
npm ci
npm run local:security
npm run local:test:security
```

The isolated fixture uses ports 8185/8186 and root / test. It generates real
Apache requests and tests a real temporary block inside the disposable container.
No cloud messaging is delivered by the default fixture. Follow the
[real Bedrock and messaging guide](docs/whatsapp-local-testing.md) to enable those paths.

## Checks

```sh
npm ci
npx next typegen
npm run typecheck
npm run lint
npm run test:web
npm run build
go vet ./...
go test ./...
node --test devops/cloudformation/messaging.test.cjs
python3 devops/cloudformation/email-rule-activation.test.py
```

Node.js 26, Go 1.23 or newer, Docker Linux containers and Compose 2.24.4 or newer
are required for the full local workflow. The protection fixture also needs kernel
iptables/ipset support. Missing provider or kernel capabilities must remain visible
as failures; an audit-only notification is not successful AWS delivery.

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

For production credentials, environment separation, plan synchronization and rotation, follow the [Stripe setup guide](devops/stripe/README.md). CloudFormation injects credentials from Secrets Manager; local Compose always uses sandbox billing.

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

Incident bundles are bounded by `storage.max_evidence_lines`. Query values and referers are removed and user agents fingerprinted. Protection ships disabled and dry-run; Default operation never mutates Apache, PHP-FPM, or firewall state; opt-in Guardian adds bounded temporary HTTP(S) protection.

Install the binary at `/usr/local/bin/guardscale`, configuration at `/etc/guardscale/config.yaml`, then install `systemd/guardscale.service`. Its hardening permits only the state directory; opt-in protection requires the separately documented kernel capabilities and policy.

For an existing Linux EC2 instance, open **Nodes → Add node** and use the generated values with the checksum-verifying bootstrap installer:

```sh
curl -fsSLo /tmp/install-guardscale.sh https://guardscale.s3.us-east-1.amazonaws.com/agent/latest/install-agent.sh
sudo bash /tmp/install-guardscale.sh --enrollment-key '<tenant-id>.<enrollment-token>'
```

The command is reusable across a fleet. On EC2, the installer uses IMDSv2 to derive a stable node ID from the instance ID and creates the agent ID automatically; non-EC2 Linux hosts use a one-way machine identity. Architecture is detected automatically. The running agent sends a heartbeat every 30 seconds and at most one sanitized request signal per second. Raw log lines, query values, client IPs, referers, and user-agent strings stay on the monitored node.

## Private AWS deployment

The AWS Marketplace listing is not publicly live. Release tooling and private deployment templates are implemented; public buyer checkout and a new-buyer Marketplace installation are not claimed. Private installations require authorized container access. Review network, certificate, credentials, costs and the CloudFormation change set before installing.


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

## Real localhost testing and Guardian

Run `node devops/local/start.mjs` for the real PHP/Apache website and enrolled Go agent, then `node devops/local/test.mjs` for Playwright. An explicitly enabled disposable security fixture tests human-approved temporary protection and expiry. See [local testing](devops/local/README.md) and [Guardian tools, policy and deployment](docs/guardian.md). These source changes do not update production or demonstrate real message delivery by themselves.
# Hackathon testing guide

See [local setup, real agent tests, environment variables and Bedrock limitations](docs/hackathon-local-testing.md).
