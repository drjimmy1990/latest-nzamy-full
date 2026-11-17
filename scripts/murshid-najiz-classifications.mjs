#!/usr/bin/env node
/**
 * murshid-najiz-classifications.mjs — writes src/data/murshid/najiz-classifications.json
 * (the six najiz filing steps and the 7 courts → 43 classes → 243 types, no PDF
 * page references) from src/data/murshid/najiz-guide-2026-10-28.md, through the
 * same slicing the page's store applies (extractUserGuide + stripInternalNotes)
 * and src/lib/murshid/najizClassifications.ts. Reads and writes only those two
 * repository files; run it again after scripts/murshid-import.mjs.
 *
 *   node scripts/murshid-najiz-classifications.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractUserGuide, parseGuideBlocks, stripInternalNotes } from "../src/lib/murshid/guideBlocks.ts";
import { buildNajizClassifications } from "../src/lib/murshid/najizClassifications.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "src", "data", "murshid");
const md = fs.readFileSync(path.join(dir, "najiz-guide-2026-10-28.md"), "utf8").replace(/\r\n/g, "\n");
const data = buildNajizClassifications(parseGuideBlocks(stripInternalNotes(extractUserGuide(md)).md));
const out = path.join(dir, "najiz-classifications.json");
fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
const classes = data.courts.reduce((n, c) => n + c.classes.length, 0);
const types = data.courts.reduce((n, c) => n + c.classes.reduce((m, k) => m + k.types.length, 0), 0);
console.log(`wrote ${path.relative(root, out)}: ${data.steps.length} steps, ${data.courts.length} courts, ${classes} classes, ${types} types`);
