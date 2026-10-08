# Infrastructure lifecycle policy

User requirement: install, update, and delete every application and its infrastructure through formal AWS CloudFormation templates and reviewed change sets. This applies to both standalone and AppHub deployments.

- Do not directly create, modify, or delete app infrastructure with AWS resource APIs or console actions. Read-only diagnostics are allowed.
- Keep active app stacks, application data, and credentials intact during migrations. Do not interpret an old stack name as an obsolete installation.
- Review replacements, deletions, retention policies, and availability impact before executing a change set.
- For orphaned resources, import the exact verified unused resources into CloudFormation before deleting them through CloudFormation. Never leave temporary cleanup stacks after successful cleanup.
- If permissions are missing, report the exact blocker; do not bypass ownership, force-delete stacks, or leave orphaned resources merely to hide failures.
