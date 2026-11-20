/**
 * faraid.ts — T18-P1-39 (batch l11): an inheritance (فرائض) calculator on the
 * Hanbali practice Saudi courts follow. Behind NZAMY_INHERITANCE_CALC (off by
 * default); every result carries a note that it needs a specialist's review,
 * and the owner reviews sample results before it is published (R14#70).
 *
 * What it does:
 *   - fixed shares (الفروض) of spouses, parents, grandfather, grandmothers,
 *     daughters, son's daughters, full / paternal / maternal siblings;
 *   - exclusion (الحجب) between them, and the ʿaṣaba order down to cousins:
 *     by self, with another (2:1 with a brother), and with another (sisters
 *     with daughters — عصبة مع الغير);
 *   - العمريتان (the mother takes a third of what is left after the spouse);
 *   - العول when the shares pass the whole, الرد (to every sharer but the
 *     spouses, by their shares) when they fall short and no ʿaṣaba is left;
 *   - the Hanbali answer in المشتركة (الحمارية): no sharing — the full
 *     brothers, as ʿaṣaba, take what is left, which may be nothing.
 *
 * What it refuses, honestly (`unsupported`): a grandfather with brothers or
 * sisters (الجد والإخوة — the schools and courts differ; a judge settles it),
 * and anything left with no sharer or ʿaṣaba but a spouse (ذوو الأرحام /
 * بيت المال), which it states and does not divide.
 *
 * Pure, exact (fractions of integers), no imports: `node --test` runs
 * faraid.test.ts on textbook cases.
 */

// ── fractions ────────────────────────────────────────────────────────────────

export interface Frac { n: number; d: number }

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
export const frac = (n: number, d = 1): Frac => {
  if (d === 0) throw new Error("zero denominator");
  const g = gcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: (s * d) / g };
};
const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
const ZERO = frac(0);
const ONE = frac(1);
const cmp = (a: Frac, b: Frac) => a.n * b.d - b.n * a.d;
const sum = (xs: Frac[]) => xs.reduce(add, ZERO);

// ── the heirs ────────────────────────────────────────────────────────────────

export const HEIRS = [
  "husband", "wife", "father", "mother", "grandfather", "maternalGrandmother", "paternalGrandmother",
  "son", "daughter", "sonsSon", "sonsDaughter",
  "fullBrother", "fullSister", "paternalBrother", "paternalSister", "maternalSibling",
  "fullNephew", "paternalNephew", "fullUncle", "paternalUncle", "fullCousin", "paternalCousin",
] as const;
export type Heir = (typeof HEIRS)[number];
export type Heirs = Partial<Record<Heir, number>>;

export const HEIR_LABELS_AR: Readonly<Record<Heir, string>> = {
  husband: "الزوج",
  wife: "الزوجة / الزوجات",
  father: "الأب",
  mother: "الأم",
  grandfather: "الجد لأب",
  maternalGrandmother: "الجدة لأم",
  paternalGrandmother: "الجدة لأب",
  son: "الابن / الأبناء",
  daughter: "البنت / البنات",
  sonsSon: "ابن الابن",
  sonsDaughter: "بنت الابن",
  fullBrother: "الأخ الشقيق",
  fullSister: "الأخت الشقيقة",
  paternalBrother: "الأخ لأب",
  paternalSister: "الأخت لأب",
  maternalSibling: "الأخ أو الأخت لأم",
  fullNephew: "ابن الأخ الشقيق",
  paternalNephew: "ابن الأخ لأب",
  fullUncle: "العم الشقيق",
  paternalUncle: "العم لأب",
  fullCousin: "ابن العم الشقيق",
  paternalCousin: "ابن العم لأب",
};

/** At most this many of one kind (wives: four). */
export const MAX_COUNT: Readonly<Record<Heir, number>> = Object.fromEntries(
  HEIRS.map((h) => [h, h === "husband" || h === "father" || h === "mother" || h === "grandfather" || h === "maternalGrandmother" || h === "paternalGrandmother" ? 1 : h === "wife" ? 4 : 30]),
) as Record<Heir, number>;

export type Basis = "fard" | "asaba" | "fard+asaba";

export interface HeirShare {
  heir: Heir;
  count: number;
  /** The group's share of the estate, after ʿawl or radd. */
  share: Frac;
  /** One person's share. */
  each: Frac;
  basis: Basis;
  /** The rule, in Arabic, in a few words. */
  reason: string;
}

export interface Excluded {
  heir: Heir;
  count: number;
  by: string;
}

