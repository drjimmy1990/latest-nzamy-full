# Owner package 30 Oct — NGO and government tool screens

Branch `fix/owner-30oct-ai-ngo-gov`, cut from `fix/owner-30oct-validation-honesty` (needs its `contactFieldRules.ts`). The `/ai/*` pieces that branch handed over. Status everywhere: «مُصلَح في الكود — بانتظار النشر واختبار القبول».

| id | Owner saw | Verified cause | Fix |
|---|---|---|---|
| LIVE-F22 (volunteer half) | عقد التطوع accepts any text as an ID or a mobile | `canVolunteer` only checked the fields were non-empty | ID through `checkNationalIdFormat` (required), mobile through `checkSaudiPhone` (optional); each shows its own error and «التالي» stays disabled while either is wrong; `FORMAT_ONLY_NOTE` under the fields |
| LIVE-F19 | the governance score is gone after a refresh | state only, never saved; a «تقرير الامتثال PDF» button had no handler | a «حساب مؤقت…» notice above the score from the first view; the dead PDF button is now «نسخ النتيجة» (copies the score and every item as text). Saving per association is not built (no association model) |
| consult-calc leftover | `/ai/gov/deadline-calculator` «المدة (يوم)» accepted −5 | `parseInt(...) \|\| 0` with no floor | whole days, at least 1: error under the field, «إضافة» disabled, `add()` refuses |

Tests: `src/app/ai/ngo/honesty.test.ts` (3, source-read) + `contactFieldRules.test.ts` 13/13; `tsc --noEmit` clean apart from the known `pdf-lib` lines.
