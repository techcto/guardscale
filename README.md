# Guardian.US

Built as a fresh, independent open-source SaaS application.

Guardian.US is an AI-powered infrastructure guardian that detects attacks and application failures, alerts teams via WhatsApp and email, and lets operators safely respond in real time. It is an independent open-source project; no license has yet been selected.

## Why Guardian.US exists

Agent-swarm traffic can now pass for ordinary human browsing one request at a time. Coordinated agents can rotate across distributed clients, use plausible browser fingerprints, traverse varied URLs, preserve cookies and referers, and remain below conventional per-IP limits. In aggregate, a short burst can still exhaust web workers, PHP-FPM pools, database capacity, sockets, and file descriptors before traditional controls recognize one offender.

Guardian.US correlates behavior at the origin: aggregate velocity, unique-URL traversal, query shapes, pagination depth, shared client patterns, direct-origin bypass, slow-stack repetition, worker saturation, resource pressure, and availability degradation. It never treats a browser version, country, or distributed traffic alone as proof of abuse. The objective is to preserve bounded evidence, explain what happened, and apply only predefined, reversible survival controls.

## Quick start

Start the complete local stack and open `http://localhost`:

```sh
cp .env.example .env
docker compose up --build -d
```

For local development, the compose defaults are username `root` and password `guardian-local-change-me`. Replace `GUARDIAN_ROOT_PASSWORD` and `GUARDIAN_SESSION_SECRET` in `.env` before exposing the application beyond localhost. Agent enrollment no longer uses a shared token — each organization gets its own enrollment secret, issued from the Nodes page.

Stripe checkout is disabled until `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, and `STRIPE_SCALE_PRICE_ID` are configured. Card data is handled by Stripe Checkout and is never stored by Guardian.US.

## Agent development

Requires Go 1.23+. Copy `configs/config.example.yaml`, use opaque server/tenant identifiers, and set local log paths.

```sh
go test ./...
go build -o bin/guardian ./cmd/guardian
bin/guardian test-config --config config.yaml
bin/guardian replay --config config.yaml --php-slow sample-slow.log sample-access.log
```

The Guardian log format is tab-separated: RFC3339 timestamp, X-Forwarded-For, immediate peer, Host, method, URI, status, bytes, duration milliseconds, Referer, User-Agent, and verification state (`valid`, `missing`, or `invalid`). Forwarded identity is used only when the immediate peer matches `proxy.trusted_cidrs`; chains are evaluated right-to-left.

Incident bundles are bounded by `storage.max_evidence_lines`. Query values and referers are removed and user agents fingerprinted. Protection ships disabled and dry-run; Phase 1 never mutates Apache, PHP-FPM, or firewall state.

Install the binary at `/usr/local/bin/guardian`, configuration at `/etc/guardian/config.yaml`, then install `systemd/guardian.service`. Its hardening permits only the state directory; future opt-in protection will require separately documented privileges.

See [architecture](docs/architecture.md), [security model](docs/security-model.md), and [contributing](CONTRIBUTING.md).
