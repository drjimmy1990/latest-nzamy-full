#!/usr/bin/env node
/**
 * parse-gov-agencies-directory.mjs — the owner's government-agencies
 * directory (owner notes ١٥ / ٢٠, 2026-10-28) → src/data/gov-agencies-directory.json.
 *
 * Source: «دليل_الجهات_وبوصلة_التظلم_المنقح_2026-10-28.md», Part 4 (الباب
 * الرابع) — 363 agencies pulled from the national portal my.gov.sa on
 * 2026-10-28, in 14 official categories. In the 2026-10-30 developer handoff
 * the file is 07-references/REF0038.md (source-inventory.csv: state
 * «current-reference»). The file is read only; nothing in the package runs.
 *
 * What it keeps, per agency, as the source wrote it (no paraphrase):
 *   id (my.gov.sa nid), category, name, short name, description, HQ,
 *   phones, e-mails, website, the agency's my.gov.sa page as `sourceUrl`.
 * What it drops:
 *   - the two test records the source itself marks «سجل تجريبي»
 *     (319731 «جهة اختبارية AC999», 18143 «مركز تواصل المستفيدين آمر- تجريبي»),
 *     as owner note ١٥ §٣ asks — 361 remain;
 *   - «المسؤول الأول» (a person's name and title: it goes stale and is not a
 *     channel of contact).
 * Every phone and e-mail is `contactsVerified: false`: the package carries no
 * per-address mail (MX) check — owner note ١٩ §٦ found 17 dead domains in this
 * same my.gov.sa data and asks that no address be shown as «معتمد» before a
 * real check.
 *
 * Usage:
 *   node scripts/parsers/parse-gov-agencies-directory.mjs <path-to-REF0038.md>          # dry run, prints counts
 *   node scripts/parsers/parse-gov-agencies-directory.mjs <path-to-REF0038.md> --write  # writes the JSON
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH = path.resolve(projectRoot, "src/data/gov-agencies-directory.json");

export const RETRIEVED_AT = "2026-10-28";
export const TEST_RECORD_IDS = ["319731", "18143"];
export const EXPECTED_SOURCE_COUNT = 363;

const stripMd = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();

function parseLink(cell) {
  const m = cell.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
  return m ? { label: m[1].trim(), url: m[2].trim() } : null;
}

const CONTACT_MARK = /\s*(?:—|\|)\s*(?=المقر:|المسؤول الأول:|هاتف:|بريد:)/;

export function parseAgencyRow(line, category, categoryId) {
  const cells = line.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  if (cells.length < 6) return null;
  const id = stripMd(cells[2]);
  const nameCell = cells[3];
  const testRecord = /سجل تجريبي/.test(nameCell);
  const nameMatch = nameCell.match(/\*\*(.+?)\*\*\s*(?:\(`([^`]+)`\))?/);
  const name = nameMatch ? nameMatch[1].trim() : stripMd(nameCell);
  const shortName = nameMatch && nameMatch[2] ? nameMatch[2].trim() : null;
  const mygov = parseLink(cells[4]);
  const website = parseLink(cells[5]);
  const tail = cells.slice(6).join(" | ").trim();

  const at = tail.search(CONTACT_MARK);
  let description = (at === -1 ? tail : tail.slice(0, at)).trim();
  if (description === "—") description = "";
  if (description === name) description = "";
  const hqMatch = tail.match(/المقر:\s*([^|—]+?)\s*(?:\||—|$)/);
  // Invisible format characters (a zero-width space trails one address in the
  // source) are dropped; every visible character is kept as published, so a
  // malformed address such as «info@@pep.gov.sa» stays as the source has it.
  const clean = (v) => v.replace(/[\u200b-\u200f\u2060\ufeff]/g, "").trim();
  const phones = [...tail.matchAll(/هاتف:\s*`([^`]+)`/g)].map((m) => clean(m[1]));
  const emails = [...tail.matchAll(/بريد:\s*`([^`]+)`/g)].map((m) => clean(m[1]));

  return {
    id,
    category,
    categoryId,
    name,
    shortName,
    description,
    hq: hqMatch ? hqMatch[1].trim() : null,
    phones,
    emails,
    website,
    sourceUrl: mygov ? mygov.url : `https://my.gov.sa/ar/agencies/${id}`,
    retrievedAt: RETRIEVED_AT,
    contactsVerified: false,
    testRecord,
  };
}

export function parseGovAgencies(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## الباب الرابع/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^## الباب الخامس/.test(l));
  if (start === -1 || end === -1) throw new Error("Part 4 (الباب الرابع) not found in the source");
  const rows = [];
  const declared = {};
  let category = null;
  let categoryId = null;
  for (const line of lines.slice(start, end)) {
    const h = line.match(/^### 4\.\d+ فئة «(.+?)» — \(معرف الفئة: `(\d+)` \| العدد الكامل: (\d+) جهة\)/);
    if (h) {
      category = h[1];
      categoryId = h[2];
      declared[category] = Number(h[3]);
      continue;
    }
    if (category && /^\|\s*\d+\s*\|\s*\d+\s*\|/.test(line)) {
      const row = parseAgencyRow(line, category, categoryId);
      if (row) rows.push(row);
    }
  }
  return { rows, declared };
}

function main() {
  const args = process.argv.slice(2);
  const source = args.find((a) => !a.startsWith("--"));
  if (!source) {
    console.error("usage: parse-gov-agencies-directory.mjs <path-to-REF0038.md> [--write]");
    process.exit(2);
  }
  const { rows, declared } = parseGovAgencies(fs.readFileSync(source, "utf8"));
  const ids = new Set(rows.map((r) => r.id));
  if (rows.length !== EXPECTED_SOURCE_COUNT || ids.size !== rows.length) {
    throw new Error(`expected ${EXPECTED_SOURCE_COUNT} unique agencies, parsed ${rows.length} (${ids.size} unique)`);
  }
  for (const [cat, n] of Object.entries(declared)) {
    const got = rows.filter((r) => r.category === cat).length;
    if (got !== n) throw new Error(`category ${cat}: declared ${n}, parsed ${got}`);
  }
  const flagged = rows.filter((r) => r.testRecord).map((r) => r.id).sort();
  if (flagged.join(",") !== [...TEST_RECORD_IDS].sort().join(",")) {
    throw new Error(`test records in the source (${flagged}) differ from ${TEST_RECORD_IDS}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const agencies = rows.filter((r) => !r.testRecord).map(({ testRecord, ...rest }) => rest);
  const out = {
    metadata: {
      title: "دليل الجهات الحكومية",
      source: "المنصة الوطنية الموحدة (my.gov.sa/ar/agencies)",
      sourceDocument: "دليل_الجهات_وبوصلة_التظلم_المنقح_2026-10-28.md — الباب الرابع",
      retrievedAt: RETRIEVED_AT,
      totalInSource: rows.length,
      excludedTestRecords: TEST_RECORD_IDS,
      totalCount: agencies.length,
      categoriesCount: Object.keys(declared).length,
      contactsVerified: false,
      contactsNote: "أرقام الهواتف وعناوين البريد كما نشرتها المنصة الوطنية الموحدة؛ لم يُتحقَّق من عمل أيٍّ منها.",
    },
    agencies,
  };
  console.log(`parsed ${rows.length} (declared ${Object.values(declared).reduce((a, b) => a + b, 0)}), kept ${agencies.length}, ` +
    `with e-mail ${agencies.filter((a) => a.emails.length).length}, with phone ${agencies.filter((a) => a.phones.length).length}, ` +
    `with website ${agencies.filter((a) => a.website).length}, with description ${agencies.filter((a) => a.description).length}`);
  if (args.includes("--write")) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote ${path.relative(projectRoot, OUTPUT_PATH)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
