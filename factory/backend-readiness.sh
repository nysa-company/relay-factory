#!/bin/bash

if [ "$#" -ne 0 ]; then
  printf '%s\n' 'usage: factory/backend-readiness.sh' >&2
  exit 2
fi

factory_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
pin_file="$factory_dir/KIT_PIN"

if [ ! -f "$pin_file" ] || [ "$(wc -l < "$pin_file")" -ne 1 ]; then
  printf '%s\n' 'backend-readiness: factory/KIT_PIN must contain exactly one lowercase 40-character SHA' >&2
  exit 2
fi

IFS= read -r pin < "$pin_file"
if [[ ! "$pin" =~ ^[0-9a-f]{40}$ ]]; then
  printf '%s\n' 'backend-readiness: factory/KIT_PIN must contain exactly one lowercase 40-character SHA' >&2
  exit 2
fi

check="$HOME/.factory/kits/releases/$pin/scripts/adapters/contract-test.sh"
if [ -L "$check" ] || [ ! -f "$check" ] || [ ! -x "$check" ]; then
  printf '%s\n' 'backend-readiness: pinned adapter contract check is unavailable' >&2
  exit 2
fi

printf '%s\n' '[relay-readiness] adapters=openai:codex,cursor-openai;anthropic:claude-code,cursor-anthropic'
"$check" --adapters codex,cursor-openai,claude-code,cursor-anthropic
adapter_status=$?
printf '[relay-readiness] adapter_check_exit=%s\n' "$adapter_status"

printf '%s\n' '[relay-readiness] routes=production/openai;checking/anthropic'
"$check" --routes
route_status=$?
printf '[relay-readiness] route_check_exit=%s\n' "$route_status"

if [ "$route_status" -eq 0 ]; then
  printf '%s\n' '[relay-readiness] result=SAFE'
  exit 0
fi

printf '%s\n' '[relay-readiness] result=UNSAFE'
exit 1
