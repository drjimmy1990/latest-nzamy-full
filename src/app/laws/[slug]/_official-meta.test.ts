/**
 * _official-meta.test.ts — the reader's official-publication fields (T28-22/23/26).
 * Run from this folder (the path contains [slug]):
 *   node --test _official-meta.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_OFFICIAL_META,
  gazetteIssueLabel,
  httpUrlOrNull,
  parseOfficialMeta,
  urlHostname,
  dbOfficialRowsUnderCard,
} from "./_official-meta.ts";

test("an older response without the new fields reads as unlocked and empty", () => {
  assert.deepEqual(parseOfficialMeta({ title: "نظام العمل", issuanceDecree: "م/51" }), EMPTY_OFFICIAL_META);
  assert.deepEqual(parseOfficialMeta(null), EMPTY_OFFICIAL_META);
  assert.deepEqual(parseOfficialMeta("x"), EMPTY_OFFICIAL_META);
});

test("a locked response exposes no official link or gazette, even if one slipped through", () => {
  const m = parseOfficialMeta({
    officialMetaLocked: true,
    officialSourceUrl: "https://laws.boe.gov.sa/x",
    gazette: { issueNumber: "4987", publicationDate: "1444/5/1", url: "https://uqn.gov.sa/1" },
  });
  assert.equal(m.locked, true);
  assert.equal(m.officialSourceUrl, null);
  assert.equal(m.gazette, null);
});

test("only a truthy boolean locks — a string «true» does not", () => {
  assert.equal(parseOfficialMeta({ officialMetaLocked: "true" }).locked, false);
  assert.equal(parseOfficialMeta({ officialMetaLocked: 1 }).locked, false);
});

test("gazette: absent, null or without an issue number renders nothing", () => {
  assert.equal(parseOfficialMeta({ gazette: null }).gazette, null);
  assert.equal(parseOfficialMeta({ gazette: { issueNumber: "", url: "https://a.b" } }).gazette, null);
  assert.equal(parseOfficialMeta({ gazette: { publicationDate: "1444" } }).gazette, null);
});

test("gazette: the url is kept only when the server sent an http(s) URL", () => {
  const withUrl = parseOfficialMeta({ gazette: { issueNumber: 4987, publicationDate: " 1444/5/1 ", url: "https://uqn.gov.sa/issue/4987" } });
  assert.deepEqual(withUrl.gazette, { issueNumber: "4987", publicationDate: "1444/5/1", url: "https://uqn.gov.sa/issue/4987" });
  const noUrl = parseOfficialMeta({ gazette: { issueNumber: "4987", publicationDate: "", url: "uqn.gov.sa/issue" } });
  assert.deepEqual(noUrl.gazette, { issueNumber: "4987", publicationDate: null, url: null });
  assert.equal(gazetteIssueLabel({ issueNumber: "4987" }), "أم القرى، العدد 4987");
});

test("officialSourceUrl: http(s) only; javascript:, relative and junk are dropped", () => {
  assert.equal(parseOfficialMeta({ officialSourceUrl: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/1" }).officialSourceUrl,
    "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/1");
  for (const bad of ["javascript:alert(1)", "/laws/x", "", "—", null, 42]) {
    assert.equal(httpUrlOrNull(bad), null, String(bad));
  }
  assert.equal(urlHostname("https://laws.boe.gov.sa/a/b"), "laws.boe.gov.sa");
});

test("replacedBy: needs a slug; the title may be empty", () => {
  assert.equal(parseOfficialMeta({ replacedBy: null }).replacedBy, null);
  assert.equal(parseOfficialMeta({ replacedBy: { title: "نظام جديد" } }).replacedBy, null);
  assert.deepEqual(parseOfficialMeta({ replacedBy: { slug: "new-law", title: "" } }).replacedBy, { slug: "new-law", title: "" });
  // replacedBy is not official-publication data, so the lock does not hide it.
  assert.deepEqual(parseOfficialMeta({ officialMetaLocked: true, replacedBy: { slug: "n", title: "ن" } }).replacedBy, { slug: "n", title: "ن" });
});

test("under the file's card: the DB official link shows unless a card row already carries that site", () => {
  const meta = {
    officialSourceUrl: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/5d33/1",
    gazette: { issueNumber: "4987", publicationDate: "1428/09/23", url: null },
  };
  // A V2 card: «الجهة المصدرة» names the ISSUER, not the source — 1,318 of the
  // 1,366 last_owner cards carry it, ~500 of them with no source row at all.
  const issuerOnly = [
    { key: "الجهة المصدرة", value: "مجلس الوزراء / المرسوم الملكي" },
    { key: "تاريخ النشر", value: "1428/09/23" },
  ];
  assert.deepEqual(dbOfficialRowsUnderCard(issuerOnly, meta), { sourceUrl: meta.officialSourceUrl, gazette: meta.gazette });
  // The card links the same site already: said once.
  const withSource = [...issuerOnly, { key: "المصدر الرسمي", value: "[هيئة الخبراء](https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/5d33/1)" }];
  assert.equal(dbOfficialRowsUnderCard(withSource, meta).sourceUrl, "");
  // A link to another site (a ministry portal) does not stand in for the official one.
  const otherSite = [...issuerOnly, { key: "رابط بوابة وزارة العدل", value: "[وزارة العدل](https://laws.moj.gov.sa/x)" }];
  assert.equal(dbOfficialRowsUnderCard(otherSite, meta).sourceUrl, meta.officialSourceUrl);
  // The gazette: a card row that cites أم القرى or the gazette stands in for it.
  assert.equal(dbOfficialRowsUnderCard([{ key: "النشر في الجريدة الرسمية", value: "العدد 4174" }], meta).gazette, null);
  assert.equal(dbOfficialRowsUnderCard([{ key: "تاريخ النشر", value: "أم القرى 1428/09/23" }], meta).gazette, null);
  // Nothing in the database: nothing to add.
  assert.deepEqual(dbOfficialRowsUnderCard(issuerOnly, { officialSourceUrl: null, gazette: null }), { sourceUrl: "", gazette: null });
});

// Owner ٣١٨ (28-Oct) REVERSES ٢٩٧ on purpose: until 2026-10-30 this test
// pinned that officialLink was public and kept on a locked response. Official
// links are now a subscriber's — a locked response drops every one of them.
test("owner ٣١٨ (reverses ٢٩٧): officialLink / officialLinks / latestUpdate are dropped on a locked response; http(s) only", () => {
  const m = parseOfficialMeta({
    officialMetaLocked: true,
    officialSourceUrl: "https://laws.boe.gov.sa/x",
    officialLink: "https://laws.boe.gov.sa/x",
    officialLinks: [{ label: "هيئة الخبراء", url: "https://laws.boe.gov.sa/x" }],
    latestUpdate: "1448/01/08هـ (المرسوم الملكي م/12)",
  });
  assert.equal(m.locked, true);
  assert.equal(m.officialSourceUrl, null);
  assert.equal(m.officialLink, null);
  assert.deepEqual(m.officialLinks, []);
  assert.equal(m.latestUpdate, null);
  assert.equal(parseOfficialMeta({ officialLink: "https://laws.boe.gov.sa/x" }).officialLink, "https://laws.boe.gov.sa/x");
  for (const bad of ["javascript:alert(1)", "//evil.example/x", "laws.boe.gov.sa", "", 7, null]) {
    assert.equal(parseOfficialMeta({ officialLink: bad }).officialLink, null, String(bad));
  }
});

test("note ٠١ item ٣: officialLinks keep an Arabic label, else the host's Arabic name — never a raw host; deduped, http(s) only", () => {
  const m = parseOfficialMeta({
    officialLinks: [
      { label: "laws.boe.gov.sa", url: "https://laws.boe.gov.sa/a" },
      { label: "هيئة الخبراء", url: "https://laws.boe.gov.sa/a" },
      { label: "", url: "https://uqn.gov.sa/b" },
      { label: "x", url: "javascript:alert(1)" },
      "junk",
    ],
  });
  assert.deepEqual(m.officialLinks, [
    { label: "هيئة الخبراء", url: "https://laws.boe.gov.sa/a" },
    { label: "جريدة أم القرى", url: "https://uqn.gov.sa/b" },
  ]);
});

test("owner ٣١٨: latest_legislative_update is public but only a date alone", () => {
  for (const ok of ["1448/01/08هـ", "1446/02هـ", "1446هـ"]) {
    assert.equal(parseOfficialMeta({ officialMetaLocked: true, latest_legislative_update: ok }).latestLegislativeUpdate, ok);
  }
  for (const bad of ["1448/01/08هـ (المرسوم الملكي م/12)", "م/12", "2026-10-30", "", 1448, null]) {
    assert.equal(parseOfficialMeta({ latest_legislative_update: bad }).latestLegislativeUpdate, null, String(bad));
  }
});

test("note ٠١ item ٦: articleCounts parse per container; malformed or absent → null", () => {
  const m = parseOfficialMeta({
    articleCounts: {
      law: { total: 245, amended: 12, repealed: 3 },
      regulations: [{ name: "اللائحة التنفيذية", total: 40, amended: 0, repealed: 1 }, { name: "", total: 0 }, null],
      annexes: 2,
    },
    hasMergedRegulation: true,
  });
  assert.deepEqual(m.articleCounts, {
    law: { total: 245, amended: 12, repealed: 3 },
    regulations: [{ name: "اللائحة التنفيذية", total: 40, amended: 0, repealed: 1 }],
    annexes: 2,
  });
  assert.equal(m.hasMergedRegulation, true);
  assert.equal(parseOfficialMeta({}).articleCounts, null);
  assert.equal(parseOfficialMeta({ articleCounts: { regulations: [] } }).articleCounts, null);
  assert.deepEqual(parseOfficialMeta({ articleCounts: { law: { total: -1, amended: 1.5 } } }).articleCounts, {
    law: { total: 0, amended: 0, repealed: 0 },
    regulations: [],
    annexes: 0,
  });
});

test("under the file's card: the DB link is not repeated when the issuer row already shows it", () => {
  const url = "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/5d33/1";
  const meta = { officialSourceUrl: url, gazette: null };
  const issuerOnly = [{ key: "الجهة المصدرة", value: "مجلس الوزراء" }];
  assert.equal(dbOfficialRowsUnderCard(issuerOnly, meta, url).sourceUrl, "");
  assert.equal(dbOfficialRowsUnderCard(issuerOnly, meta, "https://other.gov.sa/x").sourceUrl, url);
  assert.equal(dbOfficialRowsUnderCard(issuerOnly, meta).sourceUrl, url);
});

// ٣١٨ reverses ٢٩٧ here too: the link is behind metaLocked again, and shown by
// its Arabic name — on «الجهة المصدرة» only when there is no «المصادر الرسمية» list.
test("the sidebar's official links open in a new tab, by Arabic name, for subscribers only (٣١٨)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("./_sidebar.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  const link = src.slice(src.indexOf("const renderOfficialLink"), src.indexOf("const getFieldIcon"));
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /officialSourceName\(/);
  assert.match(src, /const officialLink = metaLocked \? null : \(officialMeta\?\.officialLink \?\? null\);/);
  assert.match(src, /const topLinks = metaLocked \? \[\] : collectOfficialLinks\(officialMeta\?\.officialLinks \?\? \[\], cardRows\);/);
  assert.match(src, /f\.id === "issuer" && officialLink && !topLinks\.length \? renderOfficialLink\(officialLink\)/);
  assert.match(src, /\{officialLink && !topLinks\.length && !layout\.primary\.some\(\(f\) => f\.id === "issuer"\) && \(/);
  // No raw host is drawn as a link's text.
  assert.doesNotMatch(src, /urlHostname\(/);
});
