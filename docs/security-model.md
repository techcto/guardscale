# Security model

The agent trusts forwarded client identity only from configured proxy CIDRs, never logs verification secrets, redacts evidence, has no inbound listener, and works offline. Identifiers are opaque. Protection and remote commands are disabled. Configuration fails on unknown keys. Operators must protect configuration and secret files as root-readable and use documentation-only address ranges and `example.com` data in public artifacts.
