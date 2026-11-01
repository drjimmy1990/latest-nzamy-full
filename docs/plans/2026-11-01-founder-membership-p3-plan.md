# Lawyer Founder Membership (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A verified lawyer opens `https://nezamy.sa/pricing?audience=lawyers&campaign=founder-2026#founder-plan`, pays 2,996 SAR + VAT (3,445.40), and is activated as a founder for 12 months:
- a seat, out of 1,096;
- 6 drafter works;
- 1 shared output from the four tools;
- 365 days of the library;
- the paid founder badge;
- office management (ERP) shown as «قريبًا».

The admin watches the seats and can pause the sale.

**Architecture:**
- **A new order kind, `membership`,** runs through the existing Moyasar pipeline:
  - checkout reserves a seat in SQL under a lock;
  - fulfilment activates it in one SQL function, which writes the seat, the credits, the library grant and the badge together;
  - a refund revokes all of it.
- **Credits are rows, not points.** A new RPC, `ai_start_run_with_credit`, spends one credit and starts the run at price 0 in one transaction.
- **`ai_fail_run` is re-created with the same signature.** It now also restores a spent credit, under the same once-only guard as refunds.

**Tech stack:**
- Next.js 16 App Router, TypeScript, `node --test` units;
- self-hosted Supabase (PL/pgSQL, RLS);
- Docker RLS harness `supabase/tests/rls/run.sh`;
- Moyasar.

**Spec:**
- `C:\Users\LOQ\Downloads\33-founder-complete-kit-r7\campaign.manifest.json` (commercial truth): `lawyer` block plus `campaign`;
- `02-PROGRAMMER-HANDOFF.md` §1, §2, §8, §10 and §11;
- the gap analysis `docs/audits/2026-11-01-founder-kit-r7-gap-analysis.md`. It is in the main folder; copy it into this branch in Task 11.

**Worktree:** `D:\nzwt\founder`, branch `feat/founder-membership` (from main e25edba2).

## Global Constraints

**Commercial values and copy**
- Plan id `lawyer-founder-2026`, campaign id `founder-2026`, capacity **1096**, price **2996** SAR before VAT, billing `once` (no auto-renew, no saved card).
- VAT is 15% on top: 449.40, total 3,445.40.
- Window 2026-11-01 → 2027-01-25 inclusive, Riyadh day, or until the seats run out. The membership lasts **12 months from activation**.
- Credits:
  - `drafting_work` = **6**, tool `legal-drafter`, turn 0 only;
  - `independent_output` = **1**, tools `contracts-pro`, `legal-opinion-consult`, `legal-opinion-letter`, `wargaming`.
  - Direction support has no tool yet, so it stays «قريبًا» and spends nothing.
- Eligible drafter kinds (manifest): `claim`, `reply`, `supplementary`, `closing`, `appeal`, `cassation`, `petition`. **`rejoinder` is excluded** until the owner answers ٣٩٩.
- Activation requires `lawyer_profiles.verification_status = 'verified'`, a paid order, and an atomically allocated seat. Nobody gets a badge, seat or credit without all three.
- The card must not promise anything this plan doesn't grant: no guest invites, continuity/grace, marketplace fee, recommendation, founder room, academy or 25 GB. ERP is shown only as «قريبًا — ضمن مدة العضوية المحسوبة من التفعيل».
  - No strike-through prices and no superlatives (`pricingHonesty.test.ts`).
  - Currency is written «ر.س».
- **Out of scope:**
  - **Prices:** don't touch `lib-annual` (3,490), `draftKinds` prices or top-up balances. These are owner questions ٣٩٨–٤٠١.
  - **Other founder plans:** no client founder and no business founder.

**SQL and database**
- One new migration, `supabase/migrations/20261101_10_founder_membership.sql`.
- Every function is `security definer` with `set search_path = public, pg_temp`. Execute is revoked from `public`, `anon` and `authenticated` and granted to `service_role`.
- The file is idempotent: it must run twice cleanly.
- **Never create a second overload** of `ai_start_run`, `ai_fail_run` or `library_read_quota_hit` (PGRST203). `ai_fail_run` is re-created with the identical `(uuid, text, text)` signature.

