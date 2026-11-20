/**
 * faraid.test.ts — T18-P1-39 (batch l11): the inheritance calculator on
 * textbook cases (Hanbali, as Saudi courts apply it).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/inheritance/faraid.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amountOf, calculateFaraid, frac, REVIEW_NOTE_AR, type Frac, type Heir, type Heirs } from "./faraid.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const f = (s: string): Frac => { const [a, b] = s.split("/").map(Number); return frac(a, b ?? 1); };

/** heir → its group's share as "n/d"; every result must also sum (with what is undivided) to the whole. */
function shares(heirs: Heirs): Record<string, string> {
  const r = calculateFaraid(heirs);
  assert.ok(r.ok, r.ok ? "" : r.unsupported);
  const total = [...r.shares.map((s) => s.share), r.undivided].reduce((a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d), frac(0));
  assert.deepEqual(total, frac(1), "the shares make the whole estate");
  return Object.fromEntries(r.shares.map((s) => [s.heir, `${s.share.n}/${s.share.d}`]));
}
const excludedOf = (heirs: Heirs): Heir[] => {
  const r = calculateFaraid(heirs);
  assert.ok(r.ok);
  return r.excluded.map((e) => e.heir);
};

test("son and daughter: to the male twice the female", () => {
  assert.deepEqual(shares({ son: 1, daughter: 1 }), { son: "2/3", daughter: "1/3" });
  assert.deepEqual(shares({ son: 2, daughter: 1 }), { son: "4/5", daughter: "1/5" });
});

test("husband with a daughter: a quarter, the daughter half, and the rest returned to her (الرد)", () => {
  const r = calculateFaraid({ husband: 1, daughter: 1 });
  assert.ok(r.ok && r.radd);
  assert.deepEqual(shares({ husband: 1, daughter: 1 }), { husband: "1/4", daughter: "3/4" });
});

test("العمريتان: the mother takes a third of what is left after the spouse", () => {
  assert.deepEqual(shares({ wife: 1, mother: 1, father: 1 }), { wife: "1/4", father: "1/2", mother: "1/4" });
  assert.deepEqual(shares({ husband: 1, mother: 1, father: 1 }), { husband: "1/2", father: "1/3", mother: "1/6" });
  // With the grandfather instead of the father it is a third of the whole.
  assert.deepEqual(shares({ husband: 1, mother: 1, grandfather: 1 }), { husband: "1/2", mother: "1/3", grandfather: "1/6" });
});

test("العول: husband and two full sisters — the base rises from 6 to 7", () => {
  const r = calculateFaraid({ husband: 1, fullSister: 2 });
  assert.ok(r.ok && r.awl);
  assert.deepEqual(shares({ husband: 1, fullSister: 2 }), { husband: "3/7", fullSister: "4/7" });
});

test("المنبرية: wife, two daughters, father, mother — the base 24 rises to 27", () => {
  const r = calculateFaraid({ wife: 1, daughter: 2, father: 1, mother: 1 });
  assert.ok(r.ok && r.awl);
  assert.deepEqual(shares({ wife: 1, daughter: 2, father: 1, mother: 1 }), { wife: "1/9", father: "4/27", mother: "4/27", daughter: "16/27" });
  assert.equal(r.ok && r.base, 27);
});

test("daughter, son's daughter and full sister: half, a sixth to complete two-thirds, the sister the rest with another", () => {
  assert.deepEqual(shares({ daughter: 1, sonsDaughter: 1, fullSister: 1 }), { daughter: "1/2", sonsDaughter: "1/6", fullSister: "1/3" });
  // The sister with the daughter blocks the paternal brother.
  assert.ok(excludedOf({ daughter: 1, fullSister: 1, paternalBrother: 1 }).includes("paternalBrother"));
});

test("father, mother and two brothers: the brothers drop the mother to a sixth and are excluded by the father", () => {
  assert.deepEqual(shares({ father: 1, mother: 1, fullBrother: 2 }), { father: "5/6", mother: "1/6" });
  assert.ok(excludedOf({ father: 1, mother: 1, fullBrother: 2 }).includes("fullBrother"));
});

test("المشتركة (الحمارية) on the Hanbali view: the full brother takes nothing", () => {
  const heirs = { husband: 1, mother: 1, maternalSibling: 2, fullBrother: 1 };
  assert.deepEqual(shares(heirs), { husband: "1/2", mother: "1/6", maternalSibling: "1/3" });
  assert.ok(excludedOf(heirs).includes("fullBrother"));
});

test("maternal siblings: a sixth alone, a third shared; excluded by a descendant or the father", () => {
  assert.deepEqual(shares({ mother: 1, maternalSibling: 2, fullBrother: 1 }), { mother: "1/6", maternalSibling: "1/3", fullBrother: "1/2" });
  assert.ok(excludedOf({ daughter: 1, maternalSibling: 1, fullUncle: 1 }).includes("maternalSibling"));
});

