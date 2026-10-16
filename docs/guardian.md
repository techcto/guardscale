# Guardian: investigate → approve → protect → verify

Guardian uses bounded Bedrock tool calls, not arbitrary remote shell access.
The Linux agent is outbound-only. MCP is the integration surface; private agent
polling carries commands to the host without opening an inbound management port.

1. The real agent evaluates a bounded recent Apache-request window with the
   existing detector, retains the candidate address locally, and uploads a
   scoped incident with measured findings and the source IP.
2. With GUARDSCALE_AI_MODEL_ID configured, Bedrock first calls inspect_server.
   The agent returns log-source readability, recent request count and protection
   opt-in status. No file contents, secrets or shell commands are returned.
3. Bedrock evaluates those results and calls request_human_approval with an
   advisory recommendation. The incident UI shows the actual tool trace.
4. Only organization-admin configured email/WhatsApp recipients receive alerts.
   Alerts may contain the server name, source IP and advisory summary. Country
   is unknown unless a real geolocation source supplies it; none is bundled.
5. An administrator approves Protect in the authenticated console, or an
   authorized WhatsApp sender replies `Protect <code>` within 15 minutes.
   `Watch <code>` and `Dismiss <code>` update review state. Email users follow
   the authenticated incident link; direct inbound email replies are NOT built.
6. A durable, tenant/server/agent/candidate-scoped command is created. The
   agent independently validates its local candidate, opt-in and target CIDRs.
   It uses iptables INPUT + ipset with a timeout to reject only HTTP(S) traffic
   from that address. SSH and outbound control-plane connections are untouched.
7. Application/failure/rejection and expiry acknowledgements are recorded in
   the incident/organization activity. Kernel timeout expires the address even
   if the agent stops. Repeating approval cannot extend the original expiry.

## Production prerequisites (not deployed by this work)

- Release updated web/API/worker containers AND the Go agent. Old agents do not
  poll commands. Server → Connection settings reopens install/update commands
  with the existing server/agent identity, plus PHP log diagnostics.
- Set GUARDSCALE_AI_MODEL_ID to an approved tool-capable model. The standard
  CloudFormation templates prepare optional Nova Lite permissions and runtime
  variables, including AppHub-specific templates. Review replacements, data
  retention, existing queue-policy ownership and IAM changes before executing a
  change set. No AWS resources are changed by editing code.
- Set GUARDSCALE_NOTIFICATION_MODE=aws, verified GUARDSCALE_SES_FROM and the
  registered WhatsApp origination phone-number ID. Configure each organization's
  recipients in Settings → Notifications. Log mode is NOT real delivery.
- Set GUARDSCALE_PUBLIC_URL to the installation's HTTPS origin.
- Set the registered EUM Social phone number's event destination to a trusted
  SNS topic, and pass its ARN as WhatsappEventTopicArn. Standard templates
  prepare an SNS-to-SQS subscription and SourceArn-restricted queue policy.
  The worker requires GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN and checks topic, sender,
  origination identity, message age, incident scope and approval code.
- WhatsApp business-initiated alerts outside an open conversation require an
  approved template. Set GUARDSCALE_WHATSAPP_ALERT_TEMPLATE to an approved
  template containing one body text parameter, and configure its language with
  GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE (default en_US). Without it, the adapter
  sends session text and delivery depends on the conversation window. Template
  registration/approval and actual provider delivery still require verification.
- Install iptables/ipset and verify kernel hash:ip/set-match support. Agent-side
  config must explicitly enable protection, disable dry-run, and specify bounded
  protection.allowed_cidrs (/24 or narrower). Keep operator/control-plane and
  shared-proxy/CDN addresses OUT of those ranges. IPv6, shared proxy mitigation,
  distributed path shedding, service reloads/restarts and broad IP blocking are
  not implemented by this first response tool.
- Organization Settings → Response must separately allow remote requests and
  disable dry-run. Default action TTL is bounded to 10–900 seconds.

## Auto Guardian

Disabled by default. An organization administrator may grant a standing policy
with a 60–600 second human-response window, 10–120 second automatic block TTL,
and 1–3 actions per rolling hour. Both agent and organization opt-ins still apply.
It requires an AWS-provider-accepted alert, a completed Guardian assessment and
real inspection trace, a Protect recommendation, an unresolved review state,
and at least one critical measured finding. Missing AI, missing notifications,
unsupported tools or quota exhaustion never count as permission to act.

Worker decisions are serialized per organization with an expiring database lock.
This initial policy does not automatically block every 404 or every member of a
distributed swarm. False-positive evaluation, policy race/failure testing and
real recovery tests remain prerequisites before enabling it on customer hosts.
Provider acceptance is not proof that a human received/read an alert.

## MCP/API

Existing integration-read credentials remain read-only. get_guardian_status
returns the incident and scoped command results. An administrator can explicitly
request an integration-response credential (permission=response at the existing
same-origin integration-token endpoint). That additionally exposes inspect_server
and protect. Protect accepts only approvalCommandId for an already-approved,
unexpired command; it cannot choose an IP, create approval or execute shell text.
The console approval endpoint requires same-origin administrator access and the
explicit confirmation string Protect. Command transport remains agent-authenticated.

## Known operational limits

Command audit records are independent of collected-media retention and current
data purge. Review retention and cancellation semantics before production use.
Notification delivery is retryable/at-least-once; a crash between provider
acceptance and recording may duplicate an alert. Incident uploads use a bounded
on-disk retry spool, separate from logs so investigation cannot block command
polling. Kernel expiry is the safety boundary, not worker availability.
Live AWS inference, outbound delivery and inbound replies require deployment and
configured credentials; a local-only alert audit is not evidence of those paths.
