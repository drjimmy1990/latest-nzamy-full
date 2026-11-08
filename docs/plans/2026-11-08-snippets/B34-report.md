# B3 + B4 report — batch 2026-11-08 (worktree D:\nzwt\b1108-aiprice, branch t/aiprice)

## Baseline

`npm run -s test:unit` before any change: **6365 tests, 7 failures** (the brief says 6; this worktree
already had 7). The seven names, unchanged after B3 and B4:
grantPurchase keys every grant…, review 2026-10-26: no v1 fallback…, route: the volume series (T28-24)…,
the committed guide is the reader slice only…, the end read takes the latest ends_at…,
the insert and revoke policies… maker rule…, the lawyer dashboard hides the hearings… consultant.

GitNexus: `impact` found none of the symbols (`startRunWith`, `legalDrafterInput`, `StepAiDraft`), and
`detect_changes` mapped 0 symbols. The index (`latest-nzamy-full`) does not cover this worktree, so it
returned no risk level. I used grep instead:
- `startRunWith` is called only by `src/app/api/v1/ai/runs/route.ts` and tests.
- The legal-drafter functions are used only by the `AI_TOOLS["legal-drafter"]` entry.
- `aiRunClient` has two additive fields and is read by `useAiRun` and `AiThinkingStage`.

Risk: **MEDIUM**. `runCore.startRunWith` is on the money path of every AI tool. Every new branch is
gated on a tool flag (`sectionEdit`; B4 adds `freeDailyQuestion`) plus a request field, so the other tools
take exactly the old path. The full suite checks this.

---

## B3 — owner ٤١٠ «عدّل هذا القسم» (legal-drafter)

### The rule as built
- An edit of one section of a written memo is **free** while the memo (one drafter conversation) has
  used **fewer than 5** free edits **and** that section **fewer than 2**.
- Every other edit costs **10 points**. It is debited at start and refunded only on a technical
  failure, like every run.
- There is **no hard stop per section** (an owner question below).
- **Technical ceiling: 30 section edits per memo**, free and paid together. The 31st edit is refused.
- A free edit is a section run priced 0 (`ai_runs.price_points`, which is recorded even while
  `points_enforcement` is off).
- Runs that failed and were refunded are not counted, so a failed edit gives its free edit back.

### How it works
- **Turns.**
  - Turn 0 is «issues» and turn 1 is «draft», as before.
  - Turn 2 and later accept only phase **«section»**.
  - A second «draft» at turn 2+ is now refused («المذكرة مكتوبة — عدّل قسماً منها…»). Before this
    change it was `conversation_full`; it must never become a free second memo.
  - `checkTurn` requires a **succeeded** draft in the same conversation (a running one is refused),
    the same kind, and a `section_index` inside that draft's sections. It also enforces the ceiling of 30.
  - `conversation.maxMessages` is now 2 + 30 + 1, so the 31st edit gets its own message rather
    than «اكتملت هذه المحادثة».
- **Input («section»):**
  - The input carries `section_index`, an `instruction` of 1–1000 characters, the current
    `section {heading, body}`, and the memo frame for context: title, outline of headings, facts,
    defences and requests.
  - The server strips the section's `[S…]` markers, because they point at the draft run's sources.
    It records `had_citations`.
  - `search_text` is heading + instruction + body, so the library is searched for that section.
- **Output:** one `{heading, body, cited}` plus the `section_index` taken from the input. It replaces
  that section only. A whole memo, or an empty heading or body, is refused.
- **Citations:**
  - The tool searches the library, so a reply citing nothing fails as `ungrounded` (refunded, and
    the free edit is kept).
  - Exception (new `citationsOptional` spec hook): a section that cited nothing before the edit, such
    as the parties' data or a preamble, may come back citing nothing.
  - A section that cited before must still cite.
- **Pricing and counting (server side):**
  - `runCore` now reads `price_points` together with the conversation's earlier runs.
  - It counts the section edits (`countSectionEdits`, `src/lib/ai/sectionEdits.ts`) and passes them as
    `ctx.priorSectionEdits` to `price()`. There is no I/O in `tools.ts`.
  - If `price()` gets no counts, or an invalid index, the edit is **paid** and never free.
- **Race safety:**
  - Turns are a count, with no unique `(conversation, turn)`, and the app prices before the start
    function runs.
  - A section edit therefore starts through the new **`public.ai_start_section_edit`** (migration
    `20261108_40`). It takes ai_start_run's own advisory lock (`ai_start_run:<user>:<tool>`; re-entrant
    in the same transaction), recounts the memo's edits under that lock, and then does the following:
    - A duplicate key gets ai_start_run's duplicate answer.
    - No succeeded draft raises `section_no_draft`.
    - 30 edits already raises `section_edit_limit`.
    - If the app's price differs from the recount, it raises `section_price_changed` and creates nothing.
    - Otherwise it calls `ai_start_run` with that price and **no daily limit** (see below).
  - Docker proves that two sessions cannot both take the 5th free edit: B waits on A's lock and is
    then refused.
