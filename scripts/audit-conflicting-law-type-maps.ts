/** Read-only, per-file evidence for type aliases with different meanings in
 * the operational and governing manifests. Never accepts either mapping. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "./parsers/lib/frontmatter";

const [operationalPath, governingPath, sourceRootArg, outputDir] = process.argv.slice(2);
if (!operationalPath || !governingPath || !sourceRootArg || !outputDir) {
  throw new Error("Usage: OPERATIONAL.json GOVERNING.json SOURCE_ROOT NEW_EXTERNAL_OUTPUT_DIR");
}
const operational = JSON.parse(fs.readFileSync(operationalPath, "utf8"));
const governing = JSON.parse(fs.readFileSync(governingPath, "utf8"));
const a = operational.type_normalization_map as Record<string, string>;
const b = governing.type_normalization_map as Record<string, string>;
const conflicts = new Map(Object.keys(a).filter((key) => !key.startsWith("_") && b[key] != null && a[key] !== b[key])
  .map((key) => [key, { operational: a[key], governing: b[key] }]));
const sourceRoot = path.resolve(sourceRootArg);
const files = execFileSync("rg", ["--files", sourceRoot], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 })
  .trim().split("\n").filter((file) => file.endsWith(".md"));
const records = [];
for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = parseFrontmatter(raw, file);
  if (typeof parsed.meta.type !== "string" || !conflicts.has(parsed.meta.type)) continue;
  if (parsed.warnings.length) throw new Error(`Conflicted file has YAML warnings: ${file}`);
  records.push({
    name: path.basename(file),
    matches: [file],
    resolution: "exact",
    reported_type: parsed.meta.type,
    file_sha256: createHash("sha256").update(raw).digest("hex"),
    title: typeof parsed.meta.title === "string" ? parsed.meta.title : null,
    official_source_url: typeof parsed.meta.official_source_url === "string" ? parsed.meta.official_source_url : null,
    operational_mapping: conflicts.get(parsed.meta.type)!.operational,
    governing_mapping_untrusted: conflicts.get(parsed.meta.type)!.governing,
    review_reason: `قيمة type=${parsed.meta.type} تُطبَّع إلى ${conflicts.get(parsed.meta.type)!.operational} في عقد التيست وإلى ${conflicts.get(parsed.meta.type)!.governing} في المرجع؛ يلزم التحقق من نوع الوثيقة وأداة إصدارها قبل اعتماد تصنيف موحد أو بذرها.`,
  });
}
records.sort((x, y) => x.matches[0].localeCompare(y.matches[0]));
const summary = {
  operational_manifest: path.resolve(operationalPath),
  governing_manifest: path.resolve(governingPath),
  source_root: sourceRoot,
  source_files: files.length,
  conflicting_aliases: [...conflicts].map(([raw, maps]) => ({ raw, ...maps })),
  affected_files: records.length,
};
fs.mkdirSync(outputDir, { mode: 0o700 });
fs.writeFileSync(path.join(outputDir, "conflicting-law-types.jsonl"), records.map((row) => JSON.stringify(row)).join("\n") + "\n", { flag: "wx", mode: 0o600 });
fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx", mode: 0o600 });
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
