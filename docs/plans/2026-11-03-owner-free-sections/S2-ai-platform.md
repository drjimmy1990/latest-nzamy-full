# S2: AI platform foundations (gap analysis Wave 3)

**Scope.** Slice C §3.1-3 (review gate), §3.5-1 (collector), §3.5-2a (activity), §3.5-3a/d/e/f (inputs), §3.5-4 (telemetry).
**Spec:** `docs/audits/2026-11-02-owner-package/C-ai-architecture-studios.md` and `00-gap-analysis-and-plan.md` §5 Wave 3.
**Base:** `batch/2026-11-03-owner-free` at 1103812d. Every file:line below was re-read at that HEAD.

## 0. Facts at HEAD that shape this section

**Review mode (retired by Wave 1)**
- `aiToolsConfig.ts:51-53`: `effectiveToolMode` maps `review` to `staff`. `aiToolsSettingIssue` refuses a `review` write (`:85`).
- `runCore.ts:198-203` and `:639-640`: a success is always stored as `succeeded`. Nothing holds a run any more.
- The only output path for a stored `review` row is `GET /api/v1/admin/ai-runs/[id]` (settings.write, through `runVisibility.staffMaySeeRunOutput`).

**Hidden output can leak**
- `ai_runs` grants `SELECT (output, citations)` to `authenticated`, and the "own ai runs" policy covers the user's own row (`20261027_10_ai_runs.sql:71-80`).
- So any output written to `output` is readable by its owner straight through PostgREST, whatever the route hides.
- **Design rule:** a held result lives in new columns that carry no grant (`held_output`, `held_citations`). It moves to `output` only on release. This is a column grant on new columns, not an RLS change on an existing table, so it is not a STOP-POINT.

**Refunds**
- `ai_fail_run` was last re-created by `20261101_10_founder_membership.sql` (§8): it gives back a founder credit as well as points.
- This section never redefines `ai_fail_run`. `ai_reject_run` calls it.
- `ai_sweep_runs` and `ai_runs_retention` are defined only in `20261027_10`, so they are re-created in place from that body, with the same signatures.

**Alerts**
- `notifications.body` is `NOT NULL DEFAULT ''` (`20260518_client_workflow_backend_ready.sql:130`). `notify.ts:31` sends `null` when no body is given, so every alert below passes a non-empty body.
- There is no e-mail channel in the app:
  - `N8N_WEBHOOK_DEADLINE` serves deadline rows only;
  - the outbox deliver loop filters `deadline_id is not null` (`cron/deadlines/route.ts:190-195`).
- Staff e-mail therefore gets its own webhook and its own n8n workflow (A4).

**Who reviews**
- Release and reject stay on `settings.write` (super_admin), the same gate as the existing output view.
- Giving them to `operations` is a new owner question (§Excluded).

**File inputs**
- AI reads PDF and images only: `aiFiles.ts:56-62`, and `aiReadable.ts:10-11` on the client.
- Uploads accept any type and store `file.type || "application/octet-stream"` (`documentService.ts:428`). A `.md` usually arrives as `""`, so the server must fall back to the extension.
- `fflate@0.8.3` is a direct dependency (already used by `attachmentsZip.ts`), so **.docx needs no new dependency**.
- **.doc** (binary CFB) has no reader among the direct dependencies. `@xmldom`, `sax` and `yauzl` are transitive only. So .doc is refused with honest copy, and reading it is a STOP-POINT (B1).
- The n8n doc job (`workflows.mjs:862-975`) downloads each `files[].url` and gives the binary, with its response Content-Type, to the Gemini "Analyze Document" node.
- **Design:** the server extracts the text and hands n8n a `text/plain` file through a short-lived HMAC link on our own API. Nothing new is stored and the workflow does not change.
- Whether that n8n node reads `text/plain` must be proven live before the flag goes on (B5, STOP-POINT).

**Brief-check with no file**
- brief-check is a `toDocJobWorkflow`. With no file, «Files» yields no item and n8n never calls back.
- Pasted text therefore travels as the same kind of virtual `text/plain` file (B4), so the workflow always has exactly one file.

**Wargaming already takes pasted text**
- It accepts `memo_text` for «نقض المذكرة» (`tools.ts:477-479`, page `:595`).
- What it lacks is pasting the case documents, which today are upload-only. B4 adds `docs_text`.

**Contract review**
- Contract review on `/ai/contracts` is a team order (`useContractsState.ts:272-310`, `validateContractsIntake`), not an AI run.
- «الصق النص» there is an intake field (B7).

**Forced specialty and branch**
- Drafter: `useDraftState.ts:202`, `tools.ts:1046-1047`, `orderIntake.ts:243`.
- Wargaming: page `:365-366`, `tools.ts:471-472`.
- Legal opinion: page `:213`. Its validator already allows a missing `area` (`tools.ts:663-667`).
- `CASE_FRAME` (`workflows.mjs:351`) prints `«' + esc(i.area) + '»`. analyze-strength never sends `area` (`tools.ts:527-540`), so its prompt already reads «تخصص القضية: «»». B10 fixes both.

**Collector**
- The hub links only to `/ai/draft` (`collector/page.tsx:99-106`).
- `transcriptHandoff.ts` is the one hand-off, and the drafter consumes it (`draft/page.tsx:62-86`).
- Of the 6 targets, `direction-support` is ComingSoon and the canvas studio is Wave 7 (q٤٢٨). Both show «قريباً».
- Principles: `_principle-block.tsx` has copy and draft-cart buttons, but nothing saves to the collector.

**Activity**
- The route is `lawyer/activity/route.ts`, for lawyer and firm (`:69`).
- It reads 3 streams (`:103-147`). `ai_runs` is not one of them.

**Telemetry**
- Only a 3-value `progress_step` exists.
- `startRunWith` runs lib-queries and retrieval (`runCore.ts:477-535`) before it answers (`:560-600`).
- None of the n8n workflows posts a progress callback today (no "progress" in `workflows.mjs`).
- `after` is exported by `next/server` in Next 16.3.3.

**Mount points**
- `useAiRun` is used in 15 files.
- The 10 chosen mount points are listed in E9/E10, with the reason each of the other 5 is out.

## 1. Deploy and run order (the controller sequences these)

1. **Migrations `20261103_30` and `20261103_31`: run BEFORE the deploy.**
   - Both are additive (new columns, new table, new functions; existing functions are changed in place with the same signature).
   - The code below also survives running before them: review stays `staff` until A8, and progress writes and reads degrade to "no events".
2. **STOP-POINT B10, before the deploy that carries B9:** import the n8n prompts that read a missing area or branch. The new prompt handles both a present and an absent value.
3. **Deploy:** everything except A8, with `NZAMY_AI_TEXT_FILES` off and `NEXT_PUBLIC_AI_TEXT_FILES` off.
4. **STOP-POINT A4 / E6:** import the staff-alert e-mail workflow and the job workflows with progress branches. Both orders are safe; see each task.
5. **STOP-POINT B5:** a live text/plain test as admin. Then the user sets both text-file flags and rebuilds.
6. **STOP-POINT A8: re-enable review mode.** It is the last task. It needs steps 1, 3 and 4 done (the A4 e-mail may knowingly stay "not configured", with the bell only).

## 2. Migrations in this section

| File | Runs | Docker test | `_verify.sql` block |
|---|---|---|---|
| `supabase/migrations/20261103_30_ai_review_gate.sql` | BEFORE deploy | `supabase/tests/rls/ai_review_gate.test.sql` | `verify:ai_review_gate` |
| `supabase/migrations/20261103_31_progress_events.sql` | BEFORE deploy | `supabase/tests/rls/progress_events.test.sql` | `verify:progress_events` |

Numbers 20261103_32 to _49 stay unused.

## 3. New environment variables (set by the user, documented in the owner report)

| Variable | Read by | Off / unset means |
|---|---|---|
| `N8N_WEBHOOK_STAFF_ALERT` | `reviewAlerts.ts` (A4) | E-mail is logged as `not_configured`; the bell still goes out |
| `NZAMY_AI_TEXT_FILES=on` | `/api/v1/ai/runs` route (B3, B4) | .docx, .txt, .md and pasted text are refused before any charge |
| `NEXT_PUBLIC_AI_TEXT_FILES=on` (build time) | `aiTextFilesFlag.ts` (B6) | The pickers and paste boxes stay PDF and image only |

`N8N_WEBHOOK_SECRET`, `NZAMY_AI_KEY` and `NEXT_PUBLIC_SITE_URL` already exist.

---

## Part A: the money-safe review gate

### Task A1: migration 20261103_30, review columns, release, reject and sweep

**Files**
- Create `supabase/migrations/20261103_30_ai_review_gate.sql`.
- Create `supabase/tests/rls/ai_review_gate.test.sql`.
- Create `supabase/tests/rls/prelude_ai_review_legacy_row.sql`: inserts one `review` row that has `output` set, between the two runs.
- Modify `supabase/migrations/_verify.sql`: append `-- >>> verify:ai_review_gate` … `-- <<< verify:ai_review_gate`.

**Interfaces (produces)**

New columns on `public.ai_runs`. Each is `add column if not exists`, and none is granted to `authenticated`:

| Column | Type |
|---|---|
| `hold_for_review` | `boolean not null default false` |
| `held_output` | `jsonb` |
| `held_citations` | `jsonb` |
| `held_at` | `timestamptz` |
| `review_decision` | `text`, constraint `ai_runs_review_decision_check check (review_decision in ('released','rejected','expired'))`, added with drop-if-exists then add |
| `review_note` | `text` |

Other schema changes:
- Index `ai_runs_review_held_idx on public.ai_runs (held_at) where status = 'review'`.
- **Legacy move** (idempotent through `held_at is null`):
  ```sql
  update public.ai_runs
     set held_output = output, held_citations = citations,
         output = null, citations = null, held_at = now()
   where status = 'review' and held_at is null;
  ```
  `held_at = now()` gives every legacy row a fresh window in the queue, so the first sweep does not refund them at once. **Say this plainly in the owner report:** legacy review rows not decided within the window (24 h by default) are refunded automatically.

New and changed functions:
- `public.ai_release_run(p_run uuid, p_staff uuid) returns boolean`
  - security definer, `set search_path = ''`.
  - A null argument raises `22023`.
  - `update … set status='succeeded', output=held_output, citations=coalesce(held_citations,'[]'::jsonb), held_output=null, held_citations=null, review_decision='released', reviewed_by=p_staff, reviewed_at=now(), finished_at=now() where id=p_run and status='review' and held_output is not null`.
  - Returns `found`.
- `public.ai_reject_run(p_run uuid, p_staff uuid, p_reason text) returns boolean`
  - Security definer.
  - First: `update … set review_decision = case when p_staff is null then 'expired' else 'rejected' end, reviewed_by=p_staff, reviewed_at=now(), review_note=left(p_reason,500), held_output=null, held_citations=null where id=p_run and status='review'`.
  - If not found, it returns false.
  - Otherwise it returns `public.ai_fail_run(p_run, case when p_staff is null then 'review_timeout' else 'rejected' end, p_reason)`. That is the founder-aware refund: points to their lots, and a credit restored once.
- `public.ai_sweep_runs() returns int`: **re-created in place** from the 20261027_10 body.
  - The `running` loop is unchanged.
  - A second loop: `status='review' and held_at < now() - make_interval(hours => v_hours)`, limit 500, calling `public.ai_reject_run(id, null, format('no review decision within %s hours', v_hours))`.
  - `v_hours := least(168, greatest(1, coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'ai_review_hours' and jsonb_typeof(ps.value) = 'number'), 24)))`.
  - Returns the total of both loops.
- `public.ai_runs_retention() returns int`: re-created in place. It also nulls `held_output`, `held_citations` and `review_note`, and the WHERE also matches rows where those are not null.
- Grants on the new functions: revoke all from public, anon and authenticated; grant execute to service_role.
- Ends with a SELECT whose `ok` is never NULL:
  ```sql
  select coalesce(
           to_regprocedure('public.ai_release_run(uuid,uuid)') is not null
           and to_regprocedure('public.ai_reject_run(uuid,uuid,text)') is not null
           and not has_column_privilege('authenticated','public.ai_runs','held_output','SELECT')
           and not has_function_privilege('authenticated','public.ai_reject_run(uuid,uuid,text)','EXECUTE'),
           false) as ok,
         (select count(*) from public.ai_runs where status='review') as review_rows;
  ```

