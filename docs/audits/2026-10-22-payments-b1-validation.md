# B1 payment continuation and validation

Worktree `D:/nzwt/integ`, branch `batch/2026-10-22-payments-b1`. The owner explicitly authorized continuing this existing developer branch. The unrelated main checkout was preserved. Codex continued directly after the previous provider quota interruption; no independent Claude re-review is claimed.

## Completed

- Task 7 fix `e725d239`: reviewed locally, 85 focused tests passed. Amount changes require confirmation, used-up intents can be retried, callback origin/expiry come from the server, and gateway loading does not send a manual request.
- Task 8 `ffefa687`: owner-filtered billing, token-free saved card views, provider-first card deletion, printable recorded-amount receipts, explicit test receipt notice, and hidden card mode migration `_31`.
- Task 9: read/refund staff actions; admin filters and review flags; durable refund claim; verified provider reversal; atomic local reversal and audit; predecessor restoration for the latest renewal; authoritative admin points adjustments and directory balances. `_32` and `_33` are additional pre-deploy requirements.
- Result page fulfilment throws now render pending. Build repairs move shared firm context and deadlines panels out of special Next files, and move the tested article status helper out of the route module. Public behavior is preserved.
- SQL handoff, environment placeholders, owner report and operational decisions are included in this branch.

## Evidence

| Check | Result and scope |
|---|---|
| Full `src/**/*.test.ts` on Node 22 | 3,142 tests passed, zero failed |
| Type-check | Passed |
| Full `eslint .` | Zero errors, 1,701 warnings; touched-source lint also zero errors |
| `next build --webpack` | Passed including TypeScript, static generation and route output; rerun after final admin date filter wiring |
| `_31` isolated SQL | Two applies with restored stray column grants, T0–T4 pass; missing migration negative control fails |
| `_32` isolated SQL | Two applies, T0–T17 pass and actual authenticated EXECUTE denied; duplicate claim/finish, unrelated plan preservation, predecessor restoration, explicit retry claim and audit rollback/recovery |
| `_33` isolated SQL | Two applies, T0–T5 pass; real balances returned, insufficient debit rolls back, directory matches; missing migration negative control fails at T0 |
| Release additions verify | Passed after `_10/_20/_30/_31/_32/_33` in isolated Postgres |
| Script parser boundary | 4 tests pass with fake seed persistence, no production database |
| Postman local HTTP | Real Moyasar client + refund core: success 200; 500 keeps grants and claim; explicit 400 validation rejection permits retry; wrong response currency keeps grants; 8 HTTP requests confirmed in simulation log |
| Earlier billing HTTP simulation | Provider 204 and 404 lead to local card deletion; 500 returns 502 and leaves card active |

No real secrets were read/copied. Build used synthetic values and localhost Supabase URL. No request to real Moyasar, no real card operation, no live SQL, no push/merge/deploy. Local simulation helpers were stopped.

Browser verification is incomplete. A prior dev request failed at the missing Supabase configuration boundary; it was not evidence of a billing UI defect. Automatic approval review rejected starting the local production server for the synthetic browser fixture, with only `blocked by policy`. No production visual claim is made.

## Scope and limits

GitNexus impact requests returned UNKNOWN because the registered index is stale; the analyzer had previously crashed twice and was not rerun. Current references were checked directly. Pre-commit `detect_changes` found the edited files but zero indexed symbols; that is not proof of zero impact. Relevant flows are checkout/fulfilment, refund and admin credit grants, user directory balances, and shared firm/deadline rendering. Existing auth and staff gates remain the entry checks.

Refund result validation checks the verified payment ID, order metadata, halala amount, SAR currency, key mode and requested terminal operation. An uncertain mutation retains its claim; only a definite provider validation rejection releases it. Already-refunded provider evidence can recover local finish without another gateway action. Notification failure after an atomic finish is logged and does not report the financial mutation as failed.

SQL smoke tests use the repository's throwaway Postgres harness and minimal prerequisite fixtures. They do not establish compatibility with an uninspected live schema. The whole `_verify.sql` copy includes previous batch requirements; only the new final B1 verification block was run in the isolated chain.

Before launch: real test-key checkout/3DS/callback/webhook, intent-only recovery, refund, card deletion, ownership checks, mobile/dark layout, and Apple Pay domain verification. Moyasar's metadata filter and first-page ordering require real provider confirmation. Schedule sweep with a long timeout and no overlapping runs; monitor the 20-attempt give-up and 200-row window. B2 and B3 remain separate, unimplemented follow-ups.
