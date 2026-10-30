# Owner package 2026-10-30: lawyer case flow ledger

**Source:** owner handoff `Nezamy-Developer-Handoff-2026-10-30`. Requirements come from `05-traceability\developer-backlog.csv` (detail / requested / acceptance) and `08-current-code-review\backlog-review.csv`. All 38 items were re-checked against this branch (`fix/lawyer-case-flow-2026-10-30`, cut from `main` 235e1bef) before any change.

**Status rule:** no item here is closed. Every fixed item reads **«مُصلَح في الكود — بانتظار النشر واختبار القبول»**. The owner's acceptance column asks for proof on the deployed build plus a live acceptance test. A unit test is not a UI test.

**Not merged, not pushed, not deployed.** The parent session integrates.

Verdicts:
- **F** = fixed now, in code (awaiting deploy and acceptance);
- **D** = needs an owner decision;
- **B** = blocked;
- **A** = already fixed before this pass.

**Commits on `fix/lawyer-case-flow-2026-10-30`** (oldest first, on top of `main` 235e1bef):

| Commit | What |
|---|---|
| f699c3f9 | one Riyadh «today» source (`useRiyadhToday`, `riyadhDay.ts`) and the accessible `ModalShell` |
| dfcaaa32 | LIVE-F15, CODE-F03, LIVE-F25 / CODE-F04 — stage outcome, legal trigger event, recompute; migration `20261030_50` |
| 7dea078f | CODE-F06, CODE-F32, CODE-F33 — deadline confirm / reason / reopen, latest-answer guard |
| 753740f4 | LIVE-F33 — calculator on the radar's engine |
| a53403d2 | LIVE-F18 — research collector session names |
| c21f7eb1 | CODE-F14, CODE-F16, CODE-F29, LIVE-F38 — home counts, links, Riyadh day, header pill |
| 84ff117d | CODE-F07–F12, LIVE-F17, LIVE-F26, LIVE-F27, UX09 — tasks and timer |
| 33c44333 | CODE-F13, CODE-F19, CODE-F30, CODE-F34, CODE-F35 — case form, modals, consultation conversion |
| 3cf82bf5 | CODE-F15 / LAW-010, LIVE-F14 / LAW-006, LAW-005, UX05 — collected revenue, own case born active, create once |
| 1a5d4184 | CODE-F17 / LIVE-F28 / LAW-017, LIVE-F29, CODE-F18 — hearings |
| 14dd460e | CODE-F20 / LIVE-F16, CODE-F25, CODE-F36, CODE-F40 — case list, client file; migration `20261030_30` |
| 82db85de | LIVE-F10 / UX11, CODE-F11 (case page), Q316 — case file |