**Steps**
- [ ] **Write the failing test** `supabase/tests/rls/ai_review_gate.test.sql`. Its CHAIN header is the `founder_credits.test.sql` chain, then:
  - `20261103_30_ai_review_gate.sql`;
  - `prelude_ai_review_legacy_row.sql`;
  - `20261103_30_ai_review_gate.sql` again;
  - the verify block extracted with sed;
  - the test.

  Actors and lots are as in `ai_runs.test.sql` (A …a001 has 30 + 100 points).

  Every assertion RAISES:
  - **T0:** `to_regprocedure('public.ai_release_run(uuid,uuid)') is not null`. This is the negative control: without the migration it fails "T0 FAIL".
  - **T1 legacy:** the prelude row now has `output is null`, `held_output = '{"text":"legacy"}'::jsonb` and `held_at is not null`.
  - **T2 release:**
    - Start a run for A at price 50 (`ai_start_run`), set `status='review', held_output='{"x":1}', held_citations='[]', held_at=now()` as service_role.
    - `ai_release_run(run, M)` = true, then `status = 'succeeded'`, `output = '{"x":1}'`, `held_output is null`, `review_decision = 'released'` and `reviewed_by = M`.
    - A second call returns false.
  - **T3 reject refunds:**
    - Start a run at price 50 (A's balance falls from 130 to 80) and hold it.
    - `ai_reject_run(run, M, 'خطأ في الإحالات')` = true.
    - Then `status='failed'`, `error_code='rejected'`, `review_decision='rejected'`, `held_output is null`, A's `sum(points_left)` is back to 130, and there is one `usage_refund` ledger row for `ai_run:<id>`.
    - A second call returns false.
  - **T4 sweep default:**
    - A held row with `held_at = now() - interval '25 hours'` and another with `now() - interval '1 hour'`.
    - `ai_sweep_runs()` returns ≥ 1.
    - The first row is `failed`, with `error_code='review_timeout'` and `review_decision='expired'`. The second is still `review`.
  - **T5 setting:** with `platform_settings ('ai_review_hours', '2')`, a row held 3 hours ago is swept.
  - **T6 credit run:**
    - A run started with `ai_start_run_with_credit` (fixture as in `founder_credits.test.sql`), then held and rejected.
    - `membership_credit_uses.restored_at is not null`, and the credit's `remaining` is back to its value before the run.
  - **T7 grants:**
    - `has_column_privilege('authenticated','public.ai_runs','held_output','SELECT') = false`.
    - As the test role with `test.uid` = A, `select held_output from public.ai_runs` raises 42501.
    - `has_function_privilege('authenticated','public.ai_release_run(uuid,uuid)','EXECUTE') = false`.
- [ ] **Run it; it must fail at T0** (paste the full chain from the header):
  ```
  bash supabase/tests/rls/run.sh <chain> supabase/tests/rls/ai_review_gate.test.sql
  ```
- [ ] Write the migration exactly as the Interfaces above specify. Wrap it in `begin; … commit; notify pgrst, 'reload schema';`.
- [ ] Write the `_verify.sql` block. Before the migration it may only NOTICE; after it, it RAISES on:
  - the two functions missing;
  - `held_output` readable by authenticated;
  - an `ai_sweep_runs` body that does not mention `'review'`, checked with `pg_get_functiondef`.
- [ ] **Verify:** the same `run.sh` chain passes, and the migration's final SELECT prints `ok = t` on both runs.
- [ ] **Commit:** `feat(ai): review gate SQL — held output columns, ai_release_run / ai_reject_run (refund), review sweep (20261103_30, BEFORE deploy)`

### Task A2: tool labels and a generic output renderer (pure)

**Files**
- Create `src/lib/ai/toolLabels.ts` and `src/lib/ai/toolLabels.test.ts`.
- Create `src/lib/ai/runOutputBlocks.ts` and `src/lib/ai/runOutputBlocks.test.ts`.

**Interfaces (produces)**

`AI_TOOL_LABELS_AR: Readonly<Record<string, string>>`, one entry per `AI_TOOLS` id:

| Tool id | Label |
|---|---|
| communicate | المتحدث الذكي |
| najiz-optimizer | منقح ناجز |
| lib-queries | **not a registry tool, so absent** |
| quick-answer | سؤال قانوني سريع |
| library-assistant | مساعد المكتبة |
| assistant | المستشار الذكي |
| canvas-card | بطاقة الكانفاس الذكية |
| case-brief | عصارة المرفقات |
| brief-check | مراجعة وتدقيق مذكرة |
| wargaming | المحاكي الشامل |
| analyze-strength | محلل قوة الموقف |
| contract-drafter | محترف العقود المختصر |
| contracts-pro | محترف العقود |
| legal-opinion-consult | الرأي الفصل — استشارة |
| legal-opinion-letter | الرأي الفصل — خطاب |
| legal-drafter | الصائغ القانوني |

Functions and constants:
- `aiToolLabelAr(id: string): string`: the fallback is «أداة ذكاء اصطناعي».
- `AI_TOOL_PAGES: Readonly<Record<string, string | null>>`:

  | Page | Tool ids |
  |---|---|
  | `/ai/<id>` | communicate, najiz-optimizer, quick-answer, assistant, case-brief, brief-check, wargaming, analyze-strength, contract-drafter |
  | `/ai/contracts` | contracts-pro |
  | `/ai/legal-opinion` | both legal-opinion ids |
  | `/ai/draft` | legal-drafter |
  | `null` | library-assistant, canvas-card |

- `runOutputBlocks(output: unknown): Array<{ heading: string | null; paragraphs: string[]; items: string[] }>`. A pure walk:
  - Top-level string fields become paragraphs.
  - An array of strings becomes items.
  - An array of objects becomes items, each the object's string values joined by « — ».
  - Headings come from `OUTPUT_KEY_LABELS_AR`: summary → الخلاصة, findings → الملاحظات, sections → الأقسام, answer → الإجابة, reply → الرد, text → النص, conclusion → الخلاصة, citation_check → التحقق من الإحالات, options → الخيارات, questions → أسئلة.
  - An unknown key gets heading `null`, but its content is still shown and never dropped.
  - Nesting deeper than 3 is ignored.
  - At most 200 blocks.

**Steps**
- [ ] **Failing tests**:
  - `toolLabels: every registry tool has a label and a page entry`: `Object.keys(AI_TOOLS).every(id => typeof AI_TOOL_LABELS_AR[id] === "string")` is true; `aiToolLabelAr("x")` === "أداة ذكاء اصطناعي".
  - `runOutputBlocks: summary, findings and an unknown key`:
    - input `{summary:"س", findings:[{severity:"high",issue:"ع",fix:"ح"}], zzz:"ب"}`;
    - deepEqual `[{heading:"الخلاصة",paragraphs:["س"],items:[]},{heading:"الملاحظات",paragraphs:[],items:["high — ع — ح"]},{heading:null,paragraphs:["ب"],items:[]}]`.
  - `runOutputBlocks: non-object → []`: `runOutputBlocks(null)` deepEqual `[]`.
- [ ] Run `node --test src/lib/ai/toolLabels.test.ts src/lib/ai/runOutputBlocks.test.ts`. It must fail on the missing modules.
- [ ] Implement both. Use relative imports only (`./tools.ts`), so `node --test` loads them.
- [ ] Verify with the same command.
- [ ] **Commit:** `feat(ai): Arabic tool labels and a generic run-output renderer`

### Task A3: runCore holds a result for review (still unreachable)

**Shared files:** `src/lib/ai/runCore.ts`, `src/lib/ai/aiToolsConfig.ts`

**Files**
- Modify `src/lib/ai/runCore.ts`:
  - `StartRunDeps` (`:75-99`);
  - `settleRunWith` (`:204-262`);
  - after `onRunCreated` (`:464-469`);
  - the settle reply (`:586-599`);
  - `callbackWith` (`:604-645`).
- Modify `src/lib/ai/aiToolsConfig.ts`: add a helper.
- Modify `src/lib/ai/runCore.test.ts`.

**Interfaces**
- `aiToolsConfig.ts`: `export function runHoldsForReview(mode: AiToolMode, isAdmin: boolean): boolean`, returning `mode === "review" && !isAdmin`. Until A8, `runtime.mode` can never be `"review"`, so this is false in production.
- `StartRunDeps.onHeld?: (run: { runId: string; tool: string; userId: string }) => void`.
- `settleRunWith(admin, ctx: { spec; runId; sources; input; hold?: boolean }, raw)` adds `SettleOutcome | { kind: "held"; status: "review" }`.
  - When `ctx.hold`, it runs `update({ status: "review", held_output: output, held_citations: citations, held_at: nowIso, usage, model })` `.eq("status","running")`.
  - It **never** writes `output`.
- startRunWith:
  - Right after `onRunCreated`: if `runHoldsForReview(runtime.mode, isAdmin)`, then `update({ hold_for_review: true }).eq("id", run.run_id).eq("status","running")`. An error fails the run with `store_failed` and 502 `tool_failed`.
  - A fast settle of `held` replies `200 { runId, status: "review", ...charged }`, with no output and no citations, and calls `deps.onHeld` once.
- `callbackWith(admin, body, deps: { onHeld?: StartRunDeps["onHeld"] } = {})`:
  - It selects `"*"` instead of the column list at `:611`, so it survives either migration order.
  - It passes `hold: run.hold_for_review === true` and calls `deps.onHeld` on `held`.
- The comments at `:198-203`, `:585` and `:639-640` are updated to say the hold path exists and that the switch is still closed until A8.

**Steps**
- [ ] **Failing tests** in `runCore.test.ts`, reusing the file's fake admin, which records `.update()` payloads:
  - `A3 hold: a held success stores held_output and never output`:
    - `settleRunWith(fake, {spec: communicate, runId: RUN, sources: {}, input, hold: true}, {run_id: RUN, status: "succeeded", output: {text: "x"}})`;
    - outcome deepEqual `{kind: "held", status: "review"}`;
    - the recorded update has `held_output` deepEqual `{text:"x"}` and no `output` key.
  - `A3 hold: callbackWith reads hold_for_review from the row and alerts once`:
    - the fake row is `{id: RUN, tool: "brief-check", class: "job", status: "running", user_id: U, hold_for_review: true, source_ids: {}, input: {...}}`;
    - a valid brief-check result;
    - reply body `final` === "review"; `onHeld` calls deepEqual `[{runId: RUN, tool: "brief-check", userId: U}]`.
  - `A3: the switch stays closed`: with setting `{communicate: {mode: "review"}}`, a non-admin `startRunWith` replies 423 `tool_off` and the rpc spy shows no `ai_start_run`. This is today's behaviour, kept on purpose.
- [ ] Run `node --test src/lib/ai/runCore.test.ts`. The first two fail.
- [ ] Implement as above. `runHoldsForReview` lives in `aiToolsConfig.ts`, so A8 changes one place.
- [ ] Verify:
  - `node --test src/lib/ai/runCore.test.ts src/lib/ai/runVisibility.test.ts`;
  - `npx tsc --noEmit -p .`.
- [ ] **Commit:** `feat(ai): runCore can hold a result for review in columns the user cannot read (switch still closed)`

### Task A4: staff alerts, bell plus e-mail (no WhatsApp)

**Files**
- Create `src/lib/ai/reviewAlerts.ts` and `src/lib/ai/reviewAlerts.test.ts`.
- Modify `src/app/api/v1/ai/runs/route.ts`: `deps.onHeld`.
- Modify `src/app/api/v1/ai/callback/route.ts`: pass `{ onHeld }` to `callbackWith`.
- Create `n8n/workflows/wf-5.1-ai-review-staff-alert.json`.
- Modify `n8n/README.md`: one row for the new workflow and its env var.

**Interfaces**
- `alertStaffRunHeld(deps: { admin: SupabaseClient; fetchFn?: typeof fetch; webhookUrl?: string; secret?: string; siteUrl?: string; reviewHours?: number }, run: { runId: string; tool: string; userId: string }): Promise<{ bells: number; email: "sent" | "not_configured" | "failed" | "no_recipients" }>`.
- **Recipients:** `platform_staff` rows with `staff_role = 'super_admin'` (service client).
- **Bell:** one `notifications.insert([...])` call with one row per recipient:
  - `title: "نتيجة ذكاء اصطناعي بانتظار المراجعة"`;
  - `body: \`${aiToolLabelAr(tool)} — اعتمِدها أو ارفضها خلال ${hours} ساعة، وإلا أُعيدت نقاط المستخدم تلقائياً\``;
  - `href: \`/dashboard/admin/ai-review?run=${runId}\``.
- **E-mail:**
  - With no `webhookUrl`: `"not_configured"` and one `console.warn` per process. **Never "sent".**
  - Otherwise it POSTs `{ kind: "ai_review_held", runId, tool, toolLabel, href: \`${siteUrl}/dashboard/admin/ai-review?run=${runId}\`, to: [emails] }`. The emails come from `profiles.email` of the recipients. The header is `X-Webhook-Secret: <secret>` and the timeout is `AbortSignal.timeout(5000)`.
  - `res.ok` gives `"sent"`; anything else gives `"failed"` and is logged.
- **The routes:**
  - `onHeld: (r) => after(() => alertStaffRunHeld({ admin, webhookUrl: process.env.N8N_WEBHOOK_STAFF_ALERT, secret: process.env.N8N_WEBHOOK_SECRET, siteUrl }, r).then(() => {}))`.
  - Best-effort: a throw is caught and logged inside `alertStaffRunHeld`.
- **n8n JSON:**
  - Webhook (POST `nzamy/ai-review-alert`, Header Auth credential checking `X-Webhook-Secret`);
  - then an IF that `to` is non-empty;
  - then **Send Email** (SMTP credential placeholder `NZAMY SMTP`): subject «نظامي: نتيجة بانتظار المراجعة — {{toolLabel}}», a body with the link, `toEmail` = `to.join(',')`;
  - then Respond 200.
  - `settings.saveDataSuccessExecution: "none"`.

**Steps**
- [ ] **Failing tests** with a fake admin:
  - `reviewAlerts: one bell per super_admin, each with a non-empty body`:
    - 2 platform_staff rows;
    - the inserted array length is 2; every `body.length > 0`; `href` === "/dashboard/admin/ai-review?run=<RUN>".
  - `reviewAlerts: no webhook → not_configured, bells still written`: the result deepEqual `{bells: 2, email: "not_configured"}`.
  - `reviewAlerts: webhook 500 → failed`: a fake `fetchFn` returns `new Response("", {status: 500})`, so `email` === "failed".
  - `reviewAlerts: no super_admin → no_recipients, nothing inserted`.
- [ ] Run `node --test src/lib/ai/reviewAlerts.test.ts`. It must fail.
- [ ] Implement `reviewAlerts.ts` and wire both routes. Hours are read once from `platform_settings.ai_review_hours`, default 24.
- [ ] Write the n8n JSON. It is not generated: copy the Webhook / Respond node shapes of `n8n/workflows/wf-1.1-welcome-new-user.json`.
- [ ] Verify:
  - `node --test src/lib/ai/reviewAlerts.test.ts`;
  - `node -e "JSON.parse(require('fs').readFileSync('n8n/workflows/wf-5.1-ai-review-staff-alert.json','utf8'))"`;
  - `npx tsc --noEmit -p .`.
- [ ] **STOP-POINT (user):**
  - import `wf-5.1-ai-review-staff-alert.json` on the live n8n;
  - select an SMTP credential and the header-auth credential;
  - activate it;
  - set `N8N_WEBHOOK_STAFF_ALERT` on the app server.

  Until then the e-mail reports `not_configured` and the bell works. Either order is safe.
- [ ] **Commit:** `feat(ai): bell + e-mail alert to super admins when a run is held for review (WhatsApp excluded)`

### Task A5: admin API, the queue, release and reject

**Files**
- Create `src/lib/ai/reviewDecision.ts` and `src/lib/ai/reviewDecision.test.ts`.
- Create `src/app/api/v1/admin/ai-runs/review/route.ts` (GET).
- Create `src/app/api/v1/admin/ai-runs/[id]/release/route.ts` (POST).
- Create `src/app/api/v1/admin/ai-runs/[id]/reject/route.ts` (POST).
- Modify `src/app/api/v1/admin/ai-runs/[id]/route.ts`: a review row returns `output: held_output ?? output` and `citations: held_citations ?? citations`. It selects `"*"`, so the route survives running before _30.
- Modify `src/lib/auth/adminRouteGates.test.ts`, if it enumerates admin routes: add the three new paths with `settings.write`.

**Interfaces**
- `parseRejectReason(raw: unknown): string | null`: trims, needs 3..500 characters, and collapses whitespace.
- `reviewRpcReply(error: { code?: string; message?: string } | null, data: unknown): { status: 200 | 409 | 503; body: Record<string, unknown> }`:

  | RPC result | Reply |
  |---|---|
  | `data === true` | 200 `{ ok: true }` |
  | `data === false` | 409 `{ error: "هذا التشغيل لم يعد بانتظار المراجعة" }` |
  | code `42883` / `PGRST202` | 503 `{ error: "بوابة المراجعة غير مفعّلة بعد على قاعدة البيانات", code: "not_ready" }` |
  | any other error | 503 `{ error: "تعذّر تنفيذ القرار الآن" }` |

- `GET /api/v1/admin/ai-runs/review`:
  - `requireStaff("settings.write")`.
  - Rows: `status = 'review'`, ordered `held_at asc`, limit 50.
  - Columns: META + `held_output, held_citations, held_at, hold_for_review`, plus `user_name` (as in `ai-runs/route.ts`) and `expiresAt = held_at + hours`, as an ISO string from the server.
  - A missing column (42703 / PGRST204) gives `{ runs: [], schemaMissing: true }`.
  - `Cache-Control: private, no-store`.
- `POST …/[id]/release`:
  - requireStaff("settings.write"), UUID check, then `rpc("ai_release_run", { p_run, p_staff: gate.userId })` mapped by `reviewRpcReply`.
  - On 200:
    - `logAdminAction({ actorId: gate.userId, action: "ai_run_released", targetType: "ai_run", targetId: id, metadata: { tool } })`;
    - a bell to the run owner: `{ title: "نتيجتك جاهزة", body: \`${label}: اعتمدها فريق نظامي\`, href: \`/ai/runs/${id}\` }`.
- `POST …/[id]/reject` with body `{ reason }`:
  - A reason that fails `parseRejectReason` gives 422 «اكتب سبب الرفض (٣ أحرف على الأقل)».
  - Then `rpc("ai_reject_run", { p_run, p_staff, p_reason })`.
  - On 200:
    - audit `ai_run_rejected`;
    - a bell to the owner: `{ title: "لم تُعتمد نتيجة", body: \`${label}: لم يعتمدها فريق نظامي، وأُعيد ما دفعته\`, href: \`/ai/runs/${id}\` }`. «ما دفعته» covers points and a founder credit alike.

**Steps**
- [ ] **Failing tests** in `reviewDecision.test.ts`:
  - `parseRejectReason("  ab ")` === null;
  - `parseRejectReason("سبب  واضح")` === "سبب واضح";
  - `parseRejectReason("x".repeat(501))` === null;
  - `reviewRpcReply(null, true).status` === 200;
  - `reviewRpcReply(null, false).status` === 409;
  - `reviewRpcReply({code: "PGRST202"}, null).body.code` === "not_ready".
- [ ] Run `node --test src/lib/ai/reviewDecision.test.ts`. It must fail.
- [ ] Implement the module and the 3 routes. Update the `[id]` GET.
- [ ] Verify:
  - `node --test src/lib/ai/reviewDecision.test.ts src/lib/auth/adminRouteGates.test.ts`;
  - `npx tsc --noEmit -p .`.
- [ ] **Commit:** `feat(admin): AI review queue API — release publishes, reject refunds (settings.write), audit + owner bell`

### Task A6: admin review queue page

**Shared files:** navigation files (`src/components/admin/adminNavByRole.ts`, `src/constants/navigation.sidebars.primary.ts`, `src/lib/auth/adminNavAccess.ts`)

**Files**
- Create `src/app/dashboard/admin/ai-review/page.tsx`.
- Modify the three nav files: an item «مراجعة نتائج الذكاء الاصطناعي» at `/dashboard/admin/ai-review`, and `ADMIN_PAGE_ACTION["/dashboard/admin/ai-review"] = "settings.write"`.
- Modify the nav test that classifies every admin page (`adminNavByRole.test.ts`).

**Interfaces (consumes)**
- A5 routes.
- `runOutputBlocks`, `aiToolLabelAr` (A2).

**Behaviour**
- One card per held run: the tool label, the user name, «حُجزت منذ …» and «يُسترد تلقائياً بعد …». Both are computed on the client in a `useEffect` from `held_at` / `expiresAt`, never during SSR.
- Expanding a card renders the held output with `runOutputBlocks`.
- Two buttons:
  - «اعتماد ونشر للمستخدم», which POSTs release;
  - «رفض وإعادة ما دفعه», which opens a required reason textarea, then POSTs reject.
- The run leaves the list only on 200. A 409 refreshes the list with that message.
- `?run=<id>` (the bell link) scrolls to that card and opens it.
- `schemaMissing` shows «بوابة المراجعة تنتظر تشغيل ترحيل قاعدة البيانات 20261103_30».
- An empty queue shows «لا توجد نتائج بانتظار المراجعة».
- Text colours never use text-gray-100 or text-gray-200.

**Steps**
- [ ] **Failing test** in `src/components/admin/adminNavByRole.test.ts`, `ai-review is a settings.write page`:
  - `ADMIN_PAGE_ACTION["/dashboard/admin/ai-review"]` === "settings.write";
  - `adminHrefVisible("/dashboard/admin/ai-review", "operations")` === false;
  - `adminHrefVisible("/dashboard/admin/ai-review", "super_admin")` === true.

  Both helpers are in `src/lib/auth/adminNavAccess.ts:102`.
- [ ] Run `node --test src/components/admin/adminNavByRole.test.ts`. It must fail.
- [ ] Implement the page and the nav entries.
- [ ] Verify the tests above, then the build:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://placeholder.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack
  ```
- [ ] **Commit:** `feat(admin): «مراجعة نتائج الذكاء الاصطناعي» queue with release / reject`

### Task A7: the user sees a released result

**Files**
- Create `src/lib/ai/runErrors.ts` and `src/lib/ai/runErrors.test.ts`. Extended in E4 and E7.
- Modify `src/hooks/useAiRun.ts` (`:104-107`, `:149-152`): keep polling in `review`.
- Create `src/app/ai/runs/[id]/page.tsx`: the run viewer, used by the bells and by the activity log (D1).
- Check `src/app/ai/layout.tsx`: every role that can start a tool reaches `/ai/runs/*`. If its guard lists subtrees, add `/ai/runs`. `routeAccess.ts` has no `/ai` entry at HEAD, so it needs no change.

**Interfaces**
- `runErrors.ts` (pure):
  - `reviewPollDelay(status: string, elapsedMs: number): number | null` gives 15000 while `status === "review" && elapsedMs <= 30*60*1000`, and null otherwise.
  - `runFailureMessage(code: string | null, refunded: boolean, creditUsed: boolean): string`:

    | Code | Message |
    |---|---|
    | `rejected` | «لم يعتمد فريق نظامي النتيجة، وأُعيد ما دفعته» |
    | `review_timeout` | «انتهت مهلة مراجعة النتيجة، وأُعيد ما دفعته» |
    | any other code, refunded | «تعذّر إكمال الطلب، وأُعيدت نقاطك» |
    | any other code, not refunded | «تعذّر إكمال الطلب» |
    | a credit run (any code) | `FOUNDER_CREDIT_REFUNDED_FAILURE` |

- `useAiRun`:
  - `review` (from the start reply or a poll) keeps polling GET `/api/v1/ai/runs/<id>` with `reviewPollDelay`.
  - `succeeded` moves to `done` with the output.
  - `failed` moves to `error` with `runFailureMessage`.
  - After 30 min it stays `review`; pages already show «تنتظر مراجعة الفريق».
- `/ai/runs/[id]`, a client page:
  - GET the run.
  - Header: tool label, status and charged points.
  - `succeeded`: `runOutputBlocks` plus a link «افتح الأداة» to `AI_TOOL_PAGES[tool]` when non-null.
  - `review`: «بانتظار مراجعة فريق نظامي — سيصلك تنبيه».
  - `failed`: `runFailureMessage(error_code, !!refunded_at, false)`.
  - 404: «غير موجود».
  - Dates are formatted on the client.

**Steps**
- [ ] **Failing tests**:
  - `reviewPollDelay("review", 0)` === 15000;
  - `reviewPollDelay("review", 1_800_001)` === null;
  - `reviewPollDelay("succeeded", 0)` === null;
  - `runFailureMessage("rejected", true, false)` === "لم يعتمد فريق نظامي النتيجة، وأُعيد ما دفعته";
  - `runFailureMessage("model_error", true, false)` === "تعذّر إكمال الطلب، وأُعيدت نقاطك".
- [ ] Run `node --test src/lib/ai/runErrors.test.ts`. It must fail.
- [ ] Implement it, wire it into `useAiRun`, and build the page.
- [ ] Verify the test plus the build command.
- [ ] **Commit:** `feat(ai): released results reach the user — review polling and /ai/runs/[id]`

### Task A8: re-enable review mode (LAST in Part A)

**Shared files:** `src/lib/ai/runCore.ts`, `src/lib/ai/aiToolsConfig.ts`

The admin settings PATCH route (`src/app/api/v1/admin/settings/route.ts`, key `ai_tools`) passes `REVIEWABLE_AI_TOOLS` to `aiToolsSettingIssue`.

**Precondition: STOP-POINT.** All of the following are needed, and then the user's explicit go:
- `20261103_30` has run on production and `_verify` is clean;
- A3–A7 are deployed;
- the A4 e-mail is either tested or knowingly left "not configured" (bell only).

**Files**
- Modify `src/lib/ai/aiToolsConfig.ts`:
  - `WRITABLE_MODES` adds `"review"`;
  - `effectiveToolMode` returns `mode` unchanged;
  - `RunnableAiToolMode = AiToolMode`;
  - `legacyMode` is removed;
  - `REVIEW_MODE_REFUSED_AR` is deleted, along with its use at `:85`;
  - the header comment is rewritten.
- Modify `src/lib/ai/runCore.ts:294-300`: refuse only `off`, or `staff` for a non-admin. The hold comes from `runHoldsForReview(runtime.mode, isAdmin)`, which is now reachable.
- **Tools that may NOT be put in review.** `aiToolsSettingIssue(value, knownTools)` gains an optional third parameter, `reviewable: ReadonlySet<string>`. The admin settings route passes `REVIEWABLE_AI_TOOLS`, a new export of `src/lib/ai/toolLabels.ts`. It lives there rather than in `tools.ts` to avoid an import cycle, and it holds every id whose spec has no `conversation` **and** whose `AI_TOOL_PAGES` entry is non-null. Writing `mode: "review"` for any other tool returns «وضع المراجعة غير متاح لهذه الأداة: <tool>». The reasons:
  - `assistant` (a conversation, `tools.ts:1245`) and `library-assistant` (no page, called by `_library-assistant.ts`) expect the answer inside the reply and do not use `useAiRun`;
  - `legal-drafter` (a conversation, `:1405`): its free draft turn builds on an analysis the user could not see while it was held;
  - `canvas-card` and `library-assistant` have no page that `/ai/runs/[id]` could send the user back to.

  The admin page shows no review option for these tools.
- Modify `src/app/api/v1/admin/ai-runs/route.ts`: drop `legacyMode`.
- Modify `src/app/dashboard/admin/ai-usage/page.tsx` (`:12`, `:25-27`, `:49-57`, `:177-187`):
  - the mode select gets `review` with the label «بمراجعة الفريق (يُخصم ويُحجز الناتج حتى الاعتماد)»;
  - the legacy label is removed;
  - a link to `/dashboard/admin/ai-review`.
- Modify the Wave 1 tests that assert the retirement. **These turn red by design. Flip them, never delete them:**
  - `src/lib/ai/runCore.test.ts:375-395`, «review retired: a stored review resolves to staff…»;
  - the `aiToolsSettingIssue` test that expects `REVIEW_MODE_REFUSED_AR` for `mode: "review"`. Find it with `grep -rn REVIEW_MODE_REFUSED_AR src`.
  - `src/lib/ai/runVisibility.test.ts` stays as it is. `runForViewer` still hides a review row from its owner, and `staffMaySeeRunOutput` is unchanged.

**Steps**
- [ ] **Failing tests**:
  - `A8: a stored review resolves to review`: `resolveToolRuntime(spec, {communicate: {mode: "review", daily_limit: 4}})` deepEqual `{mode: "review", dailyLimit: 4}`;
  - `A8: an admin may write review`: `aiToolsSettingIssue({communicate: {mode: "review"}}, ["communicate"], REVIEWABLE_AI_TOOLS)` === null;
  - `A8: chat and page-less tools refuse review`: for `assistant`, `legal-drafter`, `library-assistant` and `canvas-card`, `aiToolsSettingIssue({[id]: {mode: "review"}}, [id], REVIEWABLE_AI_TOOLS)` is a string including «وضع المراجعة غير متاح لهذه الأداة»; and `REVIEWABLE_AI_TOOLS.has("brief-check")` === true;
  - `A8: a non-admin review run is charged and held`: setting `{communicate: {mode: "review"}}`, a non-admin actor and a fake n8n success. The reply status is 200 with `body.status` === "review" and `body.output` === undefined; the rpc spy saw `ai_start_run`; the update spy saw `hold_for_review: true`;
  - `A8: an admin on a review tool sees the output at once`: same setting, admin actor. `body.status` === "succeeded" and `body.output` is defined.
- [ ] Run `node --test src/lib/ai/runCore.test.ts`. It must fail.
- [ ] Implement it and flip the named retirement tests.
- [ ] Verify:
  - `npm run test:unit` (only the 6 known CRLF failures remain);
  - `npx tsc --noEmit -p .`;
  - the build.
- [ ] **Commit:** `feat(ai): review mode is selectable again — money-safe (release / reject with refund / 24 h sweep)`

---

## Part B: inputs

### Task B1: text extraction for .docx, .txt and .md (pure; .doc refused)

**Files:** create `src/lib/ai/textExtract.ts` and `src/lib/ai/textExtract.test.ts`.

**Interfaces (produces)**
- `type TextKind = "docx" | "txt" | "md"`.
- `textKindOf(mime: string | null, fileName: string | null): TextKind | "doc" | null`.
  - Mime first: the docx OOXML mime gives `docx`; `text/plain` gives `txt`; `text/markdown` / `text/x-markdown` give `md`; `application/msword` gives `doc`.
  - For `""`, `application/octet-stream` or an unknown mime, it falls back to the extension, case-insensitive: `.docx`, `.txt`, `.md`, `.markdown`, `.doc`.
  - `application/pdf` and images give null; they stay with `AI_FILE_MIMES`.
- `extractDocxText(bytes: Uint8Array): { ok: true; text: string } | { ok: false; code: "docx_unreadable" | "docx_too_large" }`:
  - **Bomb guard.** A first `unzipSync` pass uses a `filter` that only records `originalSize` of `word/document.xml` and returns false. Over `DOCX_XML_MAX_BYTES = 20 * 1024 * 1024` gives `docx_too_large`.
  - A second pass unzips only that entry.
  - `</w:p>` → `\n`, `<w:tab/>` → `\t`, `<w:br/>` and `<w:cr/>` → `\n`.
  - Text comes from `<w:t(?:\s[^>]*)?>([^<]*)</w:t>`.
  - It decodes `&amp; &lt; &gt; &quot; &apos; &#NNN; &#xHH;`, collapses 3 or more newlines to 2, and trims.
  - A non-zip input, a missing entry or an empty text gives `docx_unreadable`.
- `decodeTextBytes(bytes: Uint8Array): string`: `new TextDecoder("utf-8", { fatal: true })` with the BOM stripped; on a throw, `new TextDecoder("windows-1256")` for legacy Arabic files.
- `TEXT_CHARS_PER_PAGE = 3000`.
- `textPages(text: string): number` = `Math.max(1, Math.ceil(text.length / 3000))`.
  - **Pinned rule.** It feeds case-brief's page price (`tools.ts` CASE_BRIEF prices) and every 30-page cap. Word's own page count (`docProps/app.xml`) is not used, because it is often stale.
  - Raise it as a new owner question in the report. It is not blocking, because the 30-page cap stands (٤٢٨ is open).
- `TEXT_FILE_MAX_CHARS = 90_000`, which is 30 pages.
- `.doc`: no extraction. `FILE_COPY.doc` (B3) refuses it before any charge.

**STOP-POINT, conditional.** Reading `.doc` needs a new npm dependency (a CFB / Word-97 reader). It is not planned here; ask the user before adding one.

**Steps**
- [ ] **Failing tests.** Build each docx inside the test with `zipSync({ "word/document.xml": strToU8(xml) })` from `fflate`, so there is no binary fixture.
  - `extractDocxText: paragraphs and entities`: two `<w:p>` with `مرحبا` and `عالم &amp; نظام` give `{ok: true, text: "مرحبا\nعالم & نظام"}`.
  - `extractDocxText: tab`: `<w:t>أ</w:t><w:tab/><w:t>ب</w:t>` gives text `"أ\tب"`.
  - `extractDocxText: not a zip`: `new Uint8Array([1,2,3])` gives `{ok: false, code: "docx_unreadable"}`.
  - `extractDocxText: bomb`: a document.xml of 21 MB of spaces gives `{ok: false, code: "docx_too_large"}`.
  - `decodeTextBytes`: UTF-8 with BOM + «نص» gives «نص»; the windows-1256 bytes `[0xE4, 0xD5]` give «نص».
  - `textPages`: `""` gives 1; `"x".repeat(3001)` gives 2.
  - `textKindOf`: `("", "a.MD")` gives "md"; `("application/octet-stream", "c.docx")` gives "docx"; `("application/msword", "x.doc")` gives "doc"; `("application/pdf", "x.pdf")` gives null.
- [ ] Run `node --test src/lib/ai/textExtract.test.ts`. It must fail.
- [ ] Implement it, importing only `fflate` (a direct dependency).
- [ ] Verify with the same command.
- [ ] **Commit:** `feat(ai): server-side text from .docx/.txt/.md (fflate, bomb-guarded); .doc refused honestly`

### Task B2: a signed link for n8n to fetch extracted text

**Files**
- Create `src/lib/ai/fileTextToken.ts` and `src/lib/ai/fileTextToken.test.ts`.
- Create `src/app/api/v1/ai/file-text/[token]/route.ts`.

**Interfaces**
- `type FileTextClaim = { a: string; u: string; e: number } | { r: string; f: string; u: string; e: number }`:
  - `a` is an attachment id;
  - `r` / `f` are a run id and its pasted field;
  - `u` is the owner user id;
  - `e` is the expiry in epoch ms.
- `signFileTextToken(claim: FileTextClaim, secret: string): string` = `base64url(JSON) + "." + base64url(HMAC-SHA256(secret, base64url(JSON)))`, using `node:crypto`.
- `verifyFileTextToken(token: string, secret: string, nowMs: number): FileTextClaim | null`:
  - `timingSafeEqual` on the signature;
  - `e > nowMs`;
  - a shape check.
- `FILE_TEXT_TTL_MS = 15 * 60 * 1000`, the same as `SIGNED_URL_SECONDS`.
- `GET /api/v1/ai/file-text/<token>`:
  - It needs no session: the token is the credential, like a storage signed URL.
  - Secret: `process.env.NZAMY_AI_KEY`. Missing gives 503.
  - Any invalid or expired token gives 404 `not found`, with no detail.
  - **`a` claim:**
    1. The service client reads `attachments` with `id = a`, `owner_user_id = u` and `deleted_at is null`.
    2. It downloads from bucket `documents` and runs `textKindOf` then extract or decode.
    3. It answers 200 `text/plain; charset=utf-8` with `Cache-Control: private, no-store`.
  - **`r` / `f` claim:** it reads `ai_runs.input` with `id = r`, `user_id = u` and `status = 'running'`, and returns the string at `input[f]`.
  - The body is capped at `TEXT_FILE_MAX_CHARS`.
  - The proxy has no gate on `/api/v1/ai/*` (`runs/route.ts:26-29`), so `proxy.ts` needs no change.

**Steps**
- [ ] **Failing tests**:
  - a round trip returns the same claim;
  - a token with its last character changed gives null;
  - `e = now - 1` gives null;
  - another secret gives null;
  - `"abc"` gives null.
- [ ] Run `node --test src/lib/ai/fileTextToken.test.ts`. It must fail.
- [ ] Implement the module and the route.
- [ ] Verify the test plus `npx tsc --noEmit -p .`.
- [ ] **Commit:** `feat(ai): short-lived HMAC link serving extracted text to n8n (nothing stored)`

### Task B3: AI file checks accept text kinds behind a server flag

**Files**
- Modify `src/lib/ai/aiFiles.ts`:
  - `resolveAiFiles` gets a new last parameter;
  - `FILE_COPY` (`:82-91`);
  - the type check (`:157-159`);
  - the loop (`:169-198`).
- Modify `src/lib/ai/aiFiles.test.ts`.
- Modify `src/app/api/v1/ai/runs/route.ts`: pass the option.

**Interfaces**
- `resolveAiFiles(admin, userId, raw, rules, now = new Date(), opts: { textFiles?: { secret: string; baseUrl: string } } = {})`.
- Per row:
  1. `AI_FILE_MIMES[mime]` first.
  2. Else, if `opts.textFiles` is set, `textKindOf(mime, file_name)`:
     - `"doc"` → `{ ok: false, error: FILE_COPY.doc, code: "file_type_doc" }`;
     - a text kind → download, extract or decode; an extraction failure → `FILE_COPY.unreadableText`, code `file_unreadable`;
     - `pages = textPages(text)`; the existing page and byte caps apply.
     - The AiFile is `{ id, name, mime: "text/plain", bytes: utf8Length(text), pages, url: \`${baseUrl}/api/v1/ai/file-text/${signFileTextToken({a: id, u: userId, e: now + FILE_TEXT_TTL_MS}, secret)}\`, url_expires_at }`.
  3. Otherwise `FILE_COPY.type`.
- `FILE_COPY` changes:
  - `type`: «نوع ملف غير مدعوم — أرفق PDF أو صورة» when the flag is off; with it on, the route passes a variant that adds «أو Word (.docx) أو نصاً (.txt / .md)».
  - `doc`: «ملف Word القديم (.doc) لا يُقرأ — احفظه بصيغة .docx أو PDF ثم أرفقه».
  - `unreadableText`: «تعذّر قراءة نص أحد الملفات (قد يكون تالفاً)».
- The route: `textFiles` only when `process.env.NZAMY_AI_TEXT_FILES === "on"` and `NZAMY_AI_KEY` is set and `callbackUrl()` is https. `baseUrl` is the site origin.
- The header comment at `aiFiles.ts:18-20` («DOCX is not accepted») is rewritten.

**Steps**
- [ ] **Failing tests** with the file's fake admin; the storage download returns a docx built with `zipSync`:
  - `B3: a docx becomes a text/plain file when text files are on`: `files[0].mime` === "text/plain", `files[0].pages` === 1, `files[0].url.startsWith("https://site.test/api/v1/ai/file-text/")` is true, and `pages` === 1.
  - `B3: the same docx with the flag off is refused`: `code` === "file_type".
  - `B3: .doc is refused with its own copy`: mime `application/msword` gives `code` === "file_type_doc".
  - `B3: a .md stored as octet-stream is read by its extension`: the row is `{mime_type: "application/octet-stream", file_name: "n.md"}`, so `files[0].mime` === "text/plain".
- [ ] Run `node --test src/lib/ai/aiFiles.test.ts`. It must fail.
- [ ] Implement it.
- [ ] Verify the test and `npx tsc --noEmit -p .`.
- [ ] **Commit:** `feat(ai): AI file tools read .docx/.txt/.md as text (flag NZAMY_AI_TEXT_FILES, off by default)`

### Task B4: pasted text travels as a virtual text file (brief-check, wargaming)

**Shared files:** `src/lib/ai/runCore.ts`, `src/lib/ai/tools.ts`

**Files**
- Modify `src/lib/ai/tools.ts`:
  - `AiToolSpec`: add `pasteAsFile`;
  - `BRIEF_CHECK_FILES` (`:398`): `optional: true`;
  - `briefCheckInput` (`:402-411`);
  - `wargamingInput` (`:468-491`);
  - the brief-check spec (`:1279-1293`): `filesRequired`, `pasteAsFile`;
  - the wargaming spec (`:1294-1308`): `pasteAsFile`.
- Modify `src/lib/ai/runCore.ts`:
  - `StartRunDeps.pastedFileUrl`;
  - before the charge, next to the file step (`:380-400`);
  - after the run is created;
  - `pkg.input` (`:551`).
- Modify `src/app/api/v1/ai/runs/route.ts`: pass `pastedFileUrl` only under the same flag as B3.
- Modify the tests: `src/lib/ai/briefCheck.test.ts`, `src/lib/ai/caseAnalysis.test.ts` (wargaming) and `src/lib/ai/runCore.test.ts`.

**Interfaces**
- `AiToolSpec.pasteAsFile?: { field: string; name: string; maxChars: number }`.
- **brief-check**
  - `memo_text` is optional. When present it must be 200..60,000 characters after trim:
    - under 200: «النص الملصق قصير — الصق المذكرة كاملة (٢٠٠ حرف على الأقل)»;
    - over 60,000: «النص الملصق أطول من ٦٠٬٠٠٠ حرف — ارفعه ملفاً».
  - `filesRequired: (input) => !input.memo_text`.
  - `pasteAsFile: { field: "memo_text", name: "نص المذكرة (ملصق).txt", maxChars: 60000 }`.
- **wargaming**
  - `docs_text` is optional, 50..30,000 characters, with the same copy pattern.
  - `pasteAsFile: { field: "docs_text", name: "نص المستندات (ملصق).txt", maxChars: 30000 }`.
  - The existing `memo_text` is unchanged.
- `StartRunDeps.pastedFileUrl?: (runId: string, userId: string, field: string) => string`.
- runCore, **before the charge**, when `spec.pasteAsFile` and `checked.input[field]` is a non-empty string:
  - no `deps.pastedFileUrl` → 422 `{ error: "لصق النص غير متاح بعد — ارفع ملفاً", code: "paste_unavailable" }`;
  - `pages += textPages(text)`;
  - `files.length + 1 > spec.files.max` → 422 `too_many_files` («اختر طريقة واحدة: ملف أو نص ملصق»);
  - `pages > spec.files.maxPages` → 422 `too_many_pages`.
- **After the run is created**, before dispatch, append:
  ```ts
  { id: `paste:${field}`, name, mime: "text/plain", bytes, pages: textPages(text),
    url: deps.pastedFileUrl(run.run_id, actor.userId, field), url_expires_at }
  ```
- `pkg.input` omits the `pasteAsFile` field: the text travels once, as the file. `ai_runs.input` keeps it, because the B2 route reads it from there.

**Steps**
- [ ] **Failing tests**:
  - `briefCheckInput({client_capacity: "المدعي", memo_text: "x".repeat(199)}).ok` === false;
  - with 200 characters: `ok` === true and `input.memo_text.length` === 200;
  - `wargamingInput({...valid, docs_text: "x".repeat(30001)}).ok` === false;
  - runCore `B4: a pasted memo is sent as one text file and left out of the package input`:
    - brief-check, `fileIds: []`, `memo_text` of 300 characters;
    - `pastedFileUrl: (r,u,f) => \`https://s/t/${r}/${f}\``;
    - the captured pkg has `files.length` === 1, `files[0].name` === "نص المذكرة (ملصق).txt", `files[0].mime` === "text/plain", `files[0].url` === `https://s/t/${RUN}/memo_text`, and `"memo_text" in pkg.input` === false.
  - runCore `B4: no pastedFileUrl → 422 paste_unavailable, nothing charged`: the rpc spy has no `ai_start_run`.
  - runCore `B4: a file and a pasted memo together → 422 too_many_files` (brief-check `max: 1`).
- [ ] Run `node --test src/lib/ai/briefCheck.test.ts src/lib/ai/caseAnalysis.test.ts src/lib/ai/runCore.test.ts`. They must fail.
- [ ] Implement it.
- [ ] Verify with the same command plus `npx tsc --noEmit -p .`.
- [ ] **Commit:** `feat(ai): «الصق النص» for brief-check and wargaming — sent to n8n as a text file (no workflow change)`

### Task B5: STOP-POINT, prove text/plain on the live n8n, then switch the flags

This task has no code and is run by the user. The n8n doc-job node «Read» (Gemini analyze document, `workflows.mjs:913-925`) receives the downloaded binary with the response Content-Type. Gemini's document input accepts `text/plain`, but that must be seen working before anyone is charged for it.

**Steps**
- [ ] **STOP-POINT (user):**
  1. On the server, set `NZAMY_AI_TEXT_FILES=on` and restart. `NEXT_PUBLIC_AI_TEXT_FILES` stays off, so nobody else sees the option.
  2. Keep brief-check on `staff`.
  3. As admin, send one brief-check whose memo is a .docx, through `/dashboard/admin/ai-usage` or the API.
  4. Check that the run reaches `succeeded`, and that its findings quote the document.
  5. Repeat with a pasted 300-character memo.
- [ ] **If either fails** (`download_failed`, `model_error`, or the report ignores the text):
  - unset `NZAMY_AI_TEXT_FILES` and report back;
  - the fallback (text inlined into each prompt, which means editing the doc-job workflows) goes into a later section;
  - do **not** turn on the client flag.
- [ ] **If both pass:**
  1. Set `NEXT_PUBLIC_AI_TEXT_FILES=on` and rebuild (B6 UI).
  2. Record it in the owner report as «نُفِّذ ✓».

### Task B6: client pickers and paste boxes

**Files**
- Create `src/lib/ai/aiTextFilesFlag.ts`: `export const AI_TEXT_FILES_ON = process.env.NEXT_PUBLIC_AI_TEXT_FILES === "on";`.
- Modify `src/components/ai/aiReadable.ts`: all three exports get a flag parameter.
- Modify `src/components/ai/aiReadable.test.ts`. Create it if absent.
- Modify the callers of `splitAiReadable`, `isAiReadable` and `AI_READABLE_ACCEPT` (`grep -rn "aiReadable" src`): pass `AI_TEXT_FILES_ON`.
- Modify `src/app/ai/brief-check/page.tsx` (`:98-164`, `:155-157`, `:216-250`).
- Modify `src/app/ai/wargaming/page.tsx`: the files step near `:498-600` and the start call `:932-949`.

**Interfaces**
- `aiReadableAccept(textFiles = false): string` = `".pdf,.png,.jpg,.jpeg,.webp"` + (`textFiles ? ",.docx,.txt,.md" : ""`). `AI_READABLE_ACCEPT` is kept as `aiReadableAccept(false)`.
- `isAiReadable(name, textFiles = false)` and `splitAiReadable(files, textFiles = false)`. `.doc` is never readable.
- **brief-check page, when `AI_TEXT_FILES_ON`:**
  - A two-way switch «ارفع المذكرة» / «الصق نص المذكرة».
  - In paste mode: a textarea with a live character count «N / ٦٠٬٠٠٠». The AI button is enabled at 200 or more characters.
  - The run sends `{ ...input, memo_text }` with `fileIds: []`.
  - `memoIsPdf` (`:155`) becomes `isAiReadable(memo.name, AI_TEXT_FILES_ON)`.
- **wargaming page, when the flag is on:**
  - A collapsible «أو الصق نص المستندات» textarea (≤ 30,000, with a counter), sent as `docs_text`.
  - Skipped-file copy names .doc with `FILE_COPY.doc` wording.
- With the flag off, nothing renders and the behaviour is unchanged.

**Steps**
- [ ] **Failing tests**:
  - `isAiReadable("a.docx")` === false;
  - `isAiReadable("a.docx", true)` === true;
  - `isAiReadable("a.doc", true)` === false;
  - `aiReadableAccept(true).endsWith(",.docx,.txt,.md")` === true;
  - `splitAiReadable([{documentId: "1", name: "m.md"}], true).ids` deepEqual `["1"]`.
- [ ] Run `node --test src/components/ai/aiReadable.test.ts`. It must fail.
- [ ] Implement it.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(ai): Word/text pickers and paste boxes on brief-check and wargaming (NEXT_PUBLIC_AI_TEXT_FILES)`

### Task B7: «الصق النص» on contract review (a team order)

**Shared files:** intake validators (`src/lib/services/orderIntake.contracts.ts`)

**Files**
- Modify `src/lib/services/orderIntake.contracts.ts`: the review branch of `validateContractsIntake` (`:81+`) and the `ContractsIntakeV1` type.
- Modify `src/lib/services/orderIntake.contracts.test.ts`. Also check `intakeGuard.test.ts` and `intakeValues.test.ts`, which call the same validator, and keep them green.
- Modify `src/hooks/useContractsState.ts`:
  - new state `rContractText`;
  - `canProceed` r_upload (`:172`);
  - `buildReviewIntake` (`:277-288`).
- Modify `src/components/contracts/steps/review/StepRUpload.tsx`: tabs «رفع ملف» / «لصق نص العقد».
- Modify `src/app/ai/contracts/page.tsx`: pass the props.
- Modify the order readers that render the intake to the team and the client:
  - `src/app/ai/orders/[id]/_components/OrderSummary.tsx`;
  - `src/app/dashboard/admin/service-orders/page.tsx`.

  Each gets a «نص العقد الملصق» block: `whitespace-pre-wrap`, collapsed after 600 characters with «عرض الكل».

**Interfaces**
- Review intake: `contractText?: string`.
- Valid when `attachments.length > 0` **or** `contractText.trim()` is 100..50,000 characters.
- Errors:
  - neither: «ارفع ملف العقد أو الصق نصه»;
  - over 50,000: «نص العقد أطول من ٥٠٬٠٠٠ حرف — ارفعه ملفاً»;
  - 1..99: «النص الملصق قصير — الصق العقد كاملاً (١٠٠ حرف على الأقل)».
- `canProceed` r_upload: `(attachments.length > 0 || rContractText.trim().length >= 100) && !uploading`.
- Not AI: the order goes to the team through `createServiceOrder`, as today. No price or points change.

**Steps**
- [ ] **Failing tests**:
  - `{schemaVersion: 1, service: "contracts", mode: "review", representing: "الطرف الأول", attachments: [], contractText: "ع".repeat(100)}` gives `ok` === true;
  - the same with 99 characters gives errors that include «النص الملصق قصير — الصق العقد كاملاً (١٠٠ حرف على الأقل)»;
  - with no attachments and no text, errors include «ارفع ملف العقد أو الصق نصه»;
  - 50,001 characters gives the too-long error.
- [ ] Run `node --test src/lib/services/orderIntake.contracts.test.ts src/lib/services/intakeGuard.test.ts src/lib/services/intakeValues.test.ts`. The first must fail.
- [ ] Implement it.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(contracts): contract review takes pasted contract text as well as a file`

### Task B8: attachment preview modal

**Files**
- Create `src/lib/attachments/previewKind.ts` and `src/lib/attachments/previewKind.test.ts`.
- Create `src/app/api/v1/documents/[id]/preview/route.ts` (GET).
- Create `src/components/attachments/AttachmentPreviewModal.tsx`.
- Modify the mount points, adding an eye button «معاينة» on each uploaded file chip:
  - `src/components/draft/steps/StepCase.tsx`;
  - `src/components/contracts/steps/review/StepRUpload.tsx`;
  - `src/app/ai/brief-check/page.tsx`;
  - `src/app/ai/wargaming/page.tsx`;
  - `src/components/services/ServiceRequestWizard.tsx` (screenshot 13).

**Interfaces**
- `previewKindOf(mime: string | null, name: string | null): "pdf" | "image" | "text" | "none"`:
  - `application/pdf` gives `pdf`;
  - `image/png|jpeg|jpg|webp|gif` gives `image`;
  - `textKindOf` ∈ {docx, txt, md} gives `text`;
  - anything else gives `none`, including .doc.
- `GET /api/v1/documents/<id>/preview`:
  - The session client (`requireApiUser`) reads `attachments` (`id, file_name, mime_type, storage_path, size_bytes, deleted_at`). RLS limits it to the owner or a request participant. No row, or a binned one, gives 404.
  - `pdf` / `image`: the service client `createSignedUrl(storage_path, 300)` → `{ kind, name, url }`.
  - `text`: refuse `size_bytes > 22 MB` with `{ kind: "none", reason: "too_large" }`. Otherwise download and extract → `{ kind: "text", name, text: first 20,000 chars, truncated: boolean }`.
  - `none` → `{ kind: "none", name }`.
  - `Cache-Control: private, no-store`.
  - The attachment id is checked with `isValidAttachmentId` (`documents/_shared.ts`).
- `<AttachmentPreviewModal documentId name onClose />`:
  - `pdf` shows an `<iframe title=name src=url>`; `image` an `<img alt=name>`; `text` a `<pre dir="auto" class="whitespace-pre-wrap">`, plus «يُعرض أول ٢٠٬٠٠٠ حرف» when truncated.
  - `none` shows «لا تتوفر معاينة لهذا النوع من الملفات».
  - Escape and the backdrop close it, focus returns to the button, and it has `role="dialog"` with `aria-modal`.
  - Loading and error states are real; there is no fake progress.

**Steps**
- [ ] **Failing tests**:
  - `previewKindOf("application/pdf", "x")` === "pdf";
  - `previewKindOf("", "a.MD")` === "text";
  - `previewKindOf("application/msword", "a.doc")` === "none";
  - `previewKindOf("image/webp", "p")` === "image".
- [ ] Run `node --test src/lib/attachments/previewKind.test.ts`. It must fail.
- [ ] Implement the helper, the route, the modal and the 5 mounts.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(uploads): instant preview of an uploaded file (PDF, image, Word/text)`

### Task B9: drop the forced specialty and branch (the AI infers them)

**Shared files:** `src/lib/ai/tools.ts`, intake validators (`src/lib/services/orderIntake.ts`)

**Precondition:** STOP-POINT B10 (the n8n import) is done before this ships.

**Files**
- Modify `src/lib/ai/tools.ts`:
  - `wargamingInput` `:471-472`: `area` becomes optional;
  - `legalDrafterInput` `:1046-1047`: `branch` becomes optional, and the `:1088` search fallback changes;
  - `DRAFT_COPY.branch` `:992` is removed.
- Modify `src/lib/services/orderIntake.ts:242-243`: `legalBranch` is no longer required.
- Modify `src/hooks/useDraftState.ts:202`.
- Modify `src/components/draft/steps/StepIdentify.tsx`: the label.
- Modify `src/app/ai/draft/page.tsx:191`: send `branch: s.legalBranch || null`.
- Modify `src/app/ai/wargaming/page.tsx:93-94`, `:364-366` and the area label.
- Modify `src/app/ai/legal-opinion/page.tsx:213`: the consult needs only the description; the area label says «(اختياري)».
- Modify the tests:
  - `src/lib/ai/legalDrafter.test.ts:142-146`: flip «kind, role and branch required»;
  - `src/lib/ai/caseAnalysis.test.ts`;
  - `src/lib/services/orderIntake.test.ts` (`validateDraftIntake`). Keep `intakeGuard.test.ts` and `intakeValues.test.ts` green.

**Interfaces**
- `wargamingInput`: `area` blank or absent gives `null`; over 150 characters gives «تخصص القضية أطول من المسموح».
- `legalDrafterInput`:
  - `branch` blank gives `null`; over 60 characters gives «الفرع القانوني أطول من المسموح».
  - The search fallback is `factsRaw || judgment?.reasons || judgment?.text || [branch, DRAFT_KINDS[kind].label].filter(Boolean).join(" ")`.
- `validateDraftIntake`: an empty `legalBranch` adds no error.
- **The party forms:** `draftPartiesShown("case", "")` → `{one: true, two: true}`. Only a chosen committee branch hides party two, as before. This is unchanged code, stated so the reviewer sees it.
- **The pickers stay**, labelled:
  - «الفرع القانوني (اختياري — يستنتجه الذكاء من الوقائع)»;
  - «تخصص القضية (اختياري)»;
  - «المجال القانوني (اختياري)».
- `canProceed` identify: `!!(clientRole && memoType && memoSubType)`.
- wargaming `canNext`: `ctx.role !== "" && ctx.summary.trim().length >= 20 && !uploading`. «أخرى» with empty text sends no area.

**Steps**
- [ ] **Failing tests**:
  - `wargamingInput` without `area` gives `ok` true and `input.area` === null;
  - `legalDrafterInput({phase: "issues", kind: "claim", client_role: "plaintiff", facts: "", facts_in_files: true})` gives `ok` true and `input.search_text` === DRAFT_KINDS.claim.label;
  - `validateDraftIntake` (non-specialist, no `legalBranch`): errors do not include «الفرع القانوني مطلوب»;
  - the flipped `legalDrafter.test.ts:146`: `issuesInput({branch: " "})` gives `ok` true and `input.branch` === null.
- [ ] Run `node --test src/lib/ai/legalDrafter.test.ts src/lib/ai/caseAnalysis.test.ts src/lib/services/orderIntake.test.ts src/lib/services/intakeGuard.test.ts src/lib/services/intakeValues.test.ts`. The new assertions must fail.
- [ ] Implement it.
- [ ] Verify the tests and the build.
- [ ] **Commit:** `feat(ai): specialty / branch no longer forced on the drafter, wargaming and legal opinion — the AI infers them`

### Task B10: n8n prompts infer a missing area or branch (repo JSON + STOP-POINT)

**Files**
- Modify `n8n/ai/workflows.mjs`:
  - `CASE_FRAME`, the `:351` line;
  - `LEGAL_DRAFTER_PROMPT`, the `:636` line.
- Regenerate with `node scripts/n8n-ai-export.mjs`: `n8n/ai/wargaming.json`, `analyze-strength.json` and `legal-drafter.json`.
- Modify `src/lib/ai/n8nWorkflows.test.ts`.

**Interfaces**
- CASE_FRAME:
  ```js
  'تخصص القضية: ' + (i.area ? '«' + esc(i.area) + '».' : 'لم يحدده المحامي — استنتجه من الوقائع والمستندات، واذكره في أول الملخص.')
  ```
- LEGAL_DRAFTER_PROMPT:
  ```js
  'الفرع القانوني: ' + (i.branch ? '«' + esc(i.branch) + '».' : 'لم يحدده المحامي — استنتجه من الوقائع.')
  ```
- **This also fixes analyze-strength**, which never sends `area` and today prints «تخصص القضية: «»».

**Steps**
- [ ] **Failing tests**, run through the file's Code-node harness:
  - `B10: wargaming prompt with no area asks the model to infer it`: the built prompt includes «استنتجه من الوقائع» and includes neither ««»» nor «undefined»;
  - `B10: wargaming prompt with area عمالي quotes it`: includes «تخصص القضية: «عمالي».»;
  - `B10: drafter prompt with no branch asks the model to infer it`.
- [ ] Run `node --test src/lib/ai/n8nWorkflows.test.ts`. It must fail.
- [ ] Edit `workflows.mjs` and run `node scripts/n8n-ai-export.mjs`. Check that the CRLF line endings of the JSON match the repo, and never set autocrlf.
- [ ] Verify with `node --test src/lib/ai/n8nWorkflows.test.ts` and `git diff --stat n8n/ai`. Only the 3 JSON files and `workflows.mjs` may change.
- [ ] **STOP-POINT (user):** import the 3 JSON files on the live n8n over the existing workflows (ids in `n8n/ai/README.md`), and re-select the credentials. **This must happen BEFORE the deploy that carries B9.** The new prompt is correct with or without the value, so importing first is safe.
- [ ] **Commit:** `feat(n8n): wargaming / analyze-strength / drafter prompts infer a missing specialty (import before B9 deploy)`

---

## Part C: the collector hub

### Task C1: a typed context hand-off (pure)

**Files:** create `src/lib/ai/contextHandoff.ts` and `src/lib/ai/contextHandoff.test.ts`.

`src/lib/ai/transcriptHandoff.ts` and its test are **not changed**. The drafter keeps consuming them.

**Interfaces (produces)**
- `CONTEXT_TARGETS = ["drafter", "contracts-pro", "legal-opinion", "wargaming", "direction-support", "canvas"] as const`, and `type ContextTarget`.
- `CONTEXT_TARGET_META: Readonly<Record<ContextTarget, { label: string; href: string | null; maxChars: number; live: boolean; consultantBlocked: boolean }>>`:

| Target | Label | `href` | `maxChars` | `live` | `consultantBlocked` |
|---|---|---|---|---|---|
| drafter | الصائغ القانوني | `/ai/draft?from=context` | 12000 (`DRAFT_FACTS_MAX`) | true | true |
| contracts-pro | محترف العقود | `/ai/contracts?from=context` | 4000 (`CONTRACTS_PRO_DESC_MAX`) | true | false |
| legal-opinion | الرأي الفصل | `/ai/legal-opinion?from=context` | 6000 (`LEGAL_OPINION_QUESTION_MAX`) | true | false |
| wargaming | المحاكي الشامل | `/ai/wargaming?from=context` | 6000 (`CASE_SUMMARY_MAX`) | true | true |
| direction-support | داعم الاتجاه | null | 0 | false | false |
| canvas | استوديو الكانفاس | null | 0 | false | false |

  The two dead targets render «قريباً»:
  - direction-support is ComingSoon at HEAD;
  - the canvas studio is Wave 7 / q٤٢٨.

- `CONTEXT_FROM_PARAM = "context"`, and the storage key `` `nzamy.contextHandoff.${target}` `` in **sessionStorage**.
- `CONTEXT_HANDOFF_TTL_MS = 30 * 60 * 1000`.
- `buildContextHandoff(target, items: { title: string; content: string }[], sourceLabel: string, now = Date.now()): { v: 1; target; text; sourceLabel; createdAt; truncated } | null`:
  - Each item becomes `«title»\ncontent`, joined by `"\n\n—\n\n"`.
  - The result is cut to `maxChars`, with `truncated: true`.
  - Empty → null.
- `writeContextHandoff(storage, target, items, sourceLabel, now?)` → `{ ok: true; truncated: boolean } | { ok: false; reason: "empty" | "storage" | "coming_soon" }`.
- `consumeContextHandoff(storage, target, now?)` → the handoff or null:
  - It removes the key on every read.
  - It rejects an expired value, a wrong `v`, or a `target` mismatch.
- `discardContextHandoff(storage, target)`.
- Relative imports only, so `node --test` loads it. The limits are imported from `./tools.ts`.

**Steps**
- [ ] **Failing tests**:
  - `wargaming truncates at 6000`: one item of 7,000 characters gives `text.length` === 6000 and `truncated` === true.
  - `direction-support is coming soon`: `writeContextHandoff(mem, "direction-support", [{title: "a", content: "b"}], "x")` deepEqual `{ok: false, reason: "coming_soon"}`.
  - `consume once`: write drafter, then consume, gives `text` === "«a»\nb"; a second consume gives null.
  - `expired`: `consumeContextHandoff(mem, "drafter", created + 31*60*1000)` === null.
  - `target mismatch`: a value stored under the drafter key with `target: "wargaming"` gives null.
- [ ] Run `node --test src/lib/ai/contextHandoff.test.ts src/lib/ai/transcriptHandoff.test.ts`. The new file must fail; the old one stays green.
- [ ] Implement it.
- [ ] Verify with the same command.
- [ ] **Commit:** `feat(collector): typed «إرسال مع السياق» hand-off for six targets (two «قريباً»)`

### Task C2: the «إرسال مع السياق إلى ▾» menu in the collector and on AI results

**Files**
- Create `src/components/ai/SendWithContextMenu.tsx`.
- Modify `src/app/ai/collector/page.tsx:99-106`: the plain drafter link is replaced by the menu over the current tab's selection.
- Modify `src/app/ai/collector/_components/DesktopPanel.tsx`: the selection exists (`selected`, `:101`); add the menu to the bulk bar.
- Modify `src/app/ai/collector/_components/SessionsPanel.tsx`: the menu on an open session sends its items.
- Modify `src/components/AiResultActions.tsx`: the menu next to «المجمّع». It shows only where `canShowCollector` (lawyer and firm, `:73-74`) and sends `[{ title: filename, content: text }]`.

**Interfaces**
- `<SendWithContextMenu items: {title: string; content: string}[] sourceLabel: string disabled?: boolean />`:
  - The button is «إرسال مع السياق إلى ▾». The menu has `role="menu"` and one `role="menuitem"` per `CONTEXT_TARGETS`.
  - A dead target is disabled with a «قريباً» badge.
  - A `consultantBlocked` target is disabled for a consultant, using the same client check as `draft/page.tsx:49` (`user.practiceKind === "consultant"`). Its title is `CONSULTANT_BLOCKED_MESSAGE`.
  - A live target runs `writeContextHandoff(sessionStorageOrNull(), …)`:
    - `ok` → `router.push(href)`;
    - `storage` → inline «تعذّر تجهيز السياق في هذا المتصفح — انسخ النص يدوياً»;
    - `empty` → the menu is disabled before that.
  - Before navigating, it shows the truncation as a real count: «سيُرسل أول N حرف (حد الأداة)».

**Steps**
- [ ] **Failing test.** Add a pure `contextMenuEntries(practiceKind: string | null)` to `contextHandoff.ts`, returning `{target, label, enabled, badge}[]`, and test it in `contextHandoff.test.ts`:
  - `contextMenuEntries("consultant")`: the drafter and wargaming entries have `enabled` false;
  - `contextMenuEntries("advocate")`: direction-support has `badge` === "قريباً" and `enabled` false;
  - contracts-pro has `enabled` true.
- [ ] Run `node --test src/lib/ai/contextHandoff.test.ts`. It must fail.
- [ ] Implement the helper, the component and the 4 mounts.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(collector): «إرسال مع السياق إلى ▾» in the collector and on AI results`

### Task C3: the four live targets read the hand-off

**Files**
- Modify `src/app/ai/draft/page.tsx:62-86`: next to the transcript consume, `?from=context` → `consumeContextHandoff(…, "drafter")` → `s.setCaseText(text)`. Without the param it calls `discardContextHandoff`.
- Modify `src/app/ai/contracts/page.tsx` with `useContractsState.setContractDesc`: draft mode is preselected and the description is prefilled.
- Modify `src/app/ai/legal-opinion/page.tsx`: the consult type is preselected and `setDescription(text)` (`:109`).
- Modify `src/app/ai/wargaming/page.tsx`: `setCtx({...ctx, summary: text})` (`:477`).

Each page shows a dismissible notice «أُضيف نص من «sourceLabel»». When `truncated`, it adds «— قُصّ إلى حدّ الأداة».

**Interfaces (consumes):** C1.

**Steps**
- [ ] **Failing test.** Add a pure `contextNoticeText(h: {sourceLabel: string; truncated: boolean}): string` to `contextHandoff.ts`:
  - `{sourceLabel: "المجمّع البحثي", truncated: true}` gives «أُضيف نص من «المجمّع البحثي» — قُصّ إلى حدّ الأداة»;
  - with `truncated: false` it gives «أُضيف نص من «المجمّع البحثي»».
- [ ] Run `node --test src/lib/ai/contextHandoff.test.ts`. It must fail.
- [ ] Implement the helper and the 4 consumers. Each reads `useSearchParams` in a client `useEffect`, never during SSR.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(collector): drafter, contracts pro, legal opinion and wargaming open pre-filled from the hand-off`

### Task C4: «+ المجمّع» on a judicial principle

**Files**
- Modify `src/app/precedents/[slug]/_principle-block.tsx`: next to the copy and cart buttons.
- Create `src/lib/library/principleCollectorItem.ts` and `src/lib/library/principleCollectorItem.test.ts`.

**Interfaces**
- `principleCollectorItem(p: { text?: string | null; locked?: boolean }, reference: string): { title: string; content: string } | null`:
  - null when `p.locked`. A locked principle's full text is paywalled, so it is never saved.
  - Otherwise the title is `reference` and the content is `cleanPrincipleText(p.text)`, cut to 20,000 characters.
- The button «+ المجمّع» is shown only to lawyer and firm (`useUser`), as in `AiResultActions` (`:73-74`). It is hidden for a locked principle.
- On click: `addToInbox` with source `"legal-library"` (an existing `InboxSource`, `SOURCE_LABELS` «المكتبة القانونية»).
  - Success: «أُضيف للمجمّع ✓».
  - A failed save says so: «تعذّر الحفظ في المجمّع».

**Steps**
- [ ] **Failing tests**:
  - `principleCollectorItem({text: "نص", locked: true}, "مبدأ ١")` === null;
  - `principleCollectorItem({text: "**نص**"}, "مبدأ ١")` deepEqual `{title: "مبدأ ١", content: cleanPrincipleText("**نص**")}`.
- [ ] Run `node --test src/lib/library/principleCollectorItem.test.ts`. It must fail.
- [ ] Implement the helper and the button.
- [ ] Verify:
  - the test;
  - the build;
  - `node --test src/app/api/library/library-column-lock.test.ts` stays green.
- [ ] **Commit:** `feat(library): save a judicial principle to the collector (never a locked one)`

---

## Part D: activity log

### Task D1: `ai_runs` in the unified activity log

**Files**
- Modify `src/lib/events.ts`:
  - `ActivityBadge` (`:201-211`) adds `"ai"`;
  - add `describeAiRun`.
- Modify `src/lib/events.test.ts`. Create it if absent.
- Modify `src/app/api/v1/lawyer/activity/route.ts`:
  - a fourth stream next to `:138-147`;
  - `degraded`;
  - `nextCursor` (`:290-294`).
- Modify `src/app/dashboard/lawyer/activity/page.tsx`:
  - the `ai` badge style (Robot icon);
  - delete the stale comment `:107-111`;
  - `matchesCardFilter` (`:175`) returns false for `ai` rows, because the stat cards count orders.

**Interfaces**
- `describeAiRun(r: { tool: string; status: string; chargedPoints: number; refunded: boolean }): DescribedEvent` with `badge: "ai"` and `title: \`«${aiToolLabelAr(tool)}»\``. The description depends on the status:

  | Status | Description |
  |---|---|
  | succeeded, chargedPoints > 0 | «اكتملت — خُصم N نقطة» (N in Arabic digits, `pointsNounAr`) |
  | succeeded, 0 points | «اكتملت دون خصم» |
  | failed + refunded | «تعذّرت وأُعيدت النقاط» |
  | failed, not refunded | «تعذّرت» |
  | running | «قيد التنفيذ» |
  | review | «بانتظار مراجعة الفريق» |

- The stream uses the **RLS** client from `assertRole`, which matches the owner select policy:
  ```ts
  supabase.from("ai_runs")
    .select("id, tool, status, charged_points, refunded_at, created_at")
    .eq("user_id", uid)
  ```
  It applies `before`, then `.order("created_at", { ascending: false }).limit(PAGE_SIZE)`.
- Each item:
  - `id: \`ai:${id}\``;
  - `requestHref: \`/ai/runs/${id}\`` (A7);
  - `requestId: null`.
- If the table is missing (42P01 / PGRST205), the stream is empty and **not** degraded. Any other error degrades the feed.
- `nextCursor` also continues when the AI stream returned `PAGE_SIZE` rows.

**Steps**
- [ ] **Failing tests**:
  - `describeAiRun({tool: "brief-check", status: "succeeded", chargedPoints: 200, refunded: false})` deepEqual `{badge: "ai", title: "«مراجعة وتدقيق مذكرة»", description: "اكتملت — خُصم ٢٠٠ نقطة"}`;
  - `describeAiRun({tool: "x", status: "failed", chargedPoints: 50, refunded: true}).title` === "«أداة ذكاء اصطناعي»" and its `description` === "تعذّرت وأُعيدت النقاط".
- [ ] Run `node --test src/lib/events.test.ts`. It must fail.
- [ ] Implement it.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(activity): every AI run appears in the activity log, linked to /ai/runs/[id]`

---

## Part E: live waiting telemetry

### Task E1: migration 20261103_31, `progress_events`

**Files**
- Create `supabase/migrations/20261103_31_progress_events.sql`.
- Create `supabase/tests/rls/progress_events.test.sql`.
- Modify `supabase/migrations/_verify.sql`: block `verify:progress_events`.
- Modify `src/app/api/v1/cron/ai-sweep/route.ts`: `?task=retention` also calls `progress_events_prune`. A missing function (42883 / PGRST202) is skipped, never a 500.

**Interfaces (produces)**
- Table `public.progress_events`. It is a new table, so its RLS is not a STOP-POINT.
  ```sql
  id         bigserial primary key,
  run_id     uuid not null references public.ai_runs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null constraint progress_events_kind_check
             check (kind in ('file','query','law','principle','verify','step','note')),
  label      text not null constraint progress_events_label_check
             check (char_length(label) between 1 and 200),
  created_at timestamptz not null default now()
  ```
- Index `progress_events_run_idx on (run_id, id)`.
- RLS enabled, with policy `"own progress events"` for select to authenticated using `(user_id = auth.uid())`.
- Grants:
  - `revoke all … from anon, authenticated, public`;
  - `grant select (id, run_id, kind, label, created_at) to authenticated`;
  - `grant all to service_role`;
  - usage on the sequence to service_role.
- The table comment says: titles and article numbers only, never a text (R7).
- `public.progress_events_prune() returns int`:
  - deletes rows older than 7 days;
  - security definer, `search_path = ''`;
  - service_role only.
- The final SELECT, whose `ok` is never NULL:
  ```sql
  select coalesce(
           to_regclass('public.progress_events') is not null
           and not has_table_privilege('authenticated','public.progress_events','INSERT'),
           false) as ok;
  ```
- **Runs BEFORE deploy.** The code tolerates its absence (E2: an insert error is logged once and ignored; E5: the reads return `events: []`).

**Steps**
- [ ] **Failing test** `progress_events.test.sql`. CHAIN: the `ai_runs.test.sql` chain, then `20261103_31` twice, then the verify block, then the test.
  - **T0:** the table exists. This is the negative control.
  - **T1:** as A, `select count(*) from progress_events` counts only A's 2 rows; B's row is not visible.
  - **T2:** an insert as authenticated raises 42501.
  - **T3:** a 201-character label raises 23514.
  - **T4:** deleting the run as service_role deletes its events.
  - **T5:** `progress_events_prune()` returns 1 for a row dated `now() - interval '8 days'` and keeps the 1-day-old row.
- [ ] Run `bash supabase/tests/rls/run.sh <chain> supabase/tests/rls/progress_events.test.sql`. It must fail at T0.
- [ ] Write the migration, the verify block and the cron change.
- [ ] Verify:
  - the chain passes, and `ok = t` on both runs;
  - `node --test src/app/api/library/library-column-lock.test.ts` is still green (no library table touched).
- [ ] **Commit:** `feat(ai): progress_events table — titles only, own rows, 7-day prune (20261103_31, BEFORE deploy)`

### Task E2: progress event builders (pure, R7)

**Files:** create `src/lib/ai/progressEvents.ts` and `src/lib/ai/progressEvents.test.ts`.

**Interfaces**
- `type ProgressKind = "file" | "query" | "law" | "principle" | "verify" | "step" | "note"`.
- `interface ProgressEvent { kind: ProgressKind; label: string }`.
- `cleanLabel(s: unknown): string | null`:
  - strips control characters;
  - collapses whitespace;
  - cuts to 199 characters + «…» when longer than 200;
  - empty → null.
- `fileEvents(files: { name: string }[]): ProgressEvent[]`.
- `queryEvents(queries: string[]): ProgressEvent[]`.
- `sourceEvents(sources: Pick<PackageSource, "kind" | "title">[]): ProgressEvent[]`:
  - `kind` "article" → `law`, "principle" → `principle`;
  - the label is **`title` only**;
  - the parameter type has no `text`, and the caller maps to `{kind, title}` before calling.
- `verifyEvent(output: Record<string, unknown>): ProgressEvent | null`: when `output.citation_check` is an array of length n > 0, the label is «تحقق من n إحالة نظامية في المكتبة», with n in Arabic digits.
- `STEP_LABEL_AR = { reading: "يقرأ المستندات", drafting: "يكتب الناتج", reviewing: "يراجع الناتج", sent: "أُرسل الطلب إلى المحرّك" }`.
- `recordProgress(admin: SupabaseClient, runId: string, userId: string, events: ProgressEvent[]): Promise<void>`:
  - one insert of up to 40 rows;
  - never throws;
  - 42P01 / PGRST205 is logged once per process, then ignored.

**Steps**
- [ ] **Failing tests**:
  - `R7: a source event carries the title, never the text`: `sourceEvents([{kind: "article", title: "نظام العمل — المادة ٧٧", text: "SECRET"} as any].map(({kind, title}) => ({kind, title})))` deepEqual `[{kind: "law", label: "نظام العمل — المادة ٧٧"}]`.
  - A guard on the caller-side mapping helper `toSourceRefs(sources)`, exported too: `JSON.stringify(toSourceRefs([{sid: "S1", kind: "article", title: "t", text: "SECRET"}]))` does not include "SECRET".
  - `cleanLabel("a\n\tb")` === "a b"; `cleanLabel("x".repeat(300)).length` === 200; `cleanLabel("  ")` === null.
  - `fileEvents([{name: "  "}, {name: "عقد.pdf"}])` deepEqual `[{kind: "file", label: "عقد.pdf"}]`.
- [ ] Run `node --test src/lib/ai/progressEvents.test.ts`. It must fail.
- [ ] Implement it.
- [ ] Verify with the same command.
- [ ] **Commit:** `feat(ai): progress event builders — file names, searches, law titles, never texts (R7)`

### Task E3: runCore emits progress events

**Shared files:** `src/lib/ai/runCore.ts`

**Files**
- Modify `src/lib/ai/runCore.ts`: `StartRunDeps`, after the run is created, after lib-queries (`:504-508`), after retrieval (`:527-528`), before the n8n call (`:560`), and on a settle with `citation_check`.
- Modify `src/lib/ai/runCore.test.ts`.
- Modify `src/app/api/v1/ai/runs/route.ts` and `src/app/api/v1/ai/callback/route.ts`: bind `progress` to `recordProgress(admin, …)` through `after`.

**Interfaces**
- `StartRunDeps.progress?: (runId: string, userId: string, events: ProgressEvent[]) => void`. Fire-and-forget, never awaited on the money path.
- The same `progress` goes into `callbackWith`'s deps (E6).
- The emit order:
  1. `fileEvents(files)`, including pasted virtual files;
  2. `queryEvents(queries)`;
  3. `sourceEvents(toSourceRefs(found.sources))`;
  4. `{kind: "step", label: STEP_LABEL_AR.sent}`;
  5. on success, `verifyEvent(output)` when present.

**Steps**
- [ ] **Failing test** `E3: progress gets files, then searches, then law titles, never texts`:
  - a retrieval tool (quick-answer);
  - fake lib-queries returns `{queries: ["أجر العامل"]}`;
  - fake retrieve returns `sources: [{sid: "S1", kind: "article", title: "نظام العمل — المادة ٧٧", text: "NEVER"}]`;
  - the collected kinds in order equal `["query", "law", "step"]`;
  - `JSON.stringify(collected)` does not include "NEVER".
- [ ] Run `node --test src/lib/ai/runCore.test.ts`. It must fail.
- [ ] Implement it.
- [ ] Verify with the same command plus `npx tsc --noEmit -p .`.
- [ ] **Commit:** `feat(ai): runCore records real progress — files, searches, law titles, verify`

### Task E4: job runs answer with the run id BEFORE lib-queries and retrieval

**Shared files:** `src/lib/ai/runCore.ts`

**Files**
- Modify `src/lib/ai/runCore.ts`: split `startRunWith` at `:470` into the checks-and-charge part and a new `dispatchRunWith`.
- Modify `src/lib/ai/runErrors.ts` (A7): the code → Arabic map.
- Modify `src/lib/ai/runErrors.test.ts`.
- Modify `src/lib/ai/runCore.test.ts`.
- Modify `src/app/api/v1/ai/runs/route.ts`: `defer: (fn) => after(fn)`, imported from `next/server`.

**Interfaces**
- `StartRunDeps.defer?: (task: () => Promise<void>) => void`.
- `dispatchRunWith(admin, deps, ctx: { spec; run: StartedRun; checked; files; pages; history; conversationId; isAdmin; hold; deadline; startedAt; actor }): Promise<RouteReply>`. It holds `:477-599` as it is today, including every `failRun` refund.
- In `startRunWith`, after the run is created (and after A3's hold flag and B4's virtual file):
  - **`spec.class === "job"` and `deps.defer`:** call `deps.defer(async () => { try { await dispatchRunWith(…) } catch (e) { await failRun(admin, run.run_id, "internal", String(e)) } })`, then **return at once** `202 { runId, status: "running", ...charged }`.
    - This is before lib-queries, before retrieval and before the n8n webhook.
    - Every later failure reaches the user by polling, as an `error_code`.
  - **Otherwise** (fast tools, or no `defer` as in tests): `return await dispatchRunWith(…)`. This is today's behaviour. The 31 existing tests do not pass `defer`, so they run unchanged.
- Why fast tools stay synchronous:
  - `assistant/_assistant-client.ts` and `laws/[slug]/_library-assistant.ts` call fast tools without `useAiRun` and expect the answer in the reply.
  - A fast run's progress is still visible by its idempotency key (E5).
- `runErrors.ts` adds `RUN_ERROR_AR: Readonly<Record<string, string>>`:

  | Code | Message |
  |---|---|
  | no_sources | «لم أجد في مكتبة الأنظمة نصوصاً تتعلق بسؤالك، وأُعيدت نقاطك — جرّب صياغة أخرى» |
  | ungrounded | «لم تُجب نصوص المكتبة التي وجدتها عن سؤالك، وأُعيدت نقاطك — جرّب صياغة أخرى» |
  | timeout | «استغرق الطلب وقتاً أطول من المسموح، وأُعيدت نقاطك — حاول مرة أخرى» |
  | no_queries, store_failed, bad_reply, model_error, unreachable, internal | «تعذّر إكمال الطلب، وأُعيدت نقاطك» |

  `runFailureMessage` uses this map first when the run was refunded. The strings are literal copies, so the client bundle never imports `runCore.ts`.

**Steps**
- [ ] **Failing tests**:
  - `E4: a job tool answers 202 before lib-queries`:
    - legal-opinion-consult (job + retrieval);
    - `defer` captures the task without running it;
    - the reply status is 202 and `body.runId` === RUN;
    - the fake n8n call log is empty;
    - then run the captured task: the n8n log paths are `[LIB_QUERIES_PATH, "nzamy-ai/legal-opinion-consult"]`.
  - `E4: a background no_sources refunds`: retrieve returns no sources, then the captured task runs; the rpc spy has `ai_fail_run` with `p_code` === "no_sources".
  - `E4: a background throw refunds as internal`: retrieve throws a non-Error from inside a patched dep, and `ai_fail_run` gets `p_code` "internal".
  - `runErrors: every RUN_ERROR_AR string equals its AI_COPY twin`: the test imports both and checks `RUN_ERROR_AR.no_sources === AI_COPY.noSources`, `ungrounded`, and `timeout`.
- [ ] Run `node --test src/lib/ai/runCore.test.ts src/lib/ai/runErrors.test.ts`. They must fail.
- [ ] Implement it.
- [ ] Verify:
  - `npm run test:unit` (only the 6 known CRLF failures remain);
  - `npx tsc --noEmit -p .`;
  - the build.
- [ ] **Commit:** `fix(ai): job runs return their id before searches and retrieval (no more 60 s nginx cut on consult / drafter)`

### Task E5: progress read routes

**Files**
- Create `src/lib/ai/progressRead.ts` and `src/lib/ai/progressRead.test.ts`.
- Create `src/app/api/v1/ai/runs/[id]/events/route.ts` (GET).
- Create `src/app/api/v1/ai/runs/progress/route.ts` (GET). The static segment `progress` takes precedence over `[id]`.

**Interfaces**
- `parseAfter(raw: string | null): number`: a non-negative safe integer, else 0.
- `parseProgressKey(raw: string | null): string | null`: `/^[A-Za-z0-9_-]{8,100}$/`, the same as `runCore.ts:141`.
- `GET /api/v1/ai/runs/<id>/events?after=N`:
  - The RLS client (`requireApiUser`) reads the run (`id, status, progress_step`, own row). None → 404.
  - It reads `progress_events` with `run_id = id` and `id > N`, ordered by id, limit 100.
  - Reply: `{ status, step, events: [{id, kind, label}], final: status !== "running" }`.
  - A missing table gives `events: []`.
  - `Cache-Control: private, no-store`.
- `GET /api/v1/ai/runs/progress?key=K&after=N`:
  - The session user is required.
  - The **service** client is needed, because `idempotency_key` is not granted to sessions. It reads `ai_runs` with `user_id = auth.uid` and `idempotency_key = K`, selecting `id, status, progress_step`.
  - None → `{ runId: null, status: null, events: [] }`. That is not a 404, because the POST may not have created the run yet.
  - Otherwise it returns the same events as above, also filtered by `user_id`.

**Steps**
- [ ] **Failing tests**:
  - `parseAfter("12")` === 12;
  - `parseAfter("-1")` === 0;
  - `parseAfter("abc")` === 0;
  - `parseAfter("9007199254740993")` === 0;
  - `parseProgressKey("short")` === null;
  - `parseProgressKey("abcDEF12_-")` === "abcDEF12_-".
- [ ] Run `node --test src/lib/ai/progressRead.test.ts`. It must fail.
- [ ] Implement the helpers and the 2 routes.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(ai): read a run's progress by id, or by idempotency key while a fast run is in flight`

### Task E6: callback details and n8n progress branches (repo JSON + STOP-POINT)

**Shared files:** `src/lib/ai/runCore.ts`

**Files**
- Modify `src/lib/ai/runCore.ts`, the progress branch of `callbackWith` (`:623-629`).
- Modify `n8n/ai/workflows.mjs`: a helper `withProgressBranches(wf)` used by `toDocJobWorkflow`, `toCaseJobWorkflow` and `toClauseJobWorkflow`.
  - At HEAD all 9 job workflows use one of these three builders (`AI_WORKFLOWS` `kind`, `:757-848`):
    - docJob: case-brief, brief-check;
    - clauseJob: contracts-pro;
    - caseJob: the other six.
  - In a caseJob the «drafting» branch is attached on both the files path (Read) and the no-files path (Agent).
- Regenerate every job JSON with `node scripts/n8n-ai-export.mjs`:
  - case-brief, brief-check, wargaming, analyze-strength;
  - contract-drafter, contracts-pro;
  - legal-opinion-consult, legal-opinion-letter;
  - legal-drafter.
- Modify `src/lib/ai/runCore.test.ts` and `src/lib/ai/n8nWorkflows.test.ts`.

**Interfaces**
- **The callback body** `{ run_id, status: "progress", step, kind?: "step" | "note", detail?: string }`:
  - `step` must still be in `PROGRESS_STEPS`. Otherwise it returns 400, as today.
  - `progress_step` is updated as today.
  - Then `deps.progress(runId, run.user_id, [{ kind: kind === "note" ? "note" : "step", label: cleanLabel(detail) ?? STEP_LABEL_AR[step] }])`.
  - Unknown extra fields are ignored. An old n8n sends neither field, and an old app ignores both, so **either deploy order is safe**.
- **n8n:** two dead-end parallel branches. No node after them reads their output, so `$json` on the main path never changes.
  - `Progress · reading`:
    - attached as a second target of «Accepted 202»'s main output;
    - HTTP POST to `respond.callback_url` with the callback credential;
    - body `{ run_id, status: "progress", step: "reading", kind: "note", detail: "يقرأ " + files.length + " ملف" }`;
    - `onError: "continueRegularOutput"`, `timeout: 5000`, no retry.
  - `Progress · drafting`:
    - a second target of «Ready?» true (doc and case jobs), of the node before the Agent (the caseJob no-files path), and of the node before the first clause call (clauseJob);
    - `step: "drafting"`, `kind: "step"`.

**Steps**
- [ ] **Failing tests**:
  - runCore `E6: a progress callback with detail records a note`:
    - the body is `{run_id: RUN, status: "progress", step: "reading", kind: "note", detail: "يقرأ ٢ ملف"}`;
    - the progress spy gets `[{kind: "note", label: "يقرأ ٢ ملف"}]`;
    - the reply is 200.
  - runCore `E6: without detail the step label is used`: step "drafting" gives the label «يكتب الناتج».
  - n8nWorkflows `E6: every job workflow reports reading on a dead-end branch`:
    - for each job JSON, a node named `Progress · reading` exists;
    - `connections["Accepted 202"].main[0]` contains both it and the old next node;
    - `connections["Progress · reading"]` is undefined;
    - the node has `onError === "continueRegularOutput"`.
- [ ] Run `node --test src/lib/ai/runCore.test.ts src/lib/ai/n8nWorkflows.test.ts`. They must fail.
- [ ] Implement it, then run `node scripts/n8n-ai-export.mjs`.
- [ ] Verify the same tests and `git diff --stat n8n/ai`.
- [ ] **STOP-POINT (user):** import the regenerated job JSON files on the live n8n over the existing workflows, and re-select the credentials. This is independent of the app deploy order.
  - `wargaming`, `analyze-strength` and `legal-drafter` JSON are regenerated by both B10 and E6.
  - If B10's import has not happened by the time E6 is merged, import **once**: the E6 files carry both changes, and that single import must still come before the deploy that carries B9.
- [ ] **Commit:** `feat(ai): n8n job workflows report reading / drafting progress with detail (import is a user step)`

### Task E7: `useAiRun` follows progress

**Files**
- Modify `src/hooks/useAiRun.ts`.
- Modify `src/lib/ai/runErrors.ts`: add `mergeProgressEvents`.
- Modify `src/lib/ai/runErrors.test.ts`.

**Interfaces**
- `AiRunState` adds:
  - `events: { id: number; kind: string; label: string }[]`;
  - `startedAt: number | null`, which is `Date.now()` at `start()`, a real clock.
- **While the POST is in flight**, poll `GET /api/v1/ai/runs/progress?key=<the idempotency key>&after=<last id>` every 1500 ms. This covers fast tools and the moment before a job's 202. It stops when the POST settles.
- **After a 202**, the job poll uses `GET /api/v1/ai/runs/<id>/events?after=` every 3000 ms. On `final` it does one `GET /api/v1/ai/runs/<id>` for the output, then applies A7's review and failure rules.
- An error code from polling becomes `runFailureMessage(code, refunded, creditUsed)` (A7 + E4), so `no_sources`, `ungrounded` and `timeout` keep their specific Arabic.
- `mergeProgressEvents(prev, next)`: dedupe by id, sort ascending, keep the last 60.

**Steps**
- [ ] **Failing tests**:
  - `mergeProgressEvents([{id: 2, …}], [{id: 1, …}, {id: 2, …}]).map(e => e.id)` deepEqual `[1, 2]`;
  - 70 events in → `length` 60, and the first id is 11;
  - `runFailureMessage("no_sources", true, false)` === RUN_ERROR_AR.no_sources.
- [ ] Run `node --test src/lib/ai/runErrors.test.ts`. It must fail.
- [ ] Implement it.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(ai): useAiRun follows real progress events and keeps the specific failure messages`

### Task E8: `<AiThinkingStage/>`

**Files**
- Create `src/components/ai/AiThinkingStage.tsx`.
- Create `src/components/ai/aiThinkingStage.logic.ts` and `src/components/ai/aiThinkingStage.logic.test.ts`.

**Interfaces**
- `<AiThinkingStage phase step events startedAt isDark toolLabel? />`, rendered while `phase` is `starting` or `running`. Its header is «يعمل الآن على: toolLabel».
- The current step label comes from `STEP_LABEL_AR`; before any event it is «بدأ التشغيل».
- Elapsed time: real seconds since `startedAt`, from a 1-second `setInterval` started in `useEffect`. There is **no percentage bar and no invented stage timing**.
- Groups appear only when non-empty: «الملفات المقروءة» (file), «عمليات البحث» (query), «النصوص المسترجعة» (law, principle), «التحقق» (verify) and «ملاحظات المحرّك» (note, step).
- `aria-live="polite"`. Motion respects `prefers-reduced-motion`. No `text-gray-100` / `text-gray-200`.
- Logic, pure:
  - `groupProgress(events)` → `{ files, queries, sources, verify, notes }` as arrays of labels;
  - `formatElapsed(ms)` → `"m:ss"` in Arabic digits.

**Steps**
- [ ] **Failing tests**:
  - `groupProgress([{kind: "file", label: "a"}, {kind: "law", label: "b"}, {kind: "principle", label: "c"}]).sources` deepEqual `["b", "c"]`;
  - `formatElapsed(65_000)` === "١:٠٥";
  - `formatElapsed(0)` === "٠:٠٠".
- [ ] Run `node --test src/components/ai/aiThinkingStage.logic.test.ts`. It must fail.
- [ ] Implement it.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(ai): <AiThinkingStage/> — real files, searches and law titles while a run works`

### Task E9: mount `<AiThinkingStage/>`, points 1–5

**Files.** Replace each page's busy spinner or text while `run.busy` with the stage. Its review and error UI stays.
1. `src/components/draft/steps/StepAiDraft.tsx` (legal-drafter: job + retrieval + files).
2. `src/components/contracts/steps/draft/StepGenerate.tsx` (contracts-pro, job).
3. `src/app/ai/contract-drafter/page.tsx` (job). Screenshot 07: «no waiting motion».
4. `src/app/ai/brief-check/page.tsx` (job + file).
5. `src/app/ai/wargaming/page.tsx` (job + files).

**Steps**
- [ ] **Failing test:** a source-level check in `src/components/ai/aiThinkingStage.mounts.test.ts`. For each of the 5 files, `readFileSync(...)` includes `"<AiThinkingStage"`.
- [ ] Run `node --test src/components/ai/aiThinkingStage.mounts.test.ts`. It must fail.
- [ ] Mount it, passing `phase`, `step`, `events`, `startedAt` and `toolLabel = aiToolLabelAr(tool)`.
- [ ] Verify the test and the build.
- [ ] **Commit:** `feat(ai): live waiting stage on the drafter, contracts pro, contract drafter, brief-check, wargaming`

### Task E10: mount `<AiThinkingStage/>`, points 6–10

**Files**

6. `src/app/ai/analyze-strength/page.tsx` (job + files).
7. `src/app/ai/case-brief/page.tsx` (job + files).
8. `src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx` (consult: job + retrieval; LIVE-03/04).
9. `src/app/ai/legal-opinion/_components/LetterWorkflow.tsx` (letter, job).
10. `src/app/ai/quick-answer/page.tsx`. A fast tool with retrieval; its progress comes by key.

**Out, and why:**
- `src/app/ai/communicate/page.tsx` and `src/app/ai/najiz-optimizer/page.tsx`: fast tools with no files and no retrieval, a single model call. There is nothing real to show beyond the step, so they keep their spinner.
- `src/app/ai/legal-opinion/page.tsx` and `src/app/ai/contracts/page.tsx`: hosts only; the stage lives in the panels (8, 9) and in StepGenerate (2).
- `src/app/dashboard/admin/ai-usage/page.tsx`: the staff test bench.
- The assistant and the law-reader assistant: they do not use `useAiRun` (chat UX).

**Steps**
- [ ] **Failing test:** extend `aiThinkingStage.mounts.test.ts` with the 5 files above.
- [ ] Run `node --test src/components/ai/aiThinkingStage.mounts.test.ts`. It must fail.
- [ ] Mount it.
- [ ] Verify:
  - the test;
  - `npm run test:unit`;
  - the build.
- [ ] **Commit:** `feat(ai): live waiting stage on analyze-strength, case-brief, legal opinion (consult + letter), quick answer`

---

## Estimate

**33 tasks:**
- Part A: 8 (A1–A8).
- Part B: 10 (B1–B10). B5 is an ops-only STOP-POINT.
- Part C: 4.
- Part D: 1.
- Part E: 10 (E1–E10).

**About 10.5 developer-days:**
- A ≈ 3;
- B ≈ 3;
- C ≈ 1;
- D ≈ 0.5;
- E ≈ 3.

Add about 30% for review and testing, as the gap analysis says. The suggested waves estimate (6–8 days) did not count the attachment preview or the paste-as-file mechanism.

**STOP-POINTS:**
1. **A4:** import the staff-alert e-mail workflow, plus the SMTP credential and `N8N_WEBHOOK_STAFF_ALERT`.
2. **A8:** the go to re-enable review mode, after _30 is on production and A3–A7 are deployed.
3. **B1 (conditional):** reading legacy `.doc` needs a new npm dependency. Not planned; refused with honest copy instead.
4. **B5:** the live text/plain proof on n8n, then the `NZAMY_AI_TEXT_FILES` / `NEXT_PUBLIC_AI_TEXT_FILES` flags.
5. **B10:** import the 3 prompt JSONs **before** the deploy that carries B9.
6. **E6:** import the job JSONs with progress branches. Either order is safe.

Migrations `20261103_30` and `_31` add no RLS change on an existing table: new columns carry no grant, and the new table has its own policy. So neither is a STOP-POINT.

## Excluded, and what blocks each

| Item | Blocked by |
|---|---|
| q335: open the AI tools to every registered account with points (drop the Pro gate), together with the ~200-character excerpts for users without library access, and the role widening | **٤١٧** (open). The excerpt layer is pointless without the answer, and widening before it hands paywalled text to free accounts (slice C R1) |
| WhatsApp alert to admins for held runs | No question number. It needs WhatsApp provider keys (ops), which the user excluded. The bell and e-mail ship |
| Legacy `.doc` extraction | A new npm dependency, so a STOP-POINT, not an owner question |
| Review mode for chat and page-less tools (`assistant`, `legal-drafter`, `library-assistant`, `canvas-card`) | Refused by A8 (`REVIEWABLE_AI_TOOLS`). No owner question: those screens need the answer in the reply, and a held drafter analysis would hide what its free draft turn builds on |
| Release / reject by the `operations` role | **New owner question** to add to the report. Until then `settings.write` (super_admin), as the existing output view |
| `ai_review_hours` default 24 h, and the 3,000-characters-per-page rule for Word / text pricing and caps | **New owner questions**, not blocking. Both are pinned defaults; the hours are an admin setting |
| Prompts from the Saudi prompt repository | **٤١٨** (open). B10 edits only the existing hand-written prompts |
| The canvas-studio target of the hand-off (shows «قريباً») | **٤٢٨** (canvas studio, Wave 7) |
| The direction-support target (shows «قريباً») | Wave 4b. The tool is ComingSoon; no question blocks it, but it has no engine yet |

