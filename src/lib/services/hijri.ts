/**
 * hijri.ts — one Hijri calendar for the whole platform, and it is Umm al-Qura.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * There were two Hijri implementations in this app and they disagreed with each
 * other on 674 of 730 consecutive days. Neither agreed with Umm al-Qura — the
 * calendar Saudi courts file against — which is the only one that matters here:
 * a filing deadline is counted in Hijri days, and a platform that shows a lawyer
 * the wrong one is worse than a platform that shows none.
 *
 * Measured on 2026-08-27, in the header of every account:
 *
 *     Umm al-Qura (ICU)                14 / 3 / 1448
 *     HijriDateWidget's own arithmetic  13
 *
 * A whole day out. Both implementations were JS ports of the same tabular
 * routine, whose C original relies on truncation TOWARD ZERO; `Math.floor` is
 * not that for the negative `(14 - m) / 12` term, so the Julian day came out
 * wrong for most months. That is not a bug worth fixing twice — the runtime
 * already ships the real calendar.
 *
 * ── WHY Intl RATHER THAN A TABLE ────────────────────────────────────────────
 *
 * `islamic-umalqura` IS Umm al-Qura, maintained in ICU with the published
 * sighting tables. Re-deriving it in application code means owning those tables
 * forever and being wrong between updates.
 *
 * `en-u-ca-islamic-umalqura` and `formatToParts`, not `ar-SA`, deliberately:
 *   - `ar-SA` resolves to different calendars across ICU builds, so asking for
 *     it is asking for whatever that build happens to think;
 *   - the `day` PART comes back as a plain number, where a formatted `ar-SA`
 *     string would hand back Arabic-Indic numerals that have to be parsed home
 *     again.
 *
 * ── WHY EVERYTHING RETURNS null INSTEAD OF A FALLBACK ───────────────────────
 *
 * A runtime without Umm al-Qura data exists (older embedded ICU, a trimmed
 * Node build). On one, `Intl` silently falls back to Gregorian — so the
 * "Hijri" day would be the Gregorian day printed under a «هـ». Every function
 * here returns `null` in that case and the CALLER must render nothing at all.
 * An absent Hijri date is a gap; a wrong one is a false statement about a court
 * deadline.
 */

/** The twelve Hijri months, in order, index 0 = محرم. */
export const HIJRI_MONTHS_AR = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الثاني",
  "جمادى الأولى",
  "جمادى الثانية",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
] as const;

export interface HijriParts {
  /** 1–30 */
  day: number;
  /** 1–12 */
  month: number;
  year: number;
  /** The Arabic month name, from HIJRI_MONTHS_AR. */
  monthName: string;
}

/**
 * Built once, and only after confirming the runtime honoured the request.
 * `resolvedOptions().calendar` is the check that matters: without it a runtime
 * that ignored the `-u-ca-` extension would quietly format Gregorian.
 */
const UMM_AL_QURA: Intl.DateTimeFormat | null = (() => {
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
    return fmt.resolvedOptions().calendar === "islamic-umalqura" ? fmt : null;
  } catch {
    return null;
  }
})();

/** True when this runtime can answer at all. Callers render no Hijri when false. */
export function hijriAvailable(): boolean {
  return UMM_AL_QURA !== null;
}

/**
 * The Umm al-Qura date for a Gregorian `date`, or `null` if unavailable.
 *
 * No `timeZone` is set, on purpose: callers build their dates at LOCAL midnight
 * (`new Date(y, m, d)`), so the parts must be read back in the local zone. Ask
 * for UTC and a reader in Riyadh sees the previous day for three hours a night.
 */
export function hijriPartsOf(date: Date): HijriParts | null {
  if (!UMM_AL_QURA || Number.isNaN(date.getTime())) return null;
  try {
    const parts = UMM_AL_QURA.formatToParts(date);
    const read = (type: string) => {
      const value = parts.find((p) => p.type === type)?.value;
      // The year part can carry an era suffix in some builds ("1448 AH").
      const n = value ? Number.parseInt(value.replace(/[^0-9]/g, ""), 10) : Number.NaN;
      return Number.isFinite(n) ? n : null;
    };
    const day = read("day");
    const month = read("month");
    const year = read("year");
    if (day === null || month === null || year === null) return null;
    if (month < 1 || month > 12) return null;
    return { day, month, year, monthName: HIJRI_MONTHS_AR[month - 1] };
  } catch {
    return null;
  }
}

/** «١٤ ربيع الأول ١٤٤٨ هـ», or `null` when the runtime cannot say. */
export function hijriLabelAr(date: Date): string | null {
  const h = hijriPartsOf(date);
  if (!h) return null;
  return `${toArabicDigits(h.day)} ${h.monthName} ${toArabicDigits(h.year)} هـ`;
}

/** Western digits → Arabic-Indic, for Arabic copy. */
export function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** Mean length of a Hijri year in days — used ONLY to seed the search below. */
const MEAN_HIJRI_YEAR_DAYS = 354.367;
const HIJRI_EPOCH_UTC = Date.UTC(622, 6, 19); // 19 July 622 CE, 1 Muharram 1 AH
const DAY_MS = 86_400_000;

/**
 * The Gregorian date for a Hijri day/month/year, or `null` when there is no
 * such date (or the runtime has no Umm al-Qura data).
 *
 * SEARCHED, NOT COMPUTED, and that is the point: the estimate below only picks
 * a starting day, and every candidate is then checked with `hijriPartsOf` —
 * i.e. against ICU itself. So this function cannot drift from the forward
 * conversion the rest of the app uses, which is exactly how the two old
 * implementations came to disagree with each other.
 *
 * The window is ±45 days around an estimate that is accurate to a few days, so
 * the loop is ~90 cheap iterations and terminates whether or not a match
 * exists. `null` for «٣٠ رمضان» in a year where Ramadan has 29 days is a real
 * answer, not a failure.
 */
export function gregorianFromHijri(day: number, month: number, year: number): Date | null {
  if (!UMM_AL_QURA) return null;
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (day < 1 || day > 30 || month < 1 || month > 12 || year < 1 || year > 2000) return null;

  const daysSinceEpoch = (year - 1) * MEAN_HIJRI_YEAR_DAYS + (month - 1) * 29.53 + (day - 1);
  const estimate = HIJRI_EPOCH_UTC + Math.round(daysSinceEpoch) * DAY_MS;

  for (let offset = -45; offset <= 45; offset += 1) {
    const utc = new Date(estimate + offset * DAY_MS);
    // Rebuild at LOCAL midnight before comparing: hijriPartsOf reads in the
    // local zone, so a UTC instant would be compared against the wrong day.
    const candidate = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    const h = hijriPartsOf(candidate);
    if (h && h.day === day && h.month === month && h.year === year) return candidate;
  }
  return null;
}
