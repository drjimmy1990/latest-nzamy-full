/**
 * brandedQr.test.ts — the printed QR still scans with the badge on it.
 *
 * No QR DECODER is installed (no jsqr / zxing in node_modules, and none may be
 * added for a test), so this proves it the way a decoder would recover it:
 *
 *   1. `qrcode` builds the real level-H symbol for real profile URLs;
 *   2. every module the badge's disc touches is treated as WRONG (worse than
 *      reality — about half of them would happen to read right);
 *   3. those modules are mapped back to the codewords they carry, with the
 *      library's own placement walk (the zig-zag of setupData in
 *      qrcode/lib/core/qrcode.js) and its own block interleaving
 *      (createCodewords there);
 *   4. per Reed–Solomon block, the damaged codewords must stay within
 *      floor(ec / 2) — what the decoder corrects with no erasure hints.
 *
 * It also checks the badge leaves the finder patterns, the timing lines, the
 * format and version areas alone. On version 7+ an alignment pattern sits at
 * the centre and IS covered; common decoders (ZXing, jsQR) sample from the
 * finders and the bottom-right alignment pattern only, so that is reported,
 * not failed.
 *
 * NEGATIVE CONTROL (recorded 2026-10-26): QR_BADGE_FRACTION = 0.40 with the
 * area check relaxed → "version 3-H block 0: 13 damaged codewords > 11
 * correctable (ec 22)"; 0.46 fails four of the five URLs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { QR_BADGE_FRACTION, brandedQrModel, moduleUnderBadge } from "./brandedQr.ts";

const require = createRequire(import.meta.url);
const QRCode = require("qrcode") as { create(text: string, o: { errorCorrectionLevel: "H" }): QrSymbol };
const ECCode = require("qrcode/lib/core/error-correction-code") as {
  getBlocksCount(version: number, ecl: unknown): number;
  getTotalCodewordsCount(version: number, ecl: unknown): number;
};
const Utils = require("qrcode/lib/core/utils") as { getSymbolTotalCodewords(version: number): number };
const Alignment = require("qrcode/lib/core/alignment-pattern") as { getPositions(version: number): number[][] };

interface QrSymbol {
  version: number;
  errorCorrectionLevel: unknown;
  modules: { size: number; get(r: number, c: number): number; isReserved(r: number, c: number): number | boolean };
}

/** Codeword index carried by each data module, by the library's own walk. */
function codewordOfModule(sym: QrSymbol): Map<string, number> {
  const m = sym.modules;
  const size = m.size;
  const out = new Map<string, number>();
  let inc = -1;
  let row = size - 1;
  let bit = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (!m.isReserved(row, col - c)) {
          out.set(`${row},${col - c}`, Math.floor(bit / 8));
          bit++;
        }
      }
      row += inc;
      if (row < 0 || size <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
  return out;
}

/** For each codeword position in the symbol stream, its RS block and the block's ec count. */
function blockOfCodeword(sym: QrSymbol): { block: number[]; ec: number; blocks: number; total: number } {
  const total = Utils.getSymbolTotalCodewords(sym.version);
  const ecTotal = ECCode.getTotalCodewordsCount(sym.version, sym.errorCorrectionLevel);
  const blocks = ECCode.getBlocksCount(sym.version, sym.errorCorrectionLevel);
  const dataTotal = total - ecTotal;
  const inG2 = total % blocks;
  const inG1 = blocks - inG2;
  const dataG1 = Math.floor(dataTotal / blocks);
  const ec = Math.floor(total / blocks) - dataG1;
  const sizes = Array.from({ length: blocks }, (_, b) => (b < inG1 ? dataG1 : dataG1 + 1));
  const block: number[] = [];
  for (let i = 0; i < Math.max(...sizes); i++) for (let b = 0; b < blocks; b++) if (i < sizes[b]) block.push(b);
  for (let i = 0; i < ec; i++) for (let b = 0; b < blocks; b++) block.push(b);
  assert.equal(block.length, total);
  return { block, ec, blocks, total };
}

const URLS = [
  "https://nezamy.sa/lawyers/fahad-al-shammari",
  "https://nezamy.sa/lawyers/a",
  // the fallback when a lawyer has no slug: a UUID (version 7-H)
  "https://nezamy.sa/lawyers/0f8e2c1a-5b7d-4e3a-9c1f-2a6b8d4e0c9f",
  "https://staging.nezamy.sa/lawyers/0f8e2c1a-5b7d-4e3a-9c1f-2a6b8d4e0c9f",
  "https://nezamy.sa",
];

for (const url of URLS) {
  test(`the badge stays inside level H's repair budget: ${url}`, () => {
    const sym = QRCode.create(url, { errorCorrectionLevel: "H" });
    const n = sym.modules.size;
    const cw = codewordOfModule(sym);
    const { block, ec, blocks, total } = blockOfCodeword(sym);
    const align = sym.version >= 2 ? Alignment.getPositions(sym.version) : [];

    const damaged = new Set<number>();
    let covered = 0;
    let alignmentCovered = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!moduleUnderBadge(r, c, n)) continue;
        covered++;
        if (sym.modules.isReserved(r, c)) {
          const inAlignment = align.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2);
          assert.ok(inAlignment, `module ${r},${c} is a finder / timing / format / version module`);
          alignmentCovered++;
          continue;
        }
        const k = cw.get(`${r},${c}`);
        // Bits past the last codeword are remainder bits: not data.
        if (k !== undefined && k < total) damaged.add(k);
      }
    }

    const perBlock = new Array<number>(blocks).fill(0);
    for (const k of damaged) perBlock[block[k]]++;
    const budget = Math.floor(ec / 2);
    assert.ok(covered / (n * n) < 0.1,`the badge covers ${((covered / (n * n)) * 100).toFixed(1)}% of the modules`);
    for (let b = 0; b < blocks; b++) {
      assert.ok(perBlock[b] <= budget,
        `version ${sym.version}-H block ${b}: ${perBlock[b]} damaged codewords > ${budget} correctable (ec ${ec})`);
    }
    // The finders, at the three corners, are untouched.
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      for (let r = r0; r < r0 + 7; r++) for (let c = c0; c < c0 + 7; c++) assert.equal(moduleUnderBadge(r, c, n), false);
    }
    if (alignmentCovered > 0) assert.ok(sym.version >= 7, "only the centre alignment pattern of version 7+ may be covered");
  });
}

test("the model draws no module under the badge and centres the badge", () => {
  const sym = QRCode.create(URLS[0], { errorCorrectionLevel: "H" });
  const model = brandedQrModel(sym.modules);
  assert.equal(model.viewBox, sym.modules.size + 8);
  assert.equal(model.badge.cx, model.viewBox / 2);
  assert.ok(Math.abs(model.badge.r * 2 - sym.modules.size * QR_BADGE_FRACTION) < 1e-9);
  // the wordmark sits inside the disc
  const { x, y, width, height } = model.logo;
  const corner = Math.hypot(x - model.badge.cx, y - model.badge.cy);
  assert.ok(corner + 1e-9 < model.badge.r, "the wordmark's corners stay inside the disc");
  assert.ok(Math.abs(x + width / 2 - model.badge.cx) < 1e-9 && Math.abs(y + height / 2 - model.badge.cy) < 1e-9);
  // every drawn square is outside the badge
  for (const m of model.path.matchAll(/M(\d+) (\d+)/g)) {
    const col = Number(m[1]) - 4;
    const row = Number(m[2]) - 4;
    assert.equal(moduleUnderBadge(row, col, sym.modules.size), false, `${row},${col}`);
  }
  assert.ok(model.path.length > 0);
});
