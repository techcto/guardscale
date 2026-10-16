# GuardScale — AWS CDS Agentic AI Partner Hackathon

## Submission draft — not submission-ready

### Requirements audit — October 9, 2026

| Requirement | Status / remaining evidence |
| --- | --- |
| AWS-deployed AI solution | Blocked: no Bedrock/AgentCore inference call found in audited application/agent source. Implement, test and deploy a real AI workflow. AgentCore is recommended, not mandatory. |
| Eligible runtime CDS service | SES and EUM Social send adapters exist; demonstrate actual configured delivery. Log mode and EUM Push do not qualify. |
| Partner eligibility | Confirm APN registration, terms, authorized representative and team eligibility. |
| New-project eligibility | Verify creation within September 14–October 28, 2026; disclose pre-existing code as required. Renaming a repository does not prove newness. |
| ACE opportunity | Net-new qualifying opportunity within the window, with required campaign; provide ID privately. |
| Submission artifacts | Pending: exported architecture, approximately three-minute public English video, working AI/CDS demo, deployed access/instructions, and free judge access through judging. |
| Repository | AGPL-3.0 exists; verify submitted-revision source, assets, setup and judge access. |

See [requirements](https://aws-cds-partner.devpost.com/) and [rules](https://aws-cds-partner.devpost.com/rules). Marketplace delivery is not a substitute for runtime evidence.

## Devpost fields — complete after verification

### Project name

`GuardScale`

### Elevator pitch (under 200 characters)

> GuardScale detects attacks and application failures, alerts teams via WhatsApp and email, and preserves bounded evidence. AI-assisted response is in development.

### About the project

Use the sections from **Origin story** through **Safety and responsible agentic behavior** below as the Markdown project story. They cover inspiration, what we learned, how the project was built, and the primary engineering challenges.

### Built with (up to 25 tags)

`Go`, `Next.js`, `React`, `TypeScript`, `Docker`, `AWS`, `Amazon ECS`, `AWS Fargate`, `Application Load Balancer`, `Amazon DynamoDB`, `Amazon S3`, `Amazon SQS`, `Amazon CloudWatch`, `Amazon SES`, `AWS End User Messaging Social`, `WhatsApp`, `CloudFormation`, `GitHub Actions`, `Apache`, `PHP-FPM`, `Linux`, `systemd`, `nftables`

### Try it out links

- Devpost submission: https://devpost.com/software/guardscale
- Demo: `https://guardscale.org`
- Source: `https://github.com/techcto/guardscale`
- API health: `https://guardscale.org/api/health`

### Project media

- Gallery images: dashboard overview, incident timeline, verified outbound notification delivery, and architecture diagram. Use synthetic data only and crop to a 3:2 ratio where practical.
- Video demo: `<YOUTUBE_OR_VIMEO_URL>`

### Code repository access

`https://github.com/techcto/guardscale`

Before submission, confirm the public repository has a visible OSI-approved `LICENSE` file and includes every runtime integration actually shown in the video.

### Architecture diagram

Upload the exported PNG or PDF version of `docs/architecture-diagram.mmd` (to be rendered before submission).

### ACE Opportunity ID

`<ACE_OPPORTUNITY_ID>`

Create this through AWS Partner Central ACE with marketing campaign code `AWS CDS Agentic AI Hackathon -Sept. 2026`. Do not commit the resulting opportunity ID to this public repository.

### Which CDS services does the solution use?

Select only services actually demonstrated at runtime. SES and AWS End User Messaging Social adapters exist, but delivery evidence remains to be recorded.

### Was WhatsApp the sole CDS service?

Answer after verifying which services the submitted demo actually uses.

### Describe how AWS End User Messaging Social (WhatsApp) was used

> GuardScale includes an outbound AWS End User Messaging Social adapter for structured incident alerts. Actual delivery must be verified before submitting this field. Opt-in Guardian source now includes bounded Bedrock inspection, trusted WhatsApp reply handling and temporary Protect execution. Local approval/block/expiry tests passed; live AI/CDS delivery still needs deployment verification. RESTORE/service restart tools are not implemented.

### Country fields

- Team member country or countries: `<SELECT_IN_DEVPOST>`
- AWS Partner headquarters country: `<SELECT_IN_DEVPOST>`

## The pitch

GuardScale correlates origin telemetry, preserves bounded evidence and provides a tenant-scoped console with configurable outbound WhatsApp and SES adapters. AI explanation and policy-controlled response are planned, not completed.

Target: [AWS CDS Agentic AI Partner Hackathon](https://aws-cds-partner.devpost.com/), due October 28, 2026 at 1 PM PDT (4 PM EDT). The deployed-AI requirement is not yet established by the audited source.

## Origin story

Traditional rate limits assume abusive traffic will reveal a noisy IP, an obviously automated client, or an individually excessive request rate. Agent swarms break that assumption. Hundreds of agents can use plausible browser fingerprints, rotate distributed addresses, preserve normal-looking request context, and traverse unique pages at a low rate per identity. Each request looks human. Together, a short coordinated burst exhausts Apache, PHP-FPM, database capacity, sockets, or file descriptors.

GuardScale correlates the behavior the origin actually experiences. It combines request velocity, distributed identity, unique-URL and pagination traversal, direct-origin bypass, PHP saturation, repeated slow stacks, resource exhaustion, and application availability. It never declares a browser version, country, or busy IP malicious by itself.

## Three-minute demonstration

Record verified behavior: synthetic traffic replay, correlated incident, bounded evidence, console timeline and configured real CDS delivery. Add an actual deployed AI workflow before submission. Do not invent performance measurements or present simulated WhatsApp approvals as implemented functionality.

## AWS architecture

```text
GuardScale Go agent
        │ outbound HTTPS
        ▼
Application Load Balancer
        ├── guardscale-web (ECS Fargate / Next.js)
        └── guardscale-api (ECS Fargate / Next.js route handlers)
                  │
                  ├── DynamoDB — tenant-scoped operational records
                  ├── S3 — bounded evidence bundles
                  └── SQS + DLQ
                         │
                         ▼
                  guardscale-worker (ECS Fargate)
                    ├── AWS End User Messaging Social / WhatsApp
                    └── Amazon SES
```

CloudWatch receives platform logs and service health. GuardScale telemetry remains distinct from platform telemetry. The agent has no AWS credentials and stays useful while disconnected.

## Safety and responsible agentic behavior

- Phase 1 is detection-first; no cloud-directed mutation or AI inference is demonstrated.
- Signed, expiring, allowlisted commands and AI-assisted decisions are future requirements.
- The agent never exposes arbitrary shell execution.
- Local policy may reject a cloud-approved action.
- Automatic actions are disabled by default, dry-run first, and require TTL rollback.
- Evidence is bounded and redacted; secrets, cookies, authorization values, and sensitive query values are excluded.
- Tenant, server, agent, incident, and command identifiers are opaque and every storage query is tenant-scoped.
- High traffic alone cannot trigger destructive action.

## Measurable customer impact

GuardScale is designed to reduce time-to-understanding from a manual cross-log investigation to one correlated incident timeline, reduce time-to-safe-action through a conversational approval path, and reduce recovery risk through evidence-first, reversible actions. Collect reproducible measured detection latency and error-rate results. Approval-to-recovery measurements require the response workflow first.

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
go build -o bin/guardscale ./cmd/guardscale
bin/guardscale test-config --config configs/config.example.yaml
```

The local stack uses only synthetic identifiers and local service substitutes. CDS adapters need explicit AWS configuration; log mode is the safe default. Environment variables alone do not implement Bedrock/AgentCore or response execution.

## Submission checklist

- Public repository includes an OSI-approved license before submission.
- Architecture diagram is exported from the architecture above.
- Approximately three-minute demonstration video shows actual implemented AI and CDS runtime behavior.
- Deployed project URL or interaction instructions are supplied.
- Runtime code demonstrates eligible AWS CDS usage.
- WhatsApp submission text explains AWS End User Messaging Social usage.
- AWS Partner Central ACE opportunity uses campaign code `AWS CDS Agentic AI Hackathon -Sept. 2026`.
- Examples, screenshots, fixtures, and recordings contain synthetic data only.

## Commercial path

The open-source agent remains independently useful. Commercial value comes from hosted correlation, conversational response, AWS enrichment, longer retention, team workflows, enterprise policies, Marketplace delivery, and support. The architecture supports hosted SaaS and customer-hosted AWS deployment without putting cloud administrator credentials on monitored origins.

## Guardian evaluation and limitations

The PHP/Apache fixture includes reproducible Playwright checks for real log ingestion, newest-first views, scroll anchoring, pause/resume and public redaction. The disposable security tests exercise real detection → local alert audit → authenticated human approval → iptables/ipset block → kernel expiry/recovery, with operator/control-plane access preserved. See the [local testing guide](devops/local/README.md) for commands. Local-only alerts and runs without configured AI do not demonstrate live Bedrock/CDS delivery. The source includes the Guardian tool loop, scoped MCP response tools and disabled-by-default Auto Guardian policy; deployment and real-provider tests remain necessary.
