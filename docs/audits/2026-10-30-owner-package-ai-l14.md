# Owner package 30 Oct — L14 الصائغ القانوني (LIVE-F02, NOTE-22) — what each item was and what changed

**Source:** the owner's 2026-10-30 handoff package (`05-traceability/developer-backlog.csv` LIVE-F02; `08-current-code-review` NOTE-22-C03; `07-references/REF0021.md`, the second half of NOTE-22).

**Branch:** `feat/ai-l14-drafter`, cut from `fix/ai-owner-30oct` at `ad147d91`. It is not merged and not deployed.

**Owner wording:** «مُصلَح في الكود — بانتظار النشر واختبار القبول». Nothing here is closed until the change is deployed and the owner re-tests it.

**Owner's direction (30 Oct), which overrides plan decision D9:**
- generation is automatic by default;
- review by a person is a separate, optional, clearly labelled order;
- the text «سيتولى فريق نظامي إعداد المذكرة يدوياً» goes.

## Owner items

| # | Item | What the owner saw / asked | Change | Status |
|---|---|---|---|---|
| 1 | **LIVE-F02** (P0) | The wizard ended on «سيتولى فريق نظامي إعداد المذكرة يدوياً، وسيصلك إشعار عند جهوزيتها» and nothing was generated. Acceptance: a different document per input with real run evidence; points charged once; retry tested | See **How it works** below | code ✓, n8n live ✓, tests ✓; waits for deploy + acceptance test |
| 2 | **NOTE-22-C03** «الصائغ آلي بمرحلتين وتأكيد وقائع ومراجع وتصدير» | The drafter was not a registered tool | Tool `legal-drafter` in `src/lib/ai/tools.ts`, with two phases, a facts confirmation, library sources and export (the details are in item 1) | code ✓; waits for deploy |

### How it works (item 1)

- **Where it runs:** for a pleading kind (lawyer or firm), the last step of `/ai/draft` is `StepAiDraft`.
- **Phase A, «تحليل الوقائع»:**
  - the lawyer's facts, or the facts in the files, become an editable summary, issues, proposed defences (keep or reject, in the StepDefenses look), requests, a list of what is missing, and the library sources;
  - it is charged the kind's price.
- **Phase B, «اكتب المذكرة»:**
  - written only from what the lawyer kept;
  - free; a failed draft is retried free;
  - result: the pleading with its [S…] sources and the L8 citation check, copy / .txt, and a Word `.doc` download.
- **Optional review:** «طلب مراجعة من فريق نظامي (اختياري)» is a separate button and order that carries the AI draft in its notes.
- **Text removed:** «سيتولى فريق نظامي إعداد المذكرة يدوياً».

## The plan's "fix the drafter before L14" list

| # | Item | Change | Status |
|---|---|---|---|
| 3 | The specialist modes could never submit: the validator required `clientRole` and `legalBranch` | `validateDraftIntake` (`src/lib/services/orderIntake.ts`) no longer needs either for arbitration, notary, report or minutes. No role is stored for them | code ✓, tests ✓ |
| 4 | A file without typed facts failed `MIN_CASE_TEXT` | An attached document stands in for typed facts, in the validator, in the wizard's «التالي», and in the AI run (`facts_in_files`). The run refuses `files_required` before charging if the facts are said to be in files and none are sent | code ✓, tests ✓ |
| 5 | No «تعقيب» option | «مذكرة تعقيب (على رد الخصم)» added to the reply sub-types and mapped to the `rejoinder` kind | code ✓, tests ✓ |
| 6 | Consultants could order pleadings (Art. 18) | Three places: the AI tool is `consultantBlocked`; the page stops a consultant with the Art. 18 message; the service-requests POST refuses a pleading draft order (`isPleadingDraftIntake` → `assertCourtPractice`). Specialist documents stay open | code ✓, tests ✓ (no route-level test of the POST) |
| 7 | Pricing had to key on the sub-type | `draftKindFromMemo(main, sub)` → kind → price. 500 for claim, reply, rejoinder, supplementary and closing; 1,000 for appeal; 1,500 for cassation and petition | code ✓, tests ✓ (every wizard sub-type is mapped in a test) |

## Charge once, retry free (how)

- **One conversation, two runs.** Turn 0 (the analysis) is charged `draftKindPrice(kind)`. Turn 1 (the draft) is priced 0.
- **A failed run is not counted as a turn,** so a failed draft can be started again in the same conversation without a charge. A failed analysis is refunded by the existing pipeline.
- **`checkTurn`** (`src/lib/ai/runCore.ts` + tools.ts) refuses each of these with `409 turn_refused`, before anything is charged:
  - a draft first;
  - a draft while the analysis is still running;
  - a change of kind;
  - a second analysis.
