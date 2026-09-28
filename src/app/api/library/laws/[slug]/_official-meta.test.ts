import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIER_SHAPED_CACHE_CONTROL,
  gazetteFor,
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
