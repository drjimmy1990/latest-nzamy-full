# Owner package 30 Oct — LIVE-F41, «تنتهي خلال ٣٠ يوماً» counted a cancelled contract

Branch `fix/owner-30oct-contracts-expiry` (from main). Status: «مُصلَح في الكود — بانتظار النشر واختبار القبول».

- Cause: the lawyer and firm contract lists counted and badged every row by `ends_on` alone (`contractExpiryState(c.endsOn)`), whatever its status.
- Decision taken (owner left it open: "work in progress only, or all records"): the counter and the badge are about an upcoming action, so a `terminated` or `cancelled` contract never counts — new `contractExpiryForStatus(status, endsOn)` in `src/lib/services/contractDates.ts` returns "none" for those two. `expired` keeps its state (it can be renewed). If the owner wants every record counted, it is a one-line revert.
- Changed: `src/app/dashboard/lawyer/contracts/page.tsx`, `src/app/dashboard/firm/contracts/page.tsx` (counter + per-card badge).
- Not changed (open branches edit it): `ContractDetail.tsx` — its badge on a cancelled contract's own page; the client / micro contract pages use their own rows. To align at integration.
- Tests: `contractDates.test.ts` 6/6 (new LIVE-F41 case); `tsc` clean.