- **Limit:** `conversation.maxMessages = 2` refuses a third run once a draft has succeeded.

## Live test (n8n, 30 Oct)

**Workflow:** `hhmOLkcaPj3bojmh`, active (published version checked with `get_workflow mode=active`).

**Method:** a temp workflow called the real webhook through the stored inbound credential, and a second webhook caught the callback. No key was handled or printed. The temp workflow and all its executions were then deleted; the real workflow saves no successful executions.

| Run | Path | Result |
|---|---|---|
| A, claim, typed labour facts, 2 sources | Agent | `succeeded`: a facts summary, 3 issues, 2 defences each tied to an issue, 3 requests, 4 missing items, `cited` 77 and 84, citations [S1, S2]. Passes `validateOutput` |
| B, claim, the confirmed analysis | Agent | `succeeded`: 3 sections in court order, only the 2 confirmed requests, `[....]` for the agency number and company name, citations [S1, S2] |
| A, appeal, a PDF instead of facts | Download → Gemini document | `succeeded`: read the file, found no facts, invented none, listed what is missing. In the app this has no [S…] marker, so it is refused as ungrounded and refunded |

## Tests

- `node --test src/lib/ai/*.test.ts src/components/ai/*.test.ts`: 165/166. The one failure is `aiFiles.test.ts`, which cannot load `pdf-lib`: the shared `node_modules` lacks the dependency added in `ad147d91`. This was already the case before this branch; `npm install` fixes it.
- `src/components/draft/*.test.ts`: 3/3.
- `src/lib/services`, `src/lib/auth`, `src/lib/n8n` and the payment gate: 1378/1378.
- New in this branch:
  - `legalDrafter.test.ts`: 13;
  - n8n tests: 3 + the caseJob wiring loop;
  - `legalDraft.test.ts`: 3;
  - `orderIntake.test.ts`: 3.
- `navigation.consultant.test.ts` 11/12. The failure is in a dashboard source test that matches LF text in a CRLF checkout, in a file this branch does not touch.
- `npx tsc --noEmit`: clean except the same missing `pdf-lib`.

**Scope of the live test:** it called n8n directly. The app's own path (start → charge → callback → citation check → refund) is covered by unit tests only, until the deploy and the owner's acceptance test.

## Not done (for the owner or later)

- **The tool ships off (`defaultMode: off`; D10 keeps AI tools off or staff-only).** Until an admin turns `legal-drafter` on, «تحليل الوقائع» answers «tool off». The page then switches to the team order («لا يكتب الذكاء الاصطناعي هذا الطلب حالياً…»). Pleadings are not AI-written until the tool is on.
- **Facts only in files ground weakly:**
  - the analysis searches the library before n8n has read the file, using the judgment reasons, or else the branch and the kind;
  - so a real file can come back with no [S…] markers, and it is then refused as ungrounded and refunded;
  - typed facts ground properly.
- **Fixed after review (commit 4):**
  - once a draft exists, the analysis is locked;
  - «صياغة جديدة» states that it charges again (a third run in the same work is refused);
  - the AI step stays mounted on every step, so «السابق» no longer drops a paid analysis.

- **Price conflict:**
  - NOTE-22 says appeal 800; the plan and the brief say 1,000 (built as 1,000);
  - the published table `src/constants/pricing/pricing.lawyers.ts` shows the drafter at 15 points.
  - The pricing session owns that table, so it was not changed here.
- **Pro tier:** retrieval tools are gated by `libraryAiAccess` (Pro tier or higher, or admin), so the drafter needs Pro.
- **Review mode:** `review` release mode blocks phase B, which needs phase A `succeeded`. Run the tool in staff or live; there is still no admin approve route.
- **Drafting engine:** outline-then-sections drafting is not built; one call writes the whole pleading (up to 16,000 output tokens).
- **Editing and export:** there is no versioned editor and no letterhead DOCX/PDF export. The Word file is HTML saved as `.doc`.
- **Specialist modes:** arbitration, notary, report and minutes are still a team order, now worded honestly without «يدوياً».
- **Saving:** the draft is saved as the `ai_runs` row (history), not in the vault or a case.
- **Word files:** Word attachments are not read by the AI. The page names them and says to attach a PDF.
