# Relay Factory Product

This repository is the production product state for the Relay software-factory shakedown. The reusable engine lives in `nysa-company/software-factory`; do not copy kit scripts or role contracts here.

## Boundaries

- `factory/KIT_PIN` selects one certified, immutable software-factory release.
- `factory/` owns tickets, initiatives, ledger, envelope, Linear mapping, and product certification.
- `app/` is the zero-dependency conformance product used by certification and ticket work.
- Secrets and machine profiles remain outside Git. Never commit `.env`, credentials, raw agent output, PID files, locks, or maintenance markers.

## Workflow

- Protected default branch: `main`.
- Use short-lived branches matching `^(feat|fix|docs|chore|refactor|test|hotfix|spike)/[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Keep test-author commits separate and before implementation commits.
- Never edit the ledger, ticket state, `KIT_PIN`, or factory controls outside their documented operator flows.
- Never push, merge, or change GitHub settings without explicit operator authorization.

## Verification

Run `npm test --prefix app` and `.github/scripts/test-immutability-check.sh` before completion. Product certification additionally runs `factory/certify.sh` through the pinned kit.

## Session end

Record durable product-state decisions in `factory/tickets/`, `factory/initiatives/`, or `README.md` as appropriate. Keep temporary evidence under ignored `.context/`.
