#!/usr/bin/env node
/**
 * verify-seeder-contract.mjs — the "quadrilateral contract" check.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *   Three independent data-loss bugs were found BY ACCIDENT in a single day:
 *     • seed-library.ts wrote `series_id` to library.judicial_collections —
 *       a column that did not exist in ANY migration. Every upsert to that
 *       table failed silently (batchUpsert records the error and continues).
 *     • A migration documented as "applied" (feqh is_synthetic_page) had never
 *       actually been written to disk.
 *     • Parsers extracted classification_keywords / hashtags / is_redacted /
 *       metadata; the seeder dropped them on the floor.
 *   None of these were caught by a test. All three were the same class of bug:
 *   a silent mismatch between the four layers of the contract.
 *
 * WHAT IT COMPARES
 *   (1) DB    — actual columns, parsed from supabase/migrations/*.sql
 *               (create table + alter table add column)
 *   (2) SEED  — every field seed-library.ts actually writes, per table
 *   (3) PARSE — fields the parsers emit (scripts/parsers/*.ts return objects)
 *   (4) MANIFEST — the frontmatter contract (schema_manifest.json)
 *
 * WHAT IT FAILS ON (exit 1)
 *   • SEED writes a field with no DB column   → silent write failure (CRITICAL)
 *   • DB has a NOT NULL column with no default that SEED never writes
 *
 * WHAT IT WARNS ON (exit 0)
 *   • PARSE emits a field the SEED never writes → extracted then dropped
 *   • DB column nothing ever writes            → dead column (or UI-only)
 *
 * USAGE
 *   node scripts/verify-seeder-contract.mjs
 *   node scripts/verify-seeder-contract.mjs --json     (machine-readable)
 *
 * This script reads only. It never touches the database or the library.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const SEEDER = path.join(ROOT, "scripts", "seed-library.ts");
const PARSERS_DIR = path.join(ROOT, "scripts", "parsers");

const JSON_OUT = process.argv.includes("--json");

// ── 1. DB columns from migrations ───────────────────────────────────────────
function parseMigrations() {
  const tables = {};           // table -> { col -> {notNull, hasDefault, from} }
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf-8");

    // create table [if not exists] library.NAME ( ...body... );
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?library\.([a-z_]+)\s*\(([\s\S]*?)\n\s*\);/gi;
    let m;
    while ((m = createRe.exec(sql)) !== null) {
      const table = m[1];
      const body = m[2];
      tables[table] = tables[table] || {};
      for (let line of body.split("\n")) {
        line = line.trim();
        if (!line || line.startsWith("--")) continue;
        // skip table-level constraints
        if (/^(primary\s+key|unique|foreign\s+key|constraint|check)\b/i.test(line)) continue;
        const cm = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
        if (!cm) continue;
        const col = cm[1].toLowerCase();
        if (["create", "comment", "alter", "begin", "commit"].includes(col)) continue;
        tables[table][col] = {
          notNull: /\bnot\s+null\b/i.test(line),
          hasDefault: /\bdefault\b/i.test(line) || /\bgenerated\s+always\b/i.test(line),
          generated: /\bgenerated\s+always\b/i.test(line),
          from: file,
        };
      }
    }

    // alter table library.NAME add column [if not exists] COL TYPE ...
    const alterRe = /alter\s+table\s+library\.([a-z_]+)\s+([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql)) !== null) {
      const table = m[1];
      const body = m[2];
      tables[table] = tables[table] || {};
      const addRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)([^,]*)/gi;
      let am;
      while ((am = addRe.exec(body)) !== null) {
        const col = am[1].toLowerCase();
        const rest = am[2] || "";
        tables[table][col] = {
          notNull: /\bnot\s+null\b/i.test(rest),
          hasDefault: /\bdefault\b/i.test(rest),
          generated: /\bgenerated\s+always\b/i.test(rest),
          from: file,
        };
      }
    }
  }
  return tables;
}

// ── 2. Fields the seeder writes, per table ──────────────────────────────────
function parseSeeder() {
  const fullSrc = fs.readFileSync(SEEDER, "utf-8");

  // CRITICAL: the same row-array name is reused across seeder functions
  // (`chapterRows` is BOTH library.chapters in seedLaws AND library.feqh_chapters
  // in seedFeqh). A global variable→table map silently mixes their fields and
  // invents phantom mismatches. So scope every mapping to its own function body.
  const fnRe = /async\s+function\s+(seed[A-Za-z0-9_]*)\s*\(/g;
  const bounds = [];
  let fm;
  while ((fm = fnRe.exec(fullSrc)) !== null) bounds.push({ name: fm[1], start: fm.index });
  bounds.push({ name: "(eof)", start: fullSrc.length });

  const scopes = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    scopes.push({ name: bounds[i].name, src: fullSrc.slice(bounds[i].start, bounds[i + 1].start) });
  }
  if (!scopes.length) scopes.push({ name: "(whole file)", src: fullSrc });

  const tableFields = {};
  const varToTable = {};

  for (const scope of scopes) {
  const src = scope.src;

  // variable -> table, from: batchUpsert(client, "table", uniqueXxxRows
  const scopeVarToTable = {};
  const buRe = /batchUpsert\(\s*client\s*,\s*"([a-z_]+)"\s*,\s*([A-Za-z0-9_]+)/g;
  let m;
  while ((m = buRe.exec(src)) !== null) {
    const table = m[1];
    let v = m[2];                                   // e.g. uniqueLawRows
    scopeVarToTable[v] = table;
    varToTable[`${scope.name}:${v}`] = table;
    // map the underlying rows array too: uniqueLawRows = ...(lawRows.map
    const deref = new RegExp(`const\\s+${v}\\s*=[\\s\\S]{0,120}?\\b([A-Za-z0-9_]+Rows)\\.map`);
    const dm = src.match(deref);
    if (dm) {
      scopeVarToTable[dm[1]] = table;
      varToTable[`${scope.name}:${dm[1]}`] = table;
    }
  }

  // collect keys from every `<var>.push({ ... })` IN THIS SCOPE ONLY
  const pushRe = /\b([A-Za-z0-9_]+Rows)\.push\(\{/g;
  while ((m = pushRe.exec(src)) !== null) {
    const v = m[1];
    const table = scopeVarToTable[v];
    if (!table) continue;
    // brace-match the object literal
    let i = src.indexOf("{", m.index + v.length);
    let depth = 0, end = -1;
    for (let j = i; j < src.length; j++) {
      const ch = src[j];
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) continue;
    const body = src.slice(i + 1, end);

    // top-level keys only (depth 0 within this object)
    let d = 0;
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      const opens = (line.match(/[{[(]/g) || []).length;
      const closes = (line.match(/[}\])]/g) || []).length;
      if (d === 0 && !trimmed.startsWith("//")) {
        const km = trimmed.match(/^([a-z_][a-z0-9_]*)\s*:/i);
        if (km) {
          tableFields[table] = tableFields[table] || new Set();
          tableFields[table].add(km[1].toLowerCase());
        }
      }
      d += opens - closes;
      if (d < 0) d = 0;
    }
  }
  }  // end scope loop
  return { tableFields, varToTable };
}

// ── 3. Fields the parsers emit (best-effort: exported interfaces) ───────────
function parseParserFields() {
  const out = {};
  for (const f of fs.readdirSync(PARSERS_DIR).filter((x) => /^parse-.*\.ts$/.test(x))) {
    const src = fs.readFileSync(path.join(PARSERS_DIR, f), "utf-8");
    const fields = new Set();
    const ifaceRe = /export\s+interface\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = ifaceRe.exec(src)) !== null) {
      for (const line of m[2].split("\n")) {
        const km = line.trim().match(/^([a-z_][a-z0-9_]*)\??\s*:/i);
        if (km) fields.add(km[1].toLowerCase());
      }
    }
    out[f] = fields;
  }
  return out;
}

// ── 4. Manifest field names ─────────────────────────────────────────────────
function parseManifest() {
  const p = path.join(PARSERS_DIR, "schema_manifest.json");
  if (!fs.existsSync(p)) return { version: null, fields: new Set() };
  const j = JSON.parse(fs.readFileSync(p, "utf-8"));
  const fields = new Set();
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object" && ("t" in v || "req" in v)) fields.add(k.toLowerCase());
      walk(v);
    }
  };
  walk(j);
  return { version: j.manifest_version ?? null, fields };
}

// ── run ─────────────────────────────────────────────────────────────────────
const db = parseMigrations();
const { tableFields } = parseSeeder();
const parserFields = parseParserFields();
const manifest = parseManifest();

const critical = [];
const warnings = [];

for (const [table, fields] of Object.entries(tableFields)) {
  const cols = db[table];
  if (!cols) {
    critical.push({
      kind: "TABLE_MISSING",
      table,
      detail: `seeder writes to library.${table} but no migration creates it`,
    });
    continue;
  }
  for (const f of fields) {
    if (!(f in cols)) {
      critical.push({
        kind: "COLUMN_MISSING",
        table,
        field: f,
        detail: `seed-library.ts writes "${f}" to library.${table} — NO SUCH COLUMN. `
              + `Upserts to this table fail silently (batchUpsert logs and continues).`,
      });
    }
  }
  for (const [col, meta] of Object.entries(cols)) {
    if (meta.generated) continue;
    if (!fields.has(col)) {
      if (meta.notNull && !meta.hasDefault) {
        critical.push({
          kind: "NOT_NULL_UNWRITTEN",
          table,
          field: col,
          detail: `library.${table}.${col} is NOT NULL with no default, seeder never writes it → insert fails`,
        });
      } else if (!["created_at", "updated_at", "id"].includes(col)) {
        warnings.push({
          kind: "COLUMN_UNWRITTEN",
          table,
          field: col,
          detail: `library.${table}.${col} exists but the seeder never writes it (dead column, or filled elsewhere)`,
        });
      }
    }
  }
}

// parser-emitted fields never written by the seeder anywhere
const allSeeded = new Set();
for (const s of Object.values(tableFields)) for (const f of s) allSeeded.add(f);
for (const [file, fields] of Object.entries(parserFields)) {
  for (const f of fields) {
    if (!allSeeded.has(f) && !["id", "slug"].includes(f)) {
      warnings.push({
        kind: "PARSED_NOT_SEEDED",
        table: file,
        field: f,
        detail: `${file} emits "${f}" but no seeder table writes it — extracted then dropped`,
      });
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    manifestVersion: manifest.version,
    tablesInDb: Object.keys(db).length,
    tablesSeeded: Object.keys(tableFields).length,
    critical,
    warnings,
  }, null, 2));
} else {
  console.log("\n" + "═".repeat(72));
  console.log("  Seeder Contract Verification (DB ↔ Seeder ↔ Parsers ↔ Manifest)");
  console.log("═".repeat(72));
  console.log(`  manifest_version : ${manifest.version ?? "(not found)"}`);
  console.log(`  tables in DB     : ${Object.keys(db).length}`);
  console.log(`  tables seeded    : ${Object.keys(tableFields).length}`);
  console.log(`  parser files     : ${Object.keys(parserFields).length}`);

  console.log(`\n── 🔴 CRITICAL (${critical.length}) ──`);
  if (!critical.length) console.log("   none — every field the seeder writes has a real column.");
  for (const c of critical) {
    console.log(`   [${c.kind}] library.${c.table}${c.field ? "." + c.field : ""}`);
    console.log(`        ${c.detail}`);
  }

  console.log(`\n── 🟡 WARNINGS (${warnings.length}) ──`);
  const byKind = {};
  for (const w of warnings) (byKind[w.kind] = byKind[w.kind] || []).push(w);
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`   ${kind}: ${list.length}`);
    for (const w of list.slice(0, 12)) console.log(`      • ${w.table}.${w.field}`);
    if (list.length > 12) console.log(`      … +${list.length - 12} more`);
  }
  console.log("\n" + "═".repeat(72));
  console.log(critical.length ? "  ✗ FAIL — critical mismatches above must be fixed before seeding."
                              : "  ✓ PASS — no critical contract mismatch.");
  console.log("═".repeat(72) + "\n");
}

process.exit(critical.length ? 1 : 0);
