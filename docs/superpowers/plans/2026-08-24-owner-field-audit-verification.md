# Owner field audit — 24 August 2026: verification and build order

**Source:** `NZAMY_Master_Audit_and_Screenshots_August_2026` — a 575-line QA log plus 15 production
screenshots, produced by د. محمد with a QA co-pilot on 23 August 2026 against the live VPS.

> **STATUS — 24 August 2026, end of day.** Waves 0, 1 and 2 are **built and committed** (12 commits,
> `3042327`…`08ca9dd`). 247 unit tests pass (+32 new), `tsc --noEmit` clean, `npm run build` exit 0, and the
> dark-mode sweep was verified in a real browser (449 elements measured across 5 pages, 0 contrast failures).
> Waves 3 and 4 are **not started** — see §9 for exactly what is left and why.
>
> Two things need a human, not a commit: the **Terms of Service and Refund Policy still describe an Escrow
> system** (§9.1), and `N8N_WEBHOOK_SECRET` must be checked **on the VPS** (§3.4).

**What this document is.** The source document publishes its own «منفَّذ vs معلّق» verdict table. That
table was written by an agent, not measured. Every claim in it — and every one of the 29 observations —
was re-checked here against the actual code by 15 verification agents at high effort, with a second
adversarial agent re-checking any verdict that contradicted the owner. Nothing below is relayed from the
source document; each line has a `file:line` an agent resolved itself.

---

## 0. Two facts that reframe the whole report

### 0.1 Production is current. This is not a deploy gap.

```
POST https://nezamy.sa/api/v1/does-not-exist-xyz   → 200, HTML not-found page
POST https://nezamy.sa/api/v1/onboarding/account-type → 400, {"error":"بيانات غير صالحة."}
```

The second route only exists since `f1b45f7` (Google sign-in round, 21 August). The live server is
running current `main`. Corroborated by three screenshots: Arabic intake values on `/ai/orders/[id]`
(`f95ef4f`), the wargaming memo upload (`12e8381`), and the 9-card onboarding picker (`baa0889`).

**Consequence:** every gap below is a gap in the code. "Not deployed yet" is never the explanation.

### 0.2 The owner tested ~8% of his own plan.

