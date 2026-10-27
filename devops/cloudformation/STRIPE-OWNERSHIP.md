# Stripe secrets: main-stack ownership

Fresh installs create the required credential secret in the main application
template. The optional live/sandbox pair uses `StripeOwnedPairPrefix`. There is
no separate secrets-stack launch step. Existing external secrets remain supported.

## Move from a legacy separate secrets stack

1. Add the pair to the main application through a normal UPDATE change set. Use a
   **new** `StripeOwnedPairPrefix`, such as `my-main-stack/stripe`, and keep
   `StripeOwnedPairImport=false`. Existing service definitions and the active
   `StripeCredentialsSecretArn` stay unchanged during this step.
2. In Secrets Manager, populate the new live and sandbox JSON fields with the
   matching real `secret_key` and `webhook_secret`. Keep values out of source,
   command output and chat. Empty fields do not enable billing.
3. Verify Stripe environment, authentication and configured price ownership.
   Then update `StripeCredentialsSecretArn` to the new live ARN and increment
   `StripeCredentialsRevision` through a reviewed main-stack UPDATE change set.
   The container image version can remain unchanged; ECS rolls tasks to reload
   the credentials and receives narrowly scoped access to the new secret.
4. Wait for all services to stabilize and verify their task definitions reference
   the new secret. Confirm application health before retiring any old credentials.
5. Remove the old stack through CloudFormation with its retention policy intact.
   Retained old secrets can be explicitly retired after verifying they are unused.
   Orphaned secrets must first be imported into the main stack before a reviewed
   deletion change set; do not create another cleanup stack or delete them directly.

Advanced ownership-preserving imports are supported with
`StripeOwnedPairImport=true`, which omits SecretString. Keep that flag true after
such an import to avoid overwriting credential values. This is not needed for
the normal copy-and-switch migration above.

Never place credential values in templates, logs or migration files. Missing
deployment permissions must be reported rather than bypassed.
