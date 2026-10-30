# AI services: full status and roadmap (2026-10-28)

This is the one file to return to after the owner's review. It covers:
- what is built, what is deployed, and what is waiting;
- every tool and workflow;
- what the owner must decide;
- known limits;
- everything still to build, in order.

**Companion files:**

| File | What it is |
|---|---|
| `docs/plans/2026-10-26-ai-services-n8n-plan.md` | The design plan: contract, data model, waves, decisions D1–D11. Each wave has a dated status block |
| `docs/plans/2026-10-26-ai-services-inventory.md` | Every AI service on the platform, with the owner's prices |
| `n8n/ai/README.md` | Workflow ids, how to update or move the workflows, and the operator steps per wave |
| `AI_SERVICES_STATUS_2026-10-28.md` | The short English status and admin test steps |
| `دليل_اختبار_المالك_أدوات_الذكاء_الاصطناعي_٢٠٢٦-١٠-٢٨.md` | The owner's Arabic test guide: admin steps, what to try, the questions |

---

## 1. Where things stand

| Item | State |
|---|---|
| Wave 4 | **L9 and L10 merged into `main` and pushed (`819710ae`, 2026-10-30); `owner-edits` fast-forwarded to the same commit.** Not deployed yet. Both n8n workflows are **created, switched on and live-tested (2026-10-30)**: L9 without files, L10 without files and L10 with a PDF all came back `succeeded` |
| Wave 5 | **L11 محترف العقود المختصر merged into `main` and pushed (`c54e0c79`, 2026-10-30); `owner-edits` fast-forwarded to the same commit.** Not deployed yet. Its n8n workflow is created, switched on and live-tested (2026-10-30): a rent contract in 7 sections with `[....]` blanks |
| Code | **Waves 0–3 are merged into `main`**. Pushed up to `4039de86`. After it come two docs-only commits, committed locally and **not pushed yet**: the owner guide and this file |
| Production | Last confirmed deploy is **`7266a948`** (wave 0 + wave 1 code). **Everything after it is not deployed**: the Gemini workflows change, the useUser fix, waves 2 and 3 |
| Database | Wave 0 SQL (`ai_runs`, `ai_start_run`, `ai_fail_run`, …) **run on prod**, `_verify` OK. Waves 1–3 need **no SQL** |
| Server env | `N8N_AI_BASE_URL`, `NZAMY_AI_KEY`, `NZAMY_AI_CALLBACK_KEY` are in `/www/wwwroot/nzamy/latest-nzamy-full/.env.local` (checked). `CRON_SECRET` is present |
| n8n (n8n.asra3.com) | 15 NZAMY AI workflows, **all on**. Each refuses requests without the inbound key (403) |
| Tools on the site | **All off** until an admin sets them («للمشرفين فقط» for testing) |
| Live tests on the site | Only **المتحدث الذكي** has run end to end on prod (from the admin account). Every other tool was tested live on n8n with Gemini, through temporary relay workflows (since deleted), but not yet on the site |
| Model | Google Gemini `models/gemini-3.1-flash-lite`, on the n8n credential «Google Gemini(PaLM) Api account». **No Anthropic key is used** |

### The next deploy (one step covers everything)
```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull && npm install && nohup bash deploy.sh > /root/deploy-20261028.log 2>&1 &
```
- `npm install` is required, because wave 3 adds `pdf-lib` 1.17.1 (pinned).
- Expect `✔ Deployed 4039de86`, or the newer docs commit if those are pushed first. The site code is the same either way.
- Then, at `https://nezamy.sa/dashboard/admin/ai-usage`, set the 8 tools to «للمشرفين فقط» and press «حفظ».
- The owner tests with the Arabic guide.

---

## 2. How it works (architecture in one page)

**The browser** calls `POST /api/v1/ai/runs` with `{ tool, input, fileIds?, conversationId?, idempotencyKey }`. The client hook is `useAiRun`, or a page-specific helper.

