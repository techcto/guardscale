# Guardian.US — AWS CDS Agentic AI Partner Hackathon

## Copy-ready Devpost fields

### Project name

`Guardian.US`

### Elevator pitch (under 200 characters)

> Guardian.US detects attacks and application failures, alerts teams via WhatsApp and email, and lets operators safely respond in real time.

### About the project

Use the sections from **Origin story** through **Safety and responsible agentic behavior** below as the Markdown project story. They cover inspiration, what we learned, how the project was built, and the primary engineering challenges.

### Built with (up to 25 tags)

`Go`, `Next.js`, `React`, `TypeScript`, `Docker`, `AWS`, `Amazon ECS`, `AWS Fargate`, `Application Load Balancer`, `Amazon DynamoDB`, `Amazon S3`, `Amazon SQS`, `Amazon CloudWatch`, `Amazon SES`, `AWS End User Messaging Social`, `WhatsApp`, `Amazon Bedrock`, `Bedrock AgentCore`, `CloudFormation`, `GitHub Actions`, `Apache`, `PHP-FPM`, `Linux`, `systemd`, `nftables`

### Try it out links

- Devpost submission: https://devpost.com/software/guardian-us
- Demo: `<DEPLOYED_DEMO_URL>`
- Source: `<PUBLIC_REPOSITORY_URL>`
- API health: `<DEPLOYED_DEMO_URL>/api/health`

### Project media

- Gallery images: dashboard overview, incident timeline, WhatsApp approval exchange, recovery result, and architecture diagram. Use synthetic data only and crop to a 3:2 ratio where practical.
- Video demo: `<YOUTUBE_OR_VIMEO_URL>`

### Code repository access

`<PUBLIC_REPOSITORY_URL>`

Before submission, confirm the public repository has a visible OSI-approved `LICENSE` file and includes every runtime integration actually shown in the video.

### Architecture diagram

Upload the exported PNG or PDF version of `docs/architecture-diagram.mmd` (to be rendered before submission).

### ACE Opportunity ID

`<ACE_OPPORTUNITY_ID>`

Create this through AWS Partner Central ACE with marketing campaign code `AWS CDS Agentic AI Hackathon -Sept. 2026`. Do not commit the resulting opportunity ID to this public repository.

### Which CDS services does the solution use?

- AWS End User Messaging Social (WhatsApp)
- Amazon Simple Email Service (SES)

### Was WhatsApp the sole CDS service?

`No` — the project uses WhatsApp and Amazon SES.

### Describe how AWS End User Messaging Social (WhatsApp) was used

> Guardian.US uses AWS End User Messaging Social as a two-way incident-response interface. It sends a concise, structured incident alert with request rate, failure rate, PHP saturation, and the detected behavioral pattern. An authenticated operator can reply with commands such as STATUS, DETAILS, PROTECT, EXTEND, RESTORE, or IGNORE. Guardian maps a recognized reply to a predefined policy action; mutation requests require authorization, target validation, expiry, TTL, audit, and local-agent acceptance. Free-form questions are answered from redacted structured evidence through the AI layer, but neither WhatsApp nor AI can execute arbitrary shell commands. Guardian sends follow-up recovery measurements through the same conversation.

### Country fields

- Team member country or countries: `<SELECT_IN_DEVPOST>`
- AWS Partner headquarters country: `<SELECT_IN_DEVPOST>`

## The pitch

Guardian.US turns a production-origin incident into a two-way, policy-controlled conversation. A lightweight Go agent recognizes a coordinated agent swarm, preserves bounded forensic evidence, and sends a structured incident to an AWS control plane. Guardian explains the incident through Amazon Bedrock/AgentCore, alerts an operator through AWS End User Messaging Social for WhatsApp, accepts an explicit `PROTECT` response, maps it to a predefined temporary action, verifies recovery, and delivers the forensic report through Amazon SES.

