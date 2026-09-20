import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { getManifest } from "./manifest";

export const CORPUS_SCOPES = [
  "public_corpus", "institutional_reference", "mixed_requires_separation", "pending_review",
] as const;
export type CorpusScope = typeof CORPUS_SCOPES[number];
export interface CorpusScopeDecision {
  source: string;
  source_id: string | null;
  source_sha256: string;
  corpus_scope: CorpusScope;
  provenance: "source" | "registry" | "manifest_non_ambiguous" | "quarantine";
  reason: string;
  registry_paths: string[];
}
interface RegistryEntry {
  path: string;
  source_ids: string[];
  title: string;
  sha256: string;
  corpus_scope: CorpusScope | null;
}
const nonblank = (value: unknown): boolean => value != null && String(value).trim() !== "";
const isScope = (value: unknown): value is CorpusScope =>
  typeof value === "string" && (CORPUS_SCOPES as readonly string[]).includes(value);

function loadScopeRegistry(manifest: Record<string, unknown>): { entries: RegistryEntry[] } {
  const enums = manifest.enums as Record<string, unknown> | undefined;
  const scopes = enums?.corpus_scope;
  if (!Array.isArray(scopes) || scopes.length !== CORPUS_SCOPES.length
    || CORPUS_SCOPES.some(scope => !scopes.includes(scope))) {
    throw new Error("Missing or unsupported corpus_scope enum contract.");
  }
  const policy = manifest.corpus_scope_policy as Record<string, unknown> | undefined;
  if (!policy || policy.non_ambiguous_default !== "public_corpus"
    || policy.ambiguous_registry_file !== "corpus-scope-registry.json") {
    throw new Error("Missing or unsupported corpus_scope manifest policy.");
  }
  const bytes = fs.readFileSync(path.join(__dirname, "corpus-scope-registry.json"));
  const registrySha = crypto.createHash("sha256").update(bytes).digest("hex");
  if (registrySha !== policy.ambiguous_registry_sha256) {
    throw new Error("corpus_scope registry differs from the approved manifest hash.");
  }
  const registry = JSON.parse(bytes.toString("utf8")) as { entries: RegistryEntry[] };
  if (!Array.isArray(registry.entries) || !registry.entries.length) {
    throw new Error("corpus_scope registry is empty or malformed.");
  }
  return registry;
}

export function assertCorpusScopeContract(manifest: Record<string, unknown> = getManifest()): void {
  loadScopeRegistry(manifest);
}

/** Inventory membership is a review trigger, never a legal classification. */
export function resolveCorpusScope(
  meta: Record<string, unknown>, source: string, sourceText: string,
): CorpusScopeDecision {
  const registry = loadScopeRegistry(getManifest());
  const sourceHash = crypto.createHash("sha256").update(sourceText).digest("hex");
  const normalized = source.replace(/\\/g, "/").normalize("NFC");
  const ids = [meta.id, meta.instrument_id].filter((id): id is string => typeof id === "string" && !!id);
  const matches = registry.entries.filter((entry) =>
    normalized === entry.path.normalize("NFC") || normalized.endsWith("/" + entry.path.normalize("NFC"))
    || entry.source_ids.some((id) => ids.includes(id))
    || (typeof meta.title === "string" && entry.title === meta.title)
    || entry.sha256 === sourceHash,
  );
  const decision = (scope: CorpusScope, provenance: CorpusScopeDecision["provenance"], reason: string): CorpusScopeDecision => ({
    source, source_id: ids[0] ?? null, source_sha256: sourceHash,
    corpus_scope: scope, provenance, reason, registry_paths: matches.map((entry) => entry.path),
  });
  const hasSourceDecision = Object.prototype.hasOwnProperty.call(meta, "corpus_scope");
  const rawScope = meta.corpus_scope;
  const registryScopes = [...new Set(matches.map((entry) => entry.corpus_scope).filter((scope) => scope != null))];
  // Explicit null/unknown never uses the transition rule for an absent key.
  if (hasSourceDecision && !isScope(rawScope)) {
    return decision("pending_review", "quarantine", "missing_or_unknown_explicit_scope");
  }
  if (registryScopes.some((scope) => !isScope(scope)) || registryScopes.length > 1
    || (hasSourceDecision && registryScopes.length === 1 && rawScope !== registryScopes[0])) {
    return decision("pending_review", "quarantine", "conflicting_scope_decisions");
  }
  const selected = hasSourceDecision ? rawScope as CorpusScope : registryScopes[0];
  if (nonblank(meta.gate_zero_status)) {
    return decision("pending_review", "quarantine",
      selected === "public_corpus" ? "public_scope_conflicts_with_gate_zero" : "gate_zero_requires_individual_scope_migration");
  }
  if (selected) return decision(selected, hasSourceDecision ? "source" : "registry", "explicit_scope_decision");
  if (matches.length) return decision("pending_review", "quarantine", "ambiguous_source_requires_scope_decision");
  return decision("public_corpus", "manifest_non_ambiguous", "report145_transition_outside_review_inventory");
}

/** Public output and dry-run exports share the same guard, before any deletion/write. */
export function assertPublicCorpusRows(data: Record<string, unknown>, type: "laws" | "decrees"): void {
  assertCorpusScopeContract();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("corpus_scope: parsed output must be an object.");
  }
  const rows = data[type];
  if (!Array.isArray(rows)) throw new Error(`corpus_scope: ${type} must be an array.`);
  const decisions = data.corpus_scope_decisions;
  if (decisions !== undefined && !Array.isArray(decisions)) {
    throw new Error("corpus_scope: source decisions must be an array.");
  }
  if (Array.isArray(decisions) && decisions.some((entry) => {
    const scope = (entry as Record<string, unknown> | null)?.corpus_scope;
    return scope !== "public_corpus" && scope !== "institutional_reference";
  })) throw new Error("corpus_scope: unresolved source decisions remain quarantined.");
  rows.forEach((raw, index) => {
    const row = raw as Record<string, unknown> | null;
    const meta = row?.metadata as Record<string, unknown> | null;
    if (row?.corpus_scope !== "public_corpus"
      || (meta && Object.prototype.hasOwnProperty.call(meta, "corpus_scope") && meta.corpus_scope !== "public_corpus")
      || nonblank(row?.gate_zero_status) || nonblank(meta?.gate_zero_status)) {
      throw new Error(`corpus_scope: ${type}[${index}] is not explicitly public or has a conflicting source exclusion.`);
    }
  });
}
