/**
 * LIB-12 + LIB-17 (2026-09-25) — the law page's metadata comes from the one
 * law-detail response it already holds, and no hardcoded link points at a
 * slug the self-hosted library does not have.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getLawMeta, lawMetaFromDetail, LAW_METADATA_MAP } from "./law-metadata-map.ts";

const pageSource = readFileSync(new URL("./[slug]/page.tsx", import.meta.url), "utf8");
const civilProcedureRoute = readFileSync(new URL("./civil-procedure/route.ts", import.meta.url), "utf8");

function detail(articleCount: number, extra: Record<string, unknown> = {}) {
  return {
    issuanceDecree: "مرسوم ملكي رقم (م/1)",
    issuanceDate: "1435/01/22",
    source: "https://laws.boe.gov.sa/x",
    chapters: [{ title: "الباب الأول", articles: Array.from({ length: articleCount }, (_, i) => ({ id: `a${i}` })) }],
    ...extra,
  };
}

test("total_articles is the server's count, not the rendered one", () => {
  // The route may be unable to place an article under a chapter; the paywall
  // total counts every row, so it wins.
  const meta = lawMetaFromDetail("unknown-law", detail(3, { paywall: { totalArticles: 1838 } }));
  assert.equal(meta.total_articles, 1838);
  assert.equal(meta.issuanceDecree, "مرسوم ملكي رقم (م/1)");
  assert.equal(meta.issuanceDate, "1435/01/22");
  assert.equal(meta.boe_url, "https://laws.boe.gov.sa/x");
});

test("without a paywall total it falls back to counting the chapters", () => {
  assert.equal(lawMetaFromDetail("unknown-law", detail(7)).total_articles, 7);
  assert.equal(lawMetaFromDetail("unknown-law", detail(0)).total_articles, undefined);
});

test("has_executive_reg sees regulations the paywall withheld", () => {
  // `regulations` is emitted for unlocked articles only; a guest reading a law
  // whose regulations all sit behind the paywall still has a regulation.
  assert.equal(lawMetaFromDetail("x", detail(2)).has_executive_reg, false);
  assert.equal(lawMetaFromDetail("x", detail(2, { regulationInstrumentsLocked: 4 })).has_executive_reg, true);
  assert.equal(lawMetaFromDetail("x", detail(2, { regulationInstruments: [{ ref: "r" }] })).has_executive_reg, true);
  const withReg = { chapters: [{ articles: [{ regulations: [{ text: "t" }] }] }] };
  assert.equal(lawMetaFromDetail("x", withReg).has_executive_reg, true);
});

test("empty or malformed input returns the static entry untouched", () => {
  const staticMeta = getLawMeta("sharia-pleading-law-qadha-edition");
  assert.deepEqual(lawMetaFromDetail("sharia-pleading-law-qadha-edition", null), staticMeta);
  assert.deepEqual(lawMetaFromDetail("sharia-pleading-law-qadha-edition", undefined), staticMeta);
  const merged = lawMetaFromDetail("sharia-pleading-law-qadha-edition", { chapters: "nope" });
  assert.equal(merged.total_articles, undefined);
  assert.equal(merged.section_code, staticMeta.section_code);
});

test("the real corpus slugs pick up the static entries of the old keys", () => {
  assert.equal(getLawMeta("sharia-pleading-law-qadha-edition"), LAW_METADATA_MAP["civil-procedure-law"]);
  assert.equal(getLawMeta("evidence-law-qadha-edition"), LAW_METADATA_MAP["evidence-law"]);
  assert.equal(getLawMeta("labor-law-qadha"), LAW_METADATA_MAP["labor-law"]);
  assert.ok(LAW_METADATA_MAP["labor-law"], "the labor-law static entry must exist");
  // The stale hardcoded count (314; the real law has 243) is gone.
  assert.equal(LAW_METADATA_MAP["civil-procedure-law"].total_articles, undefined);
});

test("no related-law link points at the two old-corpus slugs", () => {
  const dead = new Set(["civil-procedure-law", "evidence-law"]);
  const slugsToCheck = [
    ...Object.keys(LAW_METADATA_MAP),
    "tamyeez", "prec-06", "labor-principles", "admin-supreme",
  ];
  for (const key of slugsToCheck) {
    const meta = LAW_METADATA_MAP[key] ?? getLawMeta(key);
    for (const doc of meta.related_systems ?? []) {
      assert.ok(!dead.has(doc.slug), `${key} links to the dead slug "${doc.slug}"`);
    }
  }
});

test("2026-09-25: no related-law link points at any of the 12 self-hosted-dead slugs found in the LIB-04 pass", () => {
  // Confirmed absent from library.laws on self-hosted (REST check, 2026-09-25).
  const dead = new Set([
    "administrative-procedures-law", "commercial-register-law",
    "cooperative-insurance-law", "court-of-grievances-law", "customs-law",
    "equestrian-club-law", "execution-law", "labor-law", "law-civil-aviation",
    "procedures-law", "sama-law", "vat-law",
  ]);
  const slugsToCheck = [
    ...Object.keys(LAW_METADATA_MAP),
    "tamyeez", "prec-06", "labor-principles", "admin-supreme", "prec-04",
    "zakat-tax", "customs-", "insurance-1438",
  ];
  let checked = 0;
  for (const key of slugsToCheck) {
    const meta = LAW_METADATA_MAP[key] ?? getLawMeta(key);
    for (const doc of meta.related_systems ?? []) {
      checked++;
      assert.ok(!dead.has(doc.slug), `${key} links to the dead slug "${doc.slug}"`);
    }
  }
  assert.ok(checked > 10, "the sweep must actually visit related_systems entries, not vacuously pass");
});

test("the equestrian-club-law link is removed (no confident self-hosted match), not left pointing at a 404", () => {
  const meta = LAW_METADATA_MAP["4dfa9563-100f-488a-bc25-ac6000addc7b"];
  assert.ok(meta, "the map entry must still exist");
  assert.ok(
    !meta.related_systems || meta.related_systems.length === 0,
    "no related_systems link may remain once the only candidate was a repealed, differently-scoped law",
  );
});

test("the law page fetches the law once and derives its metadata from that response", () => {
  assert.doesNotMatch(pageSource, /fetchLawMetadata\(slug\)/, "the second whole-law fetch must not come back");
  assert.equal(
    (pageSource.match(/fetch\(`\/api\/library\/laws\//g) || []).length,
    1,
    "exactly one law-detail fetch",
  );
  assert.match(pageSource, /fetch\(`\/api\/library\/laws\/\$\{apiSlug\(slug\)\}`\)/);
  assert.match(pageSource, /setLawMeta\(lawMetaFromDetail\(slug, data\)\);/);
});

test("/laws/civil-procedure is a real 308 to the corpus slug, with no bundled fallback", () => {
  assert.match(civilProcedureRoute, /const CIVIL_PROCEDURE_LAW_SLUG = "sharia-pleading-law-qadha-edition";/);
  assert.match(civilProcedureRoute, /status: 308/);
  // Comments may name the old slug; the code must neither fetch it nor bundle text.
  assert.doesNotMatch(civilProcedureRoute, /fetch\(/);
  assert.doesNotMatch(civilProcedureRoute, /ARTICLES\s*[:=]/);
});
