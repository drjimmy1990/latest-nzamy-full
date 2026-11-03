# L12 الرأي الفصل — the consultation and the letter as real AI jobs

Source: the owner's 2026-10-30 handoff package. LIVE-F21 says the simulator and the opinion page send users to a human path. NOTE-22 says generation should be automatic by default, with human review as a separate, optional, clearly labelled order. Price is from D4: 400 points for consultation, letter or «quick» depth.

Branch: `feat/ai-l12-opinion`, cut from `fix/ai-owner-30oct` at `4eef59d0`. Not merged, not deployed. Nothing here is closed until it is deployed and the owner has re-tested it (owner wording: «مُصلَح في الكود — بانتظار النشر واختبار القبول»).

## What was built

| # | Owner asked | What changed | Status |
|---|---|---|---|
| LIVE-F21 (opinion half) | الرأي الفصل sends the user to a human path | The consultation and the letter now generate automatically on the page, through the same run engine as the other AI tools (charge once, refund on failure, role and Art. 18 checks, off by default) | code ✓, n8n LIVE, waits for deploy + mode on |
| NOTE-22 | automatic by default; human review a separate optional order | On both types the automatic panel comes first. Below it a divider reads «أو: مراجعة فريق نظامي — طلب منفصل اختياري», and the original team order keeps working under the heading «طلب … من فريق نظامي (اختياري)». The panel never creates an order and says «لم يراجعها محامٍ» on every result | code ✓ |
| NOTE-22 (other types) | the other five types say they are the team's order | Every type card carries one line: «توليد آلي فوري · مراجعة الفريق اختيارية» (consultation, letter) or «طلب يعدّه فريق نظامي» (study, memo, research, due diligence, cross-examination). The page header says which is which | code ✓ |
| D4 | 400 points | `LEGAL_OPINION_PRICE = 400` for both tools; the button shows «— ٤٠٠ نقطة» from the same constant | code ✓ |

## Design

Two tools, not one tool with a type field, because grounding differs. A retrieval tool with no resolved citation is refunded as "ungrounded" (`settleRunWith`), and that rule should apply to the consultation but not to the letter.

- **`legal-opinion-consult`**
  - Input: `question` (20–6,000 characters) and an optional `area` label (at most 80).
  - Output: `summary` (at most 2,000) and 1–8 `sections` of `{heading, body}`.
  - Retrieval: `{from: "question", laws: 8, principles: 4}`. The library gate (`libraryAiAccess`: Pro or higher, and the library-closed switch) runs before the charge.
  - The sources go into the package, and the model cites them as `[S#]`. Parse collects the ids, and `mapCitations` keeps only ids that were sent. A reply that cites nothing is refunded.
- **`legal-opinion-letter`**
  - Input: type, sender role and name, recipient type and name, government entity (government recipient only), subject (10–4,000), optional legal reference, deadline (5/10/15/30 days or none), and up to 10 annexes.
  - Output: `title`, `body` and `cited` (up to 20).
  - No retrieval. It is signed with the sender name the user typed, not the account's display name.
  - `cited` goes through the L8 enricher (`enrichBriefCheck`), so the page shows the library's verdict on each article (found / not found / repealed / amended), never the model's.
- **Both tools**
  - Job class, deep tier, daily limit 5, deadline 15 minutes, `defaultMode: "off"`.
  - Roles: lawyer, firm, individual, corporate, micro.
  - `consultantBlocked: false`: a consultation or letter is not pleading, so Art. 18 does not bar a consultant.
  - Over-long input is refused with a reason on the page, never cut.

## n8n (LIVE)

| Tool | Workflow id | Path |
|---|---|---|
| legal-opinion-consult | `jnejnjYKUcYwhNkR` | `nzamy-ai/legal-opinion-consult` |
| legal-opinion-letter | `wIdLCC7dIj64b6Rz` | `nzamy-ai/legal-opinion-letter` |

- Both use the wave 4 `caseJob` shape (Webhook with header auth → 202 → Agent + Gemini `gemini-3.1-flash-lite` → Parse / Model error → Callback, 5 retries).
- Both are switched on. `get_workflow mode=active` shows each published version matching the export in `n8n/ai/`.
- Live test, 30 Oct, through temporary unauthenticated copies (both copies and their executions deleted afterwards):
  - **Consultation:** a labour-law question with نظام العمل م٨٤, م٨٥ and م٧٧ as S1–S3. It returned 4 sections and the correct two-thirds answer for 7 years, with citations `["S2","S1"]` and no unsent id. The output passes the registry's `validateOutput`.
  - **Letter:** a demand for payment from a contractor, with a 15-day deadline and 2 annexes. It returned a complete letter with the sender's signature, `[....]` blanks for the date and amount it was not given, and both annexes listed. The output passes `validateOutput`.
  - **What the letter test shows:** the model cited «نظام المعاملات المدنية م٣٦٣» from memory. That is exactly what the L8 check exists for: the app resolves it against the library on the callback and shows the verdict.

## Tests

- `src/lib/ai/*.test.ts` + `src/components/ai/*.test.ts`: 164/165.
  - The 1 failure is `aiFiles.test.ts`: `pdf-lib` is missing from this worktree's `node_modules`. It is environmental, pre-existing, and not in this change.
  - New: `legalOpinion.test.ts` (11 tests) and 3 new cases in `n8nWorkflows.test.ts`.
- `src/app/ai/legal-opinion/*.test.ts`: 14/14, including the new `aiPath.test.ts` (5 wiring tests).
- `tsc --noEmit`: clean apart from the same `pdf-lib` import.
- Not done: a browser check of the page. The page needs a signed-in session and this worktree has no env.

## Open questions for the owner

1. **The consultation needs Pro.** It searches the library, and library AI is Pro or higher (his answers ٢٠٦/٢٠٧/٢٠٩), so a user below Pro who presses the button is refused before any charge, with a line ending «يمكنك طلبها من فريق نظامي أدناه». The letter has no such gate. Should the consultation be open to every plan?
2. **The card points do not match.** The type cards still show the team order's credits (consultation 5 «ك», letter 4 «ك», from `_constants.ts`), while the automatic run costs 400 points. These files were left alone because pricing is his. Which number should the card show?

## Not done

- Study, memo, research, due diligence and cross-examination are still team orders, and the page says so.
- The 800-point «full» depth.
- The shared wave 5 engine (outline → sections, the common editor with versions).
- DOCX/PDF export with the letterhead (the existing `AiResultActions` exports remain).
- `review` release mode: there is no admin approve route yet, so it runs in staff/live like the other tools.
- To go live: merge, deploy, then switch both tools on in admin «أدوات الذكاء» (staff first).