**Process and files**
- The user runs all prod SQL. Ship a SELECT check per file and a `_verify.sql` block. Owner docs say «منشور — بانتظار اختبار القبول» after deploy, never «مغلق».
- The owner report is updated in the same commit as the batch.
- Keep CRLF files CRLF: edit them with the scratchpad `ed.py`, and never set autocrlf.
- Never stage `.env*`. Run `detect_changes` before every commit. Merge or push only on the user's go.

## Review Focus

1. **Two buyers race for the last seat.** One gets `reserved`, the other gets a 409 «اكتملت المقاعد», and neither is charged twice. Covered by the Task 1 Docker test with two sessions and an advisory lock.
2. **A payment is captured after the reservation expired, and the seats are full by then.** The order stays `paid`, no badge or credit is granted, `metadata.founder = 'seat_unavailable'`, and the admin panel lists it for a refund. Task 1 (SQL) and Task 5.
3. **An AI run fails twice** (n8n failure, then a sweep or late callback). The credit is restored exactly once. Task 2 Docker test.
4. **`points_enforcement` is off.** A credit run is not consumed: it starts as an ordinary free run. Task 2.
5. **The drafter's second turn** (turn 1, same `conversation_id`) never consumes a second work. Task 6 unit test.
6. **The licence is revoked between checkout and payment.** Activation refuses with `not_verified` and behaves as in item 2. Task 1.

---

### Task 1: Seats, credits and activation in SQL

**Files:**
- Create: `supabase/migrations/20261101_10_founder_membership.sql`
- Create: `supabase/tests/rls/founder_membership.test.sql`

**Interfaces (produces):**
- `payment_orders.kind` CHECK also allows `'membership'`.
- Setting `platform_settings['founder_campaign']` gains three keys:
  - `capacity` (int, 1096);
  - `sale_paused` (bool, false);
  - `starts_on` set to `'2026-11-01'`, only when it still holds the 20261021_50 seed `'2026-10-25'`.

  Merge with `||`; the other keys are kept.
- Table `founder_seats`:
  - columns `id uuid pk`, `campaign_id text`, `user_id uuid → auth.users`, `order_id uuid unique → payment_orders`, `status text check in ('reserved','active','released','revoked')`, `reserved_until timestamptz`, `activated_at timestamptz`, `ends_at timestamptz`, `note text`, `created_at`;
  - unique partial index `(campaign_id, user_id) where status in ('reserved','active')`;
  - RLS: the owner may select their own rows only.
- Table `membership_credits`:
  - columns `id`, `seat_id → founder_seats`, `user_id`, `kind check in ('drafting_work','independent_output')`, `total int`, `remaining int check (remaining between 0 and total)`, `ends_at`;
  - `unique (seat_id, kind)`;
  - RLS: owner select.
- Table `membership_credit_uses`: `id`, `credit_id`, `run_id uuid unique → ai_runs`, `tool text`, `used_at`, `restored_at`.
- `founder_reserve_seat(p_user uuid, p_order uuid) returns text`:
  - Returns `'reserved' | 'already_member' | 'full' | 'closed' | 'paused' | 'not_verified'`.
  - Takes `pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'))`.
  - Counts `active` seats plus `reserved` seats with `reserved_until > now()`, against `capacity`.
  - On success inserts a seat with `reserved_until = now() + interval '2 hours'`.
  - The window is checked with the existing `founder_campaign_active()`.
- `founder_activate(p_order uuid) returns text`:
  - Returns `'activated' | 'already' | 'not_paid' | 'not_verified' | 'full'`.
  - Same lock. The order must be `status='paid'` and `kind='membership'`. It reuses the order's own seat, even if the reservation expired, and allocates a new seat only if capacity allows.
  - **Note:** this does not check the campaign window. A payment that started inside the window and was captured after it still activates.
  - On success:
    - sets the seat `active`, `activated_at=now()`, `ends_at=now()+interval '12 months'`;
    - inserts the two credit rows (6 and 1) with the same `ends_at`;
    - calls `library_grant_access(user, 'lib-founder', 'purchase', 365, null, p_order, 'founder membership', null)`;
    - sets `lawyer_profiles.founder_badge = true`.
  - On `not_verified` or `full`, it writes `founder = <reason>` into the order metadata via `merge_payment_order_metadata`.
