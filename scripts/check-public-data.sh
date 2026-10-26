#!/bin/sh
set -eu
# 111122223333 is AWS's documented example account, used by synthetic test fixtures; any other account ID still fails.
found=$(git grep -nIoE '(AKIA[0-9A-Z]{16}|[0-9]{12}\.dkr\.ecr|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._-]{16,})' -- ':!scripts/check-public-data.sh' | grep -v ':111122223333\.dkr\.ecr$' || true)
if [ -n "$found" ]; then
  echo "$found"
  echo 'possible credential or account identifier found' >&2
  exit 1
fi
echo 'public-data safety scan passed'
