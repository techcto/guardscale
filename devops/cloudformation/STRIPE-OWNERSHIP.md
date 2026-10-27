# Stripe secrets: main-stack ownership

Fresh installs create the required credential secret in the main application
template. The optional live/sandbox pair uses `StripeOwnedPairPrefix`. There is
no separate secrets-stack launch step. Existing external secrets remain supported.

## Retain and import an existing pair

1. Inspect the old stack's two secret ARNs and verify their deletion/replacement
   policies retain the resources. Preserve the application's configured live ARN.
2. Obtain the deployed main template. Add only the pair parameters, conditions,
   resources and outputs from the official main template. Do not combine resource
   import with a service/image rollout or other resource modifications.
3. Set `StripeOwnedPairPrefix` to the existing prefix and
   `StripeOwnedPairImport=true`. Keep this import flag true on future updates:
   import mode omits SecretString and never writes empty values over real keys.
4. Validate the destination template and confirm Secrets Manager import uses the
   `Id` resource identifier. Delete the old stack **through CloudFormation** only
   after confirming retention. The retained secrets continue serving the application.
5. Create an IMPORT change set on the main stack, mapping `LiveCredentials` and
   `SandboxCredentials` to the exact retained ARNs. Review that only these two
   resources are imported, then execute and wait for IMPORT_COMPLETE.
6. Verify main-stack resource ownership, unchanged secret ARNs, unchanged active
   billing ARN, service health and a subsequent normal update plan. Keep the
   original template and ARN mapping private for rollback/recovery.

Never read or place credential values in templates, logs or migration files.
If import permissions are denied, retain the secrets and report the exact missing
action; do not recreate, copy, delete or rotate credentials as a workaround.