Arabic owner note (separate file, per the parent's rule): `docs/audits/2026-10-30-owner-note-lawyer-case-flow.ar.md`.

---

## 1. Stage outcomes and statutory deadlines

| Id | Verdict | Root cause found | Change | Main files |
|---|---|---|---|---|
| **LIVE-F15** (P0) | F | The outcome modal pre-filled today as the closing date, and the stage PATCH created the appeal or cassation deadline whenever `closed_on` was set, whatever the outcome. So «قيد النظر» + today created a cassation deadline. | A non-final outcome (`pending`) clears `closed_on` and the trigger, and never creates a deadline. If an earlier final outcome had created one and the lawyer corrects it back to pending, the open deadline is cancelled with a recorded reason. The modal has no date prefill. | `stageDeadlineSync.ts` (`resolveStagePatch`, `planStageDeadlineSync`), `case-stages/[caseId]/route.ts`, `RecordStageOutcomeModal.tsx` |
| **CODE-F03** (P0) | F (+ D) | The deadline was keyed on `closed_on`, not on the legal event. | The outcome is now separate from the trigger event (`judgment_date` / `copy_received` / `notified`) and the trigger date, stored in `case_stages.metadata.deadline_trigger`. There is no default legal date. Final outcomes show a rule panel: title, period, why it applies, source, and whether the owner verified it, plus a warning when the judgment date is chosen. Older stages keep their judgment-date behaviour. **Owner decision (REVIEW-LAW):** which event each rule counts from by default. Rule `appeal_general` says «من اليوم التالي لتسلّم صورة الحكم أو التبليغ به». | same + `stageDeadlineCopy.ts` |
| **LIVE-F25** (P0) / **CODE-F04** (P0) | F | `already_exists` returned early, so correcting the closing date (29 → 31 Oct) never moved the deadline, and the screen said the deadline already existed. | The linked open auto deadline is recomputed with `computeDueDate` (the same engine and holidays). The trigger and due dates, Hijri date, days, roll flag and rule are updated. Reminders are cancelled and re-queued. A `deadline.recomputed` activity row is written, and the engine version and inputs are appended to `deadlines.metadata.computation_history` (last 20). Before saving, the modal shows «سيُعاد احتساب المهلة المرتبطة: من X إلى Y»; after saving it says what happened. A done or cancelled deadline is not touched and the screen says so. Duplicates: the newest is kept and the extras are cancelled. New partial unique index (migration 50) stops two open auto deadlines on one stage. | `stageDeadlineSync.ts`, route, modal, `events.ts`, `caseEventLabels.ts`, migration `20261030_50` |
| **CODE-F06** (P1) | F | `onSaved` / `onCreated` fired only from the success screen's «إغلاق». Closing with ×, the backdrop or Escape skipped the parent refresh. | Both modals now report the save once, the moment the server confirms it. Every way of closing is equivalent. Both use `ModalShell`: blocked while saving, asks before discarding a draft. The parents refresh without closing the confirmation. | `RecordStageOutcomeModal.tsx`, `AddDeadlineModal.tsx`, `LawyerDeadlinesPanel.tsx`, `firm/cases/[id]/page.tsx`, `lawyer/cases/[id]/page.tsx`, `QuickAdd.tsx` |
| **CODE-F32** (P2) | F | The tab fetch had no ordering guard, so a slow answer could overwrite a newer tab. The list cap (200) was never mentioned. | A latest-request guard on both lists (open counters and the active tab). A notice when the list is cut: «تُعرض أقرب N مهلة استحقاقاً من أصل M». Header counters use the server's exact total and show «N+» when the cut falls inside the counted window. New «ملغاة» tab, so cancelled deadlines are reachable. | `deadlineStatusPolicy.ts`, `LawyerDeadlinesPanel.tsx` |
| **CODE-F33** (P2) | F | «تمّ» and «إلغاء» acted on one click, with no reason, no confirmation and no way back. | Each opens an inline confirm. Cancelling needs a reason; «تمّ» takes an optional receipt (what was filed, its number). Done or cancelled cards get «إعادة فتح», which also needs a reason, and the route re-queues reminders. The route enforces the same rule (400 without a reason), appends `metadata.status_history` (who, when, from, to, reason; last 50) and puts the reason in the activity row. | `deadlineStatusPolicy.ts`, `deadlines/[id]/route.ts`, `DeadlineCard.tsx`, both case pages, panel |
| **CODE-F25** (P1) | F | The case list's «مهلة قريبة» read `metadata.deadline`, which nothing writes, so it never showed. | One read of open rows from `public.deadlines`, summarised per case. A failed or cut-short read shows «تعذّر التحقق من المهل», never «لا توجد مهل». `deadlines/route.ts` unchanged. | `cases/page.tsx`, `cases/_caseListRules.ts` |

## 2. Dashboard home, header and calculator

| Id | Verdict | Root cause found | Change | Main files |
|---|---|---|---|---|
| **CODE-F14** (P1) | F | «المواعيد القادمة» was the length of a 50-row preview, and «مواعيد حرجة» was critical hearings within those 50 plus at most 10 deadlines. | Exact database counts (`count: exact`) for hearings and deadlines, plus a separate count of critical hearings (`kind = deadline` or `urgency = urgent`). An unread part makes the total `null`, and the card says «تعذّر عدّ المواعيد الحرجة — قد يوجد غيرها» instead of a number. | `dashboard/summary/route.ts`, `dashboardDateItems.ts`, `lawyer/page.tsx` |
| **CODE-F16** (P1) | F | Every link on the critical card (banner, «و N أخرى») went to `/dashboard/lawyer/hearings`, including links for deadlines. | Each item carries `source`, `caseId` and `href`. A deadline opens its case's «المهل» tab, or the radar when it has no case. A hearing opens its case's «الجلسات» tab, or the diary. Rows on both cards are links. | same |
| **CODE-F29** (P2) | F | «موعد خلال -3 أيام»; hearing colour came from its position in the list; «today» used the device's midnight and never moved. | One Riyadh day (`useRiyadhToday`: refreshes at Riyadh midnight, on focus and when the tab becomes visible). Text comes from `relativeDayAr`: «متأخرة N أيام» / «اليوم» / «غداً» / «خلال N أيام». The colour depends on how near the date is (`dayUrgency`), the same on every row. | `lawyer/page.tsx`, `riyadhDay.ts` (f699c3f9) |
| **LIVE-F38** (P1) | F | The header pill used the device clock (Cairo: 29 Oct), the date picker used Riyadh (30 Oct), and the tasks filter used a UTC slice. | All three now read the same Riyadh day source. The header pill builds its date from it; the tasks page is in A's row below. | `HijriDateWidget.tsx`, `useRiyadhToday.ts`, tasks (see §4) |
| **LIVE-F33** (P1) | F | The calculator tab had its own date maths (`new Date()` + N days, no roll past weekends or holidays). 28 Nov 2026 is a Saturday, so the radar's engine rolled it to the 29th. | The tab uses `computeDueDate` with the court holidays. Where the platform has a rule (appeal, cassation) it uses that rule's period, flags, source and verified state. The result explains any roll («رُحِّل الموعد لأن …») and marks guide-only presets «مدة استرشادية». Years are calendar years. | `legalDeadlinePresets.ts`, `CalcLegalDeadlines.tsx`, `ai/fee-calculator/page.tsx` |
| **LIVE-F18** (P1) | F | The research collector API returns raw rows (`title`, `created_at`) and the screen reads `name`, so a saved name showed as blank. | One mapper, `toCollectorSession` (title → name; the placeholder "Untitled Session" → ""), used by create and list. | `researchSessionRow.ts`, `researchService.ts` |

## 3. Hearings, cases, clients

| Id | Verdict | Root cause found | Change | Main files |
|---|---|---|---|---|
| **CODE-F17** / **LIVE-F28** (P1) | F | The general «إضافة موعد» saved typed text as `caseName`; the hearing was never linked, so it did not appear in the case file. | The general add picks one of the caller's own cases by id (the cases list's own rule). Typed text is only a label, marked as not linking. The POST checks the case is the caller's (400 otherwise) and stamps the case's title. The diary shows «غير مرتبط بقضية» for unlinked rows. | `AddHearingModal.tsx`, `hearings/route.ts`, `hearings/_shared.ts`, `hearings/page.tsx` |
| **LIVE-F29** (P1) | F | AddHearingModal closed on any backdrop click or Escape, mid-save or with a typed draft. | `ModalShell` with `busy` and `dirty`; the success screen shows the date and link the server returned. | `AddHearingModal.tsx` |
| **CODE-F18** (P1) | F | Only `cancelled` counted as closed (a held sitting stayed «upcoming»); the case file called every past row «منتهية», cancelled ones too; there was no edit / postpone / cancel. | Real states (مجدولة / بانتظار تسجيل النتيجة / انعقدت / مؤجَّلة / ملغاة). New `PATCH /api/v1/lawyer/hearings/[id]`: edit, postpone, cancel, complete, reopen. Postpone, cancel and reopen need a reason; each change writes a change-log entry and an activity event; 409 on a concurrent change; court-practice gated. Calendar links only for upcoming rows. Reminders follow the row's status and date through the existing delivery check. | `hearingChange.ts`, `hearings/[id]/route.ts`, `_HearingActionDialog.tsx`, `hearingVocabulary.ts`, `lawyerHearingsService.ts`, diary, case page |
| **CODE-F20** / **LIVE-F16** (P1) | F | «عرض الكل» from a client file opened the whole case list; the client filter did not exist. | `?client=` filters by card id or linked account before every count, survives a reload, and shows a chip with the client's name, «ملف الموكّل» and «إلغاء تصفية الموكّل». | `cases/page.tsx`, `_caseListRules.ts` |
| **CODE-F40** (P2) | F | The client file listed every non-consultation row as a case — client cards, invoices, tasks, hearings and AI orders share the table. | The case is defined explicitly by the cases list's own rule (`isLawyerCaseRow`). | `clients/[id]/page.tsx` |
| **CODE-F36** (P1) | F | A client note was hard-deleted on one click, with no way back. | «أرشفة» with «تراجع» and an «المؤرشفة» list where notes are restored. DELETE now archives (200). Migration `20261030_30` (see §6). | client notes routes, `lawyerClientNotesService.ts`, `clients/[id]/page.tsx` |
| **LIVE-F10** / **UX11** (P1) | F | 12 flat tabs, icons only on phones, no tab semantics, tab lost on reload, and nothing pinned. | A real tablist in three groups (المتابعة / التقاضي / الملف), roving focus, RTL arrow keys, `?tab=` kept; on phones the labels are `sr-only`. A pinned strip: title, current stage, next appointment («تعذّر التحقق» when unread). | `cases/[id]/page.tsx`, `_caseFileView.ts` |
| **CODE-F11** (case page) | F | Task status and subtask writes on the case page had the same updater bug as the tasks page. | Requests computed outside the updater; per-row latest-wins (`createLatestWins`) reverts only to the last confirmed value. | `_caseFileView.ts`, case page |
| **CODE-F25** | see §1 | | | |

