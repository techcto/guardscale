# GuardScale

### Your infrastructure, one reply away.

[![CI](https://github.com/techcto/guardscale/actions/workflows/ci.yml/badge.svg)](https://github.com/techcto/guardscale/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

**Investigate origin-server pressure, reach the operator through WhatsApp or email,
and turn explicit approval into scoped, temporary protection.**

[Start the judge walkthrough](docs/JUDGES_FIELD_GUIDE.md) · [Technical README](README-TECHNICAL.md) · [AWS architecture](docs/AWS-ARCHITECTURE.md) · [Guardian and MCP](docs/guardian.md)

<a href="https://guardscale.org"><img src="assets/launch-website.svg" width="200" alt="Try GuardScale live" /></a>

## Protect the origin. Understand the incident.

An application can fail while individual requests still look ordinary. A distributed
crawl can exhaust PHP workers and database capacity without one obvious high-rate
client. Understanding the incident means correlating request patterns, log-source
health and server pressure before choosing a response.

GuardScale collects bounded observations with a Go agent, groups incidents by
observed source, and gives operators a live activity view. An opt-in Amazon Bedrock
Guardian inspects actual server evidence before recommending Protect, Watch or
Dismiss. The recommendation requests human review; it does not approve itself.

**Observe → Inspect → Recommend → Notify → Human approval → Scoped action → Verify.**

## Communication is part of the control loop

AWS End User Messaging Social sends WhatsApp alerts using the actual
`SendWhatsAppMessageCommand` API. Replies return through SNS and SQS to the worker.
A verified recipient can reply **Protect**, **Watch** or **Dismiss**. When several
alerts are pending, the reply must identify the incident rather than guessing.

Amazon SES sends incident and authentication emails using `SendEmailCommand`.
Optional signed incident-email replies share the same response policy. The receiving
infrastructure is included in the main CloudFormation templates; deployment and a
real reply test are required before claiming that a particular installation supports it.

[Runtime CDS calls and entry points](docs/JUDGES_FIELD_GUIDE.md#runtime-aws-cds-evidence)

## Try the actual application

[Browse the real-console gallery and diagrams](docs/gallery/README.md)

1. Open [GuardScale](https://guardscale.org) and sign in to your authorized workspace.
2. Enroll a supported host from the node enrollment screen and confirm its heartbeat.
3. Open its server page to view sanitized activity, incidents and available evidence.
4. Review the Guardian trace when Bedrock is enabled and configured.
5. Approve a bounded response through the console or a verified messaging recipient.
6. Check the agent-confirmed outcome, expiry or removal in the activity timeline.

## Run locally

```sh
git clone https://github.com/techcto/guardscale.git
cd guardscale
cp .env.example .env
# Set GUARDSCALE_ROOT_PASSWORD and GUARDSCALE_SESSION_SECRET in .env.
docker compose up --build -d
```

Open **http://localhost** and sign in as `root` with the password you set.
The main stack includes web, API, worker and local data services. It does not
require AWS credentials to start. Local billing uses Stripe sandbox keys only.

Then, optionally start an enrolled local test server:

```sh
bash test-server.sh start
```

Open its website at http://localhost:8186 and find `local-php-fixture` in the
**same main console**. When you want to generate suspicious test traffic:

```sh
bash test-server.sh attack
# In another terminal, stop the requests:
bash test-server.sh stop-attack
```

The attack targets only the disposable test website. No attack starts during app
or test-server startup. Protection additionally requires enabling remote response
and disabling dry-run in organization settings. [Testing details](docs/hackathon-local-testing.md)

[Environment, health checks and testing](README-TECHNICAL.md)

## Human control, with a verifiable result

Protection is opt-in and constrained by host policy. It uses a temporary HTTP(S)
source block, with a finite expiry and optional bounded renewal when blocked traffic
continues. Dismiss stops renewal and requests removal; the agent must confirm the
change. A requested command is distinguished from an applied rule.

The agent has no arbitrary remote shell tool. Unknown evidence, failed inference,
ambiguous replies and unavailable inspection do not authorize new protection.
Observed IPs do not establish a person's identity or intent. Operators must account
for shared proxies and legitimate users before authorizing a block.

## AWS services and design choices

Fargate runs web, API and worker services; ALB provides HTTPS routing. DynamoDB
stores scoped state, S3 stores evidence, SQS buffers work, and SNS fans incoming
messaging events into trusted queues. Bedrock supplies bounded inspection and
advisory recommendations. SES and End User Messaging Social close the operator
communication loop. Secrets Manager, IAM, CloudWatch and CloudFormation support
credential handling, observability and repeatable delivery.

[Architecture diagrams and tradeoffs](docs/AWS-ARCHITECTURE.md) · [Evaluation and limitations](docs/JUDGES_FIELD_GUIDE.md#evaluation-and-limitations)

## Build and deploy

[Technical setup](README-TECHNICAL.md) · [Local incident-response demo](docs/whatsapp-local-testing.md) · [AWS prerequisites](PREREQUISITES.md) · [Private AWS templates](devops/cloudformation/README.md) · [Email receiving](docs/email-replies.md)

Private AWS installation and release tooling are implemented. The Marketplace listing
is not live. Deploy and update through reviewed CloudFormation change sets, preserving
existing data and stable credentials. No public Marketplace launch link is offered.

## License

First-party code is [AGPL-3.0-or-later](LICENSE). See [copyright notice](NOTICE),
[commercial licensing](COMMERCIAL-LICENSE.md) and the licenses of included third-party
components. The public repository includes source, assets, lockfiles and build/test
instructions; optional submodules can be fetched with `--recurse-submodules`.
