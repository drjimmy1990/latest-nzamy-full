/**
 * Offline, fail-closed preflight for the seeder's explicit --apply-live mode.
 * It runs before .env.local, service-role credentials, client creation or DB I/O.
 * This is only a provenance/integrity gate, NOT legal, RLS or publication approval.
 */
import * as fs from "fs";
import * as path from "path";
import { assertPublicCorpusRows, assertCorpusScopeContract } from "./parsers/corpus-scope";
import { sha256File } from "./parsers/lib/report";

type ContentType = "laws" | "decrees" | "precedents" | "feqh";
const ALL_TYPES: ContentType[] = ["laws", "decrees", "precedents", "feqh"];
const HEX_SHA256 = /^[0-9a-f]{64}$/;
export const PRIVATE_PRECEDENT_STORAGE_VERSION = "20260919_v1";
const BLOCKING_COUNTS = [
  "failed", "slugCollisions", "idCollisions", "collectionIdCollisions",
  "bookIdCollisions", "orphanRegulationAnchors", "malformedAnchorFiles",
  "unverifiedSupersededTags", "unverifiedEntityCollisions", "unclassified", "corpusScopeBlocked",
];

/** Locate parser text that has no destination in the public principles rows.
 * Return source positions only: diagnostics must not print judicial text. */
export function findUnseededPrecedentDetails(data: Record<string, unknown>): string[] {
  const locations: string[] = [];
  const hasContent = (value: unknown): boolean =>
    value != null && (typeof value !== "string" || value.trim().length > 0);
  const collections = Array.isArray(data.collections) ? data.collections : [];
  collections.forEach((rawCollection, collectionIndex) => {
    const collection = rawCollection as Record<string, unknown> | null;
    const principles = Array.isArray(collection?.principles) ? collection.principles : [];
    principles.forEach((rawPrinciple, principleIndex) => {
      const principle = rawPrinciple as Record<string, unknown> | null;
      if (hasContent(principle?.unparsed_details)) {
        locations.push(`collections[${collectionIndex}].principles[${principleIndex}]`);
      }
    });
  });
  const standalones = Array.isArray(data.court_precedents) ? data.court_precedents : [];
  standalones.forEach((rawPrecedent, index) => {
    const precedent = rawPrecedent as Record<string, unknown> | null;
    if (hasContent(precedent?.unparsed_details)) locations.push(`court_precedents[${index}]`);
  });
  return locations;
}

/** Source-declared, unresolved type reviews are not cured by a wider mapping.
 * Return positions only; review reasons may quote legal text and stay private. */
export function findUnresolvedLawTypeReviews(data: Record<string, unknown>): string[] {
  const laws = Array.isArray(data.laws) ? data.laws : [];
  const locations: string[] = [];
  laws.forEach((rawLaw, index) => {
    const law = rawLaw as Record<string, unknown> | null;
    const meta = law?.metadata as Record<string, unknown> | null;
    if (typeof meta?.type_review_reason === "string" && meta.type_review_reason.trim()) {
      locations.push(`laws[${index}]`);
    }
  });
  return locations;
}

