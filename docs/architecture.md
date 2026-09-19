# Architecture

Phase 1 flows from strict configuration and Apache/PHP parsers into typed observations, explainable detectors, an incident state machine, bounded evidence bundles, and the CLI. Package boundaries support outbound transport and an independently deployed API/worker/web control plane. AWS delivery uses independently healthy services, least-privilege IAM, CloudWatch observability, versioned artifacts, and reproducible CloudFormation.

The control plane uses Next.js App Router for UI and API routes under `src`, an independently deployable SQS worker, tenant-scoped records, DynamoDB, S3 evidence, and ECS Fargate services behind ALB path routing. The local composition substitutes DynamoDB Local, ElasticMQ, and S3Mock. AgentCore, SES, and WhatsApp integrations remain constrained behind asynchronous, structured action boundaries; no AI component receives shell authority.

The threat model includes coordinated agent swarms whose individual requests resemble legitimate humans and remain below per-client thresholds. Detection therefore combines origin-wide request velocity, distributed identity, shared client characteristics, systematic URL/query traversal, origin-verification state, application latency, PHP worker behavior, repeated normalized stacks, and host exhaustion. High traffic or one user-agent string alone cannot authorize protection.
