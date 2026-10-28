# Agent credentials and host trust

Agents make outbound HTTPS connections. The control plane does not provide a
remote shell. Protection remains subject to operator approval or an explicitly
enabled standing policy, a locally observed candidate, local target restrictions,
and bounded expiration.

## Unique operating credentials

An updated agent registers a cryptographically random 256-bit credential bound to
its organization, agent ID, and server ID. The control plane stores its SHA-256
hash. A credential for one server cannot be used to submit data, poll commands,
or acknowledge commands for another server. Removing a server revokes its access.

The agent saves its candidate privately before registration. If the server accepts
the change but the response is lost, the saved candidate authenticates the retry.
Rotation requires the current private credential; the organization bootstrap key
cannot replace the credential of an already migrated agent.

## Upgrade order and bootstrap cleanup

Deploy the control plane first, then update the agents. Existing agents continue
to use legacy enrollment authentication until they migrate. Isolation is complete
only after every agent in the organization has been upgraded.

Fresh installs and the published `update-agent.sh` register the private credential
and replace the bootstrap token file before starting the agent. When using the
older binary's built-in updater for the first security upgrade, run:

```bash
sudo guardscale update
sudo guardscale enroll --config /etc/guardscale/config.yaml
```

The updated runtime automatically registers and uses its private credential from
`/var/lib/guardscale/agent-credential.json`. The explicit `enroll` command also
replaces the old bootstrap file; the running service's read-only configuration
sandbox is intentionally unchanged. Files containing credentials use mode 0600.
No secret values are printed.

Rotate one agent without changing other agents:

```bash
sudo guardscale rotate-credential --config /etc/guardscale/config.yaml
sudo systemctl restart guardscale.service
```

The bootstrap key still permits registering new agents; distribute it only to
trusted administrators or authorized provisioning roles. Never bake enrolled
credentials or agent state into a reusable AMI.

## Compromised machines

Root access to a monitored host allows an attacker to read that host's secrets,
modify or stop the agent, and falsify its evidence. Credentials do not establish
hardware attestation. Revoke the affected server, rebuild the host from a trusted
image, and enroll it again. Rotating a key while an attacker retains root access
does not remove that access.

## CDN and proxy boundaries

An origin firewall matches network peers. It cannot match a visitor IP carried
only in an HTTP header. Trusted forwarded sources therefore remain advisory for
origin-firewall protection; use a configured edge/WAF or HTTP-layer enforcement
integration. See [CloudFront and origin logging](CLOUDFRONT-ORIGIN.md).
