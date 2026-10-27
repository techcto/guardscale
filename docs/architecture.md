# Architecture

The current [AWS architecture and design choices](AWS-ARCHITECTURE.md) describe the
web/API/worker runtime, actual CDS API calls, optional SES receiving, agent command
boundary and deployment templates. The [judge field guide](JUDGES_FIELD_GUIDE.md)
contains the perception-to-approval workflow and reproducible test routes.

The original detection-first agent has been extended with opt-in, human-approved,
scoped temporary protection. Bedrock inspection and WhatsApp inbound processing are
implemented; their availability requires runtime configuration. AgentCore hosting
is not claimed by this architecture.
