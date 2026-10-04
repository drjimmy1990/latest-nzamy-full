import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import { resolveCorpusScope, assertCorpusScopeContract } from "./corpus-scope";
import { getManifest } from "./manifest";
import { unambiguousIdentityFixtures } from "../corpus-scope-test-fixtures";
import { parseLaws } from "./parse-laws";
import { parseDecrees } from "./parse-decrees";
import { seedLaws, seedDecrees } from "../seed-library";
import { assertLiveSeedPreflight } from "../seed-library.live-preflight";

const root = path.resolve(__dirname, "../..");
const registry = JSON.parse(fs.readFileSync(path.join(__dirname, "corpus-scope-registry.json"), "utf8"));
const known = registry.entries.find((entry: { source_ids: string[] }) => entry.source_ids.length);
const hash = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("contract and test-fixture adapters cannot approve an ambiguous source implicitly", () => {
  const manifest = getManifest();
  assert.throws(() => assertCorpusScopeContract({ ...manifest, corpus_scope_policy: undefined }), /corpus_scope/);
  assert.throws(() => assertCorpusScopeContract({ ...manifest, enums: { ...manifest.enums, corpus_scope: ["public_corpus"] } }), /corpus_scope/);
  const rows = [{ id: known.source_ids[0], title: known.title }, { id: "SYNTHETIC", title: "Synthetic identity fixture" }];
  const selected = unambiguousIdentityFixtures(rows);
  assert.deepEqual(selected.map(row => row.id), ["SYNTHETIC"]);
  assert.equal("corpus_scope" in rows[1], false, "immutable historical rows are never relabelled in place");
});

test("public parser output reaches fake seed tables without adding a DB corpus_scope column", async () => {
  for (const kind of ["laws", "decrees"] as const) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-public-scope-"));
    const input = path.join(dir, "public.md");
    fs.writeFileSync(input, source("public_corpus", kind));
    const parsed = (kind === "laws" ? parseLaws : parseDecrees)(input);
    const rows: Record<string, unknown>[] = [];
    const client = {
      async upsert(_table: string, inserted: Record<string, unknown>[]) {
        rows.push(...inserted); return { data: inserted, error: null };
      },
      async delete() { throw new Error("This fixture never authorizes deletion"); },
    };
    await (kind === "laws" ? seedLaws : seedDecrees)(client as never, parsed as unknown as Record<string, unknown>, false, [], false);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => !Object.prototype.hasOwnProperty.call(row, "corpus_scope")));
  }
});

test("report145 inventory has 47 unique source paths, and 2026-09-19 review closed every entry", () => {
  // ٢٠٢٦-٠٩-١٩: أُغلقت المراجعةُ الفرديّةُ للسبعة والأربعين مصدراً (انظر
  // docs/audits/2026-09-19-corpus-scope-contract.md وسجلَّ 145 في Raw_Vault).
  // فالسجلُّ الآن قرارٌ لا جردٌ مفتوح — هذا الاختبارُ يقيسُ ذلك حرفياً، لا حالةَ
  // ما قبلَ المراجعةِ (كلُّها null) التي كانت هنا قبلَ القرار.
  assert.equal(registry.entries.length, 47);
  assert.equal(new Set(registry.entries.map((entry: { path: string }) => entry.path)).size, 47);
  const validScopes = new Set(["public_corpus", "institutional_reference", "mixed_requires_separation", "pending_review"]);
  assert.ok(registry.entries.every((entry: { corpus_scope: unknown }) => validScopes.has(entry.corpus_scope as string)),
    "every 2026-09-19-decided entry must carry one of the four contract values, never null");
  assert.equal(resolveCorpusScope({}, "/synthetic/unlisted.md", "synthetic").provenance, "manifest_non_ambiguous");
  // هويّةٌ مُعادُ تسميتها لمصدرٍ **غيرِ** مُدرَجٍ في السجل — يجب ألّا تلتقطَها
  // أيُّ مطابقةٍ، فتُحسَمُ بالقاعدة الانتقاليّة (public_corpus) لا بالحجر.
  assert.equal(resolveCorpusScope({ id: "SYNTHETIC-NOT-IN-REGISTRY" }, "/renamed/unlisted.md", "synthetic").corpus_scope,
    "public_corpus");
});

