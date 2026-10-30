# Owner package 30 Oct — CODE-F24, the case board's autosave

Branch `fix/owner-30oct-graph-autosave`, cut from `fix/ai-owner-30oct` (which already changes `CaseGraphView.tsx` for the canvas-card button). `feat/ai-l12-opinion` changes 10 lines of the same file: expect a small conflict at merge. Status: «مُصلَح في الكود — بانتظار النشر واختبار القبول». **No browser check was run on this branch.**

Owner's ask: «dirty revision حتى النجاح، retry ومسودة محلية للمستخدم وversion/CAS؛ اختبر full screen والتنقل قبل debounce».

| Part | Before (verified in source) | Now |
|---|---|---|
| dirty until success | the debounce cleared `pendingSave` when it FIRED, before the answer — a failed save was forgotten | `src/lib/services/caseGraphAutosave.ts`: a local revision counter; dirty until the server confirms THAT revision; an older confirmation never clears a newer change |
| retry | none — chip said «سيُعاد المحاولة مع أي تعديل جديد» | network / 5xx / 429 retry on their own (2 s, 5 s, 15 s, 30 s…); 409 and 4xx / demo mode stop (no loop) |
| local draft | none | `localStorage` key `nzamy:case-graph-draft:<user>:<case>`, written at each send, on `pagehide` and on unmount; cleared only once confirmed; on the next visit OFFERED («استعدها / تجاهلها»), never applied silently, and only if it differs from the server copy. Deliberate exception to the "localStorage only for theme/sidebar/banners/demo/guests" rule: it holds unacknowledged work only |
| version / CAS | blind upsert; every save also rewrote `owner_user_id`/`firm_id` to whoever saved last | `PUT` takes `baseUpdatedAt` (the row's `updated_at`, kept as the server's exact string): `null` → INSERT (23505 → 409); string → `UPDATE … WHERE updated_at = base` (0 rows → 409 «graph_conflict», or 404 if the row is not visible); absent → old upsert, so a tab on the old script keeps working. The update no longer touches owner/firm. `updatedAt` comes back and chains through queued saves |
| conflict UX | — | chip «تغيّرت النسخة المحفوظة — لم نحفظ فوقها» with «حمّل النسخة المحفوظة» / «احتفظ بنسختي». A retry whose earlier answer was lost (server holds exactly what we send) is not a conflict |
| fullscreen / navigation before the debounce | flush on unmount only for a change still in the debounce | `dispose()` sends whatever is unconfirmed (in the debounce OR failed and waiting); the service queues it before the next board's read; `beforeunload` asks while dirty |

Not touched: the office graph (`/dashboard/lawyer/graph`) is a read-only derived view with no autosave. The global multi-case workspace (`isGlobal`, no `caseId`) still says «غير محفوظة» — nothing to key a save on. No SQL needed (the `updated_at` trigger already exists, 20260903).

Callers: `saveCaseGraph`/`getCaseGraph` are used only by `CaseGraphView` (mounted in the lawyer, firm and business case files). `api.ts` deliberately untouched (the finance branch edits it); the service makes its own PUT with the same demo-mode refusal.

Tests: `caseGraphAutosave.test.ts` 9 (debounce, retry + backoff, old ack vs new change, conflict stop/resume/discard, demo-mode no loop, unmount after failure, nothing after conflict); `_canvas-wiring.test.ts` pins updated (not deleted) + a CODE-F24 pin on service/route/view; kanban + officeGraph suites 44/44; `tsc --noEmit` clean; eslint 0 errors (same 5 warnings as the base).

Owner acceptance (live): (1) move a card and close fullscreen within 1.5 s → reopen, it is there; (2) go offline, move a card → «تعذّر الحفظ — نعيد المحاولة», back online → «محفوظة»; (3) open the same case in two windows, edit both → the second shows the conflict choices; (4) offline edit, close the tab, reopen online → «تعديلات من زيارة سابقة لم تُحفظ».
