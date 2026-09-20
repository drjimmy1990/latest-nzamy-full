/**
 * One-time, source-SHA-bound metadata repair for an audited rejection list.
 * No document type is classified here. Legal body bytes and existing fields
 * (apart from the review flag) must remain identical.
 *
 * Usage: npx tsx scripts/mark-rejected-law-types-for-review.ts AUDIT.jsonl --dry-run EXPECTED_COUNT
 *        npx tsx scripts/mark-rejected-law-types-for-review.ts AUDIT.jsonl --apply EXPECTED_COUNT EXTERNAL_NEW_BACKUP_DIR STAMP
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "./parsers/lib/frontmatter";

type AuditRow = {
  name: string;
  matches: string[];
  resolution: string;
  reported_type: string;
  file_sha256: string;
  review_reason?: string;
};

const [auditPath, mode, expectedCountArg, backupRoot, stamp] = process.argv.slice(2);
const expectedCount = Number(expectedCountArg);
if (!auditPath || !["--dry-run", "--apply"].includes(mode) ||
    !Number.isSafeInteger(expectedCount) || expectedCount < 1 ||
    (mode === "--apply" && (!backupRoot || !/^\d{8}_\d{6}$/.test(stamp ?? "")))) {
  throw new Error("Usage: AUDIT.jsonl --dry-run COUNT | AUDIT.jsonl --apply COUNT EXTERNAL_NEW_BACKUP_DIR YYYYMMDD_HHMMSS");
}
if (mode === "--apply" && !path.isAbsolute(backupRoot)) throw new Error("External backup path must be absolute");

const hash = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const rows = fs.readFileSync(auditPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as AuditRow);
if (rows.length !== expectedCount) throw new Error(`Expected ${expectedCount} audited rows, got ${rows.length}`);
const sourceRoot = "/Users/nezamy/Projects/Raw_Vault/01_المكتبة_القانونية/أنظمة ولوائح";
const defaultReason = "قيمة type الحالية لا يقبلها عقد التحليل التشغيلي v1.4؛ يجب مراجعة نوع الوثيقة وأداة إصدارها قبل اعتماد تصنيف موحد أو بذرها.";

function splitFrontmatter(raw: string): { prefix: string; yaml: string; closing: string; body: string } {
  const opening = /^---[ \t]*\r?\n/.exec(raw);
  if (!opening) throw new Error("Missing opening YAML fence");
  const rest = raw.slice(opening[0].length);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) throw new Error("Missing closing YAML fence");
  return {
    prefix: opening[0],
    yaml: rest.slice(0, closing.index),
    closing: closing[0],
    body: rest.slice(closing.index + closing[0].length),
  };
}

const plans = rows.map((row) => {
  if (row.resolution !== "exact" || row.matches.length !== 1) throw new Error(`Unresolved audit row: ${row.name}`);
  const file = path.resolve(row.matches[0]);
  const relative = path.relative(sourceRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !relative.endsWith(".md")) {
    throw new Error(`Source escaped audited corpus: ${file}`);
  }
  if (!fs.lstatSync(file).isFile()) throw new Error(`Not a regular source file: ${file}`);
  const raw = fs.readFileSync(file, "utf8");
  if (hash(raw) !== row.file_sha256) throw new Error(`Source changed after audit: ${file}`);
  const before = parseFrontmatter(raw, file);
  if (before.warnings.length || before.meta.type !== row.reported_type || before.meta.type_raw != null) {
    throw new Error(`YAML/type mismatch or type_raw already present: ${file}`);
  }
  const reason = row.review_reason ?? defaultReason;
  if (typeof reason !== "string" || !reason.trim()) throw new Error(`Missing type-review reason: ${file}`);
  const { prefix, yaml, closing, body } = splitFrontmatter(raw);
  const flagLines = yaml.match(/^needs_human_review:[^\r\n]*$/gm) ?? [];
  const reasonLines = yaml.match(/^review_reason:[^\r\n]*$/gm) ?? [];
  if (flagLines.length > 1 || reasonLines.length > 1 || /^type_review_reason:/m.test(yaml)) {
    throw new Error(`Duplicate or preexisting review metadata: ${file}`);
  }
  const flag = before.meta.needs_human_review;
  if (flag != null && flag !== true && flag !== false) throw new Error(`Non-boolean review flag: ${file}`);
  if (reasonLines.length && (typeof before.meta.review_reason !== "string" || !before.meta.review_reason.trim())) {
    throw new Error(`Existing review_reason is empty or non-scalar: ${file}`);
  }

  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let nextYaml = yaml;
  if (flagLines.length === 1 && flag === false) {
    nextYaml = nextYaml.replace(/^needs_human_review:[^\r\n]*$/m, "needs_human_review: true");
  }
  if (flagLines.length === 0) nextYaml += `needs_human_review: true${eol}`;
  if (reasonLines.length === 0) nextYaml += `review_reason: ${JSON.stringify(reason)}${eol}`;
  // This separate marker also keeps the live seed closed if a broader type
  // normalization map later happens to accept the previously rejected type.
  nextYaml += `type_review_reason: ${JSON.stringify(reason)}${eol}`;
  nextYaml += `type_raw: ${JSON.stringify(row.reported_type)}${eol}`;
  const updated = prefix + nextYaml + closing + body;
  const after = parseFrontmatter(updated, file);
  if (after.warnings.length || after.body !== before.body || after.meta.type !== before.meta.type ||
      after.meta.type_raw !== row.reported_type || after.meta.needs_human_review !== true ||
      !String(after.meta.review_reason ?? "").trim() || after.meta.type_review_reason !== reason) {
    throw new Error(`Candidate failed semantic/body check: ${file}`);
  }
  const exclude = new Set(["needs_human_review", "review_reason", "type_review_reason", "type_raw"]);
  const stable = (meta: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(meta).filter(([key]) => !exclude.has(key))));
  if (stable(after.meta) !== stable(before.meta)) throw new Error(`Unrelated YAML field changed: ${file}`);
  return { file, relative, raw, updated, beforeSha: hash(raw), afterSha: hash(updated), oldFlag: flag, hadReason: reasonLines.length > 0 };
});
if (new Set(plans.map((p) => p.file)).size !== plans.length) throw new Error("Duplicate source path in audit");

const counts = {
  total: plans.length,
  old_false_flags: plans.filter((p) => p.oldFlag === false).length,
  old_true_flags: plans.filter((p) => p.oldFlag === true).length,
  missing_flags: plans.filter((p) => p.oldFlag == null).length,
  existing_reasons_preserved: plans.filter((p) => p.hadReason).length,
  new_reasons: plans.filter((p) => !p.hadReason).length,
};
if (mode === "--dry-run") {
  process.stdout.write(JSON.stringify({ mode, counts }, null, 2) + "\n");
  process.exit(0);
}

// Every source has both an adjacent and an external backup before the first edit.
fs.mkdirSync(backupRoot, { mode: 0o700 });
for (const p of plans) {
  const adjacent = `${p.file}.pre_type_review_${stamp}`;
  const external = path.join(backupRoot, p.relative);
  if (fs.existsSync(adjacent) || fs.existsSync(external)) throw new Error(`Backup target already exists: ${p.file}`);
  fs.mkdirSync(path.dirname(external), { recursive: true, mode: 0o700 });
  fs.copyFileSync(p.file, adjacent, constants.COPYFILE_EXCL);
  fs.copyFileSync(p.file, external, constants.COPYFILE_EXCL);
  if (hash(fs.readFileSync(adjacent, "utf8")) !== p.beforeSha ||
      hash(fs.readFileSync(external, "utf8")) !== p.beforeSha) {
    throw new Error(`Backup verification failed; no source has been edited: ${p.file}`);
  }
}
for (const p of plans) {
  const staged = `${p.file}.pending_type_review_${stamp}`;
  fs.writeFileSync(staged, p.updated, { flag: "wx", mode: fs.statSync(p.file).mode });
  if (hash(fs.readFileSync(staged, "utf8")) !== p.afterSha) {
    throw new Error(`Staged edit verification failed; no source has been edited: ${p.file}`);
  }
}
for (const p of plans) {
  fs.renameSync(`${p.file}.pending_type_review_${stamp}`, p.file);
  if (hash(fs.readFileSync(p.file, "utf8")) !== p.afterSha) throw new Error(`Post-edit verification failed: ${p.file}`);
}
const manifest = {
  mode, stamp, audit_path: path.resolve(auditPath), counts,
  files: plans.map((p) => ({ path: p.file, relative: p.relative, before_sha256: p.beforeSha, after_sha256: p.afterSha })),
};
fs.writeFileSync(path.join(backupRoot, "edit-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
process.stdout.write(JSON.stringify({ mode, backupRoot, counts, verified_after: plans.length }, null, 2) + "\n");
