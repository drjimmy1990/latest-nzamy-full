/**
 * Lawyer signup verification (owner decisions ٢٠–٢١) — name and licence keys.
 *
 * A TypeScript MIRROR of the two SQL normalisers of migration 20261122_40
 * (public.lawyer_registry_norm_name / lawyer_registry_norm_licence). The
 * database stays the reference: every registry match, and the name match the
 * instant approval reads, is computed in SQL (lawyer_signup_registry_check,
 * 20261124_70). This mirror is used for one thing only — comparing what the AI
 * read off the licence photo with the registry answer, which never goes back
 * into the database. nameLicence.test.ts pins it to the SQL verify vectors.
 *
 * Pure: no imports, no I/O, so `node --test` loads it as it is.
 */

// U+064B..U+0670 (tashkeel + superscript alef), U+065F, U+0640 (tatweel),
// U+200C..U+200F (ZWNJ/ZWJ/LRM/RLM), U+061C (ALM) — the SQL class
// '[ً-ٰٟـ‌-‏؜]' spelled with escapes.
const STRIP_RE = /[ً-ٰٟـ‌-‏؜]/g;
const FROM = "أإآٱىئؤة";
const TO = "ااااييوه";

function translate(s: string, from: string, to: string): string {
  let out = "";
  for (const ch of s) {
    const i = from.indexOf(ch);
    out += i === -1 ? ch : to[i];
  }
  return out;
}

/** lawyer_registry_norm_name: null for an empty result. */
export function normRegistryName(p: string | null | undefined): string | null {
  const s = translate(String(p ?? "").replace(STRIP_RE, ""), FROM, TO)
    .replace(/\s+/g, " ")
    .trim();
  return s === "" ? null : s;
}

/** name_key: the normalised name without spaces («عبد الله» = «عبدالله»). */
export function registryNameKey(p: string | null | undefined): string | null {
  const n = normRegistryName(p);
  return n === null ? null : n.replace(/ /g, "");
}

const LIC_FROM = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹-–—_\\";
const LIC_TO = "01234567890123456789/////";

/** lawyer_registry_norm_licence: western digits, no spaces, one «/». */
export function normRegistryLicence(p: string | null | undefined): string | null {
  const s = translate(String(p ?? "").replace(/\s+/g, ""), LIC_FROM, LIC_TO)
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return s === "" ? null : s;
}

/** Arabic letters only, at least four words — «الاسم الرباعي» (decision ٢٠). */
export function isFourPartName(raw: string | null | undefined): boolean {
  const n = normRegistryName(raw);
  if (!n) return false;
  const words = n.split(" ").filter((w) => /[ء-ي]/.test(w));
  return words.length >= 4 && words.every((w) => /^[ء-ي]+$/.test(w));
}

export type NameMatch = "exact" | "subset" | "different" | "none";

/**
 * Same rule as the SQL in lawyer_signup_registry_check (20261124_70):
 *   exact     — the keys are equal (spaces ignored);
 *   subset    — four or more typed words, every one of them in the registry
 *               name (a registry name of five or more parts, typed as four);
 *   different — anything else;
 *   none      — nothing typed / no registry name.
 */
export function compareNames(typed: string | null | undefined, registry: string | null | undefined): NameMatch {
  const a = normRegistryName(typed);
  const b = normRegistryName(registry);
  if (!a || !b) return "none";
  if (a.replace(/ /g, "") === b.replace(/ /g, "")) return "exact";
  const aw = a.split(" ");
  const bw = new Set(b.split(" "));
  if (aw.length >= 4 && aw.every((w) => bw.has(w))) return "subset";
  return "different";
}

/** exact or subset — the name test of the instant approval. */
export function nameMatchAccepted(m: NameMatch | null | undefined): boolean {
  return m === "exact" || m === "subset";
}