test("explicit decisions and gate_zero never fall through to the transition default", () => {
  for (const corpus_scope of [null, "", "unknown", 1, {}, "public"]) {
    assert.equal(resolveCorpusScope({ corpus_scope }, "fixture.md", "").corpus_scope, "pending_review");
  }
  // مصدرٌ **غيرُ مُدرَج** في سجل المراجعة: القيمةُ الصريحةُ تُحتَرَمُ حرفياً —
  // هذا هو المسلكُ الذي كان الاختبارُ الأصليُّ يقيسُه بهويّةٍ صار لها الآن قرارٌ حقيقي.
  for (const corpus_scope of ["public_corpus", "institutional_reference", "mixed_requires_separation", "pending_review"]) {
    const decision = resolveCorpusScope({ id: "SYNTHETIC-NOT-IN-REGISTRY", corpus_scope }, "renamed.md", "");
    assert.equal(decision.corpus_scope, corpus_scope);
    assert.equal(decision.provenance, "source");
  }
  // مصدرٌ **مُدرَجٌ** بقرارٍ حقيقيٍّ حُسم في 2026-09-19 (known): إن طابقَ التصريحُ
  // الصريحُ قرارَ السجلِّ فهو مُعتمَدٌ بمصدره؛ وإن خالفَه فيُحجَرُ فوراً — لا يُسقِطُ
  // أحدُهما الآخرَ صامتاً.
  const knownDecision = resolveCorpusScope({ id: known.source_ids[0], corpus_scope: known.corpus_scope }, "renamed.md", "");
  assert.equal(knownDecision.corpus_scope, known.corpus_scope);
  assert.equal(knownDecision.provenance, "source");
  const conflictingScope = known.corpus_scope === "public_corpus" ? "institutional_reference" : "public_corpus";
  const conflict = resolveCorpusScope({ id: known.source_ids[0], corpus_scope: conflictingScope }, "renamed.md", "");
  assert.equal(conflict.corpus_scope, "pending_review");
  assert.equal(conflict.reason, "conflicting_scope_decisions");
  assert.equal(resolveCorpusScope({ corpus_scope: "public_corpus", gate_zero_status: "excluded" }, "fixture.md", "").reason,
    "public_scope_conflicts_with_gate_zero");
});

function source(scope: unknown, kind: "laws" | "decrees", id = "SYNTHETIC-SCOPE"): string {
  return `---\nid: ${id}\ntitle: Scope test fixture\ntype: ${kind === "laws" ? "نظام" : "مرسوم ملكي"}\nstatus: active\nsection_code: "00"\ncorpus_scope: ${JSON.stringify(scope)}\n---\n<!-- ARTICLE_START {"number":"1","status":"active"} -->\nSynthetic test prose only.\n<!-- ARTICLE_END -->\n`;
}

test("both Markdown parsers preserve public text, exclude institutional text, and report quarantined sources", () => {
  for (const kind of ["laws", "decrees"] as const) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-corpus-scope-"));
    const input = path.join(dir, "source.md"), reportDir = path.join(dir, "report");
    const parse = kind === "laws" ? parseLaws : parseDecrees;
    fs.writeFileSync(input, source("public_corpus", kind));
    const publicResult = parse(input, reportDir) as unknown as Record<string, any>;
    assert.equal(publicResult[kind].length, 1);
    assert.equal(publicResult[kind][0].corpus_scope, "public_corpus");
    assert.equal(publicResult[kind][0].corpus_scope_provenance.source_sha256, hash(input));
    fs.writeFileSync(input, source("institutional_reference", kind));
    const institutional = parse(input, reportDir) as unknown as Record<string, any>;
    assert.equal(institutional[kind].length, 0);
    assert.equal(institutional.corpus_scope_decisions[0].corpus_scope, "institutional_reference");
    for (const scope of [null, "unknown", "pending_review", "mixed_requires_separation"]) {
      fs.writeFileSync(input, source(scope, kind));
      try { assert.throws(() => parse(input, reportDir), /parse rejected/i); }
      finally { process.exitCode = 0; }
      const report = JSON.parse(fs.readFileSync(path.join(reportDir, `parse-report-${kind}.json`), "utf8"));
      assert.equal(report.counts.corpusScopeBlocked, 1);
      assert.equal(report.notes.corpusScopeDecisions[0].source, input);
    }
    fs.writeFileSync(input, source("public_corpus", kind));
    assert.equal((parse(input) as unknown as Record<string, any>)[kind].length, 1, "a later run clears quarantine diagnostics");
  }
});

