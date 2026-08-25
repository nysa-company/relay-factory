# Operating envelope — Relay (conformance shakedown)

Filled from the kit template and calibrated against real CLI runs.

| Limit | Value | Enforced by |
|---|---|---|
| Per-run budget (USD) | $5.00 | run wrapper / adapter hard stop |
| Per-ticket budget (USD) | $100.00 | run wrapper ledger check |
| Per-run max turns | 15 | logged (Claude Code 2.1.207 dropped `--max-turns`; budget is the hard stop) |
| Per-run wall-clock cap | 15 min | run wrapper timeout |
| Daily factory cap (USD) | $300.00 | run wrapper ledger check |

Delivery stops only at the ticket or qualification budget. Provider timeouts,
cancellation, security checks, and duplicate/no-progress refusal remain safety
controls. External actions: Relay's allowlist is `test@example.com` only —
production mode does not exist in this product by design.

Exit thresholds don't apply (this is the kit's own test, not a product pilot).

Contract 2.0 qualification generation 86 admits only T-240 through T-242 at
capacity three within this $300 disposable-product envelope. The $5 run cap
is calibrated above the observed $2.3021 valid Planner run. The 15-minute
wall-clock covers the valid q78 Planner that committed just after the former
10-minute cap; the qualification manifest retains the required extended $10
settlement ceiling.
