import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TIER_SHAPED_CACHE_CONTROL,
  gazetteFor,
  lawOfficialLink,
  lawOfficialLinks,
  lawOfficialMeta,
  maskListOfficialFields,
} from "./_official-meta.ts";

// Shapes measured live 2026-09-28 (self-hosted, anon read of library.laws).
const WITH_BOE = {
  issuing_instrument: "قرار مجلس الوزراء رقم (575) وتاريخ 1442/9/22هـ",
  issue_date_hijri: "1442/09/22",
  boe_source_url: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/bf8b73e3-a411-400d-b34b-ad2c00eb44e9/1",
  official_source_url: "",
  gazette_issue_number: null,
  gazette_publication_date: null,
  gazette_url: null,
};

test("a non-subscriber gets empty official fields and the lock flag", () => {
  assert.deepEqual(lawOfficialMeta(WITH_BOE, false), {
    issuanceDecree: "",
    issuanceDate: "",
    source: "",
    officialSourceUrl: "",
    gazette: null,
    officialMetaLocked: true,
  });
});

test("a subscriber gets the stored values; an empty official_source_url stays empty", () => {
  assert.deepEqual(lawOfficialMeta(WITH_BOE, true), {
    issuanceDecree: WITH_BOE.issuing_instrument,
    issuanceDate: "1442/09/22",
    source: WITH_BOE.boe_source_url,
    officialSourceUrl: "",
    gazette: null,
    officialMetaLocked: false,
  });
});

test("gazette is null when every gazette column is null or blank", () => {
  assert.equal(gazetteFor({}), null);
  assert.equal(gazetteFor({ gazette_issue_number: "", gazette_publication_date: "  ", gazette_url: "" }), null);
  assert.equal(gazetteFor(WITH_BOE), null);
});

test("gazette is built only from real columns — never a URL made from the number", () => {
  assert.deepEqual(gazetteFor({ gazette_issue_number: "5157" }), {
    issueNumber: "5157",
    publicationDate: null,
    url: null,
  });
  assert.deepEqual(
    gazetteFor({
      gazette_issue_number: "العدد (5157)",
      gazette_publication_date: "2026-09-01",
      gazette_url: "https://uqn.gov.sa/details?p=123",
    }),
    { issueNumber: "العدد (5157)", publicationDate: "2026-09-01", url: "https://uqn.gov.sa/details?p=123" },
  );
});

test("a stored link that is not http(s) is dropped, not rendered", () => {
  assert.equal(gazetteFor({ gazette_url: "javascript:alert(1)" }), null);
  const meta = lawOfficialMeta({ ...WITH_BOE, official_source_url: "ncar.gov.sa/doc" }, true);
  assert.equal(meta.officialSourceUrl, "");
  assert.equal(lawOfficialMeta({ ...WITH_BOE, official_source_url: "https://ncar.gov.sa/document-details/x" }, true).officialSourceUrl,
    "https://ncar.gov.sa/document-details/x");
});

test("catalogue rows: decree and date nulled for a non-subscriber, status and the rest kept, input untouched", () => {
  const row = { slug: "x", title: "نظام", status: "repealed", issuing_instrument: "مرسوم ملكي رقم (م/1)", issue_date_hijri: "1440/01/01" };
  const masked = maskListOfficialFields(row, false);
  assert.deepEqual(masked, { slug: "x", title: "نظام", status: "repealed", issuing_instrument: null, issue_date_hijri: null });
  assert.equal(row.issuing_instrument, "مرسوم ملكي رقم (م/1)", "the input row is not mutated");
  assert.equal(maskListOfficialFields(row, true), row);
  // A row without the columns does not grow them.
  assert.deepEqual(maskListOfficialFields({ slug: "y" }, false), { slug: "y" });
});

test("tier-shaped responses are never stored by a shared cache", () => {
  assert.equal(TIER_SHAPED_CACHE_CONTROL, "private, no-store");
});

// Owner ٣١٨ (28-Oct) REVERSES ٢٩٧ on purpose. Until 2026-10-30 these two
// tests pinned that officialLink went to every viewer; official links are now
// a subscriber's (isSubscriber = hasFullLibraryAccess — never the whitelist).
test("owner ٣١٨ (reverses ٢٩٧): the official link is a subscriber's — official_source_url, else boe_source_url; http(s) only", () => {
  const law = { ...WITH_BOE, official_source_url: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/bf8b/1" };
  assert.equal(lawOfficialLink(law, true), "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/bf8b/1");
  assert.equal(lawOfficialLink(law, false), "");
  // No official_source_url: the BOE page stands in (subscriber only).
  assert.equal(lawOfficialLink(WITH_BOE, true), WITH_BOE.boe_source_url);
  assert.equal(lawOfficialLink(WITH_BOE, false), "");
  assert.equal(lawOfficialMeta(law, false).officialSourceUrl, "");
  for (const bad of ["", null, undefined, "javascript:alert(1)", "laws.boe.gov.sa/x", "ftp://x.sa/a", " "]) {
    assert.equal(lawOfficialLink({ official_source_url: bad, boe_source_url: bad }, true), "", String(bad));
  }
});

test("note ٠١ item ٣ / ٣١٨: lawOfficialLinks — every official source by its Arabic name, deduped, none for a guest", () => {
  const law = {
    ...WITH_BOE,
    official_source_url: WITH_BOE.boe_source_url,
    gazette_url: "https://uqn.gov.sa/details?p=1",
  };
  assert.deepEqual(lawOfficialLinks(law, true), [
    { label: "هيئة الخبراء", url: WITH_BOE.boe_source_url },
    { label: "جريدة أم القرى", url: "https://uqn.gov.sa/details?p=1" },
  ]);
  assert.deepEqual(lawOfficialLinks(law, false), []);
  assert.deepEqual(lawOfficialLinks({ ...law, boe_source_url: "javascript:x", official_source_url: "", gazette_url: null }, true), []);
});

test("the law route sends officialLink / officialLinks by isSubscriber, and the one public date to everyone", () => {
  const route = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "route.ts"), "utf8");
  assert.match(route, /officialLink: lawOfficialLink\(law, isSubscriber\),/);
  assert.match(route, /officialLinks: lawOfficialLinks\(law, isSubscriber\),/);
  assert.match(route, /\.\.\.\(legislativeEvent \? \{ latest_legislative_update: legislativeEvent\.dateHijri \} : \{\}\),/);
  assert.match(route, /const latestUpdate = latestUpdateDetail\(law\.latest_update, isSubscriber\);/);
  assert.doesNotMatch(route, /lawOfficialLink\(law\)/);
});
