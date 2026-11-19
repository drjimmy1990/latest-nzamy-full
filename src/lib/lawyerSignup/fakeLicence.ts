/**
 * fakeLicence.ts — owner file 19 §1ب.2 (batch l9-secleak): a licence number of
 * the fake test pattern `1448-LAW-…` (the ten old test lawyers carried
 * 1448-LAW-001 … 010) is never verified, by any path.
 *
 * The database holds the rule for every writer (20261129_20: a trigger on
 * lawyer_profiles / provider_profiles refuses verification_status =
 * 'verified' with such a number, errcode 23514, message «fake_test_licence…»).
 * This file is the same match in the app — so the admin approval answers a
 * clear Arabic refusal before it writes, and still works before the SQL runs —
 * and the reader of the database's refusal.
 *
 * The match: every character that is not a Latin letter or a digit removed,
 * Arabic-Indic digits folded to 0-9, case folded, then the prefix 1448LAW.
 * It is public.is_fake_test_licence(text) exactly.
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function foldDigits(value: string): string {
  let out = "";
  for (const ch of value) {
    const a = ARABIC_INDIC.indexOf(ch);
    const e = EXTENDED_ARABIC_INDIC.indexOf(ch);
    out += a >= 0 ? String(a) : e >= 0 ? String(e) : ch;
  }
  return out;
}

export function isFakeTestLicence(licence: string | null | undefined): boolean {
  if (typeof licence !== "string") return false;
  return foldDigits(licence).replace(/[^0-9A-Za-z]+/g, "").toUpperCase().startsWith("1448LAW");
}

/** The database trigger's refusal (20261129_20). */
export function isFakeLicenceDbError(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23514" && typeof error.message === "string" && error.message.startsWith("fake_test_licence");
}

export const FAKE_LICENCE_REFUSAL_AR =
  "لا يمكن الاعتماد: رقم الترخيص من أرقام الاختبار الوهمية (1448-LAW-) ولا يُوثَّق أبداً. صحّح رقم الترخيص أولاً.";
