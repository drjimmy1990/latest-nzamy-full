# Owner-priority plan (the ++++ items only)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, with the changed review rule below. Replaces the order and scope of `docs/plans/2026-11-03-owner-free-plan.md` from its Task 9 onward. Its Global Constraints and Review Focus still bind, except where this file overrides them.

**Goal:** Build only the items marked ++++ in the owner status report, plus what they cannot work without, then check everything once at the end.

**Source of the marks:** the WhatsApp copy of `تقرير_للمالك_٢٠٢٦-١١-٠٣_الحالة.md`, section 2 (2026-11-05).

**Where:** worktree `D:\nzwt\ownerfree`, branch `batch/2026-11-03-owner-free`, on top of `cdeaee7c`. Section task bodies stay in `docs/plans/2026-11-03-owner-free-sections/`; they stay binding except for the rulings below.

**Spec:** `docs/audits/2026-11-02-owner-package/00-gap-analysis-and-plan.md`.

## Scope

| Report item | Mark | What gets built | Section tasks |
|---|---|---|---|
| ١٥ Word and pasted text, attachment preview, optional specialty and branch | ++++ | All of it | S2 B1–B10 |
| ١٧ AI runs in the activity log, live progress | ++++ | All of it | S2 D1, E1–E10 |
| ١٨ Case brief inside analysis, quick answer at 20 | ++++ | All of it | S3-01 to S3-06 |
| ٢٠ Contract review (250), negotiator (150), built OFF | ++++ | All of it | S3-13 to S3-18 |
| ٢٥ SVG logo, QR verification card, Word export on letterhead | ++++ | All of it, without per-member print grants | S4 Tasks 21–27 |
| ٢٧ Wave 1 leftovers | ++++ | All of it | S5-B1 to S5-B14 |
| ٢٨ Run file and closing report | always | Shortened | old Task 34 |

**Pulled in because the items above cannot work without them:**
- From ١٤: S2-A2 (`toolLabels`, `runOutputBlocks`) and part of S2-A7 (`runErrors`, the `/ai/runs/[id]` page). See R30.
- From ١٩: S3-07 only (`tool-status`). See R31.
- From ٢٣: only the role-based branch of `readVaultForPrint` (S4 Task 9). See R32.

**Deferred by the marks:** ١٩ (except S3-07), ٢١, ٢٢, ٢٣ (except the branch above), ٢٤, ٢٦.

**Unmarked, so left out unless the user adds them:** ١٢ (eligibility at sale gates), ١٣ (official links), the rest of ١٤ (review before release), ١٦ (collector).
- `20261103_12` stays in the batch as an unused table. It is harmless.
- `20261103_13` is not created, and the number stays free for ١٣.

## Rulings (these extend the preflight's R1–R29)

- **R30.** Ruling: from S2 Part A build only A2 and this part of A7: `runFailureMessage`, the `/ai/runs/[id]` page, and `/ai/runs` in `PROTECTED` (R29). Do NOT build A1 (`_30`), A3–A6, A8, or `wf-5.1`. Drop `reviewPollDelay` and the `rejected` / `review_timeout` copy. E4's "after A3's hold flag" is a no-op, and `dispatchRunWith`'s ctx has no `hold`. A legacy run stored as `review` shows «هذه النتيجة محجوبة بانتظار قرار فريق نظامي», with no promise of an alert, because no alert exists — nothing in ١٥, ١٧, ١٨ or ٢٠ reads the hold path (checked in the section text) — cost if wrong: a compile error in E4, caught at once.
- **R31.** Ruling: S3-07 joins the ٢٠ unit, with R5's parity helper between `runCore` and `toolAvailability`. S3-08 to S3-12 stay deferred — both contract screens show the price only after `tool-status` says usable — cost: none.
- **R32.** Ruling: S4 Task 9 shrinks to `readVaultForPrint` with the lawyer read and the firm RLS read only. No `_63`, no `_64`, no `firm_letterhead_print_kit`, no PGRST202 fallback. `firmPrint` comes from the existing `permissions.print` (`letterheadPermissionsFor`: owner, managing_partner, office_admin). Drop the «firm member with an allow row» manual check — that is item ٢٣, which is deferred — cost: a member with a personal print grant arrives only with ٢٣.
- **R33.** Ruling: replaces R13. `pleadingBlocks` takes the AI pleading as it is, since S3-08 is deferred. Whoever builds ١٩ passes the edited object instead. Citation markers are stripped with `stripCitationMarkers`, moved from `src/components/ai/CitedAnswer.tsx` to a pure module that it re-exports — no second stripper, and `node --test` must load it — cost: none today.
- **R34.** Ruling: replaces R15. n8n import schedule. **Before the deploy:** wargaming, analyze-strength, legal-drafter (they carry B10 and E6). **After the deploy:** contract-review, contract-negotiator. **Any time:** the other job workflows, including brief-check, which carries E6 only (confirm the regenerated JSON has no S3-11 prompt). No `wf-5.1` and no canvas-strategist — their items are not built — cost: «غير مصنّف» does not apply, because the brief-check report is not rebuilt.
- **R35.** Ruling: S5-B10 edits `CaseGraphView.tsx` at HEAD. The "after S5-A11" note no longer applies. Whoever builds canvas later rebases on it — cost: none.
- **R36.** Ruling: live n8n stays untouched. Every workflow change is repo JSON plus an import step for the user, so no n8n stop point blocks the build.
- **R37.** Ruling: R1, R2 (canvas), R8, R16, R22–R24 and R28 do not apply to this scope. R29's `/ai/share-history` does not apply either. R3, R4, R5, R7, R9–R12, R14, R17–R21, R25 and R27 still apply.

