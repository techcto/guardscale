# Update a deployed version

From this project's root, with Bash, Node.js and AWS CLI v2 installed:

```sh
bash cmd.sh cft-update 0.2.6 --stack YOUR_EXISTING_STACK --region us-east-1 --profile YOUR_PROFILE
```

Use an actually published version; `0.2.6` is an example, not a release assertion.
Both `0.2.6` and `v0.2.6` select container tag `0.2.6`. Finish the image-release
workflow first. This command does not build images, publish tags, submit a
Marketplace release, wait for Marketplace approval, or change subscription status.

The command reads the existing stack, prepares an UPDATE change set, shows its
resource changes, asks you to type the exact stack name, executes that reviewed
change set, then waits for `UPDATE_COMPLETE`. Check application health, login,
logs and notifications afterward; stack completion is not an end-to-end health test.

It updates `ReleaseVersion` for `ImageBase` templates, or retags existing
`WebImage`, `ApiImage`, `WorkerImage`, `VisionImage` and `AgentImage` parameters
when present. Repository paths remain unchanged. Unrelated parameters use
`UsePreviousValue=true`; the command does not retrieve or print secret values.
It rejects an image base that does not identify this project rather than guessing
how to update a different application. Custom repository names may need a manual
reviewed change set. It never resets an interrupted stack or deletes data resources.

Set defaults once in your shell to shorten subsequent commands:

```sh
export GUARDSCALE_STACK_NAME=YOUR_EXISTING_STACK
export AWS_REGION=us-east-1
export AWS_PROFILE=YOUR_PROFILE
bash cmd.sh cft-update 0.2.6
```

Do not assume the stack name includes the current release version. Historical
stack names remain valid after upgrades. `CFT_STACK_NAME` is a generic fallback.
There is deliberately no guessed production stack.

## Separate planning and approval

```sh
bash cmd.sh cft-update 0.2.6 --stack YOUR_EXISTING_STACK --plan
# Review the returned ARN and its full/nested changes in CloudFormation.
bash cmd.sh cft-update 0.2.6 --stack YOUR_EXISTING_STACK --approve CHANGE_SET_ARN
```

Keep the same account/profile/Region for both commands. `--approve` requires an
exact ARN, checks the stack and requested image/version values, and executes that
existing plan rather than creating a different plan. This is the non-interactive
path after human review; there is no blanket `--yes` bypass.

Review replacements, removals, IAM changes, nested changes and availability
impact. ECS task definition replacement is normal, but database, bucket, network,
or unrelated resource replacement requires investigation before approval. An
obsolete/unavailable change set is rejected; create and review a fresh one.

## Apply an updated template intentionally

By default the deployed template is preserved. Updating only the version does
not apply uncommitted or newly published CloudFormation source changes.

```sh
bash cmd.sh cft-update 0.2.6 --stack YOUR_EXISTING_STACK --template MATCHING_TEMPLATE.yaml --plan
# Or --template-url https://YOUR_BUCKET.s3.us-east-1.amazonaws.com/MATCHING_TEMPLATE.yaml
```

Use the template that matches the stack's existing ownership/deployment mode,
not a migration or replacement template selected by filename alone. New required
parameters without defaults require a separate configuration update. Local
templates over 51,200 bytes require an HTTPS S3 URL. Stacks with the
`AWS::LanguageExtensions` transform require an explicit template, per AWS.

## Test without AWS

```sh
node --test devops/cft-update.test.mjs
```

These tests put a fake AWS executable in a temporary PATH. They exercise planning,
approval, parameter preservation, busy/wrong stacks, no-op plans and waiter
failure without contacting AWS. They do not verify image availability, live IAM
permissions, CloudFormation template acceptance or actual application health.