- `founder_revoke(p_order uuid, p_reason text) returns text`:
  - Sets the seat `revoked` and the credits `remaining = 0`.
  - Sets the library grant for that `order_id` to `revoked_at = now()`, `reason = p_reason`.
  - Clears the badge unless the user has another `active` seat.
  - Returns `'revoked' | 'none'`.
- `founder_release_expired() returns int`: releases `reserved` seats past `reserved_until` whose order is not `paid`.
- `founder_seat_summary() returns table(capacity int, active int, reserved int, seats_left int, sale_paused bool, on_sale bool)`.

- [ ] **Step 1: Write the failing Docker test** `founder_membership.test.sql`. Assert:
  - with capacity set to 2 and three verified lawyers, reservations return `reserved`, `reserved`, `full`;
  - an unverified user gets `not_verified`;
  - a second reserve by the same user gets `already_member`;
  - `founder_activate` on an unpaid order gets `not_paid`;
  - after marking the order paid it returns `activated`, there are 2 credit rows (6 and 1), a library grant with `plan_ref='lib-founder'` and `ends_at` about 365 days out, and the badge is true;
  - a second activate returns `already` and leaves the row counts unchanged;
  - an expired reservation with a free seat still activates; with capacity full it returns `full` and the metadata holds `founder = 'seat_unavailable'`;
  - `founder_revoke` zeroes the credits, revokes the grant and clears the badge;
  - `founder_release_expired()` returns 1 for a stale unpaid reservation;
  - an `authenticated` session cannot execute any of the functions or write the tables;
  - exactly one `ai_fail_run` overload exists (`select count(*) = 1 from pg_proc where proname = 'ai_fail_run'`).
- [ ] **Step 2: Run it and see it fail.** `bash supabase/tests/rls/run.sh supabase/migrations/20261019_10_*.sql supabase/migrations/20261021_50_*.sql supabase/migrations/20261022_*.sql supabase/migrations/20261030_65_*.sql supabase/migrations/20261101_10_founder_membership.sql supabase/tests/rls/founder_membership.test.sql`. Reuse the exact migration chain from the header of `payments_fulfill_once.test.sql` and `library_grant_admin.test.sql`. Expected: an error, because the migration doesn't exist yet.
- [ ] **Step 3: Write the migration** to the interfaces above. End it with a `do $$ … raise notice '20261101_10 OK'` self-check and a final SELECT check:
  `select (select count(*) from public.founder_seats) as seats, (select value->>'capacity' from public.platform_settings where key='founder_campaign') as capacity;`
- [ ] **Step 4: Run the test twice**, the second time with the migration applied twice in the chain. Expected: all asserts pass.
- [ ] **Step 5: Commit** `feat(founder): seats, credits and activation in SQL (20261101_10)`.

### Task 2: Spend and restore credits on AI runs

**Files:**
- Modify: `supabase/migrations/20261101_10_founder_membership.sql` (append)
- Create: `supabase/tests/rls/founder_credits.test.sql`

**Interfaces:**
- Consumes the Task 1 tables, plus `ai_start_run` and `ai_fail_run` from `20261027_10_ai_runs.sql:94-242`.
- Produces `ai_start_run_with_credit(<every ai_start_run parameter, same names and order>, p_credit_kind text) returns table(run_id uuid, created boolean, status text, charged boolean, charged_points int, credit_used boolean)`. It:
  1. Checks the tool against the kind: `drafting_work` needs `p_tool = 'legal-drafter'` and `p_input->>'kind'` in the eligible list; `independent_output` needs a tool in the four ids. Otherwise it raises `P0001 credit_not_eligible`.
  2. Calls `ai_start_run(... p_price := 0 ...)` without credit if the `points_enforcement` setting is off.
  3. Otherwise locks the user's credit row `for update`, where it has `remaining > 0` and `ends_at > now()`, else raises `P0001 no_credit`.
  4. Calls `ai_start_run(... p_price := 0 ...)`.
  5. If `created`, inserts a `membership_credit_uses` row and decrements `remaining`. A duplicate idempotency key returns the existing run with `credit_used = false` and no second decrement.