## 4. Tasks and timer

| Id | Verdict | Root cause found | Change | Main files |
|---|---|---|---|---|
| **CODE-F07** (P1) | F | «تتبع الوقت» flipped a local flag; no timer, nothing recorded. | Drives the page's one focus timer for that task. Pause and resume work. A second task is refused while one period is open. | `TaskCard.tsx`, `tasks/page.tsx`, `usePomodoroEngine.ts` |
| **CODE-F08** (P1) | F | The engine counted ticks, reset the start on resume, saved nothing on a reset while paused, and lost the period on mode change or when the panel closed. | `timerClock.ts` stores timestamps. The engine moved up to the page and is persisted. A period that ran out while away is saved as complete. A reset or mode change after 5 or more active minutes saves a partial. | `_pomodoro/timerClock.ts`, `usePomodoroEngine.ts`, `PomodoroPanel.tsx` |
| **CODE-F09** (P1) | F | A session was marked synced before the server answered; there was no retry; sessions were linked by title. | An outbox per user (pending / failed / synced) that retries on load, when back online, every 60 s and from a manual button. Each period has a uuid sent as `work_sessions.id`, so a repeat is idempotent (`replayed: true`). Sessions are linked by `taskId`. No SQL needed. | `_pomodoro/sessionQueue.ts`, `storage.ts`, `work-sessions/route.ts`, `sessionMapping.ts` |
| **LIVE-F17** (P1) | F | The timer lived in the panel; closing it or reloading lost the period. | Persisted and restored: same period, value and task. | as CODE-F08 |
| **CODE-F10** (P1) | F | Grouped views applied only the search; undated tasks passed every period filter. | `taskFilters.ts`: one `visibleTasks()` and then `groupTasks()`. «بلا تاريخ» is its own period. Past-due done tasks are no longer hidden. | `taskFilters.ts` |
| **LIVE-F27** (P1) | F (cause inferred) | Kanban and list had different sources; the exit animation kept removed cards on screen. | One source for both views; `popLayout` and `layoutId` removed; a test pins this. | `tasks/page.tsx` |
| **UX09** (P2) | F | Filters were spread out, and priority and type had no controls. | `TaskFilterBar`: search and «الكل / اليوم / الأسبوع» always visible; the rest in one «فلاتر» panel; a «يظهر n من m» count, removable chips and «مسح الفلاتر». | `TaskFilterBar.tsx` |
| **CODE-F11** (P1) | F | Payloads were computed inside `setTasks` updaters, writes to one task had no ordering, and the celebration fired before the server answered. | `taskWrites.ts`: writes to one task go in click order, each field has its own version, and a rollback returns to the last value the server confirmed. Confetti only after success. | `taskWrites.ts`, `tasks/page.tsx` |
| **CODE-F12** (P1) | F | Trash only re-archived the task; it came back after a reload. Edits were optimistic. | Archive is the only removal (there is no DELETE endpoint). It shows a notice with «عرض الأرشيف». Edit is not optimistic: the editor stays open with the text and an error on failure. New steps get a uuid. | `TaskCard.tsx`, `tasks/page.tsx` |
| **LIVE-F26** (P1) | F (cause inferred) | The checklist toggle computed `next` inside the updater; React can run that later, so `if (!next) return` exited and no request was sent. | Computed outside the updater. | `tasks/page.tsx` |
| **LIVE-F38** (tasks part) | F | Tasks used a UTC `toISOString` slice. | `useRiyadhToday` only. A date filter shows loading until the day is known. | `tasks/page.tsx`, `taskFilters.ts` |

