# Review Gate + The Three Remaining Services — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the platform promising a human review that was never recorded, then convert محترف العقود · المحاكي الشامل · الرأي الفصل to the same manual-fulfillment pipeline الصائغ القانوني already uses.

**Architecture:** The order engine is built and service-agnostic — `service_requests` with `receiver='ai_workspace'`, the admin queue, entitlement-checked downloads, n8n dispatch. Nothing there changes. Each service needs three things: a real file-upload path, an intake validator, and a submit step that calls `createServiceOrder`. `BetaReviewGate` gets an optional payload prop so a wrapped tool either creates a real order or stops claiming one exists.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase, Tailwind, Framer Motion. Tests: `node --test` (Node 24 native TS), zero new dependencies.

**Predecessor:** `docs/superpowers/plans/2026-08-14-manual-fulfillment-order-pipeline.md` (complete, merged at `c5f84ed`).

## Global Constraints

- **No new npm dependencies.**
- **Next.js 16 uses `src/proxy.ts`, NOT `middleware.ts`.**
- All user-facing copy is Arabic, RTL — including every API error message.
- `npm run test:unit` baseline is **20 pass / 0 fail, pristine output**. Never regress it.
- Service keys are exactly `draft` · `contracts` · `wargaming` · `legal_opinion`; order types exactly `ai_draft` · `ai_contracts` · `ai_wargaming` · `ai_legal_opinion`. All four are already valid in the live database.
- **Never weaken these existing security properties:** `attachment.request_id === order.id` gates every download; every refusal branch of a download route returns one byte-identical 404; admin routes use `createServiceClient()` behind `requireAdmin()`; `ai_workspace` orders are excluded from lawyer marketplace browse.
- Side channels (`recordEvent`, `recordNotification`, `dispatchToN8n`) are best-effort and never break the primary write.

---

## The problem being fixed first

`BETA_REVIEW_MODE = true` (`src/lib/betaConfig.ts:40`). `BetaReviewGate` hides an AI tool's output and offers **"إرسال للمراجعة الذكية"** with a stated turnaround of ٤–٢٤ ساعة. The button is:

```tsx
onClick={() => setSubmitted(true)}
```

`grep -c "fetch\|apiMutate\|supabase\|createServiceOrder" src/components/BetaReviewGate.tsx` → **0**. Nothing is persisted, nobody is notified, a refresh discards it.