- `ai_fail_run(p_run uuid, p_code text, p_message text)`: `create or replace` with the **identical** body plus one block. When the run moves to `failed` and a `membership_credit_uses` row for `p_run` has `restored_at is null`, it sets `restored_at = now()` and does `remaining = remaining + 1`. Copy the current body verbatim from `20261027_10_ai_runs.sql:179-242`; don't paraphrase it.

- [ ] **Step 1: Write the failing test.** Assert:
  - a founder with 6 works spends one (`remaining = 5`, `credit_used = true`, the run has `charged = false`);
  - the same idempotency key again leaves `remaining = 5`;
  - `ai_fail_run` restores it to 6, and a second `ai_fail_run` on the same run leaves 6;
  - `kind = 'rejoinder'` raises `credit_not_eligible`;
  - `independent_output` used on `wargaming` leaves 0, and a second use raises `no_credit`;
  - with `points_enforcement = false` nothing is decremented;
  - an expired credit (`ends_at` in the past) raises `no_credit`;
  - `select count(*) = 1 from pg_proc where proname = 'ai_start_run'`, and likewise for `ai_fail_run`.
- [ ] **Step 2: Run** with the chain from Task 1 plus `20261027_10_ai_runs.sql`, before the new migration. Expected: FAIL.
- [ ] **Step 3: Append the two functions to the migration.**
- [ ] **Step 4: Run the new test, then re-run the existing `ai_runs.test.sql` with the new migration added.** Expected: both pass. This proves the existing AI refunds are unchanged. Because every AI refund goes through `ai_fail_run`, this is the **highest-risk change in the batch**. Report the blast radius (`grep -rn "ai_fail_run" src supabase/migrations`) in the commit body.
- [ ] **Step 5: Commit** `feat(founder): spend a founder credit instead of points; ai_fail_run restores it once`.

### Task 3: The `membership` kind through the price book and catalogue

**Files:**
- Modify:
  - `src/lib/pricing/priceBook.ts` (`BookItemKind`, a new `membership()` helper, the `PRICE_BOOK` entry; update the "Still waiting" comment);
  - `src/lib/payments/catalog.ts` (`saveCard` stays false for `membership`);
  - `src/lib/payments/fulfillDecision.ts` (`fulfilmentNoticeAr` gains `membership`);
  - `src/lib/payments/resultView.ts:70`;
  - `src/lib/payments/checkoutView.ts:167,178,453`.
- Create: `src/lib/membership/founderPlan.ts` and `founderPlan.test.ts`.
- Test: `src/lib/pricing/priceBook.test.ts`, `src/lib/payments/catalog.test.ts`.

**Interfaces (produces), in `founderPlan.ts` (pure, no imports beyond relative):**
- Constants:
  - `FOUNDER_PLAN_ID = "lawyer-founder-2026"`;
  - `FOUNDER_CAMPAIGN_ID = "founder-2026"`;
  - `FOUNDER_DRAFT_KINDS: readonly DraftKindId[]` (the 7 eligible);
  - `FOUNDER_OUTPUT_TOOLS = ["contracts-pro","legal-opinion-consult","legal-opinion-letter","wargaming"] as const`.
- `creditKindForRun(tool: string, input: Record<string, unknown>, turn: number): "drafting_work" | "independent_output" | null`:
  - `legal-drafter` with turn 0 and an eligible kind gives `drafting_work`;
  - any turn above 0 gives null;
  - an output tool gives `independent_output`;
  - anything else gives null.
- Book entry: `{ id: FOUNDER_PLAN_ID, kind: "membership", labelAr: "باقة المحامي المؤسس", buyers: ["lawyer"], prices: { once: { sar: 2996 } } }`.

- [ ] **Step 1: Failing tests:**
  - `quote("lawyer-founder-2026","once")` gives net 299600, VAT 44940, total 344540 halalas;
  - `buyerAllowed` is true for `lawyer` and false for `firm` and `individual`;
  - the item has `saveCard === false`;
  - `creditKindForRun` covers the cases above, including rejoinder giving null and drafter turn 1 giving null;
  - `fulfilmentNoticeAr({kind:"membership",…})` gives the Arabic notice;
  - `resultView` labels the kind «باقة المحامي المؤسس», not "plan".
