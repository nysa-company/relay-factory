#!/usr/bin/env bash
# Enforce test-first commit ordering without trusting author identity.
set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
TEST_PATHS="${TEST_PATHS:-app/tests/}"
EXEMPT_PATHS="${EXEMPT_PATHS:-factory/}"
FAIL=0
SEEN_IMPL=0

is_exempt() {
  local file="$1" prefix
  for prefix in $EXEMPT_PATHS; do
    [[ "$file" == "$prefix"* ]] && return 0
  done
  return 1
}

for commit in $(git rev-list --reverse "$BASE_REF"..HEAD); do
  message="$(git log -1 --format=%s "$commit")"
  all_files=""
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    is_exempt "$file" || all_files+="$file"$'\n'
  done < <(git diff-tree --no-commit-id --name-only -r "$commit")
  all_files="${all_files%$'\n'}"
  test_files="$(git diff-tree --no-commit-id --name-only -r "$commit" -- $TEST_PATHS)"
  nontest_files="$(comm -23 <(sort <<<"$all_files") <(sort <<<"$test_files") | sed '/^$/d')"

  if [[ -n "$test_files" && -n "$nontest_files" ]]; then
    echo "FAIL: commit $commit ('$message') mixes test and non-test changes" >&2
    FAIL=1
  elif [[ -n "$test_files" ]]; then
    if [[ "$SEEN_IMPL" -eq 1 ]]; then
      echo "FAIL: test commit $commit ('$message') follows implementation" >&2
      FAIL=1
    fi
  elif [[ -n "$nontest_files" ]]; then
    SEEN_IMPL=1
  fi
done

if [[ "$FAIL" -eq 0 ]]; then
  echo "test immutability holds for $TEST_PATHS"
fi
exit "$FAIL"