test("husband, full sister, paternal sister: the paternal sister completes two-thirds and the base rises to 7", () => {
  assert.deepEqual(shares({ husband: 1, fullSister: 1, paternalSister: 1 }), { husband: "3/7", fullSister: "3/7", paternalSister: "1/7" });
  // Two full sisters leave nothing for a paternal sister alone.
  assert.ok(excludedOf({ fullSister: 2, paternalSister: 1, fullUncle: 1 }).includes("paternalSister"));
});

test("two daughters: two-thirds and the rest returned; two daughters exclude a son's daughter, a son's son does not let her fall", () => {
  assert.deepEqual(shares({ daughter: 2 }), { daughter: "1/1" });
  assert.ok(excludedOf({ daughter: 2, sonsDaughter: 1, fullUncle: 1 }).includes("sonsDaughter"));
  assert.deepEqual(shares({ daughter: 2, sonsDaughter: 1, sonsSon: 1 }), { daughter: "2/3", sonsSon: "2/9", sonsDaughter: "1/9" });
});

test("father with a daughter: a sixth, and the rest as ʿaṣaba", () => {
  const r = calculateFaraid({ father: 1, daughter: 1 });
  assert.ok(r.ok);
  const father = r.shares.find((s) => s.heir === "father")!;
  assert.equal(father.basis, "fard+asaba");
  assert.deepEqual(shares({ father: 1, daughter: 1 }), { father: "1/2", daughter: "1/2" });
});

test("wives share the eighth; four at most", () => {
  const r = calculateFaraid({ wife: 4, son: 1 });
  assert.ok(r.ok);
  const wives = r.shares.find((s) => s.heir === "wife")!;
  assert.deepEqual([wives.share, wives.each], [f("1/8"), f("1/32")]);
  assert.equal(calculateFaraid({ wife: 9, son: 1 }).ok && (calculateFaraid({ wife: 9, son: 1 }) as { shares: Array<{ heir: string; count: number }> }).shares.find((s) => s.heir === "wife")!.count, 4);
});

test("grandmothers: a sixth, shared; the paternal one is not excluded by the father (Hanbali), both by the mother", () => {
  assert.deepEqual(shares({ maternalGrandmother: 1, paternalGrandmother: 1, son: 1 }), { maternalGrandmother: "1/12", paternalGrandmother: "1/12", son: "5/6" });
  assert.deepEqual(shares({ paternalGrandmother: 1, father: 1 }), { father: "5/6", paternalGrandmother: "1/6" });
  assert.deepEqual(excludedOf({ mother: 1, maternalGrandmother: 1, son: 1 }), ["maternalGrandmother"]);
});

test("ʿaṣaba order: the nearest male line takes it all", () => {
  assert.deepEqual(shares({ wife: 1, fullUncle: 1, fullCousin: 3 }), { wife: "1/4", fullUncle: "3/4" });
  assert.deepEqual(excludedOf({ wife: 1, fullUncle: 1, fullCousin: 3 }), ["fullCousin"]);
  assert.deepEqual(shares({ fullNephew: 2, paternalUncle: 1 }), { fullNephew: "1/1" });
});

test("a spouse alone: the share, and the rest stated as undivided (ذوو الأرحام / بيت المال)", () => {
  const r = calculateFaraid({ wife: 1 });
  assert.ok(r.ok);
  assert.deepEqual(r.undivided, f("3/4"));
  assert.match(r.notes.join(" "), /ذوي الأرحام/);
});

test("refused, honestly: the grandfather with brothers, a husband and a wife together, nobody", () => {
  const g = calculateFaraid({ grandfather: 1, fullBrother: 1 });
  assert.equal(g.ok, false);
  assert.match(!g.ok ? g.unsupported : "", /الجد مع الإخوة/);
  // With the father present the brothers are simply excluded: no refusal.
  assert.equal(calculateFaraid({ father: 1, grandfather: 1, fullBrother: 1 }).ok, true);
  assert.equal(calculateFaraid({ husband: 1, wife: 1 }).ok, false);
  assert.equal(calculateFaraid({}).ok, false);
});

test("amounts: rounded to halalas, none without an estate", () => {
  assert.equal(amountOf(f("1/3"), 100000), 33333.33);
  assert.equal(amountOf(f("1/3"), null), null);
  assert.equal(amountOf(f("1/3"), -5), null);
});

test("behind a switch, off by default; the review note on every result", () => {
  const sw = read("src/lib/inheritance/inheritanceSwitch.ts");
  assert.match(sw, /NZAMY_INHERITANCE_CALC/);
  const page = read("src/app/ai/inheritance/page.tsx");
  assert.match(page, /inheritanceCalcEnabled\(\)/);
  assert.match(page, /notFound\(\)/);
  const ui = read("src/app/ai/inheritance/InheritanceCalculator.tsx");
  assert.match(ui, /REVIEW_NOTE_AR/);
  assert.match(REVIEW_NOTE_AR, /مراجعة مختص/);
});