## 5. Case form, modals, consultation conversion

| Id | Verdict | Root cause found | Change | Main files |
|---|---|---|---|---|
| **CODE-F19** (P1) | F + D | «إسناد إلى» was saved as `metadata.assignee`, which nothing reads. The success screen said "active" while the server saved `pending_assignment`. | The choice is removed (a read-only «المسؤول عن القضية: أنت»). Success shows the status the server returned, which is now `assigned` (see LIVE-F14 below). **Owner decision:** assigning a case to a team member needs a firm-team model (`firm_members` is still never written). | `AddCaseModal.tsx`, `addCaseForm.ts` |
| **CODE-F30** (P1) | F | The court defaulted to «التجارية» with 3 options; a failed client load hid the picker; typing after picking a client silently created a duplicate. | 14 courts plus «أخرى» (free text), no default. A load error with retry. A picked client is read-only. An existing name is offered back. | `AddCaseModal.tsx`, `courtTypes.ts`, `addCaseForm.ts` |
| **CODE-F34** (P2) | F | Four forms closed on any backdrop click, even mid-save. | All four use `ModalShell` (`busy` blocks closing; a changed draft asks first). | `AddCaseModal`, `AddCaseStageModal`, `ContractFormModal`, `QuickToolsCustomizer` |
| **CODE-F35** (P2) | F | ShareProfileModal had no focus trap or focus return; CRM cards were `div onClick`; search and sort had no names. | ShareProfileModal uses `ModalShell`. Cards are buttons. `aria-label` and `aria-pressed` added. | `ShareProfileModal.tsx`, `clients/page.tsx` |
| **CODE-F13** (P1) | F | Insert case, then link the consultation in a second write whose failure was only logged (200). Retries then hit the unique index forever (409). | `convertConsultationCore.ts`: look for an existing case first. On 23505, find it and repair the link. The link write must return the row or the call is a 500 carrying `caseRequestId`. Events and notifications fire only from the call that wrote the link. | `convert/route.ts`, `convertConsultationCore.ts` |