**The app** (`src/lib/ai/runCore.ts`, `startRunWith`) runs these steps in order:
1. the tool (registry: `src/lib/ai/tools.ts`);
2. the role;
3. Art. 18 (consultant block);
4. the mode (`off` / `staff` = admins only / `review` / `live`, from `platform_settings.ai_tools`, edited on the admin page);
5. the input check;
6. the idempotency key;
7. **conversation** (L4): earlier turns read from `ai_runs` for this user only; at most 5 messages;
8. **files** (wave 3, `aiFiles.ts`): own vault rows only, PDF or image, at most 5 files / 22 MB / 30 pages, pages counted with pdf-lib, links signed for 15 minutes;
9. **library gate** (wave 2): `libraryGate` + `libraryAiAccess`, which means Pro or higher, or an admin;
10. **`ai_start_run`**: the daily limit, the balance and the debit in one transaction. The admin is exempt. Charging only happens when `points_enforcement` is true;
11. **retrieval** (wave 2):
    - n8n `lib-queries` writes 2–4 short searches;
    - the app runs them through the relevance RPCs (`retrieval.ts`) and keeps up to 8 articles and 4 principles as S1…Sn;
    - the open article is pinned as S1 for «اشرح لي»;
12. the package goes to n8n (`callN8n`):
    - a **fast** tool waits for the reply (50 s budget, minus the search time);
    - a **job** tool gets 202, and n8n calls back `POST /api/v1/ai/callback` with the callback key.

**Settling** (`settleRunWith`):
- `validateOutput` rebuilds the output field by field.
- An **enricher** completes it from the app's own data. Today that is L8: `citationCheck.ts` checks every cited article in the library.
- Citations are kept only if they name a source the app sent.
- A library tool with no surviving citation is refunded as `ungrounded`.
- Any failure, timeout or no-sources case is refunded (`ai_fail_run`).
- The sweeper (n8n «schedules», every 10 minutes) fails and refunds runs left past their deadline.
- Daily retention clears inputs and outputs after 90 days.

**n8n** never has keys to our data. Everything arrives in the package, including signed file links. Two workflow shapes, both generated from `n8n/ai/workflows.mjs` by `node scripts/n8n-ai-export.mjs` into `n8n/ai/*.json`:
- **Chat tools:**
  1. Webhook (inbound key)
  2. Build prompt (Code)
  3. AI Agent v3, with a Gemini chat sub-node
  4. Parse (plain text, `[S1]` markers → citations)
  5. Respond 200

  A model error → «Model error» → Respond.
- **Document jobs:**
  1. Webhook
  2. 202
  3. Download each file
  4. Prepare (all files on one item; a missing download → `download_failed`)
  5. Gemini «Analyze Document» (reads scans)
  6. Parse JSON
  7. Callback

  Successful runs are **not saved** on these workflows.

**Honesty rules built in:**
- no answer from memory: every library answer cites the texts it was given;
- no percentages or probabilities;
- user text is passed as data inside tags, and planted instructions are ignored (tested live);
- the model never decides whether an article exists (L8, and the najiz reference check);
- prices are fixed before the charge.

---

## 3. Tools built