- [ ] **Step 2: Run** `node --test src/lib/membership/founderPlan.test.ts src/lib/pricing/priceBook.test.ts src/lib/payments/catalog.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Widen every `kind` switch that fell through to "plan" or "topup" so that `membership` is explicit. Find them with `grep -rn "\"topup\"\|'topup'" src/lib/payments`.
- [ ] **Step 4: Run the full unit suite** (`npm test`). Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: Checkout gate and seat reservation

**Files:**
- Modify: `src/lib/payments/checkoutCore.ts`, `src/app/api/v1/payments/checkout/route.ts`
- Test: `src/lib/payments/checkoutCore.test.ts`

**Interfaces:**
- Consumes `founder_reserve_seat` (Task 1).
- `CheckoutDeps` gains `reserveFounderSeat(userId: string, orderId: string): Promise<string>`, wired in the route to `admin.rpc("founder_reserve_seat", …)`.
- `CheckoutReply` status adds `409`.

Behaviour, for `item.kind === "membership"` only:
1. After the buyer check and the order insert, call `reserveFounderSeat`.
2. If the answer is not `reserved`, set the order `status = 'cancelled'` (use the existing order-status values) and reply as follows. All messages are Arabic.

| Answer | Status | Message |
|---|---|---|
| `not_verified` | 403 | «يُتاح اشتراك المؤسس بعد توثيق رخصتك المهنية» |
| `already_member` | 409 | «أنت عضو مؤسس بالفعل» |
| `full` | 409 | «اكتملت مقاعد المؤسسين» |
| `closed` / `paused` | 410 | «باب الاشتراك مغلق حاليًا» |

- [ ] **Step 1: Failing tests:** each answer gives the status and message above with the order cancelled; `reserved` continues to the Moyasar form; a non-membership item never calls `reserveFounderSeat`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass.**
- [ ] **Step 5: Commit.**

### Task 5: Fulfilment, refund and sweep

**Files:**
- Modify:
  - `src/lib/payments/grantPurchase.ts` (a `membership` branch → `deps.activateFounder(orderId)`; `already` counts as success);
  - `fulfillOrder.ts` (wire `activateFounder` to `founder_activate`);
  - `refundDecision.ts` and `refundCore.ts` (`membership` → `founder_revoke(order, 'refund')`);
  - `src/app/api/v1/cron/payments-sweep/route.ts` (also call `founder_release_expired`).
- Test: `grantPurchase.test.ts`, `refundDecision.test.ts`, `fulfillCore.test.ts`.

**Interfaces:**
- `GrantPurchaseResult` for membership is `{ granted: true }` on `activated` or `already`.
- On `full` or `not_verified` it is `{ granted: false, reason }`. `fulfilled_at` is still stamped, so the sweep doesn't loop on it, and an admin notification is sent with the existing admin notify helper.

- [ ] **Steps 1–5** follow the TDD cycle. The tests must assert:
  - `activateFounder` is called once per order, including on a webhook + result-page double fulfil;
  - `seat_unavailable` produces an admin notification and no throw;
  - a refund of a membership calls `founder_revoke` and does not touch points lots;
  - the sweep calls the release function.

### Task 6: Use a credit from the AI run route

**Files:**
- Modify: `src/lib/ai/runCore.ts`, `src/hooks/useAiRun.ts`
- Create: `src/app/api/v1/membership/founder/route.ts`
- Test: `src/lib/ai/runCore.test.ts`

**Interfaces:**
- The request body accepts optional `useCredit: true`.
  - When it is set and `creditKindForRun(tool, input, turn)` is non-null, `startRunWith` calls `admin.rpc("ai_start_run_with_credit", {...same args, p_credit_kind})` instead of `ai_start_run`.
  - Error mapping: `no_credit` → 402 «لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة»; `credit_not_eligible` → 400.
  - The reply adds `creditUsed: boolean`.
- `useAiRun.run(input, { useCredit?: boolean })` passes the option through.
- `GET /api/v1/membership/founder` (signed-in user; reads own rows with the user client under RLS) returns `{ member: boolean, endsAt: string | null, credits: { drafting_work: { total, remaining }, independent_output: { total, remaining } }, libraryUntil: string | null }`.

- [ ] **Steps 1–5** follow the TDD cycle. The tests must assert:
  - `useCredit` with drafter turn 0 and kind `appeal` calls the credit RPC with `p_credit_kind: "drafting_work"`;
  - turn 1 calls plain `ai_start_run` with price 0;
  - `useCredit` with an ineligible tool falls back to the normal points path (no credit RPC);
  - a 402 carries the Arabic message.

### Task 7: The «استخدم رصيد باقة المؤسس» choice on the four tools

**Files:**
- Create: `src/components/membership/FounderCreditChoice.tsx`
- Modify:
  - `src/components/draft/steps/StepAiDraft.tsx` (lines ~114, 149, 288);
  - `src/components/contracts/steps/draft/StepGenerate.tsx` (45, 84, 112, 115);
  - `src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx` (57, 86, 147);
  - `LetterWorkflow.tsx:773`;
  - `src/app/ai/wargaming/page.tsx` (1147, 1160).

**Interfaces:**
- `FounderCreditChoice({ kind: "drafting_work" | "independent_output", value: boolean, onChange(v: boolean) })`:
  - It fetches `GET /api/v1/membership/founder` once and renders nothing when `member` is false or `remaining` is 0.
  - Otherwise it shows a checkbox, checked by default for `drafting_work` and **unchecked** for `independent_output` (it is one shared output, so the lawyer chooses where to spend it). The label reads «استخدم عملاً من باقة المؤسس (متبقٍ ٥ من ٦)» or «استخدم مخرجك المستقل من باقة المؤسس (١ من ١)».
- When it is checked, each page's price line reads «من رصيد باقة المؤسس — بلا نقاط», and the "N points deducted" line reads «استُخدم من رصيد باقة المؤسس» when `creditUsed` is true.
- The direction-support page is unchanged: it stays «قريبًا».

- [ ] **Step 1: Unit-test the pure label helper.** Put `founderCreditLabel(kind, remaining, total): string` in `founderPlan.ts`, with Arabic-Indic digits via the existing digit formatter.
- [ ] **Step 2: Implement the component and wire it into the five call sites.**
- [ ] **Step 3: Check in a browser** with the dev server and a founder test account (seeded through the Task 1 functions on a local DB, or with the API mocked). Confirm the checkbox shows, the label and remaining count are right, and nothing renders for a non-founder.
- [ ] **Step 4: Commit.**

### Task 8: The founder card and the checkout link on /pricing

**Files:**
- Modify:
  - `src/lib/pricing/campaigns.ts` (`FOUNDER_CAMPAIGN_COPY.ctaHref` → `/pricing?audience=lawyers&campaign=founder-2026#founder-plan`; extend `FOUNDER_SETTING_KEYS` and `founderCampaignSettingIssue` with `capacity` as a positive int ≤ 100000 and `sale_paused` as a boolean);
  - `src/app/api/v1/campaigns/active/route.ts` (add `seatsLeft`, `onSale`, `planId` from `founder_seat_summary()`);
  - `src/app/api/v1/admin/settings/route.ts` validator;
  - `src/app/pricing/page.tsx` (read `audience` and `campaign` from `useSearchParams` inside a `<Suspense>`; `audience=lawyers` selects the lawyer tab; scroll to `#founder-plan`).
