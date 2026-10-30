/**
 * src/data/gov-agencies-directory.json — the owner's government-agencies
 * directory (owner notes ١٥ / ٢٠; REF0038 «دليل_الجهات_وبوصلة_التظلم_المنقح_2026-10-28.md»,
 * Part 4), produced by scripts/parsers/parse-gov-agencies-directory.mjs.
 * Counts, required fields, a source on every row, no test record, and no
 * contact presented as verified.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Agency {
  id: string;
  category: string;
  categoryId: string;
  name: string;
  shortName: string | null;
  description: string;
  hq: string | null;
  phones: string[];
  emails: string[];
  website: { label: string; url: string } | null;
  sourceUrl: string;
  retrievedAt: string;
  contactsVerified: boolean;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.resolve(here, "gov-agencies-directory.json"), "utf8")) as {
  metadata: Record<string, unknown>;
  agencies: Agency[];
};
const agencies = data.agencies;

test("363 agencies in the source, the 2 test records removed → 361 (owner note ١٥ §٢–٣)", () => {
  assert.equal(data.metadata.totalInSource, 363);
  assert.deepEqual(data.metadata.excludedTestRecords, ["319731", "18143"]);
  assert.equal(agencies.length, 361);
  assert.equal(data.metadata.totalCount, 361);
  assert.ok(!agencies.some((a) => a.id === "319731" || a.id === "18143"));
  assert.ok(!agencies.some((a) => /تجريبي|اختباري|test/i.test(a.name)));
});

test("14 official categories with the source's counts (اخرى less the 2 test records)", () => {
  const counts: Record<string, number> = {};
  for (const a of agencies) counts[a.category] = (counts[a.category] ?? 0) + 1;
  assert.deepEqual(counts, {
    "الوزارات": 26, "الهيئات": 73, "المؤسسات": 14, "الأمانات": 17, "الإمارات": 13, "البرامج": 7, "الجامعات": 25,
    "الدواوين": 1, "الرئاسات": 3, "الصناديق": 16, "المجالس": 8, "المديريات": 6, "المراكز": 37, "اخرى": 115,
  });
});

test("every agency has an id, a name, a category and its own my.gov.sa page as the source, with the retrieval date", () => {
  const ids = new Set<string>();
  for (const a of agencies) {
    assert.match(a.id, /^\d+$/, `id ${a.id}`);
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
    assert.ok(a.name.trim().length > 1, `name of ${a.id}`);
    assert.ok(a.category.trim().length > 1, `category of ${a.id}`);
    assert.match(a.categoryId, /^\d+$/);
    assert.equal(a.sourceUrl, `https://my.gov.sa/ar/agencies/${a.id}`, `source of ${a.id}`);
    assert.equal(a.retrievedAt, "2026-10-28");
  }
});

test("no contact is presented as verified (owner note ١٩ §٦: no address «معتمد» before a real mail check)", () => {
  assert.equal(data.metadata.contactsVerified, false);
  assert.ok(agencies.every((a) => a.contactsVerified === false));
});

test("contacts are well formed: no internal-network links, no invisible characters; the one malformed address is the source's own", () => {
  for (const a of agencies) {
    if (a.website) assert.match(a.website.url, /^https?:\/\/(?!10\.)/, `website of ${a.id}`);
    for (const v of [...a.emails, ...a.phones]) assert.ok(!/[​-‏⁠﻿\s]/.test(v), `${a.id}: «${v}»`);
    for (const p of a.phones) assert.match(p, /^\d{3,14}$/, `phone of ${a.id}`);
  }
  const malformed = agencies.flatMap((a) => a.emails).filter((e) => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e));
  assert.deepEqual(malformed, ["info@@pep.gov.sa"]);
  assert.equal(agencies.filter((a) => a.emails.length).length, 339);
  assert.equal(agencies.filter((a) => a.phones.length).length, 344);
});

test("النيابة العامة (17570) and ديوان المظالم (17486) are in the directory as the source has them", () => {
  const pp = agencies.find((a) => a.id === "17570");
  assert.ok(pp);
  assert.equal(pp.name, "النيابة العامة");
  assert.deepEqual(pp.phones, ["00966118400000"]);
  assert.deepEqual(pp.emails, ["info@bip.gov.sa"]);
  const bog = agencies.find((a) => a.id === "17486");
  assert.ok(bog);
  assert.equal(bog.shortName, "BOG");
});