export function assertLiveSeedPreflight(options: {
  dir: string;
  approvedManifestPath: string;
  types?: ContentType[];
  projectRoot: string;
}): void {
  const fail = (message: string): never => { throw new Error(`Live preflight refused: ${message}`); };
  if (!path.isAbsolute(options.approvedManifestPath)) fail("--approved-manifest must be an absolute path outside web; no guessed local path.");
  let approvedReal: string;
  try { approvedReal = fs.realpathSync(options.approvedManifestPath); }
  catch { return fail("the approved manifest does not exist or cannot be read."); }
  const rootReal = fs.realpathSync(options.projectRoot);
  if (approvedReal === rootReal || approvedReal.startsWith(rootReal + path.sep)) {
    fail("the approved manifest must be an independent contract outside web, not its vendored copy.");
  }
  if ((options.types ?? ALL_TYPES).includes("precedents")) {
    const privateMigration = path.join(
      rootReal, "supabase", "migrations", "20260919_private_precedent_details.sql",
    );
    let sql = "";
    try { sql = fs.readFileSync(privateMigration, "utf8"); }
    catch { return fail("rights-safe private precedent migration is absent from the developer package."); }
    for (const token of [
      "library_precedent_private.precedent_unparsed_details",
      "public.store_private_precedent_details",
      "public.private_precedent_storage_contract",
      PRIVATE_PRECEDENT_STORAGE_VERSION,
      "revoke all on schema library_precedent_private",
    ]) {
      if (!sql.includes(token)) {
        fail(`private precedent migration is incomplete (missing contract token: ${token}).`);
      }
    }
  }
  const operationalPath = process.env.SCHEMA_MANIFEST_PATH
    ? path.resolve(process.env.SCHEMA_MANIFEST_PATH)
    : path.join(rootReal, "scripts", "parsers", "schema_manifest.json");
  let approved: Record<string, unknown>;
  let operational: Record<string, unknown>;
  try {
    approved = JSON.parse(fs.readFileSync(approvedReal, "utf8")) as Record<string, unknown>;
    operational = JSON.parse(fs.readFileSync(operationalPath, "utf8")) as Record<string, unknown>;
  } catch {
    return fail("approved or operational manifest is missing, unreadable or invalid JSON.");
  }
  if (typeof approved.manifest_version !== "string" || typeof operational.manifest_version !== "string") {
    fail("manifest_version is missing in the approved or operational contract.");
  }
  const approvedSha = sha256File(approvedReal);
  const operationalSha = sha256File(operationalPath);
  if (approvedSha !== operationalSha) {
    fail(`operational schema_manifest drifted from the independently approved contract (approved v${approved.manifest_version}, operational v${operational.manifest_version}).`);
  }
  if ((options.types ?? ALL_TYPES).some(type => type === "laws" || type === "decrees")) {
    assertCorpusScopeContract(approved);
  }

  const dirReal = path.resolve(options.dir);
  if (!fs.existsSync(dirReal) || !fs.statSync(dirReal).isDirectory()) fail("parsed output directory is absent.");
  for (const type of options.types ?? ALL_TYPES) {
    const outputFile = path.join(dirReal, `${type}.json`);
    const reportFile = path.join(dirReal, `parse-report-${type}.json`);
    if (!fs.existsSync(outputFile) || !fs.statSync(outputFile).isFile()) fail(`${type}.json is missing; live mode never skips a selected type.`);
    if (!fs.existsSync(reportFile) || !fs.statSync(reportFile).isFile()) fail(`parse-report-${type}.json is missing.`);
    let report: Record<string, unknown>;
    try { report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as Record<string, unknown>; }
    catch { return fail(`parse-report-${type}.json is invalid JSON.`); }
    if (report.type !== type) fail(`parse-report-${type}.json has the wrong parser type.`);
    const manifest = report.manifest as Record<string, unknown> | undefined;
    if (!manifest || manifest.sha256 !== approvedSha || manifest.version !== approved.manifest_version) {
      fail(`parse-report-${type}.json was not generated under the approved manifest bytes/version.`);
    }
    if (!Array.isArray(report.rejectedEnumValues)) fail(`parse-report-${type}.json lacks the complete rejectedEnumValues list.`);
    const rejectedValues = report.rejectedEnumValues as unknown[];
    const counts = report.counts as Record<string, unknown> | undefined;
    if (!counts) fail(`parse-report-${type}.json lacks parser counts.`);
    if (!Number.isInteger(counts!.rejectedEnumValues) || counts!.rejectedEnumValues !== rejectedValues.length) {
      fail(`parse-report-${type}.json has an absent/inconsistent rejectedEnumValues count.`);
    }
    if (rejectedValues.length > 0) fail(`parse-report-${type}.json contains ${rejectedValues.length} rejected enum value(s).`);
    for (const name of BLOCKING_COUNTS) {
      const count = counts![name];
      if (count !== undefined && (!Number.isInteger(count) || (count as number) !== 0)) {
        fail(`parse-report-${type}.json has blocking ${name}=${String(count)}.`);
      }
    }
    for (const name of ["failed", "unclassified", "identityCollisions"] as const) {
      const values = report[name];
      if (values !== undefined && (!Array.isArray(values) || values.length > 0)) {
        fail(`parse-report-${type}.json has blocking ${name} entries.`);
      }
    }
    if (typeof report.output_sha256 !== "string" || !HEX_SHA256.test(report.output_sha256)) {
      fail(`parse-report-${type}.json is not bound to the full parser JSON output.`);
    }
    if (sha256File(outputFile) !== report.output_sha256) fail(`${type}.json changed after its parser report was written.`);
    if (type === "laws" || type === "decrees") {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(fs.readFileSync(outputFile, "utf8")); }
      catch { return fail(`${type}.json is invalid JSON.`); }
      assertPublicCorpusRows(parsed, type);
    }
    if (type === "precedents") {
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(outputFile, "utf8")); }
      catch { return fail("precedents.json is not valid JSON."); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        fail("precedents.json is not an object.");
      }
      // Unclassified folds are permitted only because the bundled migration
      // and seeder now have a private-schema destination. The live seeder
      // probes the applied DB contract through a service-role-only RPC before
      // its first public-table write; this offline gate cannot prove DB state.
      findUnseededPrecedentDetails(parsed as Record<string, unknown>);
    }
    // A blank law status is preserved by the parser as status_undeclared. The
    // enum validator does not count blank input as a rejection, so the report
    // alone cannot prove that the resulting parent-law status is in contract.
    // Check the bound output itself before any credentials or DB I/O.
    if (type === "laws") {
      const enums = approved.enums as Record<string, unknown> | undefined;
      // Source/registry status also includes archival file states. The DB
      // column has a narrower lifecycle domain plus the parser's explicit
      // status_undeclared sentinel; never validate DB rows against enums.status.
      const allowedStatuses = enums?.db_law_status;
      if (!Array.isArray(allowedStatuses) || allowedStatuses.length === 0
        || allowedStatuses.some((value) => typeof value !== "string")) {
        fail("approved manifest lacks a valid enums.db_law_status list.");
      }
      const dbLawStatuses = allowedStatuses as string[];
      if (!dbLawStatuses.includes("status_undeclared")
        || dbLawStatuses.includes("superseded_duplicate")
        || dbLawStatuses.includes("merged_into_parent")) {
        fail("approved enums.db_law_status must include the unknown-status sentinel and exclude archival file states.");
      }
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(outputFile, "utf8")); }
      catch { return fail("laws.json is not valid JSON."); }
      const laws = (parsed as Record<string, unknown> | null)?.laws;
      if (!Array.isArray(laws)) return fail("laws.json lacks a laws array.");
      const unresolvedTypes = findUnresolvedLawTypeReviews(parsed as Record<string, unknown>);
      if (unresolvedTypes.length > 0) {
        fail(`laws.json has ${unresolvedTypes.length} unresolved type-review marker(s); first: ${unresolvedTypes.slice(0, 3).join(", ")}. A broad normalization map is not legal classification approval.`);
      }
      const allowed = new Set(allowedStatuses as string[]);
      for (const [index, rawLaw] of laws.entries()) {
        const status = (rawLaw as Record<string, unknown> | null)?.law_status;
        if (typeof status !== "string" || !allowed.has(status)) {
          fail(`laws.json law ${index} has absent/out-of-contract law_status; resolve the source and approved contract before live seeding.`);
        }
      }
    }
  }
}
