# Production smoke testing

Run the read-only smoke test using a private session file outside the repository:

```sh
GUARDSCALE_SESSION_FILE=/private/path/guardscale-session.txt node devops/testing/prod-smoke.mjs
```

The file contains only the value of the `guardscale_session` cookie from an
authorized signed-in browser. Do not paste cookies into chat, commands, source,
screenshots or shared logs. Limit file permissions and delete it after testing.

The test checks public health, unauthenticated access rejection, authenticated
organization/server/incident/settings/billing/usage APIs, console routes and
public navigation. It reports status, timing, sizes and counts, without printing
session values or customer response bodies. It performs GET requests only.

These checks do not create users, deliver email or WhatsApp, charge a card, approve
protection or run attacks. A successful smoke test is not an end-to-end security
response test. For the latter, enroll an authorized disposable host, configure a
verified recipient, generate traffic only against that host, and verify each of
the following with explicit operator approval:

1. Fresh host heartbeat and sanitized request evidence.
2. A new incident and actual Guardian inspection trace when inference is enabled.
3. Real alert delivery through the configured provider.
4. An authorized Protect reply and the agent-confirmed temporary rule.
5. Watch/Dismiss behavior, removal or expiry, and website recovery.

## Local target, production control plane

The optional local server can report to production while scanner traffic stays
on the isolated Docker network. Initialize the pinned tool sources and provide
your authorized session using a private file:

```sh
git submodule update --init --recursive
GUARDSCALE_PROD_SESSION_FILE=/private/path/guardscale-session.txt bash test-server.sh start-prod --tools
```

Open http://localhost:8186 for the local website and
https://guardscale.org/servers for `local-php-fixture-prod`. This is a distinct
server/agent identity, not a replacement for another production server. Startup
enrolls the agent but does not start an attack. The cookie is mounted only into
the one-shot enrollment container; the agent receives its scoped enrollment token,
not the root session or AWS credentials. Redirects during enrollment are rejected.

Run one bounded workload at a time:

```sh
bash test-server.sh ffuf
# After reviewing/resetting the prior test as needed:
bash test-server.sh nuclei
# Stop request generation:
bash test-server.sh stop-attack
```

Both tools have a fixed target, rate and runtime limits. The probe has no external
network route. The test agent permits a temporary block of only `198.51.100.20/32`.
The production workspace still needs explicitly configured recipients and response
policy; the script does not turn on production protection or change notification
settings. Human approval is required unless a separate policy was deliberately
enabled. Model inference and real provider delivery incur normal AWS charges.

Do not run several alert-generating workloads before replying: when multiple
fresh incidents are pending, identify the intended incident using its code or
authenticated console. Stop the local server with `bash test-server.sh stop`.

Use the [local test-server workflow](hackathon-local-testing.md) for harmless
local traffic and the [live-provider guide](whatsapp-local-testing.md) for its
separate development queue. Do not use a development consumer on production's
queue or direct an attack generator at the production control plane.

### Multiple observed sources

Start the optional three-source lab using `bash test-server.sh start --multi`, or
`bash test-server.sh start-prod --multi` with the private session file described
above. Then run `bash test-server.sh multi` once. This runs bounded ffuf/Nuclei
workloads against the disposable local target from three actual isolated Docker
addresses: `198.51.100.20`, `.21`, and `.22`. It does not spoof forwarding headers.
Only these three /32 addresses can be blocked by this test agent.

The agent evaluates each source independently, so a source on cooldown cannot hide
another source's evidence. It caps new source reviews at five per minute per host.
When multiple incidents await a response, use the incident-specific email draft,
console action, or WhatsApp code; a plain Protect reply must not guess the target.
Existing cooldowns can prevent a repeated run from creating fresh incidents.

### Server names, websites and EC2 tags

The agent discovers bounded hostname suggestions from standard Apache and Nginx
configuration files it can read. Discovered links assume HTTPS; add exact website
URLs in the server's Websites panel for HTTP or custom ports. These are configured
hostnames, not proof that a site is reachable or that a particular virtual host
generated a request. No arbitrary Host headers become website links.

EC2 agents read the Name, Environment, Application, Project and Service tags using
IMDSv2 after checking the instance ID matches their configured server ID. Name
becomes the display name; tag values support the Servers page's Group by selector.
Instance tags must be enabled in metadata by the instance's owner (default is off).
No additional AWS credentials or EC2 API permissions are needed for this path.
Other tags, instance-role credentials and raw configuration files are not fetched.
Existing agents need the updated agent binary and a restart to report discovery
or identity changes. If metadata/configuration is unavailable, the stable server
ID remains visible and website URLs can be entered manually.