| # | Tool | Registry id | Page | Class | Points | Who | n8n workflow id |
|:-:|---|---|---|:-:|:-:|---|---|
| — | Connection tests | `echo-fast`, `echo-job` | admin page buttons | fast / job | 1 | lawyer, firm | `m8vLkLlOrmWj6qeO`, `9qqzoHhFfhY3Esdj` |
| L1 | المتحدث الذكي | `communicate` | `/ai/communicate` | fast | 5 | lawyer, firm | `z9IsIwKfr40hEE4e` |
| L2 | منقح ناجز R5 | `najiz-optimizer` | `/ai/najiz-optimizer` | fast | 5 | lawyer, firm (not consultants) | `b3SSd5YoQmIjCgna` |
| — | Search writer (internal) | — (`LIB_QUERIES_PATH`) | — | fast | — | — | `s8MAOg4WTtt1yIUW` |
| L3 | سؤال قانوني سريع | `quick-answer` | `/ai/quick-answer` | fast + library | 20 | lawyer, firm (Pro+) | `ZigypMIWBhyPHrp7` |
| L4 | المستشار الذكي | `assistant` | `/ai/assistant` | fast + library + conversation | 100 per conversation of 5 | lawyer, firm (Pro+) | `iPXmJCQQ1QGzrIRf` |
| L5 | مساعد المكتبة + «اشرح لي» | `library-assistant` | `/laws/*` panel and modal | fast + library + pinned article | 5 | every type (Pro+) | `P2wLRQW3ZjlXgNhe` |
| L6 | بطاقة الكانفاس الذكية | `canvas-card` | case board «اقترح سنداً نظامياً» | fast + library | 10 | lawyer, firm (Pro+) | `1g4hsswaWsaafkN5` |
| L7 | عصارة المرفقات / الموجز القضائي | `case-brief` | `/ai/case-brief` | job + files | 30 (≤5 pages) / 150 (≤30) | lawyer, firm | `snPDkKndPA9wjIKr` |
| L8 | مراجعة وتدقيق مذكرة (gaps report) | `brief-check` | `/ai/brief-check` (beside the team order) | job + files + enricher | 200 | lawyer, firm (not consultants) | `bu9guzNEhaLbyAPd` |
| L9 | المحاكي الشامل (wave 4) | `wargaming` | `/ai/wargaming` (beside the team order) | job + optional files + enricher | 250 | lawyer, firm (not consultants) | `5CFEwAsuT0lRZRlK` |
| L10 | محلل الموقف والخصم (wave 4) | `analyze-strength` | `/ai/analyze-strength` | job + optional files + enricher | 250 | lawyer, firm | `MwONm9eg0IOGRRzt` |
| L11 | محترف العقود المختصر (wave 5) | `contract-drafter` | `/ai/contract-drafter` | job (no files) + enricher | 500 | lawyer, firm, individual, corporate, micro | `r2s0JBMr8Q5Ti80O` |
| — | Schedules (sweep + retention) | — | — | cron | — | — | `8Skwnqn9WIPOxcml` |

**n8n credentials:**
- «NZAMY AI · inbound» `T8LjmjhlZf6mNVeC` (= `NZAMY_AI_KEY`);
- «NZAMY AI · callback» `S29iidQ71jpn1rQD` (= `NZAMY_AI_CALLBACK_KEY`);
- «NZAMY cron (x-cron-secret)»;
- «Google Gemini(PaLM) Api account» `5p0YKMLaCVAAMklV`;
- «NZAMY Anthropic (x-api-key)»: unused, and empty.

