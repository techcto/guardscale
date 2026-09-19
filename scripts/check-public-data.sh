#!/bin/sh
set -eu
if git grep -nEI '(AKIA[0-9A-Z]{16}|[0-9]{12}\.dkr\.ecr|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._-]{16,})' -- ':!scripts/check-public-data.sh'; then
  echo 'possible credential or account identifier found' >&2
  exit 1
fi
echo 'public-data safety scan passed'
