#!/usr/bin/env node
/**
 * import-lawyer-registry.mjs — loads the Saudi lawyers' registry CSV into
 * public.lawyer_registry (migration 20261122_40; launch batch R2/R3).
 *
 * THE CSV HOLDS REAL NAMES AND MOBILE NUMBERS. This script never prints a
 * row: it prints counts only. Keep the CSV outside the repository folder and
 * delete it from the server once the load is done.
 *
 * DRY RUN (default) — reads and checks the file, prints counts, writes nothing:
 *   node scripts/registry/import-lawyer-registry.mjs /root/registry.csv
 *
 * APPLY — prints a psql script (one transaction) on stdout; pipe it straight
 * into the database, nothing is written to disk:
 *   node scripts/registry/import-lawyer-registry.mjs /root/registry.csv --apply \
 *     | docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
 *   The counts go to stderr; psql then prints inserted / updated / registry
 *   totals. Upsert by licence number: a changed row is updated, an unchanged
 *   row is left alone, no row is ever deleted. Safe to run again with a newer
 *   file. --apply refuses to print to a terminal (that would put every
 *   mobile number on the screen).
 *
 * Rows skipped: no licence number, no name, and EVERY row of a licence number
 * that appears more than once in the file (the file cannot say whose it is).
 * Expiry: the Gregorian column when present, else the Hijri column converted
 * with the Umm al-Qura calendar. Validity is decided at lookup time.
 *
 * No connection details here: psql runs inside the database container.
 */

import fs from "node:fs";
import path from "node:path";
import { buildImport, parseCsv, toPsqlScript } from "./registryCsv.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const files = args.filter((a) => !a.startsWith("--"));
const unknown = args.filter((a) => a.startsWith("--") && a !== "--apply");

if (files.length !== 1 || unknown.length) {
  console.error("usage: node scripts/registry/import-lawyer-registry.mjs <registry.csv> [--apply]");
  process.exit(2);
}
const csvPath = path.resolve(files[0]);
if (!fs.existsSync(csvPath) || !fs.statSync(csvPath).isFile()) {
  console.error(`not a file: ${csvPath}`);
  process.exit(2);
}
if (apply && process.stdout.isTTY) {
  console.error("--apply prints the load script for psql; pipe it into psql (see the header of this file), never to the screen.");
  process.exit(2);
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const { records, stats } = buildImport(parseCsv(fs.readFileSync(csvPath, "utf8")), today);

const report = [
  `lawyer registry ${apply ? "APPLY" : "DRY RUN"} — counts only`,
  `  rows in file                        ${stats.rows}`,
  `  rows with a wrong column count      ${stats.badWidth}`,
  `  skipped: no licence number          ${stats.noLicence}`,
  `  skipped: no name                    ${stats.noName}`,
  `  skipped: repeated licence numbers   ${stats.duplicateLicences} number(s), ${stats.duplicateRows} row(s)`,
  `  expiry from the Gregorian column    ${stats.expiryFromGregorian}`,
  `  expiry converted from Hijri         ${stats.expiryFromHijri}`,
  `  expiry unknown                      ${stats.expiryUnknown}`,
  `  Hijri and Gregorian disagree (>1d)  ${stats.hijriGregorianDisagree}`,
  `  archived («محفوظ من القاعدة السابقة») ${stats.archived}`,
  `  expired as of ${today}            ${stats.expiredToday}`,
  `  with a mobile number                ${stats.withMobile}`,
  `  rows to load                        ${stats.toLoad}`,
].join("\n");

if (!apply) {
  console.log(report);
  console.log("\nNothing was written. Add --apply and pipe into psql to load (see the header of this file).");
  process.exit(0);
}

console.error(report);
process.stdout.write(toPsqlScript(records));