## How it runs

**Sequential, one opus implementer per unit.** The units share `runCore.ts`, `tools.ts`, `workflows.mjs`, `StepAiDraft.tsx` and `_verify.sql`, so they cannot run in parallel.

**The review rule changes:**
- No reviewer between units, and no fix rounds per unit.
- After each unit the controller runs a mechanical gate only:
  - unit tests: no failure beyond the known baseline of 6;
  - tsc clean;
  - the build exits 0;
  - no new migration without a passing Docker test;
  - no stop point crossed.
- A failed gate goes straight back to the same implementer.

**What keeps the quality up, since nobody reviews between units:**
- Each section task still goes test first, then code, then its own commit.
- The money-path tests the sections name are mandatory, not optional.
- Each implementer finishes by checking its diff against the plan's five Review Focus items, and reports what it could not verify.
- The final review is stronger than a per-unit one (Task 11).

**Implementers return their full report as text.** The harness blocked a subagent's report-file write once; the controller saves the report.

### Task 1: Close step 8 (a scoped re-review)
- Re-review `70a579fd..cdeaee7c` against `task-8-review.md`: the admin-lock conversion, the minors, and `20261103_15`.
- On clean, hand the user `_15` to run at once. It closes a live leak and depends on no deploy. Expected SELECT row: `f, f, 0, 0, t, t`.

### Task 2: AI foundations and text inputs, part 1
- **Section tasks:** S2 A2, A7 (R30), B1–B5.
- **Migrations:** none. **Env flags:** `NZAMY_AI_TEXT_FILES` stays off.
- **Produces:** `AI_TOOL_LABELS_AR`, `AI_TOOL_PAGES`, `runOutputBlocks`, `runErrors`, `/ai/runs/[id]`, text extraction, the signed file-text link, `pasteAsFile`.

### Task 3: Text inputs, part 2
- **Section tasks:** S2 B6–B10.
- **Consumes:** Task 2. Keep R12: the validated value carries `contractText`.
- **Produces:** pickers, the paste box, `AttachmentPreviewModal`, the optional legal branch, n8n prompts as repo JSON.

### Task 4: Activity log and progress, backend
- **Section tasks:** S2 D1, E1–E5.
- **Migrations:** `20261103_31`, BEFORE the deploy. Confirm its Docker chain does not need `_30`.
- **Must prove:** a debit taken before the 202 is refunded when dispatch fails.

### Task 5: Progress, screens
- **Section tasks:** S2 E6–E10.
- **Produces:** n8n progress branches as repo JSON, `useAiRun` polling, `AiThinkingStage` and its mounts.

### Task 6: Case brief, redirects, quick answer, tool status
- **Section tasks:** S3-01 to S3-07 (R3, R4, R5, R25, R31).

### Task 7: Contract review and negotiator
- **Section tasks:** S3-13 to S3-18 (R19, R20, R21). Both ship `defaultMode` off.

### Task 8: Letterhead
- **Section tasks:** S4 Tasks 21–27, plus Task 9's shrunken helper (R32, R33).
- **Migrations:** `20261103_69`, BEFORE the deploy.
- **No new dependency:** `fflate` and `qrcode` are already in `package.json`.

### Task 9: Wave 1 leftovers
- **Section tasks:** S5-B1 to S5-B14 (R9, R10, R11, R12, R35). B6 is verify-only.

### Task 10: Run file and owner report
- `SQL_batch_2026-11-03_owner_free/README.md`, every file with its full PC and server path, in this order: BEFORE-deploy SQL → n8n imports → deploy → AFTER-deploy SQL → n8n imports → `_verify` by hand.
- A `_verify` sweep, and `sqlMergeHygiene.test.ts` updated.
- Owner report `تقرير_للمالك_٢٠٢٦-١١-٠٣_الدفعة_الثانية.md`: one row per built item, status «مبني في الكود — لم يُنشر بعد». Deferred items are listed as deferred, not as done.
- New owner questions from ٤٣٩, only for what was actually built. Drop the old list's questions on review hours, release by operations, alternative clause wording, and what a client sees of a shared case; their items are not built. Check that the number is free first.

### Task 11: The one final check
Three opus reviewers in parallel, each with its own diff package (deleted bundle content excluded):
1. **AI platform (Tasks 2–5):** debit and refund paths, the 202 path ending in a state the user can see, no protected text in `progress_events`, the file-text link.
2. **Tools and letterhead (Tasks 6–8):** the AI `contract-review` id never resolved through the human-review catalogue, nobody charged while a tool is off, SVG safety, the public `/verify/[token]` page revealing nothing, a printed document carrying no raw markers.
3. **Whole branch (Tasks 1–10, including the steps done before this plan):** `GATES` and freeze walkers, `_verify`, deploy order, honesty copy, dark-mode tokens, the rulings above.

Then:
- Findings are verified against the code before they count.
- One fix round, by one implementer.
- One scoped re-check.
- The controller re-checks every «built» row of the owner report against HEAD.

Merge and push happen only on the user's go.

## What the user gets, and when it becomes visible

| Item | Visible when |
|---|---|
| ١٥ | After the deploy, the user sets `NZAMY_AI_TEXT_FILES=on`, tests one .docx and one paste on live n8n, then sets `NEXT_PUBLIC_AI_TEXT_FILES=on` and rebuilds |
| ١٧ | At the deploy. Progress details appear after the job workflows are imported |
| ١٨ | At the deploy |
| ٢٠ | «قريباً» until the user imports the two workflows and the admin sets the tool to staff or live |
| ٢٥ | At the deploy, after `_69` |
| ٢٧ | At the deploy |
