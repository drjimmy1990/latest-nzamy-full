# Owner package 2026-10-30: consultation scheduling, calculators and date conversion

Branch `fix/owner-30oct-consult-calc`, cut from `main` at `235e1bef`. It is not merged, pushed or deployed.

Source: `Nezamy-Developer-Handoff-2026-10-30`, specifically:

- `05-traceability/developer-backlog.csv`
- `08-current-code-review/backlog-review.csv`
- `08-current-code-review/lawyer-detailed-followup.csv`
- the evidence in `06-evidence/nezamy-live-test`: `08-calculator`, `phase3/CALC01/03/04/06/07` and `phase4/CONS01–12`, `TIME01–05`.

The package was read only. Nothing in it was run.

Status wording: each item below is **fixed in code, awaiting deployment and acceptance testing**. None of them is "closed".

| Commit | Scope |
|---|---|
| `5517614d` | Consultations: Riyadh-time slots validated on the server (past, partial, overlap) |
| `dbae2ba8` | Calculators: bounded inputs, and impossible dates refused |
| (this file's commit) | The ledger and the Arabic owner note |

## Re-verification against HEAD (`235e1bef`) before editing

Every item was still open in the current code. The package's blob comparison says the same.

- **LIVE-F34 / LAW-DETAIL-015 / CODE-F31.**
  - `bookingDateError` (`_bookingDate.ts`) compared the day only.
  - `POST /api/v1/service-requests` did not validate `metadata.day`/`time` at all.
  - The trigger `consultation_from_service_request` (`20260905_phase3…sql:180-187`) stores a slot only when both keys are present. A lone date was dropped silently and the row became "requested", while the modal's button still said «تأكيد الجدولة».
  - `PATCH /api/v1/lawyer/consultations/[id]` accepted any `Date.parse`-able string, past or zone-less.
- **LIVE-F35.** No route read other consultations before writing a slot.
- **LIVE-F37.** The trigger stores the Riyadh wall clock correctly: `(day||' '||time)::timestamp at time zone 'Asia/Riyadh'`, so 15:15 is saved as 12:15Z. Every screen then formatted that instant in the browser's zone (`toLocaleTimeString` with no `timeZone`).
  - The owner's machine was UTC+2 on 30 Oct: Egypt left daylight saving on 29 Oct, which also explains why CONS09 on 29 Oct showed no shift. 12:15Z therefore displayed as 14:15.
  - The reschedule modal read and wrote the browser's zone too (`new Date("YYYY-MM-DDTHH:mm")`).
- **LIVE-F30.** `calculateFee` and `calcLaborRights` used `parseFloat(x) || 0`.
  - `CalcCourtFees` already refused values ≤ 0 (`parseClaimAmount`), so that calculator needed nothing.
- **LIVE-F31.** The converter used the page's own Kuwaiti tabular routines and accepted any day number.
- **UX10.** The three «احجز استشارة» buttons on `src/app/dashboard/client/page.tsx` go to two places:
  - the hero and empty-appointment card go to `/dashboard/client/services`;
  - the quick card goes to `/dashboard/client/consultation/new`.

## Per item

### LIVE-F34: internal consultation accepted at 01:01, a time already past today

- **Verdict:** fixed now.
- **Change:** the date and the time are judged together against the current instant, which is the same instant in Riyadh as everywhere. A slot must be strictly after now. The refusal names the current Riyadh time. The check runs:
  - in the booking modal, live and again at the moment of saving;
  - in the reschedule modal, live and again at the moment of saving;
  - **on the server**:
    - `POST /api/v1/service-requests`, for `type: "consultation"` only;
    - `PATCH /api/v1/lawyer/consultations/[id]`, for a new slot or a row moving to `scheduled`;
    - the legacy `PATCH /api/v1/consultations/[id]`, which no screen calls.

  A scheduled row that keeps its existing slot (for example, only the mode changes) is not re-judged against now. "Now" is read per request on the server and after mount on the client, never at render time, so the SSR cached-date trap does not apply.
- **Files:**
  - `src/lib/services/consultationSchedule.ts` (new)
  - `src/app/api/v1/lawyer/consultations/_scheduleGuard.ts` (new)
  - `src/app/api/v1/service-requests/route.ts` (+16 lines; the file's mixed line endings were preserved)
  - `src/app/api/v1/lawyer/consultations/[id]/route.ts`
  - `src/app/api/v1/consultations/[id]/route.ts`
  - `src/app/dashboard/lawyer/consultations/page.tsx` (BookingModal only)
  - `src/app/dashboard/lawyer/_components/consultations/ConsultationActionModal.tsx` (schedule action only)
- **Commit:** `5517614d`
- **Tests:** `consultationSchedule.test.ts`, including:
  - "01:01 today, entered in the evening, is refused";
  - the current minute is refused and the next one is accepted;
  - `_scheduleGuard.wiring.test.ts`, which checks the guard runs before the insert and that PATCH rejects a new past slot.
- **Check live:**
  1. In the evening, as admin, book an internal consultation for today at 01:01. The modal should refuse it with «لا يمكن جدولة استشارة في وقت مضى… الساعة الآن … بتوقيت الرياض».
  2. Repeat the request with the browser's devtools: `POST /api/v1/service-requests` with `metadata.day` set to today and `time` 01:01. It should answer **400**.
  3. Reschedule an existing consultation to an earlier time today. It should be refused, both in the UI and via PATCH (400).
  4. Failure case: a time later today should be accepted.

### LAW-DETAIL-015: same issue (REF0035)

- **Verdict:** fixed now, by the LIVE-F34 change.
- **Files, commit and tests:** as for LIVE-F34.
- **Check live:** as for LIVE-F34.

### CODE-F31: empty date accepted although the button says «تأكيد الجدولة»

- **Verdict:** fixed now.
- **Change:**
  - The modal now distinguishes the two outcomes:
    - both date and time blank: the button reads «حفظ كطلب غير مجدول» and the summary row «الحالة بعد الحفظ» reads «بانتظار الجدولة — طلب غير مجدول»;
    - both filled: the button reads «تأكيد الجدولة» and the summary reads «مجدولة — موعد مؤكد».
  - A date without a time, or a time without a date, is refused with «أدخل التاريخ والوقت معاً…». This is enforced in the UI and on the server (400), replacing the trigger's silent drop.
  - The summary now spells the date out with `describeDateAr` (weekday plus Hijri) and shows the time with «بتوقيت الرياض».
  - The server checks the date, the time, the zone (fixed Riyadh +03:00, or an explicit offset on PATCH) and conflicts (LIVE-F35).
  - A bad `metadata.duration` is refused (400) instead of being nulled by the trigger.
- **Files and commit:** as for LIVE-F34.
- **Tests:**
  - "CODE-F31: both blank is an unscheduled request" and "a date without a time … is refused";
  - the wiring test for the button label.
- **Check live:**
  1. Book with no date or time. The button should say «حفظ كطلب غير مجدول» and the card should land under «بانتظار الجدولة».
  2. Book with a date and no time. It should be refused.
  3. Book with both. The button should say «تأكيد الجدولة».

### LIVE-F35: two overlapping 60-minute consultations saved with no warning

- **Verdict:** fixed now, with a provisional policy. **The policy itself needs an owner decision.**
- **Policy search:** neither `05-traceability/corrections.html` nor `conflicts-and-corrections.csv` contains a ruling on consultation overlap. Their only overlap entry, C10, is about counting review findings. `developer-questions-299-321.csv` has nothing either.
- **Change:** the server reads the lawyer's own `scheduled` consultations (`lawyer_user_id`) whose time intersects the new slot, using the duration.
  - Back-to-back slots, such as 13:00–14:00 then 14:00–15:00, do not count as overlapping.
  - A stored row with no duration counts as 60 minutes.
  - The row being rescheduled is excluded.
  - On overlap the server answers **409 `consultation_overlap`**, with the Arabic message listing the conflicting slots in Riyadh time.
  - The modal shows the warning and a «حفظ رغم التعارض» button. That button resends the request with `confirmOverlap: true`, and only then is the slot saved.
  - Any change to the date, time or duration clears the warning.
  - If the read fails, the save is refused (503) rather than done blind.

  The check runs on booking only when the booking is assigned to the caller. The client wizards send no slot, so they never reach it. Switching to a hard block is a one-line change in `_scheduleGuard.ts`.
- **Files:**
  - `_scheduleGuard.ts`
  - `[id]/route.ts`
  - `lawyerConsultationsService.ts`, which gains `ConsultationOverlapError` and `mutateConsultationSlot`. `updateLawyerConsultation` now uses `mutateConsultationSlot`, so a 409 overlap surfaces as a distinct error.
  - the two modals.
- **Commit:** `5517614d`
- **Tests:**
  - "13:30 and 14:00, both 60 minutes, overlap";
  - back-to-back slots and self-exclusion;
  - the default 60 minutes for a null duration;
  - the 8-hour look-back window.
- **SQL:** none. A database exclusion constraint would hard-block, which contradicts the confirm-to-save policy. The existing index `idx_consultations_lawyer_status` already serves the query.
- **Check live:**
  1. Book 13:30 for 60 minutes, then 14:00 for 60 minutes on the same account. The second should show the warning naming «١:٣٠ م بتوقيت الرياض (٦٠ دقيقة)» and should not be saved until «حفظ رغم التعارض» is pressed.
  2. 14:30 after a 13:30 + 60-minute slot should save with no warning.

### LIVE-F37: 15:15 shows as 14:15 after saving and after reload

- **Verdict:** fixed now.
- **Trace:**
  - **Client → server:** the booking modal sends `metadata.day` and `metadata.time` as typed. The trigger converts them `at time zone 'Asia/Riyadh'`, which was already correct (15:15 becomes 12:15Z).
  - **Reschedule modal:** it used to send the browser-local instant, which was wrong on any non-Riyadh machine. It now sends the explicit Riyadh instant (`riyadhSlotIso`), and PATCH refuses a zone-less `scheduledAt`.
  - **Stored → display:** this was wrong on every screen, which used the browser's zone. All of them now render the Riyadh wall clock with fixed +3 arithmetic and no Intl or machine zone, and append «بتوقيت الرياض»:
    - the lawyer list, the «الاستشارة القادمة» card and the «اليوم» KPI (`localYMD` and `todayYMD` are now Riyadh);
    - `ConsultationDetail`;
    - the firm list (it also sliced UTC characters for the date);
    - the client list (`scheduledDate` now carries the time) and client detail.

  Input, review, save and display now agree, and each names the zone.
- **Files:** as for LIVE-F34, plus:
  - `ConsultationDetail.tsx`
  - `src/app/dashboard/firm/consultations/page.tsx`
  - `src/app/dashboard/client/consultation/page.tsx`
  - `src/app/dashboard/client/consultation/[id]/page.tsx`
- **Commit:** `5517614d`
- **Tests:**
  - "15:15 Riyadh is stored as 12:15Z and read back as 15:15, whatever the machine zone";
  - the trigger round trip;
  - the day boundary at 21:00Z;
  - no daylight saving.

  These were run under `TZ=UTC`, `TZ=Africa/Cairo` and `TZ=America/New_York`, and all pass.
- **Check live:**
  1. Set the test machine to Cairo (UTC+2) or any non-Riyadh zone.
  2. Book 30 Oct at 15:15.
  3. The review, the card after saving and the card after a reload should all read «٣:١٥ م بتوقيت الرياض».
  4. Reschedule to 16:00. It should read «٤:٠٠ م» everywhere.

### UX10: similar «احجز استشارة» buttons lead to two flows

- **Verdict:** **not changed. Needs an owner decision, or a go-ahead to edit the client home page.**
- **Reason:** the brief allowed this only if it stayed small and inside the consultation and booking files. The divergence is entirely in `src/app/dashboard/client/page.tsx`, the client dashboard home, which is not one of those files.

  The booking flows themselves already avoid promising a time:
  - `/dashboard/client/consultation/new` sends with «إرسال الطلب» and shows «المحامي والموعد: يحدد من قبل المنصة»;
  - `/book/consultation` shows «الموعد المطلوب» and «يتواصل معك لتأكيد الموعد».

  After commit `5517614d`, the client list shows the confirmed time with «بتوقيت الرياض», and an unscheduled row carries the «بانتظار الجدولة» status.
- **Proposed diff, not applied:** in `src/app/dashboard/client/page.tsx`:
  - point the hero button (~line 662) and the empty-appointment card button (~line 817) at `/dashboard/client/consultation/new`, the same as the quick card (~line 508);
  - relabel all three «اطلب استشارة»;
  - change the hint «احجز استشارة ليظهر موعدك هنا» to «اطلب استشارة؛ يظهر موعدك هنا بعد تأكيده».

### LIVE-F30: calculators accept negative input

- **Verdict:**
  - fixed now for «أتعاب المحامي» and «مستحقات العمل»;
  - already fixed for «التكاليف القضائية» (`parseClaimAmount` refuses ≤ 0 and shows «أدخل مبلغاً بالأرقام فقط، أكبر من صفر.»);
  - «المواعيد القانونية» has no numeric input.
- **Change:** `src/components/calculators/calcInputs.ts` provides one bounded parser. It accepts Arabic-Indic digits and thousands separators. It refuses a sign, an exponent, letters, an empty required field or an out-of-range value, with an Arabic sentence, before calculating.
  - **Lawyer fees:**
    - hours must be greater than 0 and at most 10,000;
    - the dispute value must be greater than 0;
    - «بالساعة» or «نسبة» with an empty field is refused, where it used to fall back silently to the fixed formula.
  - **Labour rights:**
    - salary greater than 0;
    - allowances 0 or more;
    - years a whole number from 0 to 60;
    - months a whole number from 0 to 11;
    - total service greater than 0;
    - leave days 0 to 365 when the leave switch is on;
    - notice months 0 to 24 when the notice switch is on.

  The bounds are input sanity checks only, and imply no legal endorsement of the formulas.
- **Files:**
  - `calcInputs.ts` (new)
  - `CalcLaborRights.tsx`
  - `src/app/ai/fee-calculator/page.tsx`
- **Commit:** `dbae2ba8`
- **Tests:** `calcInputs.test.ts`, including:
  - "CALC01: −5 hours is refused";
  - "CALC04: a service of −5 years is refused, not answered with 0";
  - junk input such as `5abc` or `1e3`;
  - a source check that neither screen still calls `parseFloat` or `parseInt`.
- **Check live:**
  1. «بالساعة» with −5 should show «عدد الساعات لا يكون سالباً.» and no result.
  2. «مستحقات العمل» with −5 years should show «سنوات الخدمة لا يكون سالباً.».
  3. 40 hours should still calculate.

### LIVE-F31: the converter accepted 31 February 2026 and answered «14 رمضان 1447»

- **Verdict:** fixed now.
- **Change:** `src/components/calculators/dateConvert.ts` checks the date before converting.
  - **Gregorian:** the day must exist in that month and year, so 29 February is accepted only in a leap year.
  - **Hijri:** the day must exist on Umm al-Qura, so «30» in a 29-day month is refused with «هذا الشهر ٢٩ يوماً بحسب تقويم أم القرى».
  - Years are bounded to 1900–2100 CE and 1318–1525 AH.
  - Nothing is normalised silently.
  - The Kuwaiti tabular routines were replaced by `src/lib/services/hijri.ts` (Intl `islamic-umalqura`), the calendar that `deadlineEngine.ts` and the header use.
- **Side effect on LIVE-F32, which belongs to another worker:** the Hijri day this converter shows **changes**. 29 Oct 2026 now converts to **18 جمادى الأولى 1448**, matching the header, where it used to show 19. The test asserts this. LIVE-F32 is not claimed here, and the header was not touched.
- **Files:**
  - `dateConvert.ts` (new)
  - `src/app/ai/fee-calculator/page.tsx`
- **Commit:** `dbae2ba8`
- **Tests:** `dateConvert.test.ts`, which:
  - refuses 31 Feb 2026, 29 Feb 2026, 31 Apr and 31 Jun, and accepts 29 Feb 2028;
  - checks agreement with `hijriPartsOf`;
  - checks the Hijri → Gregorian round trip;
  - refuses day 30 in a 29-day month (the month is found from the calendar, not hard-coded).

  It was run under UTC, Riyadh and New York.
- **Check live:**
  1. 31/2/2026 should show «لا يوجد يوم ٣١ في فبراير ٢٠٢٦ — هذا الشهر ٢٨ يوماً…» and no result.
  2. 29/10/2026 should give «18 جمادى الأولى 1448هـ».
  3. Hijri 30 in a 29-day month should be refused.

## Verification

- **Unit tests:** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/**/*.test.ts"`.
  - Baseline at `235e1bef`: 4166 tests, 7 failing.
  - On the branch: 4210 tests (44 new), all 44 new ones passing.
  - The same 7 pre-existing failures remain. None is in the files touched here:
    - library volume series;
    - lawyer dashboard consultant cards;
    - `aiFiles` (`pdf-lib` missing from `node_modules`);
    - an AI timer end read;
    - `grantPurchase`;
    - two share-snapshot tests.
  - In the full run, `src/lib/ai/runCore.test.ts` once reported a timeout of 49999 where 50000 was expected. It is timing-dependent, passed 3/3 when run alone, and is in an area that is off limits for this work.
- **Type check:** `tsc --noEmit` reports only the pre-existing `pdf-lib` "Cannot find module" errors in `src/lib/ai/aiFiles*.ts`.
- **GitNexus:** `impact` returned "target not found" for the edited symbols, and `detect_changes` mapped 0 symbols across the 10 changed files. The `latest-nzamy-full` index does not cover this worktree or is stale. The blast radius was checked by grep instead:
  - `ConsultationActionModal` is imported by the lawyer list, the lawyer detail and the firm list;
  - `updateLawyerConsultation` is used only through that modal;
  - every other edited function is file-private.
- **Off limits, untouched:** consultation → case conversion (`convert` action and route, `ConsultCard`'s convert button), deadline maths, hearings, finance, auth, `src/lib/ai`, library and pricing.

## SQL

None. LIVE-F35 is warn-and-confirm, which a database constraint cannot express. A past-slot trigger was considered and rejected: it could refuse unknown writers such as imports or the admin, and the server routes are the only writers in the app.

## Open owner questions

1. **Overlapping consultations (LIVE-F35).** Should an overlap be **refused**, or **allowed after an explicit confirmation**, as built now? Should the check also cover the lawyer's hearings and tasks, or a firm-wide calendar? It currently covers only the same lawyer's scheduled consultations.
2. **UX10.** May the client home page (`src/app/dashboard/client/page.tsx`) be changed so that all three buttons open the same booking wizard and read «اطلب استشارة»? The proposed diff is in the UX10 section above.