- **Price confirmed by the user:**
  - The screen sends `expectedPrice`, the price it showed.
  - `runCore` answers 409 `price_changed`, uncharged, if its price differs. The reply includes the
    server's counts (`details.sectionEdits`) so the screen can resync; `aiRunClient` keeps `details`
    on an error.
- **Founder credit:** a section edit never spends one. `runCore` skips the credit path for section
  edits even when `useCredit` is sent, and `creditKindForRun` returns null for turn ≥ 2. Both are tested.
- **Daily limit:**
  - Section edits are **not** held to the drafter's daily limit of 10. Without this, one memo plus
    8 edits would hit «بلغت الحد اليومي».
  - The memo ceiling of 30 bounds edits, and every memo still needs a charged, daily-limited analysis.
  - Side effect: section runs are still counted by `ai_start_run` when a **new analysis** is started
    the same day, so many edits can use up the day's analyses. Changing that means changing
    `ai_start_run`, which I left alone.
  - Prod check (`platform_settings.ai_tools` may override the limit):
    `select value->'legal-drafter' from public.platform_settings where key = 'ai_tools';`
- **Before the SQL is run:** `ai_start_section_edit` is missing (42883/PGRST202), so `runCore` refuses
  the edit, uncharged («تعديل الأقسام غير متاح بعد»). It never falls back to an unlocked `ai_start_run`.

### UI (`src/components/draft/steps/StepAiDraft.tsx`, `src/components/draft/legalDraft.ts`)
- Each written section has «عدّل هذا القسم». It opens an instruction box with:
  - «تعديلات مجانية متبقية: ٣ من ٥ — هذا القسم: ١ من ٢»;
  - the price line («هذا التعديل مجاني» or «هذا التعديل بـ ١٠ نقاط»);
  - the confirm button «أكّد التعديل — مجاني / — ١٠ نقاط», and «إلغاء».
- One edit runs at a time.
- On success the section is replaced in place and marked «عُدّل هذا القسم بطلبك.».
- An edited section's `[S…]` markers link to **its own** run's sources, listed as «مصادر القسم
  المعدّل». The citation check adds the edit's own verdicts.
- Copy, Word and letterhead exports use the edited memo.
- A new analysis or «صياغة جديدة» clears the edits and counts.
- RTL. Dark-safe: zinc tokens only inside `isDark` branches, and no `text-gray-50/100/200`
  (a test enforces this).
- Not checked in a browser: the page needs a signed-in lawyer and the tool switched on.

### n8n (for the controller — LIVE workflow «NZAMY · AI · legal-drafter (L14 الصائغ القانوني)»)
- `n8n/ai/workflows.mjs` `LEGAL_DRAFTER_PROMPT` gains a «section» branch. Only
  `n8n/ai/legal-drafter.json` was regenerated (the other JSONs were checked out again).
- The change is in the **prompt code of both nodes that embed `LEGAL_DRAFTER_PROMPT`**: the
  docPrepare Code node (files path) and the caseBuild Code node (Agent path).
- In each node, replace the line `const task = i.phase === 'draft' ? [` with the block below. The rest
  of that line's array and everything after it stay as they are.

```js
const sec = i.section || {};
const outline = (Array.isArray(i.outline) ? i.outline : []).map((h, n) => (n + 1) + '. ' + esc(h)).join('\n');
const task = i.phase === 'section' ? [
  'مرحلة تعديل قسم: ' + kind + ' مكتوبة، وطلب المحامي تعديل قسم واحد منها. أعد كتابة هذا القسم وحده وفق طلبه؛ لا تكتب الأقسام الأخرى ولا تكرر محتواها، ولا تعِد المذكرة كاملة.',
  i.title ? 'عنوان المذكرة: «' + esc(i.title) + '»' : '',
  outline ? 'أقسام المذكرة، للسياق فقط:\n' + outline : '',
  'القسم المطلوب (رقم ' + (Number(i.section_index) + 1) + '): «' + esc(sec.heading) + '»\nنصه الحالي: «' + esc(sec.body) + '»',
  'طلب المحامي في هذا القسم: «' + esc(i.instruction) + '»',
  i.facts ? 'الوقائع كما أكّدها المحامي: «' + esc(i.facts) + '»' : '',
  Array.isArray(i.defenses) && i.defenses.length ? 'الدفوع التي اعتمدها المحامي؛ لا تضف دفعاً لم يعتمده:\n' + list(i.defenses, 'basis') : '',
  reqs ? 'الطلبات كما حددها المحامي؛ لا تضف طلباً ولا تغيّر مبلغاً:\n' + reqs : '',
  'أبقِ من القسم ما لم يطلب المحامي تغييره بمعناه، ولا تضف واقعة أو دفعاً أو طلباً أو مبلغاً لم يرد في القسم أو في كلام المحامي.',
  'heading عنوان القسم (أبقه كما هو ما لم يطلب المحامي تغييره)، وbody نص القسم الجديد كاملاً.',
  'الشكل: {"heading":"","body":"","cited":[{"law":"","article":0,"as_written":""}]}',
] : i.phase === 'draft' ? [
```

