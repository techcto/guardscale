# Uptime monitoring

Open **Uptime** between Servers and Incidents. An administrator can add up to
50 HTTP(S) checks per workspace, choose a 1, 5 or 15 minute interval, tag checks,
pause/resume them and select approved workspace users for email alerts. SaaS
recipients must have verified email and active membership. Disabled or removed
users are rechecked at delivery and no longer receive new alerts. Private-mode
users follow administrator approval; explicitly unverified accounts are excluded.

The optional WhatsApp checkbox uses the workspace's configured recipients that
have completed its WhatsApp return-path verification. It does not send to an
arbitrary phone number entered on a check. Both channels respect workspace
notification enablement and use the existing SES and EUM Social integration.
No additional AWS resources, standalone stack or secret is needed. The existing
worker must be running; Docker Compose starts it with the main application.

Enrolled servers automatically create checks for their reported public websites,
including existing servers when the worker next reconciles them. Explicit website
URLs take precedence over an assumed HTTPS hostname. A shared URL creates one
check per workspace, not one per server or tag. New checks inherit server tags
and only existing configured recipients who are eligible workspace members;
other users are not automatically subscribed. Review recipients in Edit check.
Servers with no reported public site remain covered by server heartbeat status.
Paused, customized and explicitly deleted checks are not recreated or reset by
reconciliation. Additional sites wait when the 50-check workspace limit is reached.
Deleting a check retains a small suppression record so auto-enrollment respects
your choice; workspace deletion removes it. You can manually add the URL again.

## Checks, charts and incidents

- Public HTTP(S), ports 80/443, normal TLS validation, no credentials or queries.
- HTTP 200–399 means available. Redirects are reported without following them.
- Two consecutive failures open one availability incident. Further failures
  update the check history without creating another incident every minute.
- Two successful checks confirm recovery, resolve that same incident and send a
  recovery notification. Closing an incident manually does not disable the check.
- Response-time sparklines use measured results, with red failure markers. Up/down
  badges, search and tag/status filters help review the fleet. Select a check name
  for recent samples and links to outage incidents.
- Observed availability is successful completed checks / completed checks over
  the latest 24 hours. It excludes gaps and paused time and is not a contractual
  uptime/SLA measurement. Up to 1,440 samples and 50 outage references are retained
  per check; incident history follows the existing workspace data lifecycle.
  Settings → Data → Purge also clears uptime samples, outage references and pending
  notifications while keeping check configuration. Deleting a workspace removes
  its checks. Activity can resume after purge while a check remains enabled.

Checks run from the worker's deployment region (normally us-east-1), **not a
multi-region Pingdom probe fleet**. It tests the configured HTTP endpoint, not
browser rendering, transaction completion or every redirect destination. WAFs
may block requests. Overdue checks show **Stale**, rather than remaining green.
If the GuardScale worker itself is unavailable, it cannot send outage messages;
keep independent infrastructure alarms for the monitoring service.
Add an appropriate public health endpoint when
needed. A missed heartbeat and an external website outage are different signals.

## Runtime safeguards and verification

DNS results must all be public addresses. The connection is pinned to a validated
address, so a second DNS lookup cannot redirect the request to metadata or an
internal network. Loopback, private, link-local, reserved and mapped IPv6 targets
are rejected; redirects are not followed. Responses are bounded to headers and
the body is discarded. Each probe has an eight-second deadline. The worker uses
five concurrent checks and conditional per-monitor leases in the existing
DynamoDB table; stale workers cannot overwrite an administrator's newer edit.

Notifications retry on later worker cycles, with per-destination acknowledgments.
Provider acceptance does not prove inbox delivery. Delivery is at least once:
a crash after provider acceptance but before saving its acknowledgment can cause
a duplicate. Pending transitions are bounded to the latest ten; all retained
outage references remain visible if a provider outage outlasts this window.

Outage incidents are clearly identified as availability issues. They do not
identify an attacker, invoke a firewall block, authorize Protect or call an
arbitrary shell command. Investigate using the linked console incident and host
evidence. This version sends email/WhatsApp notifications, not automated voice calls.

Run `npm run test:web` for transition, recipient authorization, isolation, lease
and address validation regressions. Test a controlled public health endpoint by
returning 503 for two checks, then 200 for two checks. Confirm one outage incident,
one recovery and the selected recipients. Do not disable a real customer site
just to demonstrate an outage.
