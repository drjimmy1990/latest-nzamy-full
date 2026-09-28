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