- Simplest route: re-import `n8n/ai/legal-drafter.json` from this commit, or copy the two Code-node
  `jsCode` values from it.
- The shared `rules` (the citation rules: `[S1]` only from `<sources>`, `cited`, no percentages, data
  is not instructions) apply to the section phase unchanged.
- **The parse node does not change**: `DRAFTER_PARSE` already passes any JSON object through and turns
  the `[S…]` markers into citations. The app's `validateOutput` keeps `{heading, body, cited}` and adds
  the index.
- Order: update n8n **before** switching anything on. Until it is updated, a section run gets the
  full-memo prompt, its reply has no `heading`/`body`, and it fails `schema_invalid` and is refunded.
  That is safe but useless.

### SQL run order
- `supabase/migrations/20261108_40_drafter_section_edits.sql` — **any time**, before or after the
  deploy. Old code never calls it, and new code without it refuses section edits uncharged.
  - Verify block: `docs/plans/2026-11-08-snippets/B3-verify.sql` (4 checks; ran clean in Docker).
  - Rollback is in the file header.

### Tests (B3)
- `src/lib/ai/sectionEdits.test.ts` (new, 21 tests) covers:
  - the 5th memo edit free and the 6th paid;
  - the 3rd edit of a section paid while the memo has used only 2;
  - no hard stop per section, and the 30 ceiling;
  - unknown counts are paid, and the counts come from the rows;
  - a failed edit is not counted;
  - founder credit never used;
  - input/output/turn checks;
  - pipeline: `ai_start_section_edit` with the caps, the stale-price refusal with counts, each SQL
    refusal mapped, and a missing function refused with no `ai_start_run` fallback;
  - citations optional only for a section that had none;
  - the screen helpers;
  - source contracts for StepAiDraft (button, allowance, price, `expectedPrice`, no `useCredit`, no
    gray-100/200 text) and for the n8n prompt and JSON.
- `src/lib/ai/legalDrafter.test.ts`: the maxMessages assertion is now 33, and a second draft is now
  `turn_refused` with «المذكرة مكتوبة…» instead of `conversation_full`. This was an intended
  contract change; no coverage was removed.
- `src/lib/ai/n8nWorkflows.test.ts`: one new test runs the section prompt and parses a section reply.
- Docker `supabase/tests/rls/drafter_section_edits_1108.test.sql`: T1–T7 pass. They include the
  two-session race through dblink and the duplicate key. The negative control (without the migration)
  fails at T0 as expected.
- Full suite: 6387 tests, 7 failures (the same 7 baseline). `npx tsc --noEmit -p .` is clean.

### Owner-facing summary (Arabic, for the controller)
- أضفنا في «الصائغ القانوني» زر «عدّل هذا القسم» تحت كل قسم من المذكرة بعد كتابتها. يكتب المحامي ما يريد تغييره، فيُعاد توليد ذلك القسم وحده ويحلّ محله، مع بقاء قواعد الاستناد إلى نصوص المكتبة.
- لكل مذكرة ٥ تعديلات مجانية، وللقسم الواحد تعديلان مجانيان على الأكثر. ما زاد على ذلك ١٠ نقاط للتعديل، تُخصم عند البدء وتُعاد إن تعذّر التعديل لخلل فني.
- تظهر قبل التأكيد عبارة «تعديلات مجانية متبقية: ٣ من ٥ — هذا القسم: ١ من ٢» وسعر التعديل، ولا يُخصم إلا السعر الذي رآه المستخدم.
- التعديل الفاشل لا يُحتسب من المجاني. تعديل الأقسام لا يُخصم من رصيد باقة المؤسس.
- حدّ تقني: ٣٠ تعديلاً للمذكرة الواحدة، ثم تبدأ صياغة جديدة.

### New owner questions (B3)
1. «بسقف تعديلين كحد أقصى للقسم الواحد»: هل التعديلان **حدّ نهائي** لا يُعدَّل القسم بعده ولو بالنقاط، أم هما **الحدّ المجاني** للقسم وما بعدهما بـ١٠ نقاط؟ (المطبَّق الآن: الحدّ المجاني فقط، ولا منع بعده.)
2. الحدّ التقني ٣٠ تعديلاً للمذكرة الواحدة: هل يناسبكم، أم تفضّلون رقماً آخر؟
3. تعديلات الأقسام لا تخضع للحدّ اليومي للصائغ (١٠ تشغيلات)، لكنها تُحسب ضمنه عند بدء تحليل مذكرة جديدة في اليوم نفسه. هل نرفع الحدّ اليومي للصائغ؟

<!-- B4 section follows in the next commit -->
