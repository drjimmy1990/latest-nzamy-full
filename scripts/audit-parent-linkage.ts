/**
 * Read-only parent-law linkage gate for the live legal corpus and both registry
 * mirrors. Run with: node --import tsx scripts/audit-parent-linkage.ts
 *   --vault-root /absolute/Raw_Vault --json
 *
 * A declared parent ID is checked structurally, never inferred from a title.
 * An archival/status contradiction is reported, not auto-corrected.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter } from "./parsers/lib/frontmatter";

type RegistryRecord = {
  instrument_id: string;
  filepath?: string;
  parent_id?: string | null;
  status?: string | null;
  type?: string | null;
};
export type LinkSource = {
  filepath: string;
  meta: Record<string, unknown>;
  warnings?: string[];
};
export type LinkIssue = {
  code: string;
  severity: "error" | "warning";
  filepath: string;
  child_id: string | null;
  source_parent_id?: string | null;
  registry_parent_id?: string | null;
  candidate_ids?: string[];
};

const scalar = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const portablePath = (value: string): string => value.replace(/\\/g, "/").normalize("NFC");
// Observed registry archive/file dispositions; `superseded` is deliberately
// absent because the governing normalization map treats it as legal repeal.
const archiveStatuses = new Set([
  "superseded_duplicate", "merged_into_parent", "duplicate", "merged",
  "merged_archived", "archived_duplicate", "archived", "trash",
]);

export function auditParentLinkage(
  sources: LinkSource[], records: RegistryRecord[], mirrorsEqual: boolean,
): { relevant_files: number; parent_ids: number; counts: Record<string, number>; issues: LinkIssue[] } {
  const byId = new Map<string, RegistryRecord[]>();
  const byPath = new Map<string, RegistryRecord[]>();
  for (const row of records) {
    byId.set(row.instrument_id, [...(byId.get(row.instrument_id) ?? []), row]);
    if (row.filepath) {
      const filepath = portablePath(row.filepath);
      byPath.set(filepath, [...(byPath.get(filepath) ?? []), row]);
    }
  }
  const issues: LinkIssue[] = [];
  let relevantFiles = 0;
  let parentIds = 0;
  const push = (code: string, severity: "error" | "warning", source: LinkSource,
    child: RegistryRecord | undefined, extra: Partial<LinkIssue> = {}) => {
    issues.push({ code, severity, filepath: source.filepath,
      child_id: child?.instrument_id ?? null, ...extra });
  };
  if (!mirrorsEqual) {
    issues.push({ code: "registry_mirrors_differ", severity: "error",
      filepath: "INSTRUMENTS_REGISTRY.json", child_id: null });
  }

  for (const source of sources) {
    const meta = source.meta;
    const nestedMaps = [meta.metadata, meta.relationships].filter((value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value));
    const nestedNames = nestedMaps.map((value) => scalar(value.parent_law)).filter((value): value is string => Boolean(value));
    const nestedIds = nestedMaps.map((value) => scalar(value.parent_law_id)).filter((value): value is string => Boolean(value));
    const nestedEnabling = nestedMaps.some((value) => scalar(value.enabling_article));
    const id = scalar(meta.parent_law_id);
    const hasLink = id || scalar(meta.parent_law) || scalar(meta.parent_law_title)
      || scalar(meta.enabling_article) || nestedNames.length || nestedIds.length || nestedEnabling;
    // A malformed YAML rescue parse may itself lose the parent key. The raw
    // prefilter selected this file, so its warning must not disappear here.
    if (!hasLink && !source.warnings?.length) continue;
    relevantFiles++;
    const pathMatches = byPath.get(portablePath(source.filepath)) ?? [];
    const sourceId = scalar(meta.instrument_id) ?? scalar(meta.id)
      ?? scalar(meta.system_id) ?? scalar(meta.document_id);
    const idMatches = sourceId ? byId.get(sourceId) ?? [] : [];
    // A registry may intentionally retain archival aliases on the canonical
    // file path. That path is not ambiguous when the source declares an ID
    // matching exactly one of those rows: the frontmatter itself selects the
    // child, and all status/parent checks below still run against that exact
    // row. Never choose by array order or merely by "active" status.
    const exactPathIdMatches = sourceId
      ? pathMatches.filter((row) => row.instrument_id === sourceId)
      : [];
    const child = pathMatches.length === 1 ? pathMatches[0]
      : exactPathIdMatches.length === 1 ? exactPathIdMatches[0]
      : pathMatches.length === 0 && idMatches.length === 1 ? idMatches[0] : undefined;
    if (pathMatches.length > 1 && exactPathIdMatches.length !== 1) {
      // A last-wins Map fabricated four archival conflicts in the first audit:
      // four paths have both an active canonical record and an archival record.
      // Report all candidates; do not pick one by array order, status, or title.
      push("duplicate_registry_filepath", "error", source, child,
        { candidate_ids: pathMatches.map((row) => row.instrument_id) });
    }
    if (pathMatches.length === 0 && child) {
      push("registry_filepath_stale_id_fallback", "error", source, child);
    }
    if (pathMatches.length === 0 && idMatches.length > 1) {
      push("ambiguous_registry_instrument_id", "error", source, child);
    }
    if (source.warnings?.length) push("frontmatter_warning", "error", source, child);
    if (!child && pathMatches.length === 0) {
      push("child_not_in_registry_by_filepath", "error", source, child);
    }
    if (scalar(meta.parent_law_title) && !scalar(meta.parent_law)) {
      push("legacy_parent_name_alias", "warning", source, child);
    }
    if (nestedNames.length && !scalar(meta.parent_law)) {
      push("nested_parent_name_not_top_level", "warning", source, child);
    }
    if (nestedIds.length && !id) {
      push("nested_parent_id_not_top_level", "error", source, child,
        { source_parent_id: nestedIds[0] });
    }
    for (const nestedId of new Set(nestedIds)) {
      if (!byId.has(nestedId)) {
        push("nested_parent_target_missing", "error", source, child,
          { source_parent_id: nestedId });
      }
      if (id && nestedId !== id) {
        push("parent_id_conflict", "error", source, child,
          { source_parent_id: id, registry_parent_id: nestedId });
      }
    }
    if (nestedEnabling && !scalar(meta.enabling_article)) {
      push("nested_enabling_article_not_top_level", "warning", source, child);
    }
    const parentName = scalar(meta.parent_law);
    if (parentName && nestedNames.some((value) => value !== parentName)) {
      push("parent_name_conflict", "error", source, child);
    }
    if (new Set(nestedNames).size > 1) {
      push("nested_parent_name_conflict", "error", source, child);
    }
    const sourceStatus = scalar(meta.status);
    const registryStatus = scalar(child?.status);
    if (child && sourceStatus && registryStatus && sourceStatus !== registryStatus) {
      push("source_registry_status_conflict", "error", source, child);
    }
    if (id && !sourceStatus && archiveStatuses.has(registryStatus ?? "")) {
      push("source_status_missing_while_registry_archival", "error", source, child);
    }
    if (!id) continue; // An absent ID is not guessed from title or directory.
    parentIds++;
    if (!byId.has(id)) {
      push("parent_target_missing", "error", source, child, { source_parent_id: id });
    } else if ((byId.get(id) ?? []).length > 1) {
      push("ambiguous_parent_target_id", "error", source, child, { source_parent_id: id });
    }
    if (!child) continue;
    const registryParent = scalar(child.parent_id);
    if (registryParent !== id) {
      push(archiveStatuses.has(registryStatus ?? "")
        ? "archival_parent_relationship_unresolved" : "parent_id_not_mirrored",
      "error", source, child, { source_parent_id: id,
        registry_parent_id: registryParent });
    }
  }
  const counts: Record<string, number> = {};
  for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  return { relevant_files: relevantFiles, parent_ids: parentIds, counts, issues };
}

function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(full);
    else if (entry.isFile() && entry.name.endsWith(".md")) yield full;
  }
}

function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--vault-root");
  if (rootIndex < 0 || !args[rootIndex + 1]) {
    throw new Error("Usage: node --import tsx scripts/audit-parent-linkage.ts --vault-root <Raw_Vault> [--json]");
  }
  const root = resolve(args[rootIndex + 1]);
  const registryPaths = [
    join(root, "00_عقل_القوانين", "INSTRUMENTS_REGISTRY.json"),
    join(root, "01_المكتبة_القانونية", "INSTRUMENTS_REGISTRY.json"),
  ];
  const [governingBytes, libraryBytes] = registryPaths.map((p) => readFileSync(p));
  const governing = JSON.parse(governingBytes.toString("utf8")) as { instruments: RegistryRecord[] };
  if (!Array.isArray(governing.instruments)) throw new Error("registry lacks instruments array");
  // Parent/child legal relations are not confined to the laws directory:
  // issuing/amending instruments under أوامر وتعاميم also declare a parent.
  const corpus = join(root, "01_المكتبة_القانونية");
  const sources: LinkSource[] = [];
  for (const filepath of markdownFiles(corpus)) {
    const raw = readFileSync(filepath, "utf8");
    if (!raw.includes("parent_law") && !raw.includes("enabling_article")) continue;
    const rel = relative(root, filepath);
    const parsed = parseFrontmatter(raw, rel);
    sources.push({ filepath: rel, meta: parsed.meta, warnings: parsed.warnings });
  }
  const result = auditParentLinkage(sources, governing.instruments,
    governingBytes.equals(libraryBytes));
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(`Parent links: ${result.parent_ids}/${result.relevant_files} files; issues: ${JSON.stringify(result.counts)}`);
  if (result.issues.some((issue) => issue.severity === "error")) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
