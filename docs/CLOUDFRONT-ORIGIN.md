# CloudFront, ALB and origin identity

The expected chain is visitor -> CloudFront -> ALB -> Apache/nginx. CloudFront
adds the visitor address to X-Forwarded-For; an ALB in append mode adds its peer.
GuardScale resolves the chain from right to left, only when the immediate peer
is in the explicitly configured trusted proxy ranges.

CMS releases with extended combined logging append X-Forwarded-For, the underlying
connection peer, host and request duration to the existing access_log. GuardScale
reads this without a second log. Configure trusted proxies before relying on
forwarded identity. Older standard combined logs do not contain the forwarded chain. Capture both the
underlying connection peer and X-Forwarded-For using the Apache logging
format in [guardscale-log.conf](../devops/apache/guardscale-log.conf). Configure
the virtual host to write that format to a root-readable log file and point the
agent's `logs.apache_access` at it. Validate Apache configuration before reloading.
Do not change production logging without reviewing the virtual-host configuration.

`proxy.trusted_cidrs` must cover the actual ALB subnet ranges and the published
CloudFront origin-facing ranges. Do not trust arbitrary forwarded headers, all
Internet addresses, or all AWS address space. The peer and proxy chain must be
preserved even when mod_remoteip changes the effective Apache client address.

For protection, prefer AWS WAF associated with CloudFront so IP rules match the
viewer at the edge. A regional WAF on the ALB needs an explicitly configured,
trusted forwarded-IP rule. GuardScale does not currently provision or operate
these WAF rules automatically. Known forwarded/proxy traffic is not offered as an
origin network-block candidate.

Prevent bypass of edge controls by reviewing ALB ingress and verifying the
authorized distribution's origin requests. CloudFront origin-facing source
restrictions alone do not identify one particular distribution. Plan origin
verification and exceptions for authorized health checks and administration.

Apply infrastructure changes through the owning CloudFormation stack and a
reviewed change set. Do not create an unrelated stack or modify a live Web ACL
directly as an application workaround.