`القسم الثالث` of the source declares **81 planned checks** across 7 sections and reports **0 passed /
0 failed** — every section still reads «في الانتظار». Counting ticked boxes across the detailed tables:
**13 `[x]`** (of which 9 are the summary table's own re-listed claims, so ~**6 real field tests**) and
**16 untouched `[ ]`**.

Six field tests produced 29 observations. We have no failure data for the other ~75 checks. "Nothing is
complete" is partly a *coverage* statement, and the remaining 75 checks are the cheapest way to find out
what else is broken.

---

## 1. Verdict tally

70 claims verified. One contrarian verdict was overturned on adversarial re-check (see §1.1).

| Verdict | Count | Meaning |
|---|---:|---|
| **CONFIRMED** | 40 | The owner is right. The gap is real and present. |
| **PARTIAL** | 23 | Done in one surface, missing in another. **This is the answer to "nothing is complete as it should be."** |
| **ALREADY_FIXED** | 4 | The code already does this; the audit is out of date. |
| **FALSE** | 2 | The audit misread the system. |

**63 of 70 claims are correct or half-correct. Only 2 are wrong.** The owner's field observations are
reliable. Where the source document is unreliable is its *own* «تم إنجازه» table — see §1.1.

### 1.1 The audit's green «تم إنجازه» table does not survive contact with the code

Nine rows were claimed done. Verified individually:

| Row | Claim | Verdict |
|---|---|---|
| done-1 | Parties mandatory in contracts wizard | **PARTIAL** — UI-only; no server validation (§2.3) |
| done-2 | Contract file mandatory in review mode | **PARTIAL** — UI-only; no server validation (§2.3) |
| done-3 | Memo file required for «نقض المذكرة» | **PARTIAL** — UI-only; and the code says text **or** file by design |
| done-4 | Amber «مذكرة» badge «عند الأدمن وعند المحامي» | **ALREADY_FIXED** — but it is admin + **client**, never a lawyer view |
| done-5 | Letter wizard is a separate 4-step flow | **ALREADY_FIXED** |
| done-6 | Admin panel no longer closes on «استلام» | **OVERTURNED → PARTIAL** — holds on «الكل», fails on «جديدة» (§1.2) |
| done-7 | Server cancel lock returns 403 | **ALREADY_FIXED** — survived adversarial bypass hunting |
| done-8 | 60-second upload ceiling | **ALREADY_FIXED** — survived adversarial bypass hunting |
| done-9 | Intake values render in Arabic | **PARTIAL** — client yes, admin no (§2.1) |

**Pattern:** the two rows the source flagged as merely «مؤمن في الكود» (7, 8) are the two that held up
best. The row that failed (9) failed where a code-reading agent would never look — a second renderer in a
different feature tree reaching the same data through a different function. *Rows verified on one surface
are the unreliable ones, not rows verified by reading.*

### 1.2 The one overturned verdict

A verifier ruled done-6 ALREADY_FIXED, citing `admin/service-orders/page.tsx:311` (the guarded collapse
`if (!opts.keepOpen)`) and `:557`/`:573` (both pass `{ keepOpen: true }`). The adversarial agent found the
guard incomplete:

Panel visibility is not `open?.id === o.id` alone — it is that **and** `o` still being in `orders`
(`page.tsx:421`). After a claim, `act()` calls `load()`, whose fetch is status-scoped
(`page.tsx:280` → `route.ts:58 query.eq("status", status)`). Claim flips the row to `in_review`
(`admin/service-orders/[id]/route.ts:59-60`).

So on the **«جديدة»** tab — the tab named for exactly the orders that render the استلام button — the
claimed order stops matching the refetch, drops out of `orders`, and the card unmounts, taking the
expanded panel and the upload field with it. On «الكل» it survives. The guard protects the state variable
and not the list membership the panel actually depends on.

**Effort: S.** Either keep the claimed row locally, or refetch without the status filter while a panel is open.

---

## 2. The three findings that explain «nothing is complete as it should be»

### 2.1 `intakeValues.ts` is in a folder the admin tree cannot reach

This is the single cleanest explanation for the owner's frustration, and it is provable to the day.

The file is **not** at `src/lib/services/intakeValues.ts`. It is at
`src/app/ai/orders/[id]/_components/intakeValues.ts` — inside the client order page's private
`_components` folder. Its only importer in the repo is
`src/app/ai/orders/[id]/_components/OrderSummary.tsx:36`.

The admin panel imports exactly one thing from the services layer: `buildOrderPrompt`
(`admin/service-orders/page.tsx:9`). The asymmetry is exact, key for key, for the three strings visible in
the owner's screenshot:

| Key | Client page | Admin panel |
|---|---|---|
| `schemaVersion` | **hidden** (`intakeValues.ts:519`, `HIDDEN_INTAKE_KEYS`) | prints `**schemaVersion:** 1` |
| `contractDesc` | «وصف العقد» (`intakeValues.ts:364`) | prints `**contractDesc:**` |
| `complexity`/`simple` | «مستوى التفصيل» → «عقد بسيط» (`intakeValues.ts:358`, `:65`) | prints `**complexity:** simple` |

**Every Arabic string the admin needs already exists and is already unit-tested.** It is simply in the
wrong folder.

Commit timeline, proven by file lists rather than inferred:
- `be0a9ff` (20 Aug) touched **only** `admin/service-orders/page.tsx`, `orderPrompt.ts` and its test.
  Upgraded the admin from `JSON.stringify` to raw-keyed Markdown — better, still English keys.
- `f95ef4f` (21 Aug) touched **only** `OrderSummary.tsx`, `intakeValues.ts`, `intakeValues.test.ts`.
  **Zero admin files.**

Neither commit is wrong about itself. The Arabic work landed one day later, in the other tree, and the
admin was never revisited.

**A second tell that someone stopped halfway:** `orderPrompt.ts:40-50` emits Arabic *chrome*
(`serviceTitleAr`, `## وصف الطلب`, `## بيانات العميل المُدخلة`, `## المرفقات`) wrapped around English
*guts* from `renderValue` at `:22` (`- **${k}:**`). The scaffolding was Arabized; the field names were left raw.

**Also resolved:** the raw block is **both** the copyable prompt and the human-readable brief — there is no
separate brief. `page.tsx:502` renders `buildOrderPrompt(o)` in the `<pre>`; `:372` copies the identical
string; `:358` downloads it. The English keys are a bug, not prompt syntax, and the code says so:
`orderPrompt.ts:2-3` states its purpose is "a Markdown brief the admin can read — or paste into an AI
assistant" (reading first), and the button at `page.tsx:459` is labelled «نسخ **ملخص** الطلب».

**Fix:** promote `intakeValues.ts` to a shared module and have `buildOrderPrompt` use it. **Effort: M.**
This one change fixes obs-7, most of obs-18, and done-9 at once.

### 2.2 The dark-mode text bug is app-wide, not an onboarding bug

`obs-23` is correct, but far under-scoped. `dark:text-gray-100` appears **79 times across 25 files**.
Every one renders `#1c2128` in dark mode, because `src/app/globals.css:102` redefines `--color-gray-100`
to a dark *surface* colour. And `src/components/ThemeProvider.tsx:42,61` default the whole app to **dark**.

So this is the default rendering for every visitor, everywhere — not just the onboarding cards. The owner
only reported it where he happened to be looking.

Also missed by obs-23: the step heading of **all five** onboarding steps has the identical bug
(`onboarding/page.tsx:261, 358, 466, 566, 640`). On step 1 the `<h2>` «أنت من تكون بالضبط؟» is itself
near-invisible; on step 5 so is «حسابك جاهز تماماً!».

Same trap is armed for `--color-gray-50` (`globals.css:101` → `#161b22`) and `--color-gray-200`
(`:103` → `rgba(255,255,255,0.1)`).

**Fix:** sweep all 79 to `dark:text-zinc-100`, or simply delete the class (`text-ink` is already correct in
dark per `globals.css:86`). Grep `dark:text-gray-50` and `dark:text-gray-200` too. **Effort: M.**
**Highest value-per-hour item in this entire audit.**

### 2.3 No intake validator runs on the server

All four `validate*Intake` functions (`orderIntake.ts`, `.contracts.ts`, `.wargaming.ts`,
`.legalOpinion.ts`) have **zero non-test callers outside client hooks and page components** — verified by
grepping every call site.

`POST /api/v1/service-requests` inserts `metadata: requestData.metadata ?? {}` **verbatim**
(`route.ts:214`) and validates only `status` (`CREATE_STATUS_ALLOWLIST`, `:181-187`) and the payment gate.

**Consequence:** done-1, done-2 and done-3 are UI-only. A direct POST ships a contracts draft with unnamed
parties, a contracts review with no attached contract, or a wargaming critique with no memo — and the admin
receives an unfulfillable order.

**Fix:** one server-side dispatch on `metadata.intake.service` → the matching validator → 400. Hardens
three green rows at once. **Effort: M.**

---

## 3. Findings the audit never mentioned

Ordered by severity. All verified with `file:line`.

### 3.1 🔴 SECURITY — every invited team member becomes a full admin

`src/app/api/v1/admin/teams/route.ts:83-87` creates the invited user with
`user_metadata: { user_type: "admin" }`, and `:121-125` upserts `user_type: "admin"`.

Combined with two bypasses — `src/lib/auth/assertRole.ts:46` (`userType !== 'admin'` short-circuits every
role allow-list) and `src/components/dashboard/UserTypeGuard.tsx:32` (same on the client, guarding all 42
admin pages via `admin/layout.tsx:14`) — **the moment أ. رامي is invited through «فريق نظامي» he holds
أ. أشرف's full authority**: settings, pricing, entitlement grants, coupons.

Worse: `src/app/dashboard/admin/users/roles/page.tsx:7-22` and `admin/team/page.tsx:83` render **fictional
roles from a hardcoded constant**. The owner may believe a permission tier exists because he has seen that
screen.

**This must be fixed before أ. رامي is given an account.** It is also the real reason obs-19/table-10 is
not optional.

### 3.2 🔴 The payment gate reads a different object than the insert writes

*(The verifying agent named `consultations/route.ts` — wrong file; that route is 102 lines and has no gate
at all. The real gate is in `service-requests/route.ts`. Re-verified by hand; the defect is real.)*

`src/app/api/v1/service-requests/route.ts`:

```
:147  // Support both wrapped { request: {...} } and flat payloads
:149  const requestData = body.request ?? body;          ← data: wrapped OR flat
:154  const payment = body.payment;                       ← gate: TOP LEVEL ONLY
:155  const isPaidRequest = payment && … Number(payment.amount) > 0;
:157  if (isPaidRequest) { …getPaymentGatewayStatus()… 402 }
…
:212  payment: requestData.payment ?? { amount: 0, status: "not_required" },   ← insert
```

The route **advertises** wrapped support at `:147`, and the insert honours it at `:212`. The gate at `:154`
does not. So `{ request: { …, payment: { amount: 250, status: "paid" } } }` skips the gateway check
(`body.payment` is `undefined` → `isPaidRequest` false) and still writes a **paid row** at `:212` while the
gateway is disabled.

**Honest scoping:** no current caller sends the wrapped form — I grepped the create wrappers and found none.
This is a **latent** hole, not an active exploit, and it should not be described to the owner as one. It is
also a **one-line fix**: `const payment = body.payment ?? requestData.payment;`

(The audit *suspected* the whole gate was UI-only. That suspicion was **FALSE** — a real server guard exists
at `:157` and returns 402. This is a separate, narrower hole inside it.)

### 3.3 🔴 The public site claims payment infrastructure that does not exist

Verified directly, and it is worse than the agent reported — the FAQ does not merely list payment methods,
it publishes a **detailed escrow policy**, in both Arabic and English:

| `file:line` | Statement |
|---|---|
| `components/floating/wa-steps/StepPayment.tsx:98` | «جميع المدفوعات محمية بنظام Escrow» — and `:104` jumps straight to a success screen |
| `app/faq/page.tsx:175-180` | Q: «هل يوجد نظام Escrow؟» → A: «**نعم**، تُودَع جميع المدفوعات في حساب ضمان (Escrow) محمي ولا تُحوَّل للمزود إلا بعد تأكيد العميل…» |
| `app/faq/page.tsx:147-149` | «يُحرَّر المبلغ من الـ Escrow بعد **٤٨ ساعة** من تأكيد العميل… أو بعد **٧ أيام** تلقائياً… تُحوَّل المبالغ إلى حسابك البنكي خلال **يوم عمل واحد**.» |
| `app/faq/page.tsx:168-170` | Accepts mada, Visa, Mastercard, Apple Pay, STC Pay, bank transfer |
| `settings/PaymentsTab.tsx:42` | «لا يوجد Payment Gateway الآن» — the one honest surface |

There is no gateway, no escrow account, no dispute window and no settlement path. This is not an unbuilt
feature — it is a **specific, dated, bilingual promise about handling other people's money, published today
on a legal-services platform**. Pull or reword it now, regardless of the PSP timeline. Treat this as the
highest-urgency item in Wave 0 alongside §3.1.

### 3.4 🔴 `N8N_WEBHOOK_SECRET` is very likely empty on the VPS — **confirm on the server, not from this file**

`.env.vps:37` sets `N8N_WEBHOOK_BASE_URL=https://n8n.asra3.com/webhook` (outbound configured) while
`.env.vps:40` `N8N_WEBHOOK_SECRET=` is **empty**.

**Caveat, stated because it changes who can conclude what:** `.env.vps` is **untracked** (`git ls-files`
returns "did not match any file"). It is a local working copy of the VPS environment, not the server's live
environment. It is strong evidence, not proof. **Verify on the VPS itself** before reporting it as fact.

If it is empty there too: `src/lib/n8n/dispatch.ts:42-44` sends no `X-Webhook-Secret` header, so outbound
messages go unauthenticated and **every inbound callback is rejected 401**. The entire WhatsApp
notification-status feature the owner is being shown would be inert on the live server. One-line env fix,
and a hard prerequisite for obs-18's states 2 and 3.

**Related, same handler:** `dispatchToN8n` never throws by contract (`dispatch.ts:29-55`). The caller at
`admin/service-orders/[id]/route.ts:212` awaits it and **discards the return value**, and the row was already
updated at `:122-124`. If n8n is down, the order goes `completed`, the admin gets `200 {success:true}`, and
the failure exists nowhere but the server console. The `{delivered}` boolean is sitting there unused —
writing it into `request_events` is the cheapest real improvement in that cluster.

### 3.5 🟠 `payments` rows are never UPDATEd

Five call-sites, all SELECT or INSERT, **zero `.update(`**. The lawyer finance dashboard can issue an
invoice but can never collect one; «المبالغ المحصّلة فعلياً» is structurally pinned at 0 for every manually
issued invoice. Cheapest fix in the fee-contract cluster, and a prerequisite for the cash-payment leg.

### 3.6 🟠 «محفظتي» renders blank rows in production

`/api/v1/wallet` returns raw `wallet_transactions` rows (`kind`/`amount`/`description`/`created_at`) and raw
`coupons` rows (`code`/`discount_type`/`discount_value`). The page reads `tx.type`/`tx.descAr`/`tx.date`/
`tx.amountAr` and `c.labelAr`/`c.descAr`/`c.discount`/`c.daysRemaining`. Every real row renders as a blank
line with a fallback amber clock icon. The mock arrays that make it look correct in review are dead in
production because the binding is `walletLoading && !isSupabaseMode`.

Filing a receipt into this wallet would be wasted work — **fix the mapper first.**

### 3.7 🟠 Admin internal notes are write-only

An admin types them at `admin/service-orders/page.tsx:581-584`; they persist to `metadata.internalNotes`
(`[id]/route.ts:107` on deliver, `:115` on cancel). But `buildOrderPrompt` deliberately excludes them
(`orderPrompt.ts:4-7`, reads only `md.intake` at `:36`) and nothing else in the panel renders them.

A note أ. أشرف saves for the team is invisible to أ. رامي **on the very screen it was written on**.
The feature's stated purpose is defeated.

### 3.8 🟠 Four more dead upload controls

| Surface | Defect | `file:line` |
|---|---|---|
| الصائغ — bulk upload | «أو ارفع كافة المرفقات دفعةً واحدة» switches to a dashed area with **no `<input>`, no `onClick`, no `onDrop`**. Clicking does nothing. It also triggers the «عصارة المرفقات» upsell banner. | `StepCase.tsx:270-284`, banner `:289-311` |
| Lawyer documents | `<input type="file" className="hidden" />` with **no `onChange`**. The picker opens, the selection is discarded. Live screen, real data. | `dashboard/lawyer/documents/page.tsx:147-150` |
| `/ai/vault` | Same dropzone defect as obs-25, but **carries `cursor-pointer`** — advertises clickability it lacks. `onDrop` handles `files[0]` only despite saying «الملفات». No upload call at all. | `ai/vault/page.tsx:116-141` |
| Storage meter (مستنداتي) | «١٠.٣ / ٥٠٠ ميجا» is a **hardcoded string**, the bar is `width: '2.1%'`, «٤٨٩ ميجا متاحة» invented. `docs` is in scope; `size_bytes` never summed. | `client/documents/page.tsx:590-602` |

That last one puts **three contradictory numbers on one screen**: 100 MB per file, 500 MB total, 489 MB free
— i.e. the page promises a file bigger than the free space it reports.

### 3.9 🟠 obs-15's bug exists in five more upload surfaces

The letter-upload defect is a "hold the live `FileList`, reset the input, then read `length`" ordering bug.
The identical pattern appears at:

- `components/legal-opinion/ContextStudy.tsx:121-125` (دراسة قانونية)
- `components/legal-opinion/ContextDueDiligence.tsx:84-88` (عناية واجبة)
- `components/legal-opinion/ContextCrossExam.tsx:258` (استجواب الشهود)
- `components/contracts/steps/review/StepRUpload.tsx:79` — worse: `handleFiles` is async and the reset fires
  synchronously mid-flight

**Owner can verify in five minutes:** if upload also silently does nothing in those four flows, it is the same
one-line bug ×5.

**Correction to obs-15's framing:** the file list and the red X **do exist and are correct**
(`LetterWorkflow.tsx:529-543`). Do not "add a list" — that would produce a duplicate. The fix is three lines
inside `handleLetterFile` (`:204-208`).

### 3.10 🟠 Two notification-preference screens, neither of which saves

- `/onboarding` step 4 — 4 generic options, filed into `auth.user_metadata` **that no code reads**.
- `/settings` `NotificationsTab` — a fully role-tailored 7-role category matrix (*exactly what obs-24 asks
  for, already built*) whose save button is a 2.5-second checkmark animation and nothing else
  (`NotificationsTab.tsx:117-120`).

A user can toggle every switch on both screens and change nothing. Whoever picks up obs-24 must build the
persistence (`PUT /api/v1/settings` → `user_settings.preferences` already exists, `route.ts:82, 93-97`) and
make the wizard write the **same key vocabulary** the settings tab uses — otherwise the label fix ships a
second lie on top of the first.

Minor: the wizard's default is `useState<string[]>(["case"])` (`page.tsx:711`) — «تحديثات القضايا» is
pre-ticked for a جهة حكومية and a موثّق alike.

### 3.11 🟠 The free daily AI consultation is un-submittable

`consultation/new/page.tsx:176` reads raw `basePrice` and ignores the catalog's `requiresPayment` / free-daily
flags, while the sibling `requests/new/page.tsx:45` reads them correctly. So the free question is priced at
49 ر.س → `needsPayment` true → gateway disabled → **cannot be submitted at all**.

`consultationsUsed` is a hardcoded `0` with an admitted TODO (`:179-181`), so the whole included/not-included
banner is decided by tier alone and never by real usage.

The codebase has **two different answers to "what does this service cost"**: `pricingRepository.ts:107` and
`requests/new/page.tsx:45` gate on `requiresPayment`; `consultation/new/page.tsx:176` does not.

### 3.12 🟠 Cancel and claim are indistinguishable in `request_events`

`admin/service-orders/[id]/route.ts:111-116` — the cancel branch sets `notifyTitle = "تم إلغاء طلبك"` but
**never touches `eventName`**, so it falls through to the `:57` default `service_request.status_changed`.
`RequestEvent.SERVICE_REQUEST_CANCELLED` exists (`src/lib/events.ts:79`) and is never used by this route.
The claim branch (`:59-61`) is equally opaque for the same reason.

With no `metadata` column on `request_events` to disambiguate (§4, hardening-4), nothing downstream can tell
"admin picked it up" from "admin killed it".

### 3.13 🟠 Status vocabulary collides and diverges

- `serviceOrders.ts:140-141` maps **both** `assigned` and `in_review` to the identical label «قيد التنفيذ».
  Statuses we already store cannot be told apart on screen.
- The same row reads differently to client and admin: `pending_assignment` = «بانتظار الاستلام» (client,
  `:139`) vs «جديدة» (admin, `page.tsx:34`); `completed` = «جاهز» vs «مُسلّمة».
- The admin filter chips cannot reach three live statuses — `pending_payment` (real and reachable, see
  `orderTransitions.ts:24-40`) and `draft` have no chip (`page.tsx:32-38`).

If the owner's 5-stage wording is adopted it must replace **both** maps, or the admin and the client will
describe the same order differently on the phone.

### 3.14 🟠 The specialty taxonomy: 24 pickers, 1 uses the shared constant

A shared canonical constant **already exists**: `src/constants/taxonomies.ts:9-41`, `LEGAL_TAXONOMY`, **31
entries** (30 subject codes `SA-00..SA-29` + `SA-99` precedents). Only 5 files import it.

- **Uses it in full:** 1 — `components/consultation/constants.ts:38-53` (the *public* booking wizard).
- **Imports and truncates:** 2 — `community/lawyers/page.tsx:69` (`.slice(0,7)`),
  `constants/lawsLibraryData.ts:286,292` (`.slice(0,5)` / `.slice(5)`).
- **Lookup only:** 3.
- **Local literals that ignore it:** 15+, with counts of 8, 8, 27, 27, 27, 15, 21, 19, 6, 27, 6, 8, 6, 8, 4, 3…

**The sharpest single instance of "nothing is complete":** the consultation flow is split in two. The public
wizard uses the library's 31; the **logged-in client wizard** imports the *draft module's* 21-item list
(`client/consultation/new/page.tsx:22` → rendered `:556`), and that string is what gets persisted as the
consultation's specialty at `:228`. Same product, two lists.

**Also:** the lawyer-directory filter is not merely inconsistent, it is **functionally broken** — chips send
`'labor'`/`'عمالي'` while the DB column holds whatever the lawyer typed free-hand, and the API does an exact
array-contains match (`api/v1/lawyers/route.ts:38-39`).

**And:** `components/legal-opinion/ContextConsult.tsx:7` asserts in Arabic that its 27 sections match the
legal library. **They do not overlap on a single id.** Anyone reading that comment will believe the taxonomy
is already unified.

**Count correction for the owner:** he specified "the library's 30 sections". `LEGAL_TAXONOMY` has 31
(30 + `SA-99`), and the corpus parser manifest (`scripts/parsers/schema_manifest.json`) has **35** values
(`'00'..'30','97','98','99','غير_مصنف`). Codes 30, 97 and 98 exist in the corpus but have **no label** in
`LEGAL_TAXONOMY`, so any law seeded under them renders with a blank category **in the library itself**.

### 3.15 Smaller, still real

- **Dead input feeding a live field.** `useDraftState.ts:230-244` — `JudgmentHeader` is imported by
  `StepCase.tsx:10` and **never rendered**; its gate `needsJudgment` (`:70`) is computed and never
  referenced. Seven judgment fields flow into `buildIntake()`'s `judgment` object permanently empty
  (`useDraftState.ts:128-131`). (Previously these were mock-filled with fabricated court and party names
  inside real orders; that was removed in Task C6. Now: dead input, live-but-always-empty payload.)
- **Four wizards, one upload engine, four incompatible usages.** `useOrderAttachments.ts` is shared, but draft
  calls `attachFile` one at a time with a private `doc.id→documentId` map (`StepCase.tsx:83`); contracts-review
  and legal-opinion call batch `attachFiles`; wargaming wraps `attachFile` to tag `memoAttachmentIds`
  (`page.tsx:866-870`); legal-opinion runs **two separate hook instances** (`page.tsx:153` and
  `LetterWorkflow.tsx:51`). The batch path — the one with per-file timeout handling, an accumulating error
  list, and «لم تتم محاولة رفع» reporting (`:117-160`) — is **not used by draft or wargaming**, so the
  flagship wizard has the weakest failure reporting of the four.
- **`obs-10`'s bug has a second site.** `api/v1/lawyer/dashboard/summary/route.ts:126-129` has the identical
  `.eq("actor_user_id", uid)` on `request_events` for the overview page's "recentActivity" block.
- **The «تحميل أنشطة أقدم» button has no `onClick`.** `lawyer/activity/page.tsx:345-351` — a dead control
  advertising pagination that does not exist. The route is `export async function GET()` with **no `request`
  argument**, so it cannot read a cursor even in principle (`:8`).
- **`profiles.email` is fetched and never rendered** on the admin panel (`route.ts:70` → `page.tsx:15`, client
  line at `:444-446` shows name/phone/date only). Free data for obs-18's box 1.
- **`obs-26` is desktop-only.** The type badge is `hidden sm:inline-flex` (`client/documents/page.tsx:181`),
  so on a phone the wrong «عقد» tag is invisible entirely.
- **A stale in-repo comment that reads like a verified finding.** `src/lib/draftInboxStore.ts:5` names
  "StepLaws (Drafter), wargame, direction-support" as consumers; the actual importers are only
  `ai/collector/page.tsx` and `services/researchService.ts`. Treat this repo's citation-bearing comments with
  the same suspicion as the audit's line numbers.

---

## 4. What the owner got wrong

Five items, stated plainly so nobody builds them.

| Ref | Owner's claim | Reality |
|---|---|---|
| **obs-16** | «طلباتي الذكية» is missing from the lawyer sidebar | **The link exists** — `navigation.sidebars.legal.ts:41` and `:170` → `/ai/orders`, with both pages rendering real per-user data. **But the owner's complaint is still valid as a discoverability finding, not a missing-feature one** (see below). |
| **obs-29 note** | The `payments_gateway` guard may be UI-only | **FALSE** — a real server guard exists. (It has a *different* hole; see §3.2.) |
| **obs-6 / obs-12** | "Developers stripped the annotated-attachment UI when wiring the API" | **Partly false.** `StepCase.tsx:222` still renders the description textarea **plus voice input**, in numbered «المرفق رقم N» cards, live in `/ai/draft`. The annotation was never removed from الصائغ — the other three wizards never had it. |
| **obs-15** | The uploaded-file list and the delete X do not exist | **They exist and are correct** (`LetterWorkflow.tsx:529-543`). The bug is three lines in `handleLetterFile`. |
| **obs-18 state 1** | The WhatsApp card should show «بانتظار التسليم» | The card correctly never renders on a non-delivered order (`page.tsx:492` gates on `completed`, with a rationale at `:468-490`). The implemented state 1 is "delivered, no confirmation returned" — a different and more honest thing. |

### 4.1 obs-16 is really a discoverability bug — do not dismiss it

«طلباتي الذكية» is the **10th item** inside the «نظامي AI» collapsible group
(`navigation.sidebars.legal.ts:41`), after ParaLegal, سؤال قانوني سريع, الصائغ القانوني, المجمّع البحثي,
محترف العقود, المحاكي الشامل, عصارة المرفقات and الرأي الفصل.

In all four of the owner's activity-log screenshots (02, 04, 06, 11), the sidebar is expanded and cut off by
the viewport at «المجمّع البحثي» — **item 5**. The link he says is missing is five rows below the fold.

He did not misremember. He could not see it. **S-sized fix:** move «طلباتي الذكية» to the top of the group,
or out of it entirely, next to «طلباتي» in the main list. This also strengthens Decision 1 in §7 rather than
weakening it — under either architecture, the entry point has to be visible.

### 4.2 One inverted instruction in the audit's own brief it asks to add the new contracts field to the n8n
allow-list "since a new metadata key may be silently dropped there". It **is** dropped — but by design.
`serviceOrders.ts:56` sets `receiver: "ai_workspace"`; `n8n/payload.ts:320` routes that through
`redactForAiWorkspace()`, which rebuilds `data` keeping only contact + service + order link
(`AI_WORKSPACE_METADATA_KEYS = ["service","serviceTitleAr","schemaVersion"]`, `payload.ts:120`). The entire
`metadata.intake` blob — including party names and national IDs — never reaches n8n, with a written rationale
at `payload.ts:22-30`. **Adding the key would be a deliberate privacy regression.** Mark this layer
"no change".

---

## 4.3 obs-21 and obs-22 — the two observations written as prose

These read as descriptions of how the platform works rather than as complaints, so they were easy to skip.
Both contain concrete, unbuilt asks. Verified by hand.

**obs-21 — the individual-client loop.** The audit states that deliverables are archived automatically:
«القضايا في قضاياي، العقود في عقودي، الفواتير في محفظتي، والمستندات في مستنداتي».

**This does not happen.** The delivery handler (`admin/service-orders/[id]/route.ts`) inserts into `cases`,
`contracts` and `wallet_transactions` **zero times**. Delivery writes `metadata.deliverable` on the order
row and nothing else. Combined with §3.6 (محفظتي renders blank rows anyway), three of the four arrows in
that sentence do not land. This is a **statement of intent presented as behaviour** — the same class of
problem as §3.3, just internal rather than public. **Effort: M** to wire the three archive writes.

**obs-22 — the corporate loop (`/dashboard/business`).** Two real feature asks buried in the prose:

| Ask | State |
|---|---|
| **خزنة وثائق المنشأة** — upload CR, articles of incorporation, powers of attorney once, auto-attached to every new order | **Absent.** No mention of السجل التجاري / عقد التأسيس / وكالة شرعية anywhere under `dashboard/business/`. **Effort: M.** |
| **تعدد المستخدمين المفوضين (Team Seats)** — HR manager, CFO ordering under the company account | **Mock.** `dashboard/business/team/page.tsx:141` renders a **hardcoded fake invite link** `https://nezamy.sa/invite/x7k2m9p`. There is no seat model, no invite route, no delegation. **Effort: L.** |

The company vault is the more valuable of the two and is a natural companion to Wave 3.1 (attachment
descriptions) — both are about not re-uploading the same document.

## 4.4 Explicitly excluded by the owner — do not build

Recorded so these do not resurface next round. From «🚫 ثانياً: بنود استبعدها المالك»:

1. ❌ Receipt invalidation / watermarking (Anti-Zombie Receipts)
2. ❌ 15-minute signed URLs for attachments
3. ❌ Case success-rate warnings

---

## 5. Build order

### Wave 0 — SECURITY, before أ. رامي gets an account

| # | Item | Effort | Ref |
|---|---|---|---|
| 0.1 | `admin/teams` must not mint full admins; remove the fictional roles screens | M | §3.1 |
| 0.2 | Close the consultation payment-gate body-key bypass | S | §3.2 |
| 0.3 | Pull the false Escrow / payment-methods claims from `StepPayment.tsx` and `faq/page.tsx` | S | §3.3 |
| 0.4 | Server-side intake validation for all four services | M | §2.3 |

### Wave 1 — one commit each, visible tomorrow

| # | Item | Effort | Ref |
|---|---|---|---|
| 1.1 | Dark-mode `gray-100` sweep (79 occurrences, 25 files) + the 5 onboarding headings | M | §2.2 |
| 1.2 | `handleLetterFile` ordering bug + the same bug in 4 more surfaces | S | §3.9 |
| 1.3 | Activity log: row `href` (`entityId` is already in hand and thrown away) | S | obs-5 |
| 1.4 | Activity log: `.or()` on `requester_user_id` — **two sites** | S | obs-10, §3.15 |
| 1.5 | 100 MB → 20 MB copy, **and** replace the fabricated storage meter | S | obs-27, §3.8 |
| 1.6 | Clickable dropzone: `client/documents`, `ai/vault`, lawyer documents `onChange` | S | obs-25, §3.8 |
| 1.7 | Dead bulk-upload dropzone in الصائغ + its upsell banner | S | §3.8 |
| 1.8 | Consultation banner: `basePrice={writtenOpinionPrice}` → `basePrice={total}` (`:760`) — **and `:461`, which the audit missed** | S | obs-29 |
| 1.9 | Free-daily AI consultation: respect `requiresPayment` | S | §3.11 |
| 1.10 | Admin panel unmounting on the «جديدة» tab | S | §1.2 |
| 1.11 | Name the cancel event; add `pending_payment`/`draft` chips | S | §3.12, §3.13 |
| 1.12 | `payments` UPDATE path so invoices can be collected | S | §3.5 |
| 1.13 | **Owner action:** set `N8N_WEBHOOK_SECRET` on the VPS | — | §3.4 |

### Wave 2 — the "half-done" repairs

| # | Item | Effort | Ref |
|---|---|---|---|
| 2.1 | **Promote `intakeValues.ts` to shared; `buildOrderPrompt` uses it.** Fixes obs-7 + done-9 + most of obs-18 | M | §2.1 |
| 2.2 | Activity log: JOIN `service_requests`, Arabic event map, real stat aggregates, working «تحميل أقدم» | M | obs-3, table-3 |
| 2.3 | Internal notes read-back on the admin panel | S | §3.7 |
| 2.4 | WhatsApp: record `{delivered}`, add the toggle, add manual resend (with a `messageId`/`kind` in the callback contract, or the card cannot tell resends apart) | M | obs-20 |
| 2.5 | Wallet API↔page mapper | M | §3.6 |
| 2.6 | Notification preferences: make **one** of the two screens actually persist, sharing key vocabulary | M | obs-24, §3.10 |
| 2.7 | Admin dropzone + «📁 مرفقات الطلب» container + client email in box 1 | M | obs-9 |
| 2.8 | Admin queue: search by order number | S | §6.1 |

### Wave 3 — features the owner asked for

| # | Item | Effort | Ref |
|---|---|---|---|
| 3.1 | Attachment description + type across all four wizards, and classified display in the admin | M | obs-6, obs-12 |
| 3.2 | Add-attachment on a pending order (**split from the L-sized edit — plumbing already exists**, see §6.2) | S | obs-2 |
| 3.3 | Letter: company fields + government reference number (`رقم المعاملة`) + government **sender** | M | obs-14 |
| 3.4 | Letter: ~14 new Saudi letter types | M | obs-13 |
| 3.5 | Contracts «الغاية الخاصة والمخاطر» field (5 layers, see §6.3) | S | obs-4 |
| 3.6 | Short order code + admin lookup | S | obs-1 |
| 3.7 | Taxonomy unification onto `LEGAL_TAXONOMY` | L | obs-11, table-5 |
| 3.8 | Admin sub-roles (أشرف / رامي) | L | obs-19 |
| 3.9 | 5-stage journey — **includes building the client activity trail that does not exist** (§6.4) | L | obs-17 |
| 3.10 | localStorage auto-save in the four wizards | L | hardening-2 |
| 3.11 | 48-hour one-time revision request | L | hardening-3 |
| 3.12 | Document quick actions (ربط بقضية / طلب مراجعة / تحليل AI / إرسال للمحامي) | L | obs-28 |
| 3.13 | Auto-classifier correction + manual tag override (**needs a migration — `attachments` has no type column**) | M | obs-26 |

### Wave 4 — fee contract and receipts

Split honestly into three buckets, not two:

**(A) Buildable now, zero external dependency.** Fee-contract entity with the five fee kinds, instalment
schedule, payment-method + mark-received transition, receipt with serial/تفقيط/QR/tax number, VAT
inclusive-exclusive. **Effort: L, not M.** Only three pieces already exist: the storage pipeline, the finance
page shell, and client-side `jsPDF`. Everything else is new — a migration (no invoices/receipts/fee tables
exist), a تفقيط function (none in repo), a QR package (**not installed**), and a `payments` UPDATE path
(§3.5). Two caveats: `payments.request_id` is NOT NULL, which forces the placeholder-`service_request` hack
at `lawyer/finance/route.ts:226-253` — a new fee-contract table must not inherit it; and a **server**-rendered
PDF is not possible with the installed deps, only a browser-side download. Decide which one you are promising
before scoping, because "auto-generated and sent" implies the server one.

**(B) Blocked on a PSP decision that has never been made.** `/pay/[token]` card leg. Cannot be scoped,
estimated or started. Token format, checkout call, webhook signature verification and refund path are all
provider-specific. The decision is not technical: it needs a Saudi merchant account (CR, national address,
IBAN in the firm's name), mada scheme enablement, an Apple Pay merchant ID plus a domain-verification file,
settlement and chargeback terms, and a stable public HTTPS webhook. **Any estimate offered before a provider
is named is fiction.**

**(C) Hidden by the A/B binary — WhatsApp delivery of the receipt.** Blocked on neither. Needs a WhatsApp
Business sender (Meta Cloud API number + approved template, or the parked n8n Phase-3 workflow). If A ships
without this, the receipt is generated and filed in-app but **not delivered** — say so up front.

---

## 6. Implementation notes that will otherwise be discovered the hard way

### 6.1 A short order code is currently pointless

The admin fulfilment console has **no text search at all** — `admin/service-orders/page.tsx:254` holds only a
status string, `:280` sends it as `?status=`, `:401` renders it as pills. A client who quotes his number over
WhatsApp (the exact flow `page.tsx:136` builds) hands support a string support cannot resolve.
**Order-lookup-by-number is arguably higher value than the code's cosmetics, and it is S.**

Also: the audit prices option (b) too high. `service_requests.id` is `text primary key` with **no default**
(`20260518:5`) and the value is generated in application code (`api/v1/service-requests/route.ts:203`).
Changing that expression gives new orders a short unique PK with **zero SQL** — cost is a mixed corpus and a
retry loop on `23505`. Every FK is `request_id text references service_requests(id)`, so nothing breaks.

And: `page.tsx:80-93` deliberately copies `order.id` so "what's copied is provably the same value the header
displays". If the header goes short and the clipboard stays long, that invariant silently becomes false.
**Display short, copy both** is the only version that keeps support able to resolve a ticket.

### 6.2 obs-2 should be split, and half of it is hours

The audit says the client "cannot add an attachment". True of the UI — but the plumbing is **fully built and
already used by two other client-facing pages** (`documentService.ts:326-329`, called from
`consultation/new/page.tsx:265` and `lawyer/cases/[id]/page.tsx:319`), and the RLS insert policy permits it
(`20260616_production_readiness_fixes.sql:106-110`).

This is the sharpest example of the owner's complaint: **a missing button on top of working infrastructure.**
Ship it before the L-sized facts/parties edit.

**Trap for the edit itself:** there are already three near-identical status sets that must not be conflated —
`REQUESTER_CANCELLABLE` (server authority, 5 statuses, `orderTransitions.ts:115-121`), `OPEN_ORDER_STATUSES`
(client presentation, 3, `openOrderStatuses.ts:37-41`), and `TIMELINE_STATUSES` (`page.tsx:29`).
`orderTransitions.ts:99-105` states as a design rule that the client and server sets are intentionally not
shared. An edit gate must be a **fourth** set on the server — cancel-safe and edit-safe are different
questions once an admin has claimed the row. Note also `service-requests/[id]/route.ts:160` `ALLOWED_*`
currently blocks the metadata write.

### 6.3 obs-4 touches five layers, two of which the audit's file list missed

1. `src/hooks/useContractsState.ts` — the state, `buildIntake()` and the return bag all live here, **not** in
   `app/ai/contracts/**` or `components/contracts/steps/**`. Without `:47-48`, `:165` and `:301` the textarea
   has nowhere to store its value.
2. `src/app/ai/contracts/page.tsx` `submitRows` (`:51-85`) — the pre-submit recap the client confirms. Omit it
   here and the client types their protection requirements and sees a confirmation that does not mention them.
3. `StepContext.tsx` — the field itself. One edit covers both paths: it is step 2 on the simple path
   (`types.ts:34-38`) and step 3 on the detailed path (`types.ts:9-16`), but both render from the single
   `s.step === "context"` branch at `page.tsx:317`.
4. `orderIntake.contracts.ts` + its test.
5. The Arabic label map (`intakeValues.ts`) — and after Wave 2.1, that automatically covers the admin too.
6. **n8n: no change.** See §4.

**One decision to surface:** the client's own request preview (`client/requests/page.tsx:396`) renders only
`req.description`, and draft mode sets that to `contractDesc.slice(0, 200)` (`useContractsState.ts:204`) — so
the risks text will be invisible there. Review mode already solved the identical problem at `:257` by joining
two fields. Either mirror `:257` or accept the omission knowingly.

### 6.4 obs-17 hides a second deliverable

The owner asks for the 5 stages "in the activity log". **There is no client-facing activity log to put them
in** — and the code knows it: the comment at `client/requests/page.tsx:441-449` explicitly says the trail is
always empty and that "There is no event log on `/ai/orders/[id]` either".

The data exists (`request_events`, populated by `recordEvent` at every write site, and already returned by
`GET /api/v1/service-requests/[id]:117`), but the `ServiceOrder` client type drops it and no component renders
it. That is a separate deliverable hiding inside obs-17, and it is the larger half.

Prerequisite: a shared event→Arabic map. The only translation layer today is a three-case inline ternary at
`client/requests/page.tsx:466-469` matching **legacy** free-text names (`"created"`,
`"contract_draft_saved"`, `"cancelled_by_client"`) — none of which the namespaced writers produce any more.
So even a populated trail would print raw English identifiers to an Arabic client.

Also: fixing stages 3/4 without first fixing the `assigned`/`in_review` collision (§3.13) just adds a third collision.

### 6.5 A second admin tier: where the cost actually is

The column exists. `service_requests.assigned_to uuid references auth.users(id)` (`20260518:12`) is set today
(only ever to the caller's own id, `[id]/route.ts:60`), is load-bearing in ~20 RLS clauses, and gates
deliverable upload at `api/v1/documents/route.ts:132`. **obs-8 is a UI + one-action gap, not a schema gap** —
which is why it is M and not L.

The tier itself is L, and the cost is not the column:

- **4 gate helpers, each a flat boolean today:** `access-control.ts:101-120` `requireAdmin()` — **31 route
  files** under `api/v1/admin` each need a capability decided one at a time (*that per-route triage is what
  makes it multi-day*); `assertRole.ts:46` (a drafter would otherwise silently pass every lawyer/firm
  allow-list); `proxy.ts:324-328` (`ROUTE_ACCESS` is prefix→user_type and cannot express "admin, but not
  `/dashboard/admin/settings`"); `UserTypeGuard.tsx:32`.
- **RLS: 51 occurrences of `user_type = 'admin'` across 10 migration files.** Mitigating factor: most admin
  routes bypass RLS with `createServiceClient()` anyway, so you can ship app-layer enforcement first and
  tighten RLS second.
- **Sidebar:** `AdminSidebar.tsx:19-65` is a flat list of 25 links with no role field.
- **The two mock screens must go** or the platform shows one tiering and enforces another.

**Keep self-claim as a takeover.** `[id]/route.ts:16-22` documents why: it is the only unstick path for an
order held by an absent admin, since `documents/route.ts:132` lets only the assignee upload. Add
assign-to-someone-else *alongside* it, not instead of it.

**One asymmetry that will bite the رامي design:** deliver has **no** assignee check (`[id]/route.ts:62-111`,
guarded only by `requireAdmin` at `:30`) while document upload does. A drafter tier scoped by assignment would
be enforced on the upload but not on the completion — an unassigned admin can still mark someone else's order
delivered.

### 6.6 One infra item invisible to code review

The `documents` bucket's RLS policies are **not a tracked migration**. `20260628_documents_upload.sql:33-49`
has them commented out; `20260629_payments_and_storage_policies.sql:15-21` explains they were removed because
`storage.objects` is owned by `supabase_storage_admin`. They live in `supabase/storage_policies_documents.sql`
as a manual Dashboard step.

If they were never applied on prod, **every** upload surface would fail — but loudly (red banner via
`documentService.ts:388` → `useOrderAttachments.ts:79/135` → `LetterWorkflow.tsx:523-527`). The reported
symptom is silence, so this is not the cause of obs-15. **Worth confirming once in the Dashboard anyway.**

---

## 7. Decisions only د. محمد can make

| # | Question | Why it blocks |
|---|---|---|
| 1 | **obs-16 vs «قرار المالك المعماري الحاسم» — the two contradict each other.** Reading A (a separate orders page) is **already shipped and already linked**, cost zero. Reading B (the activity log *is* the order center) is unbuilt, ~1–1.5 days plus a prod migration. | Determines whether Wave 2.2 is polish or the product. *A cheap way to honour both: fix obs-5's `href` so the log points **at** `/ai/orders` instead of competing with it.* |
| 2 | **Which taxonomy is canonical?** `LEGAL_TAXONOMY` = 31. Corpus manifest = 35. The owner said 30. Codes 30/97/98 have no label and render blank in the library today. | Wave 3.7 cannot start. |
| 3 | **Which PSP?** | Wave 4(B) cannot be estimated at all. |
| 4 | **Receipt PDF: server-rendered or browser download?** Only the second is possible with installed deps. "Auto-generated and sent" implies the first. | Changes Wave 4(A)'s architecture. |
| 5 | **done-3: is the wargaming memo required as a *file*, or is text-or-file correct?** The current behaviour is deliberate and cites owner field-testing (`ai/wargaming/page.tsx:539`). | Product change vs bug. |
| 6 | **23 letter types on one step — grouped, or a searchable list?** | Wave 3.4 UX. |

---

## 8. Method

- 15 verification agents, `effort: high`, read-only, one cluster each; 8 adversarial challenge agents on every
  verdict that contradicted the owner. 23 agents, 674 tool calls, ~2.2M tokens.
- Every `file:line` in this document was re-resolved by the agent that cites it. The source document's line
  numbers were frequently stale — as were, in two cases, this repo's own comments (§3.15).
- No React test framework exists in this repo and none was added; UI claims were verified by reading the
  state→render binding and the actual `className` strings.
- Full per-agent output: `subagents/workflows/wf_aca014cd-258/journal.jsonl`.

---

## 9. What was built, and what is left

### 9.1 🔴 NEEDS A HUMAN, NOT A COMMIT — the legal documents still promise Escrow

The FAQ and the floating widget were cleaned. Two more surfaces carry the same claims, and I deliberately
did **not** touch them: they are **binding legal documents for a law firm**, and rewriting a firm's terms is
د. محمد's call, not a developer's.

**`src/app/terms/page.tsx`** — Arabic and English:

| Line | Claim |
|---|---|
| :24 / :140 | Defines «نظام Escrow» as the financial guarantee system under which the platform holds fees |
| :63 / :179 | **Prohibits** providers from taking payment outside the Escrow system |
| :72 | Fees are deposited into an Escrow account on signature and released on completion |
| :74 | Refund policy: full refund before the service starts, partial on breach |
| :92 | **Caps liability** at "the fees held in Escrow for the transaction" |
| :102 | On account closure, funds held in Escrow are returned |

**`src/app/refund-policy/page.tsx`**:

| Line | Claim |
|---|---|
| :26-29 | A whole section: «نظام الضمان المالي (Escrow) وأثره على الاسترداد» — all fees are held in Escrow on payment |
| :37 | «**ضمان ١٤ يوماً**» — a 14-day full refund guarantee on subscriptions |
| :44+ | Refund rules for individual service fees |

There is no escrow account, no held funds, and no refund mechanism. The liability cap at `terms:92` is the
sharpest problem: it limits the firm's exposure to a sum that is always zero, which is not a limitation a
court would read the way the drafter intended.

**Recommended:** د. محمد reviews and rewrites both, or they are temporarily replaced with a statement that
fees are arranged directly with the firm. Either way it is a legal decision.

### 9.2 Built and committed

| Commit | What |
|---|---|
| `3042327` | Dark-mode sweep — 121 occurrences, 34 files (79 × `gray-100`, 42 × `gray-200`) |
| `1991722` | Escrow / card-brand / SAMA claims removed from the FAQ and the floating widget |
| `59e25ee` | Admin console stops showing a permission tier nothing enforces; invite names the grant |
| `fc4255b` | Server-side intake validation for all four services + the payment-gate object mismatch |
| `a879f6e` | `intakeValues` promoted to shared — the admin brief now renders Arabic |
| `340f23d` | Activity log rebuilt: admin events visible, JOIN, Arabic map, clickable rows, real stats, pagination |
| `9728eb0` | Admin queue: panel survives claim on «جديدة», internal notes readable, WhatsApp toggle + resend + failure recorded, Arabic dropzone, search |
| `95937c5` | Four file pickers that discarded the selection; two dead controls in الصائغ |
| `59cb904` | Documents: 20 MB truth, real storage meter, three dead upload controls |
| `ed87aaa` | Consultation: banner matches the total; the free daily question is submittable |
| `5c5969e` | Invoices collectable (cash / bank transfer); wallet stops rendering blanks |
| `08ca9dd` | Notification preferences actually persist, and follow the user's role |

### 9.3 Not started — needs an owner decision first

- **Taxonomy unification** (§3.14) — blocked on Decision 2: 31 vs 35 vs "30".
- **The two-tier admin model** (§6.5) — blocked on Decision 1 about scope; the console is now honest about
  not having it, which was the urgent half.
- **The 5-stage journey** (§6.4) — needs a migration and hides a second deliverable (the client activity
  trail does not exist).
- **Fee contracts and receipts** (Wave 4) — bucket A is buildable but L-sized; B is blocked on a PSP;
  C needs a WhatsApp Business sender.
- **Letter types, company fields, attachment descriptions, short order code, edit-pending, auto-save,
  revisions, cloud links, document quick actions, the attachment classifier migration** — all still open.

### 9.4 Verification actually performed

Not just `tsc` and tests — those cannot see any of the UI findings.

- Dark mode: 449 elements measured for real WCAG contrast in a browser at `prefers-color-scheme: dark`
  across `/register/provider`, `/register/client`, `/login`, `/partners`, `/pricing`,
  `/services/individuals`. **0 real failures.** (Three apparent failures were artifacts of my own
  measurement — `lab()` colours parsed as RGB, and a translucent `bg-white/10` overlay. Both re-measured.)
- FAQ: loaded live, every question expanded, scanned for Escrow / ساما / TLS / card brands / the 48-hour and
  72-hour promises. **Zero hits.** The `payment` category still has 2 entries, so no tab falls into the
  empty state.
- `/terms`, `/refund-policy`, `/privacy`, `/refund` fetched and scanned — which is how §9.1 was found.
- The admin-brief fix is pinned by a regression test asserting the owner's exact screenshot strings are
  present in Arabic and that no English storage key or Latin letter survives.
- All four upload handlers re-read to confirm snapshot-before-reset ordering.

**Still unverified in a browser** (they sit behind login, and no credentials were used): the letter upload,
the documents vault, the admin queue panel, the consultation banner. Each carries an exact click-path in the
agent reports for whoever tests next.