test("unified decree indices use the same inventory and source-decision gate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-index-scope-"));
  const input = path.join(dir, "index.json");
  fs.writeFileSync(input, JSON.stringify({
    private: { title: "Synthetic private", corpus_scope: "institutional_reference", articles: ["Private test"] },
    public: { title: "Synthetic public", corpus_scope: "public_corpus", type: "مرسوم ملكي", articles: ["Public test"] },
  }));
  const result = parseDecrees(input);
  assert.deepEqual(result.decrees.map(row => row.id), ["public"]);
  fs.writeFileSync(input, JSON.stringify({ ambiguous: { id: known.source_ids[0], title: "Renamed", articles: ["Test"] } }));
  try { assert.throws(() => parseDecrees(input, dir), /unresolved corpus_scope/); }
  finally { process.exitCode = 0; }
});

test("direct seeders reject nonpublic or conflicting rows before clean, upsert, and dry export", async () => {
  for (const type of ["laws", "decrees"] as const) {
    const seed = type === "laws" ? seedLaws : seedDecrees;
    let writes = 0;
    const client = { async delete() { writes++; return { error: null }; }, async upsert() { writes++; return { error: null }; } };
    for (const dryRun of [false, true]) {
      for (const scope of [undefined, null, "", "unknown", "institutional_reference", "pending_review", "mixed_requires_separation"]) {
        await assert.rejects(seed(client as never, { [type]: [{ corpus_scope: scope }] }, dryRun, [], true), /corpus_scope/);
      }
      for (const metadata of [{ corpus_scope: "institutional_reference" }, { gate_zero_status: "excluded" }]) {
        await assert.rejects(seed(client as never, { [type]: [{ corpus_scope: "public_corpus", metadata }] }, dryRun, [], true), /corpus_scope/);
      }
    }
    assert.equal(writes, 0);
  }
});

test("hash-bound preflight gates law and decree output independently of green parser reports", () => {
  for (const type of ["laws", "decrees"] as const) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-preflight-scope-"));
    const approvedManifestPath = path.join(dir, "approved.json");
    fs.copyFileSync(path.join(__dirname, "schema_manifest.json"), approvedManifestPath);
    const output = path.join(dir, `${type}.json`);
    const version = JSON.parse(fs.readFileSync(approvedManifestPath, "utf8")).manifest_version;
    const preflight = () => assertLiveSeedPreflight({ dir, approvedManifestPath, types: [type], projectRoot: root });
    for (const scope of ["public_corpus", undefined, null, "unknown", "institutional_reference", "pending_review", "mixed_requires_separation"]) {
      fs.writeFileSync(output, JSON.stringify({ [type]: [{ corpus_scope: scope, law_status: "active" }] }));
      fs.writeFileSync(path.join(dir, `parse-report-${type}.json`), JSON.stringify({
        type, counts: { rejectedEnumValues: 0 }, rejectedEnumValues: [],
        manifest: { version, sha256: hash(approvedManifestPath) }, output_sha256: hash(output),
      }));
      if (scope === "public_corpus") assert.doesNotThrow(preflight);
      else assert.throws(preflight, /corpus_scope/);
    }
  }
});
