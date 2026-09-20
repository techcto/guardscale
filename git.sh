#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${GIT_REMOTE:-origin}"

usage() {
  cat <<'EOF'
Usage:
  ./git.sh status                 Show repository state
  ./git.sh audit                  Scan candidate files for secrets/provenance
  ./git.sh tag <version>          Audit, create, and push an annotated v<version> tag
  ./git.sh push [branch]          Push the current branch and set upstream
  ./git.sh fetch                  Fetch remote refs without changing files
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

repo() {
  git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    die "Run this script inside the Guardian.US repository."
}

status() {
  git -C "$ROOT_DIR" status --short --branch
  git -C "$ROOT_DIR" remote -v
}

audit() {
  local file result status matches=''
  local pattern='AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

  while IFS= read -r -d '' file; do
    [[ "$file" == 'git.sh' || ! -f "$ROOT_DIR/$file" ]] && continue
    if result="$(grep -IEni -- "$pattern" "$ROOT_DIR/$file")"; then
      matches+="${result}"$'\n'
    else
      status=$?
      [[ "$status" == 1 ]] || die "Audit could not read $file."
    fi
  done < <(git -C "$ROOT_DIR" ls-files --cached --others --exclude-standard -z)

  if [[ -n "$matches" ]]; then
    printf '%s\n' "$matches"
    die "Prohibited provenance or credential patterns found."
  fi

  printf 'Audit passed: no prohibited provenance or credential patterns found.\n'
}

tag() {
  local version="${1:-}"
  [[ -n "$version" ]] || die "Usage: ./git.sh tag <version>"
  version="${version#v}"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] ||
    die "Version must look like 1.2.3, 1.2.3-rc.1, or 1.2.3.beta."
  [[ -z "$(git -C "$ROOT_DIR" status --porcelain)" ]] ||
    die "Commit or remove all working-tree changes before tagging."
  local branch
  branch="$(git -C "$ROOT_DIR" branch --show-current)"
  [[ -n "$branch" ]] || die "Tagging from detached HEAD is not allowed."
  git -C "$ROOT_DIR" fetch "$REMOTE" "$branch" --quiet
  [[ "$(git -C "$ROOT_DIR" rev-parse HEAD)" == "$(git -C "$ROOT_DIR" rev-parse "$REMOTE/$branch")" ]] ||
    die "Push $branch and ensure it matches $REMOTE/$branch before tagging."
  git -C "$ROOT_DIR" rev-parse --verify --quiet "refs/tags/v${version}" >/dev/null &&
    die "Tag v${version} already exists."
  audit
  git -C "$ROOT_DIR" tag -a "v${version}" -m "Guardian.US ${version}"
  git -C "$ROOT_DIR" push "$REMOTE" "refs/tags/v${version}"
}

push_branch() {
  local branch="${1:-$(git -C "$ROOT_DIR" branch --show-current)}"
  [[ -n "$branch" ]] || die "The repository is in detached HEAD state."
  git -C "$ROOT_DIR" push --set-upstream "$REMOTE" "$branch"
}

repo
case "${1:-status}" in
  status) status ;;
  audit) audit ;;
  tag) shift; tag "${1:-}" ;;
  push) shift; push_branch "${1:-}" ;;
  fetch) git -C "$ROOT_DIR" fetch "$REMOTE" --prune ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