- Create: `src/components/pricing/FounderPlanCard.tsx`
- Test: `campaigns.test.ts`, `pricingHonesty.test.ts` (add `FounderPlanCard.tsx` to `PRICING_SURFACES`).

**Interfaces:** `FounderPlanCard({ campaign })` renders with `id="founder-plan"` only when `onSale` is true. It contains:
- the title «باقة المحامي المؤسس»;
- the price «٢٬٩٩٦ ر.س قبل الضريبة — الإجمالي ٣٬٤٤٥٫٤٠ ر.س», computed from `quote()`, not typed in;
- «للسنة الأولى، ١٢ شهرًا من التفعيل»;
- the benefits list: «٦ أعمال بالصائغ القانوني (يمكن تكرار النوع)»; «مخرج مستقل واحد تختاره من: محترف العقود، الرأي الفصل، المحاكي الشامل، داعم الاتجاه (قريبًا)»; «المكتبة القانونية ١٢ شهرًا»; «إدارة المكتب — قريبًا، ضمن مدة العضوية»;
- «المقاعد المتبقية: N من ١٬٠٩٦»;
- the fine print «لا يُعدّ سعر السنة الأولى سعر تجديد ثابتًا»;
- the CTA, depending on who is looking:
  - a guest gets `/login?next=/checkout?item=lawyer-founder-2026%26billing=once`, plus a register link to `/register/provider?plan=lawyer-founder-2026`;
  - a signed-in lawyer who is not verified gets «وثّق رخصتك أولاً», linking to the lawyer verification page;
  - a verified lawyer goes to `checkoutHref`;
  - an existing member sees «أنت عضو مؤسس».

  The CTA logic lives in a pure helper `founderCta(state)` with unit tests.
