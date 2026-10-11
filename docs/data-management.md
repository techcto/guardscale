# Server removal and data purge

Organization administrators and the installation root can remove a server from its detail page after typing its server ID. The record becomes a tombstone: active views exclude it and heartbeat updates cannot recreate that ID. Existing incidents and activity remain available until purged. This does not terminate the server, uninstall software, or revoke the organization-wide enrollment credential. Stop the agent on the machine with `sudo systemctl disable --now guardscale`.

Settings → Data provides an organization-scoped purge of collected activity and incident records after typing `PURGE`. It preserves organizations, users, billing, settings, enrolled servers, and removed-server tombstones. New collection continues during and after the operation. DynamoDB queries paginate, include removed servers, and preserve incident records updated after the purge began. Failed operations report partial completion and can be retried.

This is not an account deletion or complete erasure of every infrastructure copy. Source logs and upload spools on hosts, sent notifications, infrastructure logs, and backups are outside this purge. Buffered agent uploads can arrive again. Current application activity and incident payloads are stored in DynamoDB; this action does not claim to erase arbitrary objects from the reserved evidence bucket.

Both mutation endpoints require a same-origin request and current organization-administrator membership, or installation-root access. Neither endpoint accepts an organization ID from the request body.

Manual verification: `node --import tsx --test src/lib/data-lifecycle.test.ts`. This does not add tests to release Actions.
