/**
 * «المرشد القضائي» grievance data (batch 2026-11-08, A2). The files under
 * src/data/murshid/ are written by scripts/murshid-import.mjs and the repo is
 * public, so the COMMITTED files must already hold only what the routes serve:
 * no statute quotes, no owner-library paths, no source_url / mx_ok / my.gov.sa
 * ids, no test record, no unsafe link. Also: every file validates, and the
 * public projection is the same story.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMITTED_KEYS,
  isTestRecordCard,
  safeHttpsUrl,
  searchEntries,
  searchMurshid,
  shortSectorTitle,
  slimChannels,
  slimRawSector,
  stripUnsafeUrls,
  toPublicChannels,
  toPublicSector,
  validateSectorFile,
  type MurshidSector,
  type RawCard,
} from "./murshidData.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../../data/murshid");
const sectorDir = path.join(dataDir, "sectors");
const sectorFiles = fs.readdirSync(sectorDir).filter((f) => f.endsWith(".json")).sort();
const raws = sectorFiles.map((f) => JSON.parse(fs.readFileSync(path.join(sectorDir, f), "utf8")) as { sector_no: number; cards: RawCard[] });

test("32 sector files, numbered 1..32, each valid", () => {
  assert.equal(sectorFiles.length, 32);
  assert.deepEqual(raws.map((r) => r.sector_no), Array.from({ length: 32 }, (_, i) => i + 1));
  for (const [i, raw] of raws.entries()) {
    assert.deepEqual(validateSectorFile(raw), [], sectorFiles[i]);
  }
});

test("422 cards committed (424 in the package less its two my.gov.sa test records)", () => {
  const all = raws.flatMap((r) => r.cards);
  assert.equal(all.length, 422);
  assert.ok(!all.some((c) => ["S32-AG-18143", "S32-AG-319731"].includes(String(c.card_id))));
  assert.ok(!all.some((c) => /اختبار|تجريبي/.test(String(c.agency?.name))));
  const pub = raws.map((r) => toPublicSector(r)!);
  assert.equal(pub.reduce((a, s) => a + s.total, 0), 422);
});

function keysIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysIn(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysIn(v, out);
    }
  }
  return out;
}

test("no committed file holds a withheld key, a statute quote or a library path", () => {
  const files = [
    ...sectorFiles.map((f) => path.join(sectorDir, f)),
    path.join(dataDir, "unified_channels.json"),
  ];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const obj = JSON.parse(text);
    const extra = [...keysIn(obj)].filter((k) => !COMMITTED_KEYS.has(k));
    assert.deepEqual(extra, [], `${path.basename(f)}: keys not served by the routes`);
    for (const withheld of ["quote", "quote_verified", "source_url", "mx_ok", "my_gov_id", "is_test_record"]) {
      assert.ok(!text.includes(`"${withheld}"`), `${path.basename(f)}: ${withheld}`);
    }
    assert.ok(!text.includes("01_المكتبة_القانونية"), `${path.basename(f)}: owner-library path`);
    assert.ok(!text.includes("http://"), `${path.basename(f)}: http link`);
    assert.ok(!text.includes("10.1.61.83"), `${path.basename(f)}: intranet IP`);
    for (const u of urlsIn(obj)) assert.equal(safeHttpsUrl(u), u, `${path.basename(f)}: ${u}`);
  }
  for (const r of raws) {
    for (const c of r.cards) {
      assert.deepEqual(Object.keys(c.agency ?? {}).sort(), ["name", "website"], String(c.card_id));
      for (const b of c.legal_basis as object[]) assert.deepEqual(Object.keys(b).sort(), ["article", "id", "instrument"], String(c.card_id));
    }
  }
});

test("slimRawSector keeps only served fields and drops test records and unsafe links", () => {
  const raw = {
    sector_no: 5, sector_code: "S05", title: "القطاع 05: س", generated_at: "2026-10-28", total_cards_count: 2,
    cards: [
      {
        card_id: "S05-A", card_kind: "specialized_problem_procedure", sector_no: 5,
        agency: { name: "جهة", my_gov_id: "1", website: "http://old.gov.sa", category: "x" },
        steps: [{ n: 1, action: "قدّم", channel: "portal", where: "http://old.gov.sa/x", deadline: { duration: "30 يوماً", from_event: "التبليغ", legal_basis_id: "LB1" }, source: "م 1" }],
        escalation: [{ body: "ديوان", channel: "portal", where: "https://www.bog.gov.sa/", deadline: null }],
        legal_basis: [{ id: "LB1", instrument: "نظام", article: "الأولى", quote: "نص المادة", source: "01_المكتبة_القانونية/x.md", quote_verified: true }],
        contacts: {
          emails: [{ value: "a@b.gov.sa", source_url: "https://my.gov.sa/x", mx_ok: true }],
          phones: [{ value: "199", source_url: "https://my.gov.sa/x" }],
          portals: [{ name: "share", url: "https://wa.me/?text=x" }, { name: "site", url: "https://b.gov.sa/" }],
        },
        unverified_items: [], unverified_contacts: [], related_najiz_classification: [], last_verified: "2026-10-28", confidence: "high",
      },
      { card_id: "S05-T", card_kind: "agency_specific_grievance_and_contacts", sector_no: 5, agency: { name: "تجربة", my_gov_id: "18143", is_test_record: true }, steps: [{ n: 1, action: "x" }] },
    ],
  };
  const slim = slimRawSector(raw);
  const text = JSON.stringify(slim);
  assert.equal(slim.total_cards_count, 1);
  assert.equal(slim.cards[0].agency.website, null);
  assert.equal(slim.cards[0].steps[0].where, "");
  assert.deepEqual(slim.cards[0].legal_basis, [{ id: "LB1", instrument: "نظام", article: "الأولى" }]);
  assert.deepEqual(slim.cards[0].contacts.portals, [{ name: "site", url: "https://b.gov.sa/" }]);
  for (const bad of ["quote", "source_url", "mx_ok", "my_gov_id", "01_المكتبة", "http://", "wa.me", "S05-T"]) assert.ok(!text.includes(bad), bad);
  assert.ok([...keysIn(slim)].every((k) => COMMITTED_KEYS.has(k)));
  assert.equal(isTestRecordCard(raw.cards[1] as RawCard), true);
  assert.throws(() => slimRawSector({ sector_no: 1, title: "x", cards: [{ card_id: "" }] }));
  // Slimming is idempotent and the projection still works on its output.
  assert.deepEqual(slimRawSector(slim), slim);
  assert.equal(toPublicSector(slim)!.cards[0].steps[0].deadline?.basis, "المادة الأولى — نظام");
});

test("slimChannels drops bookkeeping and unsafe portals", () => {
  const out = slimChannels({ generated_at: "2026-10-28", channels: [{ channel_id: "UC-1", name: "ق", my_gov_id: "9", phones: [{ value: "1", type: "t", source_url: "https://x.gov.sa" }], emails: [{ value: "a@b.sa", mx_ok: true }], portals: [{ name: "p", url: "http://x.gov.sa" }] }] });
  assert.equal(out.total_channels, 1);
  assert.deepEqual(out.channels[0].portals, []);
  assert.ok(!JSON.stringify(out).includes("source_url") && !JSON.stringify(out).includes("my_gov_id"));
});

function urlsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(...(value.match(/\b(?:https?|ftp|javascript|data|file):[^\s"'<>،)]+/gi) ?? []));
  else if (Array.isArray(value)) value.forEach((v) => urlsIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => urlsIn(v, out));
  return out;
}

test("the public projection holds only safe https links, no quotes, no library paths", () => {
  const pub: MurshidSector[] = raws.map((r) => toPublicSector(r)!);
  const json = JSON.stringify(pub);
  const urls = urlsIn(pub);
  assert.ok(urls.length > 500, "links survive");
  for (const u of urls) assert.equal(safeHttpsUrl(u), u, u);
  assert.ok(!json.includes("http://"));
  assert.ok(!json.includes("10.1.61.83"));
  assert.ok(!/twitter\.com\/intent|facebook\.com\/sharer|wa\.me\/|linkedin\.com\/sharing|readspeaker/.test(json));
  assert.ok(!json.includes('"quote"'));
  assert.ok(!json.includes("01_المكتبة_القانونية"), "owner-library file paths stay on the server");
  for (const s of pub) {
    for (const c of s.cards) {
      assert.ok(c.id && c.agency.name, c.id);
      assert.ok(c.steps.length > 0 && c.steps.every((st, i) => st.n >= 1 && st.action && (i === 0 || st.n > c.steps[i - 1].n)), c.id);
    }
  }
});

test("a deadline names its article when the card's legal basis does", () => {
  const s12 = toPublicSector(raws[11])!;
  const step = s12.cards[0].steps[0];
  assert.equal(step.deadline?.basis, "المادة السادسة — نظام الإفلاس");
  assert.equal(s12.title, "الإفلاس والتسوية الوقائية وإعادة التنظيم المالي (لجنة الإفلاس)");
});

test("safeHttpsUrl: https on a dotted public host only", () => {
  assert.equal(safeHttpsUrl("https://najiz.sa/"), "https://najiz.sa/");
  assert.equal(safeHttpsUrl("http://www.sama.gov.sa/"), null);
  assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpsUrl("https://ar/contact-us"), null);
  assert.equal(safeHttpsUrl("https://10.1.61.83/wps/portal"), null);
  assert.equal(safeHttpsUrl("https://user:pw@example.gov.sa/"), null);
  assert.equal(safeHttpsUrl("https://twitter.com/intent/tweet?text=x"), null);
  assert.equal(safeHttpsUrl("https://wa.me/?text=x"), null);
  assert.equal(safeHttpsUrl("https://www.facebook.com/sharer/sharer.php?u=x"), null);
  assert.equal(safeHttpsUrl("https://app-me.readspeaker.com/cgi-bin/rsent?a=1&amp;amp;b=2"), null);
  assert.equal(safeHttpsUrl("https://x.com/mosgovsa_care"), "https://x.com/mosgovsa_care");
  assert.equal(safeHttpsUrl(42), null);
});

test("stripUnsafeUrls cuts unsafe links out of free text and keeps https ones", () => {
  assert.equal(stripUnsafeUrls("راجع http://www.fa.gov.sa للتفاصيل"), "راجع للتفاصيل");
  assert.equal(stripUnsafeUrls("راجع https://najiz.sa/ للتفاصيل"), "راجع https://najiz.sa/ للتفاصيل");
});

test("validateSectorFile catches a card with no id, agency or step numbers, and markup", () => {
  const bad = {
    sector_no: 3,
    title: "x",
    cards: [
      { card_id: "", sector_no: 3, agency: { name: "" }, steps: [{ n: "1", action: "a" }] },
      { card_id: "A", sector_no: 3, agency: { name: "ج" }, steps: [{ n: 1, action: "<script>x</script>" }] },
    ],
  };
  const errors = validateSectorFile(bad);
  assert.ok(errors.some((e) => e.includes("card_id missing")));
  assert.ok(errors.some((e) => e.includes("agency.name missing")));
  assert.ok(errors.some((e) => e.includes("not a step number")));
  assert.ok(errors.some((e) => e.includes("markup")));
  assert.equal(toPublicSector(bad), null);
});

test("shortSectorTitle drops the «القطاع NN:» prefix", () => {
  assert.equal(shortSectorTitle("القطاع 01: الخدمة المدنية"), "الخدمة المدنية");
  assert.equal(shortSectorTitle("بلا رقم"), "بلا رقم");
});

test("search across sectors finds a card by agency and caps the list", () => {
  const entries = searchEntries(raws.map((r) => toPublicSector(r)!));
  const r = searchMurshid(entries, "المنافسة");
  assert.ok(r.matches.some((m) => m.cardId === "S09-GAC-001"));
  const broad = searchMurshid(entries, "التظلم");
  assert.ok(broad.matches.length <= 50 && broad.total >= broad.matches.length);
  assert.equal(searchMurshid(entries, "").total, entries.length);
});

test("15 national channels with https-only portals", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "unified_channels.json"), "utf8"));
  const ch = toPublicChannels(raw);
  assert.equal(ch.length, 15);
  for (const c of ch) {
    assert.ok(c.id && c.name, c.id);
    for (const p of c.portals) assert.equal(safeHttpsUrl(p.url), p.url);
  }
});
