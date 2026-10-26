# Stripe environments and rotation

GuardScale uses its own Stripe account and credentials. Never reuse another application's keys or price IDs. Production uses `StripeMode=live`; local Compose forces `GUARDSCALE_STRIPE_MODE=sandbox` and rejects live keys. Local credentials live in the ignored `.env`; AWS Secrets Manager is not required for localhost.

## Approved usage pricing

Version `2026-10-26-v1` is defined in `src/lib/billing-pricing.json`:

| Meter | Overage price | Definition |
| --- | --- | --- |
| `guardscale_server_hours_v1` | $0.02 per server-hour | One server with a heartbeat in an hour; repeated heartbeats count once |
| `guardscale_log_mb_v1` | $0.0015 per MiB | 1,048,576 bytes, including log-accounting overhead; seven-day retention included |
| `guardscale_ai_credits_v1` | $0.003 per credit | One credit represents $0.001 of model inference cost at versioned token weights |

Starter includes 5 servers, 10,000 MiB and 1,000 AI credits for $49/month. Scale includes 50 servers, 100,000 MiB and 5,000 AI credits for $199/month. Free Dev includes one server, 1,000 MiB and no paid AI credits. AI metering requires configured, verified model weights; unknown models or missing token usage are reported separately, never estimated into charges.

For each approved model, divide its published USD cost per 1,000 input/output tokens by `0.001` to obtain `input_per_1k` and `output_per_1k` credit weights. Record the effective rates under a version in `AICreditWeights`; do not invent defaults for an unconfigured model. Sum token-derived credits and round cumulative billable overage up to whole credits; do not round each call separately. These are configured model-cost equivalents, not a reconciliation of AWS discounts or the final AWS invoice.

Overages remain workspace opt-in, with usage alerts and allowance-based caps. Usage exports run asynchronously using durable hourly records and idempotent meter identifiers. Creating Stripe prices does not itself opt a customer in or attach an overage charge to their subscription.

## Local sandbox

1. Save GuardScale's `sk_test_...` key as `STRIPE_SECRET_KEY` in the ignored `.env`.
2. Run `node devops/stripe/setup-local.mjs --apply`. It creates/reuses sandbox plans and all three metered prices, then writes their sandbox IDs into that same `.env`, preserving existing passwords and keys.
3. Forward local subscription events with the official Stripe CLI. Save its local `whsec_...` secret as `STRIPE_WEBHOOK_SECRET`, then run `node devops/stripe/local-webhooks.mjs`. Keep forwarding active while testing. The production endpoint signing secret is not interchangeable with this one.
4. For metering tests, explicitly set `GUARDSCALE_USAGE_EXPORT=enabled`; paid test workspaces still need overage opt-in. AI tests require configured model token weights. Restart Compose after changing `.env`.

The local webhook helper redacts keys and checks the signing secret. Local Compose always pins sandbox mode. Never populate a local key from the live production secret.

## Prepare credentials

The optional `devops/cloudformation/guardscale-stripe-secrets.yaml` provisions separate retained live and sandbox JSON secrets. Deploy it through a reviewed CloudFormation CREATE change set. Both fields start empty, which keeps billing unconfigured until real credentials are supplied; no dummy key is installed.

In AWS Secrets Manager, edit the matching secret's key/value fields:

| Secret | JSON fields |
| --- | --- |
| `guardscale/stripe/live` | `secret_key`: GuardScale live secret key; `webhook_secret`: live endpoint signing secret |
| `guardscale/stripe/sandbox` | `secret_key`: GuardScale test secret key; `webhook_secret`: test endpoint signing secret |

The deployed webhook URL is `https://guardscale.org/api/billing/webhook`. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Local forwarding uses `devops/stripe/local-webhooks.mjs` and its own signing secret. Never commit populated secrets or paste them into chat.

## Synchronize plans

Preview without AWS or Stripe calls:

```sh
node devops/stripe/sync-from-secret.mjs --mode live
```

After saving both real credential fields, explicitly synchronize the matching account:

```sh
node devops/stripe/sync-from-secret.mjs --mode live --approved-pricing --apply \
  --secret-arn YOUR_LIVE_SECRET_ARN --region us-east-1 --profile YOUR_PROFILE
```

The command reads the key in memory, validates the environment and outputs only plan/meter IDs. `--approved-pricing` creates/reuses the approved metered prices as well as base plans. It reuses matching resources and rejects price conflicts. It does not charge customers, create a subscription, or enable overages. Coupons require explicit settings documented in `setup-plans.mjs`.

Use returned IDs for `StripeStarterPriceId` and `StripeScalePriceId`. Set `StripeCredentialsSecretArn` to the matching secret ARN, keep raw credential parameters empty, and set `StripeMode` through a reviewed application CloudFormation change set. Do not deploy blank credentials. Activate the Stripe customer portal and verify checkout, webhook signatures, cancellation and the resulting workspace plan before declaring billing ready.

## Rotate

Update the existing secret in Secrets Manager, then increment `StripeCredentialsRevision` through a reviewed CloudFormation change set. ECS reloads secret values when tasks restart. Secrets are retained across stack deletion/replacement; manage their complete lifecycle through CloudFormation. The application execution role receives access only to the configured secret (and optional customer KMS key).
