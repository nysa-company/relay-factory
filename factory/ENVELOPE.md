# Operating envelope — Relay (conformance shakedown)

Filled from the kit template and calibrated against real CLI runs.

| Limit | Value | Enforced by |
|---|---|---|
| Per-run budget (USD) | $2.00 | run wrapper / adapter hard stop |
| Per-ticket budget (USD) | $25.00 | run wrapper ledger check |
| Per-run max turns | 15 | logged (Claude Code 2.1.207 dropped `--max-turns`; budget is the hard stop) |
| Per-run wall-clock cap | 10 min | run wrapper timeout |
| Daily factory cap (USD) | $100.00 | run wrapper ledger check |

Delivery stops only at the ticket or qualification budget. Provider timeouts,
cancellation, security checks, and duplicate/no-progress refusal remain safety
controls. External actions: Relay's allowlist is `test@example.com` only —
production mode does not exist in this product by design.

Exit thresholds don't apply (this is the kit's own test, not a product pilot).

Contract 1.8 qualification admits only T-110 through T-113 at capacity four
within this $100 disposable-product envelope.