- When `campaign=founder-2026` is in the URL but the sale is closed, show «انتهت حملة المؤسس أو اكتملت مقاعدها» instead of a dead anchor.

- [ ] **Steps 1–5:** TDD on `founderCta` and the setting validator; implement; `pricingHonesty` passes; check in a browser at `/pricing?audience=lawyers&campaign=founder-2026#founder-plan` with the flag forced on locally; commit.

### Task 9: «عضويتي المؤسسة» on the lawyer dashboard

**Files:**
- Create: `src/app/dashboard/lawyer/_components/FounderMembershipCard.tsx`
- Modify: `src/app/dashboard/lawyer/page.tsx`

**Behaviour:**
- **For a member,** the card reads `GET /api/v1/membership/founder` and shows:
  - «عضو مؤسس حتى <Riyadh date>»;
  - «أعمال الصائغ: متبقٍ X من ٦»;
  - «المخرج المستقل: X من ١»;
  - «المكتبة حتى …»;
  - «إدارة المكتب: قريبًا».
- **For a verified non-member while the sale is on,** it shows a one-line invite to the founder card instead. This is how the "keep the plan through login and verification" requirement is met without storing anything in the browser.
- **For everyone else,** it shows nothing.

- [ ] **Steps:** add a pure view helper with a unit test; implement; check in a browser; commit.

### Task 10: Admin «حملة المؤسس» operations panel

**Files:**
- Create:
  - `src/app/dashboard/admin/founder/page.tsx`;
  - `src/app/api/v1/admin/founder/overview/route.ts` (GET, `requireStaff("read")`);
  - `src/app/api/v1/admin/founder/sale/route.ts` (PATCH `{ salePaused: boolean, capacity?: number }`, `requireStaff("settings.write")` before any write, then `logAdminAction` with before/after).
- Modify:
  - `src/lib/auth/adminRouteGates.test.ts` (pin both routes);
  - the admin sidebar nav entry, next to «الأمان والحماية».

**What the overview returns:**
- the `founder_seat_summary()` row;
- counts of membership orders by status;
- activations today and in the last 7 days;
- members (name, activated_at, ends_at, credits remaining);
- orders whose `metadata.founder` is `seat_unavailable` or `not_verified`, labelled «بانتظار استرداد».

`capacity` cannot be set below `active + reserved`; that returns 400.

**Panel:** the numbers, a «إيقاف البيع مؤقتًا / استئناف البيع» switch with a confirm, a capacity field, and the two tables.

- [ ] **Steps:** gate tests first (they fail until the routes exist); implement; check in a browser as admin; commit.

### Task 11: Go live, verify, owner documents

**Files:**
- Modify:
  - `src/lib/pricing/campaigns.ts`: `FOUNDER_MEMBERSHIP_ON_SALE = true`. The route still answers no campaign outside the dates, when paused, or with no seats left.
  - `supabase/migrations/_verify.sql`: a `20261101_10` block. It checks the tables, one overload each of `ai_start_run` and `ai_fail_run`, `founder_campaign.capacity = 1096`, the `membership` kind in the CHECK, and that `authenticated` has no execute on the founder functions.
