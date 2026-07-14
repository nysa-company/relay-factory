# Relay Factory

Production product state for the Relay software-factory shakedown.

The factory engine is installed separately as a sealed exact-SHA release. `factory/KIT_PIN` is the only supported engine selection; merging a change to the software-factory repository does not update this product.

## Verify

```bash
npm test --prefix app
```

The product certification entrypoint is `factory/certify.sh`. Factory tickets, initiatives, cost ledger, and Linear reconciliation state live under `factory/`.