This project targets the [AWS Communication Developer Services Agentic AI Partner Hackathon](https://aws-cds-partner.devpost.com/), whose submission deadline is October 28, 2026 at 1:00 PM PDT. The challenge requires a deployed AI solution using at least one eligible AWS CDS service; Guardian is designed to demonstrate both WhatsApp and SES, with Bedrock AgentCore as the conversational reasoning layer.

## Origin story

Traditional rate limits assume abusive traffic will reveal a noisy IP, an obviously automated client, or an individually excessive request rate. Agent swarms break that assumption. Hundreds of agents can use plausible browser fingerprints, rotate distributed addresses, preserve normal-looking request context, and traverse unique pages at a low rate per identity. Each request looks human. Together, a short coordinated burst exhausts Apache, PHP-FPM, database capacity, sockets, or file descriptors.

Guardian correlates the behavior the origin actually experiences. It combines request velocity, distributed identity, unique-URL and pagination traversal, direct-origin bypass, PHP saturation, repeated slow stacks, resource exhaustion, and application availability. It never declares a browser version, country, or busy IP malicious by itself.

## Three-minute demonstration

1. Replay a synthetic distributed pagination swarm: traffic rises from 55 to 1,500 requests/minute while HTTP 504s peak at 65%.
2. The Go agent correlates `TrafficSpike`, `DistributedCrawler`, `PaginationEnumeration`, `UniqueURLStorm`, `DirectOriginAccess`, `PHPSaturation`, `SlowStackStorm`, and `HTTPFailureSpike`.
3. Guardian freezes a bounded, redacted evidence bundle and sends the structured incident outbound.
4. The AWS API acknowledges immediately and queues correlation work in SQS.
5. The worker asks Bedrock/AgentCore to explain the evidence using structured, non-sensitive fields.
6. An operator receives the incident through WhatsApp and replies `PROTECT`.
7. Guardian authenticates the operator, maps the message to an allowlisted action with a TTL, and sends a signed command. There is no arbitrary shell path.
8. The local agent validates its own policy, applies or dry-runs the temporary protection, and reports the result.
9. Recovery telemetry is returned through WhatsApp; Amazon SES sends the bounded forensic report; the dashboard shows the incident timeline.

## AWS architecture

```text
Guardian.US Go agent
        │ outbound HTTPS
        ▼
Application Load Balancer
        ├── guardian-web (ECS Fargate / Next.js)
        └── guardian-api (ECS Fargate / Next.js route handlers)
                  │
                  ├── DynamoDB — tenant-scoped operational records
                  ├── S3 — bounded evidence bundles
                  └── SQS + DLQ
                         │
                         ▼
                  guardian-worker (ECS Fargate)
                    ├── Bedrock / AgentCore
                    ├── AWS End User Messaging Social / WhatsApp
                    └── Amazon SES
```

CloudWatch receives platform logs and service health. Guardian telemetry remains distinct from platform telemetry. The agent has no AWS credentials and stays useful while disconnected.

## Safety and responsible agentic behavior

- AI explains and recommends; policy authorizes mutations.
- Commands are versioned, signed, nonce/expiry limited, audited, and allowlisted.
- The agent never exposes arbitrary shell execution.
- Local policy may reject a cloud-approved action.
- Automatic actions are disabled by default, dry-run first, and require TTL rollback.
- Evidence is bounded and redacted; secrets, cookies, authorization values, and sensitive query values are excluded.
- Tenant, server, agent, incident, and command identifiers are opaque and every storage query is tenant-scoped.
- High traffic alone cannot trigger destructive action.

## Measurable customer impact

Guardian is designed to reduce time-to-understanding from a manual cross-log investigation to one correlated incident timeline, reduce time-to-safe-action through a conversational approval path, and reduce recovery risk through evidence-first, reversible actions. Demo measurements compare detection latency, peak 504 rate, PHP slow-worker count, and time from operator approval to verified recovery.

## Reproduce locally

Prerequisites: Docker Desktop with Compose and Go 1.23+ for direct agent development.

```sh
docker compose up -d --build
docker compose ps
curl http://localhost:3001/api/health
curl http://localhost/api/health
```

Agent checks:

```sh
go test ./...
go build -o bin/guardian ./cmd/guardian
bin/guardian test-config --config configs/config.example.yaml
```

The local stack uses only synthetic identifiers and local service substitutes. AWS CDS, Bedrock/AgentCore, and production mutations must be explicitly configured; mock/log modes are the safe local defaults.

## Submission checklist

- Public repository includes an OSI-approved license before submission.
- Architecture diagram is exported from the architecture above.
- Approximately three-minute demonstration video shows the complete conversational loop.
- Deployed project URL or interaction instructions are supplied.
- Runtime code demonstrates eligible AWS CDS usage.
- WhatsApp submission text explains AWS End User Messaging Social usage.
- AWS Partner Central ACE opportunity uses campaign code `AWS CDS Agentic AI Hackathon -Sept. 2026`.
- Examples, screenshots, fixtures, and recordings contain synthetic data only.

## Commercial path

The open-source agent remains independently useful. Commercial value comes from hosted correlation, conversational response, AWS enrichment, longer retention, team workflows, enterprise policies, Marketplace delivery, and support. The architecture supports hosted SaaS and customer-hosted AWS deployment without putting cloud administrator credentials on monitored origins.
