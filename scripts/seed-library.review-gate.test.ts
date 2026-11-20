/**
 * l10 (gap 1.5, option A, OPT-IN): end to end through seedLibrary's dry-run
 * JSONL export (the rows the owner loader loads). By default a law file and a
 * decree file flagged needs_human_review are PRESENT in the JSONL and listed
 * as published_flagged («موسوم للمراجعة — يُنشر لأن البوابة غير مفعّلة»); with
 * holdReviewFlagged they are ABSENT — no law row, no article row, no decree
 * row, no page row — and listed as held_back. No DB, no network: dryRun only,
 * into a fresh tmp folder.
 *
 * Run: node --import tsx --test scripts/seed-library.review-gate.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { seedLibrary, toUuid } from "./seed-library.ts";

function law(slug: string, flagged: boolean) {
  return {
    slug,
    id: slug,
    title: `نظام تجريبي ${slug}`,
    type: "نظام",
    law_status: "active",
    corpus_scope: "public_corpus",
    needsHumanReview: flagged,
    reviewReason: flagged ? "نص منقول من صورة لم يُراجع" : "",
    chapters: [
      {
        title: "الفصل الأول",
        articles: [
          { number: 1, number_text: "المادة الأولى", text: "نص تجريبي.", status: "active" },
          { number: 2, number_text: "م".repeat(120), text: "نص تجريبي ثانٍ.", status: "active" },
        ],
      },
    ],
  };
}

function decree(id: string, flagged: boolean) {
  return {
    id,
    title: `تعميم تجريبي ${id}`,
    type: "circular",
    corpus_scope: "public_corpus",
    summary: "ملخص.",
    articles: [],
    raw_pages: [{ page_number: 1, content: "صفحة." }],
    needsHumanReview: flagged,
    reviewReason: flagged ? "تاريخ غير مؤكد" : "",
  };
}

function fixtureDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-l10-gate-in-"));
  fs.writeFileSync(path.join(dir, "laws.json"), JSON.stringify({ laws: [law("gate-clean", false), law("gate-flagged", true)] }), "utf8");
  fs.writeFileSync(path.join(dir, "decrees.json"), JSON.stringify({ decrees: [decree("تعميم-سليم", false), decree("تعميم-معلم", true)] }), "utf8");
  return dir;
}

function readJsonl(dir: string, table: string): Record<string, unknown>[] {
  const file = path.join(dir, `${table}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function run(holdReviewFlagged: boolean) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-l10-gate-out-")), "rows");
  const result = await seedLibrary({
    dir: fixtureDir(), dryRun: true, types: ["laws", "decrees"], drySeedJsonlDir: out, holdReviewFlagged,
  });
  const report = JSON.parse(fs.readFileSync(path.join(out, "needs-human-review-report.json"), "utf8"));
  return { out, result, report };
}

test("--hold-review-flagged: the flagged law and decree are absent from the JSONL and listed as held_back", async () => {
  const { out, result, report } = await run(true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(readJsonl(out, "laws").map((r) => r.slug), ["gate-clean"]);
  const articleLaws = new Set(readJsonl(out, "articles").map((r) => r.law_slug));
  assert.deepEqual([...articleLaws], ["gate-clean"], "no article of the held-back law");
  assert.deepEqual(readJsonl(out, "decrees_circulars").map((r) => r.id), [toUuid("تعميم-سليم")]);
  assert.ok(readJsonl(out, "decree_pages").every((r) => r.decree_id === toUuid("تعميم-سليم")));
  assert.equal(report.gate, "on");
  assert.equal(report.held_back_count, 2);
  assert.deepEqual(report.held_back, [
    { table: "laws", id: "gate-flagged", reason: "نص منقول من صورة لم يُراجع" },
    { table: "decrees_circulars", id: "تعميم-معلم", reason: "تاريخ غير مؤكد" },
  ]);
  assert.match(report.note, /NOT deleted/);
  assert.match(report.note, /NOT a FULL load/);
  assert.equal(report.published_flagged_count, 0);
  assert.equal(report.count, 2, "the flag report still lists every flagged record");
  assert.equal(result.review_gate?.held_back.length, 2);
  // the raised cap: the 120-character number_text reaches the row whole
  const long = readJsonl(out, "articles").find((r) => String(r.number_text).length === 120);
  assert.ok(long, "a 120-character number_text is not cut");
  assert.equal(result.value_report?.truncated.filter((t) => t.field === "number_text").length, 0);
});

test("default (hold off): the flagged files are built as before and listed loudly; nothing held back", async () => {
  const { out, result, report } = await run(false);
  assert.deepEqual(readJsonl(out, "laws").map((r) => r.slug).sort(), ["gate-clean", "gate-flagged"]);
  assert.ok(readJsonl(out, "articles").some((r) => r.law_slug === "gate-flagged"));
  assert.equal(readJsonl(out, "decrees_circulars").length, 2);
  assert.equal(report.gate, "off");
  assert.equal(report.held_back_count, 0);
  assert.equal(report.count, 2);
  assert.equal(report.published_flagged_count, 2);
  assert.deepEqual(report.published_flagged.map((p: { id: string; status: string }) => [p.id, p.status]), [
    ["gate-flagged", "موسوم للمراجعة — يُنشر لأن البوابة غير مفعّلة"],
    ["تعميم-معلم", "موسوم للمراجعة — يُنشر لأن البوابة غير مفعّلة"],
  ]);
  assert.doesNotMatch(report.note, /NOT a FULL load/, "the cleanup warning is only for a held load");
  assert.equal(result.review_gate?.published_flagged.length, 2);
});