## 5b. Items added by the parent session

| Id | Verdict | Root cause found | Change | Main files |
|---|---|---|---|---|
| **LIVE-F14** / **LAW-DETAIL-006** (P0) | F (+ D for teams) | Every create was clamped to `pending_assignment`, so a lawyer's own case was born «بانتظار الإسناد» and was not counted in «القضايا النشطة». | `createStatusFor` accepts `assigned` only for a lawyer or firm filing its OWN case to itself (self-assigned, receiver `lawyer`, not paid); every paid request stays `pending_payment`. The form sends `assigned`. Team assignment: see CODE-F19. | `ownCaseStatus.ts`, `service-requests/route.ts`, `AddCaseModal.tsx` |
| **LAW-DETAIL-005** (P1) | F | The button was disabled while saving, but each retry made a new id, so a save whose answer was lost and was pressed again created a second case. | One id per modal, reused on retry. On a primary-key clash (23505) the route answers with the caller's own existing row (200, `replayed: true`) instead of a 500. | `AddCaseModal.tsx`, `service-requests/route.ts` |
| **CODE-F15** / **LAW-DETAIL-010** (P1) | F (needs the finance branch's SQL) | «إيراد الشهر» summed invoices by their creation date. | «الإيرادات المحصّلة» = money collected this Riyadh month, by collection date, from the `invoice_collections` ledger (finance branch `fix/lawyer-finance-p0-2026-10-30`, migration `20261030_10`); a partial payment counts its amount. Sub-line shows issued this month and outstanding. Without the ledger table it falls back to paid invoices by payment date and says so. | `monthRevenue.ts`, `dashboard/summary/route.ts`, `lawyer/page.tsx` |
| **LAW-DETAIL-009** | F | = CODE-F14. | Exact counts (§2). | |
| **LAW-DETAIL-007** (P1) | D | The DB CHECK on `lawyer_clients.client_type` allows only `individual` / `company`. The package asks for six types; REF0035 names three (فرد، شركة، جهة حكومية). | Not built: the list of types and the representative / identity fields per type are the owner's call, and need a migration. | — |
| **LAW-DETAIL-008** (P1) | F (partial) | Default «المحكمة التجارية» and 3 options. | 14 courts plus «أخرى» (free text), no default (CODE-F30). **Not built:** a search box over the list. | `courtTypes.ts`, `AddCaseModal.tsx` |
| **LAW-DETAIL-017** | F | = CODE-F17. | §3. | |
| **LAW-DETAIL-020** | F (two branches) | The header pill (device clock) and the converter disagreed on the date. | The header now reads Riyadh's day (LIVE-F38, here). The header, `DualDatePicker` and the hearing modal all use the one Umm al-Qura engine (`hijri.ts`). The converter half is on branch `fix/owner-30oct-consult-calc` (dbae2ba8). | `HijriDateWidget.tsx` |
| **LIVE-F32** | fixed on another branch | — | Converter fixed on `fix/owner-30oct-consult-calc` (dbae2ba8), not here. Header side = LIVE-F38 / UX05 here. | — |
| **UX05** (P2) | F | Hearing times had no time zone. | The dashboard home prints « بتوقيت الرياض» after hearing times. | `lawyer/page.tsx` |
| **LAW-DETAIL-023** | F | = LIVE-F26 / CODE-F11. | §4. | |
| **LAW-DETAIL-024** | F | = CODE-F10 / LIVE-F27. | §4. | |
| **LAW-DETAIL-026** | F | Sessions were linked by title; nothing durable. | Linked by `taskId`, idempotent sync (CODE-F09). No billing reads `work_sessions`, so the timer does not drive fees. | §4 |
| **Q316** (owner answer) | F | No «ملف داخلي» tag; nothing told the lawyer the client sees uploads. | «الموكّل يرى هذا الملف» beside «رفع مستند», shown only where true: `attachments_select_policy` shows a file to the requester and assignee, so it is hidden on the lawyer's own case (requester = the lawyer). | `cases/[id]/page.tsx` |

## 6. SQL for the user

Two new files from this branch. Neither changes existing rows. The finance branch's `20261030_10` (collections ledger) is what CODE-F15 reads; that file belongs to the finance branch.

### 6.1 `20261030_50_stage_auto_deadline_guard.sql` — any order relative to the deploy


- **File:** `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.claude\worktrees\stoic-margulis-d567d1\supabase\migrations\20261030_50_stage_auto_deadline_guard.sql` (after merge: `…\nzamy-website\supabase\migrations\20261030_50_stage_auto_deadline_guard.sql`).
- **What it does:** prints NOTICE counts of auto deadlines created while a stage was pending, and of stages with more than one open auto deadline. It then creates the partial unique index `uq_deadlines_one_open_auto_per_stage`, but **only when no stage has duplicates**; otherwise it skips. In that case, open the case, save the stage outcome once (the route cancels the extras), and run the file again.
- **Check** (screen output; the SQL editor hides NOTICEs):

  ```sql
  select indexname from pg_indexes where indexname = 'uq_deadlines_one_open_auto_per_stage';
  ```

  One row means the index exists. No rows means it was skipped, so run the file's own last three SELECTs to see why.
- **Docker test:** `bash supabase/tests/rls/run.sh supabase/migrations/20260904_phase5_deadline_radar.sql supabase/migrations/20261030_50_stage_auto_deadline_guard.sql supabase/tests/rls/stage_auto_deadline_guard.test.sql` (T1–T6 pass).

### 6.2 `20261030_30_client_notes_archive.sql` — preferably BEFORE the deploy (either order is safe)

- **File:** `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.claude\worktrees\stoic-margulis-d567d1\supabase\migrations\20261030_30_client_notes_archive.sql` (after merge: `…\nzamy-website\supabase\migrations\20261030_30_client_notes_archive.sql`).
- **What it does:** `lawyer_client_notes` gets `deleted_at` / `deleted_by`, a stamp trigger (the server sets who and when; an archived note cannot be edited), and loses DELETE for app roles. Before it runs, the app lists every note and «أرشفة» answers 503 — it never hard-deletes.
- **Check** (the file ends with it; screen output): expect `has_deleted_at = t`, `delete_policies = 0`, `authenticated_can_delete = f`, `stamp_trigger = t`, `archived_notes = 0` on first run.

  ```sql
  select
    exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'lawyer_client_notes' and column_name = 'deleted_at') as has_deleted_at,
    (select count(*) from pg_policy where polrelid = 'public.lawyer_client_notes'::regclass and polcmd = 'd') as delete_policies,
    has_table_privilege('authenticated', 'public.lawyer_client_notes', 'DELETE') as authenticated_can_delete,
    exists (select 1 from pg_trigger where not tgisinternal and tgname = 'trg_lawyer_client_notes_archive_stamp') as stamp_trigger;
  ```
- **Tested** twice (idempotent) on a throwaway Docker Postgres with a stub schema: DELETE refused, stamp applied, archived edit refused, another user cannot restore, restore works.

## 7. Tests and checks

- `npm run test:unit` on 82db85de: **4341 tests, 4333 pass, 8 fail.** Seven are the known baseline (books volume series T28-24, the consultant dashboard needle — a `\n` against a CRLF file, `aiFiles` / `pdf-lib`, «end read takes the latest ends_at», `grantPurchase`, two maker-rule / snapshot tests). The eighth was `navigation.consultant.test.ts` pinning the old call `handleDeadlineAction(d, next)`; it now pins `(d, next, reason)` and passes (the `courtWritesAllowed` gate it checks is unchanged), so the suite is at the baseline seven.
- `npx tsc --noEmit -p .`: clean except the baseline `pdf-lib` errors.
- New test files: `deadlineStatusPolicy.test.ts`, `dashboardDateItems.test.ts`, `monthRevenue.test.ts`, `ownCaseStatus.test.ts`, `hearingChange.test.ts`, `_hearingsWiring.test.ts`, `_caseListRules.test.ts`, `_caseFileView.test.ts`, `clientNotesArchive.test.ts`, `_clientFileCases.test.ts`, plus those listed in each commit.
- **Not run:** `next build --webpack`; no browser or live acceptance test (none of these items is closed).
- **GitNexus:** the index is stale (`detect_changes` mapped 2 of 44 files); impact was done with grep over callers instead.

## 8. Left over (not done here)

- **Owner decisions:**
  - REVIEW-LAW: which event each rule counts from by default (CODE-F03).
  - Cassation period: REF0035 says 60 days (المادة 194); the platform's rule `cassation` says 30. Flagged, not changed.
  - LAW-DETAIL-007: the client types (six asked, three named, two in the DB).
  - CODE-F19 / LAW-006: team assignment needs a firm-team model.
- **Not built:** a search box over the court list (LAW-008).
- **Small leftovers seen in passing:** ClientDrawer accessibility; field labels in `AddCaseStageModal` and `ContractFormModal`; `ModalShell` overscroll on phones; Pomodoro stats bucketed by device day; `_data.ts` `today()` on the device clock; «بتوقيت الرياض» on the hearings diary itself (only the home has it).
- **Trade-offs to know:** archived «للمكتب» client notes are hidden from firm colleagues by the API only, not by RLS (case notes, 20261025_51, hide them in the DB). Consultation convert: a call whose link write failed announces nothing; the retry that repairs the link sends the event and the client notification (marked `repairedLink`), once.
- **CODE-F15** depends on the finance branch's `invoice_collections`; without it the tile says it is counting paid invoices instead.

---

## Owner note

In its own file, per the parent session's rule: `docs/audits/2026-10-30-owner-note-lawyer-case-flow.ar.md`. Nothing was appended to any shared تقرير_للمالك file.
