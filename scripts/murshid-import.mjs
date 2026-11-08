#!/usr/bin/env node
/**
 * murshid-import.mjs — the owner's corrected «المرشد القضائي» package →
 * src/data/murshid/ (batch 2026-11-08, A2; controller ruling #7 and #4).
 *
 * The repository is public, so only what the /api/v1/murshid/* routes serve
 * is committed. Everything withheld is dropped HERE, not at serve time:
 *   - sector files: statute quotes (legal_basis[].quote, quote_verified),
 *     owner-library file paths (legal_basis[].source), source_url / mx_ok
 *     bookkeeping, my.gov.sa ids and categories, the two my.gov.sa test
 *     records, and every link that is not a safe https link
 *     (src/lib/murshid/murshidData.ts → slimRawSector);
 *   - unified_channels.json: the same bookkeeping and unsafe links
 *     (slimChannels);
 *   - the najiz guide: only the reader slice (from «الباب الثاني» up to the
 *     developers' appendix — no front matter, no «الباب الأول»), with every
 *     internal research / audit note line removed
 *     (src/lib/murshid/guideBlocks.ts → extractUserGuide, stripInternalNotes).
 *     Each removed line is printed, for the report.
 *
 * The package files are read as data only; nothing in the package runs.
 *
 * Usage (Node ≥ 22.18, which runs the .ts helpers directly):
 *   node scripts/murshid-import.mjs <package-folder> <output-folder>
 *   e.g. node scripts/murshid-import.mjs \
 *     "C:/Users/LOQ/Downloads/حزمة_رد_المالك_٤٠٨_إلى_٤٣٨_٢٠٢٦-١١-٠٣/02_ملفات_المرشد_القضائي_المصححة_الكاملة" \
 *     src/data/murshid
 * <package-folder> holds 02_إجراءات_التظلم_الذرية/, 01_جهات_واتصالات/ and 00_مصادر/.
 */

import fs from "node:fs";
import path from "node:path";
import { slimChannels, slimRawSector, toPublicSector } from "../src/lib/murshid/murshidData.ts";
import { extractUserGuide, stripInternalNotes } from "../src/lib/murshid/guideBlocks.ts";

const [, , srcArg, outArg] = process.argv;
if (!srcArg || !outArg) {
  console.error("usage: node scripts/murshid-import.mjs <package-folder> <output-folder>");
  process.exit(2);
}
const src = path.resolve(srcArg);
const out = path.resolve(outArg);

const SECTORS_DIR = "02_إجراءات_التظلم_الذرية";
const CHANNELS_FILE = path.join("01_جهات_واتصالات", "unified_channels.json");
const GUIDE_FILE = path.join("00_مصادر", "دليل_ناجز_المنقح_2026-10-28.md");
const GUIDE_OUT = "najiz-guide-2026-10-28.md";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, obj) => fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, "utf8");

// ── sectors ──────────────────────────────────────────────────────────────────
const sectorSrc = path.join(src, SECTORS_DIR);
const sectorFiles = fs.readdirSync(sectorSrc).filter((f) => /^sector_\d+_.*\.json$/.test(f)).sort();
if (sectorFiles.length !== 32) throw new Error(`expected 32 sector files, found ${sectorFiles.length}`);
const sectorOut = path.join(out, "sectors");
fs.mkdirSync(sectorOut, { recursive: true });
for (const f of fs.readdirSync(sectorOut)) {
  if (f.endsWith(".json") && !sectorFiles.includes(f)) fs.rmSync(path.join(sectorOut, f));
}
let inCards = 0;
let outCards = 0;
for (const f of sectorFiles) {
  const raw = readJson(path.join(sectorSrc, f));
  inCards += raw.cards.length;
  const slim = slimRawSector(raw);
  if (!toPublicSector(slim)) throw new Error(`${f}: slim file fails validation`);
  outCards += slim.cards.length;
  writeJson(path.join(sectorOut, f), slim);
}
console.log(`sectors: ${sectorFiles.length} files, ${inCards} cards in, ${outCards} written (test records dropped: ${inCards - outCards})`);

// ── national channels ────────────────────────────────────────────────────────
const channels = slimChannels(readJson(path.join(src, CHANNELS_FILE)));
writeJson(path.join(out, "unified_channels.json"), channels);
console.log(`channels: ${channels.channels.length}`);

// ── najiz guide ──────────────────────────────────────────────────────────────
const guide = stripInternalNotes(extractUserGuide(fs.readFileSync(path.join(src, GUIDE_FILE), "utf8")));
fs.writeFileSync(path.join(out, GUIDE_OUT), `${guide.md.trim()}\n`, "utf8");
console.log(`najiz guide: ${guide.removed.length} internal-note lines removed`);
guide.removed.forEach((line, i) => console.log(`  [${i + 1}] ${line}`));
