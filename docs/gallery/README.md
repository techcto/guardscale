# GuardScale — Devpost gallery

Eight images, in upload order. Each PNG is 1500 × 1000 (3:2), below 5 MB.

1. **01-operations-console.png** — Actual signed-in local operations console.
2. **02-server-activity.png** — Real enrolled server, log stream and heartbeat.
3. **03-grouped-incidents.png** — Existing incidents grouped by observed source.
4. **04-incident-evidence.png** — Measured findings from a real development incident.
5. **05-guardian-review.png** — Saved completed Bedrock inspection and recommendation tools.
6. **06-protection-removed.png** — Historical block with agent-confirmed removal.
7. **07-agent-workflow.png** — Labeled workflow illustration and human approval boundary.
8. **08-aws-architecture.png** — Labeled AWS component and communication diagram.

[Browse the gallery](index.html).

Console images were captured on October 27, 2026 from the running isolated local
PHP/Apache fixture. Existing records were used; capture did not seed data, call
inference, issue protection commands or send notifications. Historical approval
windows are expired. Recorded log times precede capture times. The response-event
list in this view is empty; the protection image establishes the recorded command
outcome, not a new WhatsApp exchange. No WhatsApp chat screenshot is included.

Architecture illustrations describe source implementation and optional configured
components. They are not proof that every hosted integration is active. Inbound
SES replies still require deployment-specific verification.

The capture source is [capture-gallery.mjs](../../devops/playwright/capture-gallery.mjs).
It uses the local Playwright browser image and a read-only signed-in workflow.
Contact strings and signed tokens are masked if present. The included captures.json
records source routes and capture time; it contains no session credentials.