### Main files
| Area | Files |
|---|---|
| Pipeline | `src/lib/ai/runCore.ts`, `tools.ts`, `aiToolsConfig.ts`, `n8nClient.ts` |
| Retrieval | `src/lib/ai/retrieval.ts` |
| Files | `src/lib/ai/aiFiles.ts` |
| Citations | `src/lib/ai/citationCheck.ts` (L8), `legalRefs.ts` (najiz) |
| Routes | `src/app/api/v1/ai/runs/route.ts`, `callback/route.ts`, `runs/[id]`, `src/app/api/v1/admin/ai-runs/route.ts` |
| Screens | `src/app/ai/{communicate,najiz-optimizer,quick-answer,assistant,case-brief,brief-check}/`, `src/app/laws/[slug]/_ai-components.tsx` + `_library-assistant.ts`, `src/app/dashboard/business/kanban/CaseGraphView.tsx` + `_graph-ai-card.ts`, `src/components/ai/CitedAnswer.tsx`, `src/app/dashboard/admin/ai-usage/page.tsx` |
| n8n source | `n8n/ai/workflows.mjs` → `n8n/ai/*.json` |
| Tests | `src/lib/ai/*.test.ts` (pipeline, retrieval, files, citations, workflows' code nodes), plus page-helper tests |
| SQL (wave 0) | `SQL_batch_2026-10-27_ai_wave0/` and `supabase/migrations/20261027_10_ai_runs.sql` |

### Quality checks at merge
- Type check clean.
- `next build` passes.
- Unit suite: **4,142 tests**. The only failures are the 6 known environment failures that `main` already had:
  - books `_shape`;
  - `navigation.consultant`;
  - `libraryAccess` end read;
  - `fulfillOrder` grantPurchase;
  - `trackingWiring` ×2.

---

## 4. Waiting on the owner (from the Arabic guide, section 5)

1. **D10 privacy (blocks opening any tool to lawyers):** text and files are processed by Google Gemini outside the Kingdom. A disclosure is needed in the privacy policy and the terms. A one-line notice is already on each AI screen. The policy and terms text is **not written yet**.
2. **Lawyers below Pro:** may they use the library tools (L3–L6)? Today it's Pro or higher, or admin only.
3. **منقح ناجز price:** 5 (pricing table, used now) or 15 (older plan)?
4. **المستشار الذكي:** 100 points per conversation of 5 messages (D3). Confirm, or price per question.
5. **File tool prices:** L7 at 30/150 (his answer ٢٨٣) and L8 at 200. Confirm.

**Other decisions from the plan that still apply:**
- **D1:** charging from day one, or a 2-week free trial. Check the `points_enforcement` setting before going live.
- **D2:** fast tools open as `live`; document tools as `review` (an admin approves each result) for 2 weeks.
- **D11:** his revised pricing document hasn't arrived. Re-check every price when it does.

---

## 5. Known limits and small follow-ups (not blocking the review)

| # | Item | Note |
|:-:|---|---|
| F1 | n8n keeps successful runs on the chat workflows (L1–L6, lib-queries) | Stored there: user text, and the `x-nzamy-key` header. **Turn «Save successful production executions» off** on those workflows before lawyers use them. The document jobs already have it off |
| F2 | `/ai/analyze` lawyer half (AttachmentSqueezer) still «قريباً» | L7 lives on `/ai/case-brief`. Point analyze at it, and change its honesty tests and pricing table on purpose |
| F3 | Shared-case file access | Wave 3 reads only the user's own vault files. The plan's `requestFileAccess.ts` rules (a colleague's or a client's upload on a shared case) are a follow-up |
| F4 | Retrieval covers laws and principles only | Decrees and fiqh have relevance RPCs too (`search_decrees_relevance`, `search_feqh_relevance`). Add them to `retrieval.ts` for L4 «all corpora» |
| F5 | Token usage is recorded as 0 | Gemini's usage isn't read from the AI Agent / Gemini nodes yet. Needed for cost tracking (D7) |
| F6 | No retry on Gemini 503 «Service unavailable» | The run is refunded and the admin page shows the real reason. Consider one retry on the job workflows only (fast tools can't afford it) |
| F7 | Old routes `/api/ai/library-chat` and `/api/ai/explain-article` | Unused now (prod never configured them). Delete, with their env names |
| F8 | The library panel's quick prompts are Companies-law specific | `QUICK_PROMPTS` in `_ai-components.tsx`. Make them per law, or generic |
| F9 | `echo-fast` / `echo-job` «عبر النموذج» option | Still calls Claude over HTTP (needs the Anthropic key). Leave it unticked, or convert it to Gemini |
| F10 | Spelled-out articles («المادة الخامسة») | Not checked by منقح ناجز's reference check (digits only). L8 asks the model to give digits |
| F11 | Owner report rule (تقرير_للمالك in the same commit as each batch) | For the AI waves the Arabic test guide served as the owner document. Fold it into the next تقرير_للمالك if the owner wants one file |
| F12 | Moving to our own n8n | Import `n8n/ai/*.json`, then re-select the credentials on the Webhook, Model / Read, and Callback nodes. Workflow ids will change (the app uses paths, not ids) |
| F13 | GitNexus index stale | Run `node .gitnexus/run.cjs analyze` before the next impact analysis |
| F14 | `package-lock.json` dev-flag normalisation | Adding pdf-lib also normalised 27 `dev` flags (npm 10 and 11 give the same result). No version changes besides pdf-lib and its dependencies |

---

## 6. What comes next, in order

The owner's priority is **lawyer services first**, then individual tools.

### Wave 4: analysis (jobs)
| # | Tool | Page | Points | What to build |
|:-:|---|---|:-:|---|
| L9 | **المحاكي الشامل** | `/ai/wargaming` | 250 | One pass per chosen target (adversary / court direction / memo critique / pleading practice) → `SimPoint{source, severity, title, detail, counter}`. **No probability.** Memo critique reads the memo file (reuse `aiFiles`). Retrieval: principles + laws. Consultants blocked (already on the Art. 18 list) |
| L10 | **محلل قوة الموقف** | `/ai/analyze-strength` | 250 | Four tabs: strengths and weaknesses, adversary moves, risks, adversary simulator. **Qualitative levels**, not the invented scores (D5, rule ١٩٣). Make the file inputs real uploads (today they are names only) |

**Built 2026-10-28 on `feat/ai-wave4`** (details in the plan's wave 4 status block and `n8n/ai/README.md` «Wave 4»):
- files are optional;
- the n8n job branches to the AI Agent when there are no files;
- no number anywhere;
- no library retrieval: the prompt forbids naming judgments, and the cited articles go through the L8 library check instead;
- the L10 mock and its BetaReviewGate are gone.

**Price conflict (put to the owner in the guide's question ٥):**
- The registry charges **250** for each, from the owner's 25-Oct price list.
- `/pricing` and the hub badge still show wargaming at «١٥–٢٠» (owner ٢١٦, older). They come from `lawyerServicesTable` and `TOOL_POINT_LABELS`, which `pricingApprovals.test.ts` keeps equal; left unchanged until he answers.
- analyze-strength is now `betaStatus: "priced"`, with no badge, instead of «free in beta».

**Still to do for wave 4:**
1. ~~Create both workflows on n8n and live-probe them~~ done 2026-10-30. The Agent branch with the JSON shape (braces) in its user text works.
2. ~~Merge and push~~ done 2026-10-30 (`819710ae`, also on `owner-edits`).
3. Deploy, then set both tools to «للمشرفين فقط».

### Wave 5: document writing (one shared engine)
The engine:
1. the app retrieves for the confirmed issues;
2. n8n plans an outline;
3. it drafts section by section;
4. self-review plus a citation check (reuse `citationCheck.ts`);
5. the result is typed sections.

Also part of wave 5:
- **Editor:** `StudyDocumentEditor`, with versions.
- **Export:** DOCX and PDF with the letterhead, replacing `.txt`.
- **Release:** starts in `review` mode (D9).

| # | Tool | Page | Points | Notes |
|:-:|---|---|:-:|---|
| L11 | محترف العقود المختصر | `/ai/contract-drafter` | 500 | **Built 2026-10-30, merged `c54e0c79`** (one call writes the whole draft; outline-then-sections, retrieval, the editor, letterhead export and `review` mode come with L12–L14). Six types with typed fields. Template-plus-fake-delay and fake upload removed; the dead `consultations/new` link fixed |
| L12 | الرأي الفصل | `/ai/legal-opinion` | 400 / 800 (D4) | Consultation and letter first, then study, memo and research. Due diligence (3,000) and cross-examination (150) last |
| L13 | محترف العقود | `/ai/contracts` | 1,000 | About 40 types, bilingual, clause by clause. Review mode = the engine for the on-hold reviewer |
| L14 | الصائغ القانوني | `/ai/draft` | 500 / 1,000 / 1,500 | Two phases: facts and issues, then **the lawyer confirms**, then drafting with retrieval and a citation check. Founder counter |

**Before L14, fix the drafter:**
- the specialist modes can't submit;
- a file without typed facts fails `MIN_CASE_TEXT`;
- there is no «تعقيب»;
- consultants can order pleadings (Art. 18 gap);
- the price must key on the sub-type.

### Later (after wave 5)
- **القوالب** (50 points): fix the broken deep links first.
- **مراجع العقود** and **مفاوض العقود**: on hold until real (owner ٢٩٦). They reuse L13's review engine.
- **The «قريباً» tools:** المفرّغ، السكرتير، المقارن، المترجم، داعم الاتجاه.

### Individual tools (after the lawyer waves; they reuse the engines)
| Tool | Reuses | Points |
|---|---|---|
| المستشار الذكي للأفراد (`/ai/consult`) | L3/L4, plus a free-question-a-day counter in `ai_runs` | 1 free a day, then 15 |
| الفاحص الذكي (`/ai/analyze` client half) | L7 | 30 / 150 |
| صائغ الخطابات / الشكوى (`/dashboard/client/letters`) | L1, into the existing letter blocks; the review order stays | 50 |
| تقييم موقف القضية | L10, short form | 75 |
| فحص عقد ذكي | L13 review mode | 250 |
| عقد مبسّط ذكي | L11 | 500 |

### Before any tool goes «مفعّلة» (live for lawyers)
1. The owner answers D10, and the privacy policy and terms carry the disclosure.
2. F1: successful-run saving is off on all AI workflows.
3. D1 / `points_enforcement` and the daily limits are checked on the admin page.
4. Each tool has passed the owner's test on «للمشرفين فقط».
5. Optional: 10 sample questions or cases per tool reviewed by a lawyer (plan §5).

---

## 7. How to resume work (for the next session)

**Worktree.** `D:\nzwt\ai2`, branch `feat/ai-wave3`, merged into `main`. For a new wave:
```bash
git -C "D:/DEV/projects/SITE MAPS NZAMY (1)/SITE MAPS NZAMY/nzamy-website" worktree add -b feat/ai-wave4 D:/nzwt/ai4 main
```
The worktree needs its own `npm install`. Turbopack rejects a linked `node_modules`, so with a link use `next build --webpack`.

**Tests:**
```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/**/*.test.ts"
```

**Regenerate the n8n import files** after editing `n8n/ai/workflows.mjs`:
```bash
node scripts/n8n-ai-export.mjs
```

**Build** without a local `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key npx next build
```

**Live-test pattern.** For a chat tool, use a temporary no-auth relay workflow that calls the real webhook with the stored inbound credential. For a job, add a temporary callback catcher. Delete them after, **and delete the catcher's executions**, because they hold the callback key header.

**Traps already hit:**
- LangChain reads `{}` in a system message as template variables; the rules must be brace-free (tested).
- The AI Agent error output passes `error` as a **string**.
- `library-column-lock.test.ts` needs service-client parameters typed `ServiceClient = Awaited<ReturnType<typeof createServiceClient>>`.
- The Write tool turns `\uXXXX` escapes into literal characters. Re-check regexes after writing files.
- Searching on a whole question fails: ANDed it matches nothing, ORed it matches more than 5,000 unranked rows. Short model-written searches work.

**Standing rules:**
- full paths in every step;
- the user runs all prod SQL and deploys (via nohup);
- merge and push only on the user's go;
- never print secrets;
- subagents use `model: opus`;
- don't touch the najiz WIP (`src/app/api/v1/najiz/`, `najizDecomposer*`) or `.agents/`.