export type FaraidResult =
  | {
      ok: true;
      shares: HeirShare[];
      excluded: Excluded[];
      /** The base (أصل المسألة) after ʿawl or radd, with every share over it. */
      base: number;
      awl: boolean;
      radd: boolean;
      /** Left undivided (only a spouse and no one else): goes to ذوي الأرحام or بيت المال. */
      undivided: Frac;
      notes: string[];
    }
  | { ok: false; unsupported: string };

export const REVIEW_NOTE_AR = "نتيجة حسابية استرشادية على المذهب الحنبلي المعمول به في المحاكم السعودية؛ لا تُعتمد قبل مراجعة مختص أو صك حصر الورثة والمحكمة المختصة.";

const n = (h: Heirs, k: Heir) => {
  const v = h[k] ?? 0;
  return Number.isInteger(v) && v > 0 ? Math.min(v, MAX_COUNT[k]) : 0;
};

/** The calculation. Counts above a kind's maximum are capped; zero or bad counts are absent. */
export function calculateFaraid(input: Heirs): FaraidResult {
  const c = Object.fromEntries(HEIRS.map((k) => [k, n(input, k)])) as Record<Heir, number>;
  if (c.husband && c.wife) return { ok: false, unsupported: "لا يجتمع زوج وزوجة في مسألة واحدة: اختر أحدهما." };
  if (HEIRS.every((k) => c[k] === 0)) return { ok: false, unsupported: "اختر وارثاً واحداً على الأقل." };

  const excluded: Excluded[] = [];
  const exclude = (k: Heir, by: string) => {
    if (c[k]) excluded.push({ heir: k, count: c[k], by });
    c[k] = 0;
  };

  // ── exclusion (الحجب) ──
  const maleDesc = c.son > 0 || c.sonsSon > 0;
  if (c.son) {
    exclude("sonsSon", "الابن");
    exclude("sonsDaughter", "الابن");
  }
  if (c.father) exclude("grandfather", "الأب");
  if (c.mother) {
    exclude("maternalGrandmother", "الأم");
    exclude("paternalGrandmother", "الأم");
  }
  // Son's daughters: two daughters take the two-thirds; without a son's son with them, nothing is left for them.
  if (c.daughter >= 2 && !c.sonsSon) exclude("sonsDaughter", "البنتين فأكثر");
  const anyDesc = c.son + c.daughter + c.sonsSon + c.sonsDaughter > 0;
  const femaleDesc = c.daughter + c.sonsDaughter > 0;
  const maleAsc = c.father > 0 || c.grandfather > 0;
  const siblingsPresent = c.fullBrother + c.fullSister + c.paternalBrother + c.paternalSister > 0;
  if (c.grandfather && !c.father && !maleDesc && siblingsPresent) {
    return { ok: false, unsupported: "مسألة الجد مع الإخوة (الأشقاء أو لأب) يختلف فيها الحساب بين الأقوال؛ تُعرض على المحكمة المختصة ولا تحسبها هذه الأداة." };
  }
  // Maternal siblings: any descendant or a male ascendant.
  if (anyDesc || maleAsc) exclude("maternalSibling", anyDesc ? "الفرع الوارث" : c.father ? "الأب" : "الجد");
  // Full siblings: a son, a son's son, the father.
  for (const k of ["fullBrother", "fullSister"] as const) {
    if (maleDesc) exclude(k, c.son ? "الابن" : "ابن الابن");
    else if (c.father) exclude(k, "الأب");
  }
  // A full sister with daughters (and no full brother) is ʿaṣaba with another: she then blocks the paternal line like a brother.
  const fullSisterWithOther = c.fullSister > 0 && !c.fullBrother && femaleDesc;
  for (const k of ["paternalBrother", "paternalSister"] as const) {
    if (maleDesc) exclude(k, c.son ? "الابن" : "ابن الابن");
    else if (c.father) exclude(k, "الأب");
    else if (c.fullBrother) exclude(k, "الأخ الشقيق");
    else if (fullSisterWithOther) exclude(k, "الأخت الشقيقة مع البنت");
  }
  if (c.paternalSister && c.fullSister >= 2 && !c.paternalBrother) exclude("paternalSister", "الأختين الشقيقتين");
  const paternalSisterWithOther = c.paternalSister > 0 && !c.paternalBrother && femaleDesc && !c.fullSister;

  // ── the ʿaṣaba order: the first present group takes what is left ──
  const asabaChain: Array<{ male: Heir; female?: Heir; with?: "other" }> = [
    { male: "son", female: "daughter" },
    { male: "sonsSon", female: "sonsDaughter" },
    { male: "father" },
    { male: "grandfather" },
    { male: "fullBrother", female: "fullSister" },
    ...(fullSisterWithOther ? [{ male: "fullSister" as Heir, with: "other" as const }] : []),
    { male: "paternalBrother", female: "paternalSister" },
    ...(paternalSisterWithOther ? [{ male: "paternalSister" as Heir, with: "other" as const }] : []),
    { male: "fullNephew" },
    { male: "paternalNephew" },
    { male: "fullUncle" },
    { male: "paternalUncle" },
    { male: "fullCousin" },
    { male: "paternalCousin" },
  ];
  const firstAsaba = asabaChain.find((g) => c[g.male] > 0) ?? null;
  // Everyone further down the chain (male lines past the father) is blocked by it.
  if (firstAsaba) {
    const at = asabaChain.indexOf(firstAsaba);
    for (const g of asabaChain.slice(at + 1)) {
      if (["father", "grandfather"].includes(g.male)) continue; // the father/grandfather keep their fixed share
      if (g.with === "other") continue;
      // Sisters below a son, a son's son or the father were excluded above; the
      // male lines past the first ʿaṣaba (nephews, uncles, cousins) fall here.
      exclude(g.male, HEIR_LABELS_AR[firstAsaba.male]);
    }
  }

  // ── fixed shares (الفروض) ──
  const fard = new Map<Heir, { share: Frac; reason: string }>();
  const set = (k: Heir, share: Frac, reason: string) => { if (c[k]) fard.set(k, { share, reason }); };

  set("husband", anyDesc ? frac(1, 4) : frac(1, 2), anyDesc ? "الربع لوجود الفرع الوارث" : "النصف لعدم الفرع الوارث");
  set("wife", anyDesc ? frac(1, 8) : frac(1, 4), anyDesc ? "الثمن لوجود الفرع الوارث" : "الربع لعدم الفرع الوارث");

  const siblingsAll = c.fullBrother + c.fullSister + c.paternalBrother + c.paternalSister + c.maternalSibling
    + excluded.filter((e) => ["fullBrother", "fullSister", "paternalBrother", "paternalSister", "maternalSibling"].includes(e.heir)).reduce((a, e) => a + e.count, 0);
  // Umariyyatan: a spouse, the mother and the FATHER, no descendant, fewer than two siblings.
  const umariyya = !anyDesc && siblingsAll < 2 && c.father > 0 && (c.husband > 0 || c.wife > 0) && c.mother > 0;
  if (c.mother) {
    if (anyDesc || siblingsAll >= 2) set("mother", frac(1, 6), anyDesc ? "السدس لوجود الفرع الوارث" : "السدس لوجود جمع من الإخوة");
    else if (umariyya) set("mother", mul(frac(1, 3), sub(ONE, c.husband ? frac(1, 2) : frac(1, 4))), "ثلث الباقي بعد فرض الزوج أو الزوجة (العُمَرية)");
    else set("mother", frac(1, 3), "الثلث لعدم الفرع الوارث وجمع الإخوة");
  }
  const grandmothers = (["maternalGrandmother", "paternalGrandmother"] as const).filter((k) => c[k]);
  for (const k of grandmothers) set(k, frac(1, 6 * grandmothers.length), grandmothers.length > 1 ? "السدس بين الجدتين" : "السدس");

  for (const k of ["father", "grandfather"] as const) {
    if (!c[k]) continue;
    if (maleDesc) set(k, frac(1, 6), "السدس لوجود الفرع الوارث الذكر");
    else if (femaleDesc) set(k, frac(1, 6), "السدس فرضاً والباقي تعصيباً لوجود الفرع الوارث الأنثى");
  }

  if (c.daughter && !c.son) set("daughter", c.daughter === 1 ? frac(1, 2) : frac(2, 3), c.daughter === 1 ? "النصف للبنت المنفردة" : "الثلثان للبنتين فأكثر");
  if (c.sonsDaughter && !c.sonsSon) {
    if (c.daughter === 1) set("sonsDaughter", frac(1, 6), "السدس تكملة للثلثين مع البنت");
    else if (!c.daughter) set("sonsDaughter", c.sonsDaughter === 1 ? frac(1, 2) : frac(2, 3), c.sonsDaughter === 1 ? "النصف" : "الثلثان");
  }
  if (c.fullSister && !c.fullBrother && !fullSisterWithOther) set("fullSister", c.fullSister === 1 ? frac(1, 2) : frac(2, 3), c.fullSister === 1 ? "النصف للشقيقة المنفردة" : "الثلثان للشقيقتين فأكثر");
  if (c.paternalSister && !c.paternalBrother && !paternalSisterWithOther) {
    if (c.fullSister === 1 && !fullSisterWithOther) set("paternalSister", frac(1, 6), "السدس تكملة للثلثين مع الشقيقة");
    else if (!c.fullSister) set("paternalSister", c.paternalSister === 1 ? frac(1, 2) : frac(2, 3), c.paternalSister === 1 ? "النصف" : "الثلثان");
    else exclude("paternalSister", "الأخت الشقيقة مع البنت");
  }
  if (c.maternalSibling) set("maternalSibling", c.maternalSibling === 1 ? frac(1, 6) : frac(1, 3), c.maternalSibling === 1 ? "السدس" : "الثلث بينهم بالتساوي");

  // ── ʿawl ──
  let total = sum([...fard.values()].map((f) => f.share));
  const notes: string[] = [];
  let awl = false;
  if (cmp(total, ONE) > 0) {
    awl = true;
    for (const [k, f] of fard) fard.set(k, { ...f, share: div(f.share, total) });
    notes.push("عالت المسألة: زادت الفروض على التركة فنقص كل فرض بنسبته.");
    total = ONE;
  }

  // ── the residue: ʿaṣaba, or radd ──
  const residue = sub(ONE, total);
  const out = new Map<Heir, { share: Frac; basis: Basis; reason: string }>();
  for (const [k, f] of fard) out.set(k, { share: f.share, basis: "fard", reason: f.reason });
  let radd = false;
  let undivided = ZERO;

  const asaba = asabaChain.find((g) => c[g.male] > 0 && (g.male !== "father" && g.male !== "grandfather" ? true : !maleDesc));
  if (cmp(residue, ZERO) > 0) {
    if (asaba) {
      const males = c[asaba.male];
      const females = asaba.female && !asaba.with ? c[asaba.female] : 0;
      const units = asaba.with === "other" ? males : males * 2 + females;
      const unit = div(residue, frac(units));
      const maleShare = asaba.with === "other" ? mul(unit, frac(males)) : mul(unit, frac(males * 2));
      const prior = out.get(asaba.male);
      out.set(asaba.male, prior
        ? { share: add(prior.share, maleShare), basis: "fard+asaba", reason: prior.reason }
        : { share: maleShare, basis: "asaba", reason: asaba.with === "other" ? "الباقي تعصيباً مع الغير (مع البنت أو بنت الابن)" : females ? "الباقي تعصيباً: للذكر مثل حظ الأنثيين" : "الباقي تعصيباً" });
      if (females && asaba.female) {
        out.set(asaba.female, { share: mul(unit, frac(females)), basis: "asaba", reason: "تعصيباً بالغير مع أخيها: للذكر مثل حظ الأنثيين" });
      }
    } else {
      // Radd: to every sharer but the spouses, by their shares.
      const spouses: Heir[] = ["husband", "wife"];
      const others = [...out.entries()].filter(([k]) => !spouses.includes(k));
      if (others.length > 0) {
        radd = true;
        const othersTotal = sum(others.map(([, v]) => v.share));
        for (const [k, v] of others) out.set(k, { ...v, share: add(v.share, mul(residue, div(v.share, othersTotal))) });
        notes.push("رُدَّ الباقي على أصحاب الفروض عدا الزوجين بنسبة فروضهم.");
      } else {
        undivided = residue;
        notes.push("بقي من التركة ما لا وارث له بالفرض ولا بالتعصيب: يُصرف لذوي الأرحام إن وُجدوا وإلا لبيت المال؛ لا تحسبه هذه الأداة.");
      }
    }
  } else if (asaba && !out.has(asaba.male)) {
    // The ʿaṣaba was present but nothing was left (e.g. المشتركة على المذهب الحنبلي).
    excluded.push({ heir: asaba.male, count: c[asaba.male], by: "استغراق الفروض للتركة" });
    if (asaba.female && !asaba.with && c[asaba.female]) excluded.push({ heir: asaba.female, count: c[asaba.female], by: "استغراق الفروض للتركة" });
    notes.push("استغرقت الفروض التركة فلم يبق للعصبة شيء.");
  }

  const order = (k: Heir) => HEIRS.indexOf(k);
  const shares: HeirShare[] = [...out.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([heir, v]) => ({ heir, count: c[heir], share: v.share, each: div(v.share, frac(c[heir])), basis: v.basis, reason: v.reason }));
  const base = [...shares.map((s) => s.each.d), undivided.d].reduce(lcm, 1);
  return { ok: true, shares, excluded, base, awl, radd, undivided, notes };
}

/** A share as a whole number of the estate (rounded to halalas), or null without one. */
export function amountOf(share: Frac, estate: number | null): number | null {
  if (estate === null || !Number.isFinite(estate) || estate <= 0) return null;
  return Math.round((estate * share.n * 100) / share.d) / 100;
}
