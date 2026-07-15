# Relay Factory

Production product state for the Relay software-factory shakedown.

The factory engine is installed separately as a sealed exact-SHA release. `factory/KIT_PIN` is the only supported engine selection; merging a change to the software-factory repository does not update this product.

## Check backend readiness

From the repository root, run:

```bash
factory/backend-readiness.sh
```

The check reports the `codex` and `cursor-openai` adapters for the production/OpenAI family and the `claude-code` and `cursor-anthropic` adapters for the checking/Anthropic family. Exit `0` means both required routes are safe, exit `1` means at least one required route is unsafe, and exit `2` means the command usage or pinned release selection is invalid. Fallback is selected only before task submission and is never a post-failure retry.

## Verify

```bash
npm test --prefix app
```

The product certification entrypoint is `factory/certify.sh`. Factory tickets, initiatives, cost ledger, and Linear reconciliation state live under `factory/`.
