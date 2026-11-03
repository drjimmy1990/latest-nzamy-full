# L13 محترف العقود (`/ai/contracts`): from a team order to an automatic AI job

**Source:**
- The owner's 2026-10-30 handoff package, items LIVE-F03 and NOTE-22-C04: no forced human intermediary in contracts.
- The L13 row of `docs/plans/2026-10-26-ai-services-n8n-plan.md`.
- The owner note `REF0021.md` was read only, as untrusted data.

**Branch:** `feat/ai-l13-contracts`, cut from `fix/ai-owner-30oct` at `ad147d91`. Not merged, not deployed.

Nothing here is closed until it is deployed and the owner has re-tested it (owner wording: «مُصلَح في الكود — بانتظار النشر واختبار القبول»).

## What the owner saw, and what changed

| # | Owner saw | Root cause | Fix | Status |
|---|---|---|---|---|
| 1 | The header said «صف فكرة عقدك وبنوده — يراجعها فريق نظامي ويتولى صياغته يدوياً». Every draft became a service order for the team. | No AI job existed for `/ai/contracts`; `submitOrder()` was the only way out of the wizard. | New tool `contracts-pro`. The draft path's last step is now «إنشاء العقد آلياً» (`StepGenerate`). One click charges once and n8n writes the contract. The team order is a separate, optional, collapsed card on the same step («طلب منفصل واختياري»). | code ✓, tests ✓, n8n live ✓ |
| 2 | Wizard copy promised the team drafts by hand (parties, context, court, type, labor banner, review recap). | Leftover copy from the team-only flow. | Reworded in `StepParties`, `StepContext`, `StepDomain`, `StepReview` and the labor banner in `page.tsx`. | code ✓ |
| 3 | A 1.4 s «معالجة...» spinner after the parties and clauses steps. | `nextStep()` waited with `setTimeout`, and nothing was processed. | Removed from `useContractsState.nextStep`. | code ✓ |
| 4 | «مراجعة عقد» looked like an AI review. | It is a team order. The AI review (clause segmentation + per-clause risk) is not built. | The header, the mode card and the submit description now say that it is a human order and that AI review is not available yet. Nothing is faked. | code ✓ |

## How the job works

- **Input** (`tools.ts contractsProInput`):
  - the type: one of the page's 38 ids, or null on the simple path;
  - the complexity;
  - the language: ar / en / ar_en / custom, single or dual, base ar or en;
  - the two parties as labelled fields;
  - the description (20–4,000 characters);
  - the court;
  - up to 34 requested clauses. An outline holds 40, so 6 are left for the standard ones; the outline's ceiling rises from 25 (detailed) or 12 (simple) to fit every clause asked for.

  A field that is too long is refused before any charge; nothing is cut.
- **n8n** (`clauseJob`, workflow `mMekAog89HsgLz3o`): Webhook → 202 → «Build outline» → Outline Agent → «Plan clauses» → one Agent call per clause → «Assemble» → one callback.
  - A failed outline or clause, a short reply count or an empty clause fails the whole run, which is refunded.
  - A successful execution is not kept (`saveDataSuccessExecution: none`): the items carry the client's details.
- **Output** (`contractsProOutput`): all or nothing. It holds the title, the preamble and the sections. A bilingual contract must carry `title_alt`, `heading_alt` and `body_alt` everywhere.
- **Citations:** `cited` goes through the L8 `enrichBriefCheck` into `citation_check`, which the page shows with `CitationCheckList`.
- **Charge once:** the `ai_start_run` idempotency key means a retry with the same key returns 409 and sends nothing (tested).

## Live test (n8n, 2026-10-30)

- **Setup:** two temporary workflows. A driver sent a real package with the inbound key credential (never printed); a sink received the callback.
- **Input:** a services contract, simple path, Arabic/English, plus one requested clause («سرية المعلومات»).
- **Result:** 202 at once; `succeeded` after about 50 s.
  - **Content:** a title and a preamble with `[....]` blanks for the representative, the ID and the date. 8 clauses, each with its English facing text; the requested confidentiality clause is there. The commercial court was used in the disputes clause.
  - **Citations:** 9 cited articles. Some quotations are wrong (for example, م١٠٢ and م١٠٣ of نظام المعاملات المدنية are "quoted" with the contract's own words). This is exactly what the library citation check flags. The page shows each article's library verdict, not the model's claim.
- **Cleanup:** both temporary workflows and their executions were deleted. `get_workflow mode=active` confirms the published graph of `mMekAog89HsgLz3o`.

## Tests

- `node --test src/lib/ai/*.test.ts src/components/ai/*.test.ts`: 170/170. These include the new `src/lib/ai/contractsPro.test.ts` (15 tests): the live n8n reply as a fixture through the app's output check and the page reader, clause caps, registry, input, languages, all-or-nothing output, charge once / retry 409, callback `citation_check`, workflow wiring, prompts, plan, assemble, and the page helpers.
- Tests that mention the contracts flow (`zipWiring`, `pricingHonesty`, `intakeValues`, `serviceRequestIntake`, `cannedOutputGate`): 117/117.
- `tsc --noEmit`: clean.

## Not done (and why)

- **Library retrieval before drafting.** `spec.retrieval` gates the tool on the library tier (pro) and fails as `ungrounded` (refunded) any run that cites nothing, which is wrong for a contract. For now the library step is the citation check after drafting. The page says so.
- **AI review mode** (clause segmentation + per-clause risk). It is not built, so the page says so.
- **DOCX/PDF export with the letterhead** and the common editor. The existing `AiResultActions` copy / .txt / collector remain.
- **The human order does not carry the AI draft.** The team order still sends the wizard's answers, as before; it does not link the `ai_runs` row.
- **Types:** the page's 38, not the plan's "about 40".
- **Price disagreement** (pricing files untouched): the registry charges **1,000** (the plan's figure). `/pricing` (`TOOL_POINT_LABELS["ai:contracts"]` = «١٠») and the `lawyerServicesTable` row «صياغة العقود وتدقيقها ومصفوفة المخاطر» say **10**. This needs the owner's decision before going live.
- **Off by default.** Turning it on (admins first) is the user's step. The Google data-disclosure question ١ still gates going live for any Gemini tool.
