import assert from "node:assert/strict";
import test from "node:test";
import { parseFrontmatter } from "./frontmatter";

test("an indented triple dash in a YAML note cannot close frontmatter", () => {
  const raw = [
    "---",
    "id: LAW-24-0179",
    "review_reason: |-",
    "  Earlier review text.",
    "",
    "  --- متابعة تحقق حي 2026-08-26 ---",
    "  A later review paragraph.",
    "type: لائحة تنفيذية",
    "status: active",
    "---",
    "# Actual legal document",
    "<!-- ARTICLE_START {\"number\":\"1\"} -->",
  ].join("\n");
  const parsed = parseFrontmatter(raw, "fixture.md");
  assert.equal(parsed.meta.type, "لائحة تنفيذية");
  assert.equal(parsed.meta.status, "active");
  assert.match(String(parsed.meta.review_reason), /متابعة تحقق حي/);
  assert.equal(parsed.body.startsWith("# Actual legal document"), true);
  assert.deepEqual(parsed.warnings, []);
});

test("only the known numeric total_articles closing-fence defect is repaired", () => {
  const raw = "---\nid: LAW-1\ntype: نظام\ntotal_articles: 0---\n# Body\n";
  const parsed = parseFrontmatter(raw, "glued.md");
  assert.equal(parsed.meta.type, "نظام");
  assert.equal(parsed.meta.total_articles, 0);
  assert.equal(parsed.body, "# Body\n");
  assert.match(parsed.warnings[0], /repaired a closing fence glued to total_articles/);
});

test("triple dashes in the document body remain byte-for-byte unchanged", () => {
  const body = "# Document\nالمشفوعات: ---\nمقدمة ---\n--------------------------  \n";
  const parsed = parseFrontmatter(`---\ntype: نظام\n---\n\n${body}`, "body.md");
  assert.equal(parsed.meta.type, "نظام");
  assert.equal(parsed.body, body);
  assert.deepEqual(parsed.warnings, []);
});

test("a missing closing fence is reported rather than silently accepted", () => {
  const parsed = parseFrontmatter("---\ntype: نظام\n# Body\n", "unclosed.md");
  assert.deepEqual(parsed.meta, {});
  assert.match(parsed.warnings[0], /no closing fence/);
});
