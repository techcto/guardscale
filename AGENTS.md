# Infrastructure lifecycle policy

User requirement: install, update, and delete every application and its infrastructure through formal AWS CloudFormation templates and reviewed change sets. This applies to both standalone and AppHub deployments.

- Do not directly create, modify, or delete app infrastructure with AWS resource APIs or console actions. Read-only diagnostics are allowed.
- Keep active app stacks, application data, and credentials intact during migrations. Do not interpret an old stack name as an obsolete installation.
- Review replacements, deletions, retention policies, and availability impact before executing a change set.
- For orphaned resources, import the exact verified unused resources into CloudFormation before deleting them through CloudFormation. Never leave temporary cleanup stacks after successful cleanup.
- If permissions are missing, report the exact blocker; do not bypass ownership, force-delete stacks, or leave orphaned resources merely to hide failures.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