**52 reachable call sites** across lawyer, corporate, government and NGO tools. (56 files reference it; 4 are inside الصائغ's now-hidden steps and unreachable.)

Every client who pressed that button was told a human team had their request. No record was ever created.

---

## File Structure

**Create:**
| Path | Responsibility |
|---|---|
| `src/hooks/useOrderAttachments.ts` | Reusable real-upload hook, extracted from `useDraftState` |
| `src/components/orders/OrderSubmitPanel.tsx` | Shared review-and-send panel |
| `src/lib/services/orderIntake.contracts.ts` | Contracts intake types + validator |
| `src/lib/services/orderIntake.wargaming.ts` | Wargaming intake types + validator |
| `src/lib/services/orderIntake.legalOpinion.ts` | Legal-opinion intake types + validator |
| `src/lib/services/orderIntake.*.test.ts` | Unit tests per validator |

**Modify:**
| Path | Change |
|---|---|
| `src/components/BetaReviewGate.tsx` | Optional `orderPayload`; real order or honest copy |
| `src/app/ai/wargaming/page.tsx` | Real upload, hide theatre, submit step |
| `src/app/ai/contracts/page.tsx` + `src/components/contracts/**` | Both modes |
| `src/app/ai/legal-opinion/**` | Seven sub-flows, state re-plumbing |
| `src/proxy.ts` | Protect `/ai/legal-opinion` |

---

## Task A1: Make the review gate honest

**Files:**
- Modify: `src/components/BetaReviewGate.tsx`

**Interfaces:**
- Consumes: `createServiceOrder` from `src/lib/services/serviceOrders.ts`
- Produces: `BetaReviewGateProps.orderPayload?: () => OrderPayload | null`

- [ ] **Step 1: Add the payload prop**

```ts
export interface BetaReviewOrderPayload {
  service: ServiceKey;
  title: string;
  description: string;
  intake: Record<string, unknown>;
  attachments?: OrderAttachment[];
}

interface BetaReviewGateProps {
  toolId?: string;
  toolName?: string;
  reviewScope?: "role" | "legal-data";
  children: React.ReactNode;
  forceShow?: boolean;
  /** When supplied, pressing send creates a REAL order. When absent, the gate
   *  must not claim a human will review anything — see Step 3. */
  orderPayload?: () => BetaReviewOrderPayload | null;
}
```

- [ ] **Step 2: Wire the send button when a payload exists**

Replace `onClick={() => setSubmitted(true)}` with an async handler that calls `createServiceOrder(...)`, and only sets `submitted` **after** the order is created. On failure show an Arabic error and leave the button usable — the one thing this task exists to prevent is telling the user their request was received when it was not.

Show the real order id and a link to `/ai/orders/<id>` in the success card, so the claim is checkable by the person reading it.

- [ ] **Step 3: Make the no-payload path stop lying**

When `orderPayload` is absent or returns `null`, the card must **not** say a request was received or promise ٤–٢٤ ساعة. Replace that copy with an honest state — the tool's automatic output is not available yet, with a link to the services that do work (`/ai/draft`, and later the three from this plan).

Keep the button hidden entirely in this state rather than showing a disabled one; a disabled "send" still implies sending is the intended outcome.

- [ ] **Step 4: Verify**

State in your report, for both paths: exactly what the user sees, what network call is made, and what exists in the database afterwards.

Run: `npx tsc --noEmit`, `npm run test:unit` (20/0 pristine), `npm run build`.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(beta): stop promising a human review that was never recorded"
```

---

## Task A2: Audit the 52 live gates

**Files:**
- Create: `docs/BETA_REVIEW_GATE_AUDIT.md`

- [ ] **Step 1: Enumerate every reachable gate**

```bash
grep -rln "BetaReviewGate" --include=*.tsx src/app src/components | grep -v "BetaReviewGate.tsx"
```

For each, record: route, tool name, whether the step is reachable by a user today, and whether the tool holds enough real user input to build a meaningful order.

Four call sites under `src/components/draft/steps/` are on steps excluded from `CLIENT_VISIBLE_STEPS` — mark them unreachable and confirm that from `draftConstants.ts` rather than assuming.

- [ ] **Step 2: Classify**

Three buckets: **wire now** (this plan's services), **honest copy** (real input exists but out of scope today), **dead** (unreachable).

Do not wire anything outside this plan's scope. The point of this task is an accurate map, not more code.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: audit of every live BetaReviewGate call site"
```

---

## Task B1: Extract the real-upload hook

Three services need genuine file uploads and none has one. `useDraftState` already contains a correct implementation — extract it rather than writing it three more times, since it encodes hard-won behaviour: revert the display name on failure, map the demo-mode token to Arabic, and never let the client believe a file was attached when it was not.

**Files:**
- Create: `src/hooks/useOrderAttachments.ts`
- Modify: `src/hooks/useDraftState.ts` (consume the hook)

**Interfaces:**
- Produces: `useOrderAttachments()` returning `{ attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError }`

- [ ] **Step 1: Extract, preserving behaviour exactly**

Move `attachFile`, `removeAttachment`, `uploading`, `attachError` and `uploadedAttachments` out of `useDraftState` into the new hook. `attachFile` must keep returning the created `OrderAttachment` — `StepCase` depends on the returned `documentId` to wire per-row removal.

Keep the demo-mode mapping: `uploadDocumentFile` throws the literal `upload_unavailable_demo`, which must never reach a user.

- [ ] **Step 2: Make `useDraftState` consume it**

`useDraftState` re-exports the same names so `/ai/draft` keeps working with **zero changes to its components**. Verify by diffing the public surface of the hook before and after.

- [ ] **Step 3: Verify no regression in the shipped service**

Trace and state in your report: uploading a case file, a failed upload reverting the name, removing a file, and removing a whole support-doc row — all still behave as before.

Run: `npx tsc --noEmit`, `npm run test:unit` (20/0), `npm run build`.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(orders): extract the real-upload hook for reuse across services"
```

---

## Task B2: Intake validators for the three services

**Files:**
- Create: `src/lib/services/orderIntake.wargaming.ts` + `.test.ts`
- Create: `src/lib/services/orderIntake.contracts.ts` + `.test.ts`
- Create: `src/lib/services/orderIntake.legalOpinion.ts` + `.test.ts`

Follow `src/lib/services/orderIntake.ts` exactly: pure, no I/O, accumulate **all** errors before returning, validate the `service` discriminant, and coerce `documentId` with `String()` — **not** `typeof v === 'string'`. That last point is not stylistic: `attachments.id` is Postgres `bigserial`, which PostgREST serialises as a JSON **number**. A string-only guard silently produced an empty attachment list while `tsc`, tests and build all stayed green.

- [ ] **Step 1: Write failing tests first for each validator**

Cover per service: a well-formed intake; a wrong `service` discriminant; a missing required field; a too-short free-text field; a malformed attachment; **a numeric `documentId`** (the bigserial regression); and that errors accumulate rather than short-circuit.

- [ ] **Step 2: Implement**

Shapes, derived from the mapping of each wizard:

```ts
// wargaming
{ schemaVersion: 1; service: "wargaming";
  role: "plaintiff"|"defendant"|"advisor"; area: string;
  caseSummary: string;               // min 20 chars
  targets: string[];                 // at least one
  memoText?: string;                 // required IF targets includes the critique target
  attachments: OrderAttachment[] }

// contracts
{ schemaVersion: 1; service: "contracts";
  mode: "draft"|"review";
  // draft:
  complexity?: "simple"|"detailed"; contractType?: string; language?: string;
  parties?: { one: unknown; two: unknown }; contractDesc?: string;
  selectedClauses?: string[]; additionalClauses?: string[];
  // review:
  representing?: string; concerns?: string; otherParty?: string;
  attachments: OrderAttachment[] }   // review REQUIRES at least one

// legal_opinion — one order type, sub-type discriminated
{ schemaVersion: 1; service: "legal_opinion";
  outputType: "consult"|"study"|"memo"|"research"|"due_diligence"|"cross_exam"|"letter";
  topicArea?: string; description?: string; question?: string;
  settings?: Record<string, unknown>;   // depth/structure/sources — advisory to the admin
  letter?: Record<string, unknown>;     // letter sub-flow fields
  attachments: OrderAttachment[] }
```

Contracts **review mode requires at least one attachment** — reviewing a contract nobody uploaded is not a fulfillable order.

- [ ] **Step 3: Verify**

Run: `npm run test:unit` — all new tests pass, previous 20 still pass, output pristine. `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(orders): intake validators for contracts, wargaming and legal opinion"
```

---

## Task C1: المحاكي الشامل → real orders

The simplest of the three: one 677-line file, no sub-components.

**Files:**
- Modify: `src/app/ai/wargaming/page.tsx`

- [ ] **Step 1: Keep what is real, hide the theatre**

**Keep visible:** step 1 (`role`, `area`, case-summary textarea with voice input) and step 2 (target toggles — they tell the admin which angles the client wants, functioning as a checklist).

**Hide:** `SimulatingLoader`, `buildPoints()`'s generated points, the `ActionCard` curation UI, and `PolishPanel`. Hide, do not delete.

The `ActionCard` edit textarea (line ~178) is the one to be most careful about: it looks like the user is refining real output, but the edit is discarded. **Do not carry any variant of it forward** — a box users type into that goes nowhere is exactly the pattern this whole effort exists to remove.

- [ ] **Step 2: Real uploads**

Line ~376 does `setCtx({...ctx, file: f.name})` — the `File` is discarded. Replace with `useOrderAttachments()` from Task B1.

- [ ] **Step 3: The critique target needs an input that does not exist**

One target is **نقض المذكرة** (critique the memo), which implies the client supplies a memo. No such field exists — `MOCK_MEMO_BASE` was always used instead. Add a memo textarea (or attachment) shown **only** when that target is selected, and make it required by the validator in that case.

Without this, selecting that target produces an order the admin cannot fulfil.

- [ ] **Step 4: Submit step**

Add the review-and-send step calling `createServiceOrder({ service: "wargaming", ... })`.

- [ ] **Step 5: Verify + commit**

Trace each of the four targets and state what the admin receives for each. Run `npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

```bash
git commit -m "feat(wargaming): submit a real order instead of simulating one"
```

---

## Task C2: محترف العقود — draft mode

**Files:**
- Modify: `src/app/ai/contracts/page.tsx`, `src/hooks/useContractsState.ts`, `src/components/contracts/steps/draft/**`

- [ ] **Step 1: Keep the real steps**

Keep: **parties** (genuine), **domain** (contract type + language), **context** (description, court type). Keep the **clauses** checklist — the static menu is a legitimate way for a client to say what they want included, provided the fake per-clause `aiSuggestion` text is removed.

Remove the decorative "ارفع عقوداً سابقة" dropzone in the context step — it is a styled `div` capturing nothing.

- [ ] **Step 2: Hide the theatre**

Hide **bestprac** (fake 2.2s search over a list `page.tsx` hard-codes to `[]`), **drafting** (one fixed labour-contract template regardless of input, whose copy button copies the template rather than the user's edits), and **approval**'s fake voice recorder and hardcoded `AI_SUMMARY_POINTS` — which describe a lawyer-engagement contract no matter what was drafted.

**review**'s `buildChecks()` is genuine deterministic logic over real state — keep it, but strip the fake staggered "AI scanning" reveal and the canned `PROPOSED_FIXES`.

- [ ] **Step 3: Submit step + commit**

`createServiceOrder({ service: "contracts", intake: { mode: "draft", ... } })`.

```bash
git commit -m "feat(contracts): draft mode submits a real order"
```

---

## Task C3: محترف العقود — review mode

Review mode's entire premise is "upload your contract and we analyse it". **There is no upload.** `StepRUpload`'s dropzone is a styled `div` with no `<input type=file>`, no drop handler, and no file state — and although labelled متطلب, `canProceed()` only checks `contractType`, so it is completable with nothing attached.

**Files:**
- Modify: `src/components/contracts/steps/review/**`, `src/hooks/useContractsState.ts`

- [ ] **Step 1: Build the upload**

Wire `useOrderAttachments()` into `StepRUpload`. Make `canProceed()` require **at least one uploaded attachment** — matching the validator from Task B2.

- [ ] **Step 2: Keep identity, hide the mock analysis**

Keep `r_identity` (representing / concerns / other party — all genuine). Hide `r_analysis`, whose `contractClauses` is a hardcoded array of five fictional clauses the original author labelled `// Mock Clauses`, and everything downstream of it.

- [ ] **Step 3: Submit step + commit**

```bash
git commit -m "feat(contracts): review mode uploads a real contract and submits an order"
```

---

## Task C4: الرأي الفصل → real orders

The largest and the only one with pre-existing data-loss bugs.

**Files:**
- Modify: `src/app/ai/legal-opinion/page.tsx`, `_components/**`, `src/proxy.ts`

- [ ] **Step 1: Protect the route**

`/ai/legal-opinion` is absent from `src/proxy.ts`'s PROTECTED list, so **any visitor with the URL runs every step with no account at all**. The PRO badge only filters the catalog card. Add it to PROTECTED alongside `/ai/secretary` and the others.

- [ ] **Step 2: Re-plumb the fields that are silently discarded**

These are real inputs held in local `useState` and never lifted to the parent, so they can never reach an order:
- `ContextMemo.tsx:29-32` — audience, side
- `ContextResearch.tsx:43-46` — researchType, compareWith, keywords
- `ContextDueDiligence.tsx:45-62` — nearly every field

For each, either lift it into the order payload or remove the control. **Do not leave a control that implies the choice was saved.** State which you chose per field and why.

- [ ] **Step 3: One order type, seven sub-types**

`ai_legal_opinion` already covers all seven flows; discriminate with `metadata.intake.outputType`. Do not add order types.

**Keep** each sub-flow's context step (they are genuine intake). The cross-exam flow is the best-wired — it already composes a clean text block an admin can act on. The letter flow's steps 1-3 are a complete intake on their own.

**Hide** every `Processing` step and `ResultView` / `CrossExamResultView`, which are 100% canned.

**`StudyDocumentEditor` is the hard case:** a well-built curation UI over entirely fabricated seed content. There is no partial version — hide it with `ResultView`. Do not attempt to keep the editor with empty content.

**One exception worth preserving:** the letter flow's `fullLetterText` is built from the user's genuine step 1-3 input, not fabricated. Carry it into the order as the admin's starting draft rather than discarding it.

- [ ] **Step 4: Real uploads**

`ContextStudy`, `ContextDueDiligence` and `ContextCrossExam`'s file mode all capture `File.name` only. Wire `useOrderAttachments()`. Letter "attachments" are free-text labels, not files — leave them as labels and say so in the payload.

- [ ] **Step 5: Route the quick-chat shortcut**

The top-of-page quick chat currently skips the context step and jumps to processing. Land it in the submit flow instead.

- [ ] **Step 6: Verify + commit**

State what the admin receives for each of the seven sub-types.

```bash
git commit -m "feat(legal-opinion): seven sub-flows submit real orders"
```

---

## Task C5: Owner QA checklist for the three services

**Files:**
- Modify: `DEPLOY_AND_SMOKETEST_RUNBOOK.md`

- [ ] **Step 1: One round-trip per service**

Extend the existing checklist in the same أين / ماذا تفعل / ✅ المتوقع format. Each service: submit → appears in queue → admin opens attachments → deliver → client downloads.

Include a check that a tool still wrapped in `BetaReviewGate` without a payload **does not** claim a request was received.

- [ ] **Step 2: Commit**

```bash
git commit -m "test: owner QA checklist for the three converted services"
```

---

## Deferred / not in this plan

- **T6e** — self-completion on non-`ai_workspace` receivers.
- **T10b** — delivery status surfaced in the admin UI.
- **Google sign-in** — `docs/superpowers/plans/2026-08-14-google-signin.md`, unstarted.
- **Wargaming badge mismatch** — header says "MAX فقط", `access-control.ts:68` gates at `pro`. Pre-existing, cosmetic, flagged for a decision.
- **The ~48 other gated tools** — Task A2 maps them; wiring them is a separate effort.
