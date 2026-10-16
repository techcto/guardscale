# Security Policy

Please report vulnerabilities privately to the repository maintainers. Do not open issues containing secrets, customer information, or production evidence. Protection is disabled by default; review generated evidence before sharing it.

Before publishing changes, review both staged files and non-ignored new files. Keep credentials in environment variables or an external secret store, not source or images. Commit only placeholder examples; never commit filled CloudFormation parameter files, local `.env` files, runtime secrets, customer logs, database exports, or generated test reports. The documented localhost fixture credentials are disposable test credentials, not deployment defaults.

If a real credential reaches Git, revoke or rotate it immediately. Removing it from the latest revision does not remove it from repository history.