- Create:
  - `SQL_batch_2026-11-01_founder_membership/README.md` (run order: 01 = the migration BEFORE the deploy, then deploy, then `_verify` by hand; each step with its SELECT check and full PC and server paths);
  - `docs/audits/2026-11-01-owner-note-founder-membership.ar.md` (what was built, what is deferred and why, acceptance test steps, questions ٣٩٨–٤٠٦);
  - `تقرير_للمالك_٢٠٢٦-١١-٠١_باقة_المؤسس.md`.
- Copy: `docs/audits/2026-11-01-founder-kit-r7-gap-analysis.md` from the main folder into the branch.

**Owner questions:**

| No. | Question | Default until answered |
|---|---|---|
| ٣٩٨ | Library annual price: 3,490 (answer ٣٠٠) or 3,790 (kit)? | Live price unchanged |
| ٣٩٩ | Does the rejoinder memo (تعقيب) count as one of the 6 works? | Excluded |
| ٤٠٠ | The drafter's initial claim: 200 points (kit) or 500 (today)? | 500 |
| ٤٠١ | Do the larger top-up balances apply during the founder window? | Normal balances |
| ٤٠٢ | Confirm the bundle and ERP prices; what happens to existing `lawyer-pro` 3,990 subscribers? | — |
| ٤٠٣ | Deferred benefits (guest invites, continuity/grace, marketplace fee, recommendation, founder room, academy, 25 GB storage): shown as «قريبًا» or left off the card? | Left off |
| ٤٠٤ | Refund policy for a membership with credits already used | Admin decides the amount; everything is revoked |
| ٤٠٥ | Business founder plan (`biz-sm-pro` is not in the book) | — |
| ٤٠٦ | Who answers founder WhatsApp replies, and the Zernio account owner | — |

- [ ] **Step 1: Full checks.**
  - `npx tsc --noEmit` and `npm test`, with all unit tests passing.
  - The webpack build: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack`.
  - Both Docker tests, plus the existing `ai_runs`, `payments_fulfill_once`, `founder_badges_unpaid_removed` and `library_grant_admin` tests.
- [ ] **Step 2:** `detect_changes`, plus a grep for the blast radius of `ai_fail_run` and every `kind` switch. The run must touch only the expected symbols.
- [ ] **Step 3: Whole-branch review** by a fresh reviewer on `model: opus`. Fix what it confirms.
- [ ] **Step 4: Commit** the docs and the owner report in the same commit as the flag flip. Report to the user and wait for their go to merge and push.

---

## Part B: Zernio WhatsApp. A separate plan, written once its prerequisites exist

This is not built in this branch. The prerequisites are the owner's or the user's, and secrets never go in chat:
- a Zernio account linked to the WhatsApp number, plus its `accountId` and `profileId`;
- an API key and a webhook secret, which go into the server `.env` (and n8n credentials);
- Meta approval of the four templates in `templates/`, which takes days;
- a consented contact list with license status;
- the name of the human who takes handoffs (question ٤٠٦).

Planned shape, to be detailed in its own plan when the prerequisites exist:
1. Tables `campaign_contacts` (the handoff §3 fields, E.164 phone numbers, consent fields, `suppressed_at`) and `campaign_events` (unique `event_id`).
2. `POST /api/v1/webhooks/zernio`, which:
   - checks the HMAC-SHA256 `X-Zernio-Signature` over the raw body, using a constant-time compare;
   - stores the event, then answers 2xx;
   - hands the event to an n8n worker.
3. The n8n worker handles:
   - «إيقاف», which suppresses the contact deterministically and permanently;
   - «التفاصيل», which sends the PDF and MP4 once per request, using an idempotency key built from campaign, contact, intent and asset version;
   - FAQ replies from `agent-knowledge.json` facts only;
   - anything unknown, which goes to a human and stops the bot for that conversation.
4. The admin panel from Task 10 gains the funnel: delivered → interested replies → details requested → offer visit → subscription started → paid → activated, plus opt-outs and failures. It also gets a «إيقاف الحملة» switch that cancels pending sends.
5. Assets are served from a direct HTTPS URL with the correct MIME type: video up to 16 MB, PDF up to 100 MB.
