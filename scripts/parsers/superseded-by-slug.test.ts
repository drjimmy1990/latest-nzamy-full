// superseded_by written as the survivor's SLUG (owner export 2026-10-03: 98 of 162
// pointers). A tagged duplicate is dropped only when the slug names exactly one
// untagged, published survivor — never itself, a tagged file, an ambiguous slug,
// a missing one, or a file the corpus-scope gate keeps out.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws";
import { parseDecrees } from "./parse-decrees";
import { buildSlugIndex, resolveSlugSurvivor, AMBIGUOUS_SLUG } from "./lib/entity-prescan";

const LAWS = "أنظمة ولوائح";
const DECREES = "أوامر وتعاميم";

function doc(o: {
  id: string; slug?: string; status?: string; supersededBy?: string; scope?: string; kind: "law" | "decree";
}): string {
  return [
    "---",
    `id: ${o.id}`,
    `title: وثيقة اختبار ${o.id}`,
    o.slug ? `slug: ${o.slug}` : "",
    `type: ${o.kind === "law" ? "نظام" : "مرسوم ملكي"}`,
    `status: ${o.status ?? "active"}`,
    o.supersededBy ? `superseded_by: "${o.supersededBy}"` : "",
    `section_code: "00"`,
    o.scope ? `corpus_scope: ${o.scope}` : "",
    "---",
    `<!-- ARTICLE_START {"number":"1","status":"active"} -->`,
    "متن اختباري لا يمثل حكماً قانونياً.",
    "<!-- ARTICLE_END -->",
    "",
  ].filter((l, i, a) => l !== "" || i === a.length - 1).join("\n");
}

function library(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-slug-sup-"));
  fs.mkdirSync(path.join(root, LAWS), { recursive: true });
  fs.mkdirSync(path.join(root, DECREES), { recursive: true });
  for (const [rel, body] of Object.entries(files)) fs.writeFileSync(path.join(root, rel), body, "utf8");
  return root;
}

const tagged = (id: string, target: string) =>
  doc({ id, slug: `dup-${id.toLowerCase()}`, status: "superseded_duplicate", supersededBy: target, kind: "law" });

function lawsOf(root: string): string[] {
  try {
    return parseLaws(path.join(root, LAWS), root).laws.map((l) => l.slug).sort();
  } finally {
    process.exitCode = 0;
  }
}

test("law → slug of a published, untagged law: the duplicate is dropped", () => {
  const root = library({
    [`${LAWS}/survivor.md`]: doc({ id: "LAW-T-1", slug: "evidence-law-survivor", kind: "law" }),
    [`${LAWS}/dup.md`]: tagged("LAW-T-2", "evidence-law-survivor"),
  });
  assert.deepEqual(lawsOf(root), ["evidence-law-survivor"]);
});

test("law → slug of a file-name-derived survivor (no slug line) also verifies", () => {
  const root = library({ [`${LAWS}/plain-survivor.md`]: doc({ id: "LAW-T-3", kind: "law" }) });
  const derived = lawsOf(root)[0];
  fs.writeFileSync(path.join(root, LAWS, "dup.md"), tagged("LAW-T-4", derived), "utf8");
  assert.deepEqual(lawsOf(root), [derived]);
});

test("law → slug of a law the corpus-scope gate keeps out: unverified, parse refused", () => {
  const root = library({
    [`${LAWS}/internal.md`]: doc({ id: "LAW-T-5", slug: "internal-only", scope: "institutional_reference", kind: "law" }),
    [`${LAWS}/dup.md`]: tagged("LAW-T-6", "internal-only"),
  });
  assert.throws(() => lawsOf(root), /Law parse rejected/);
});

test("law → slug of another tagged file, or of nothing: unverified, parse refused", () => {
  const other = library({
    [`${LAWS}/a.md`]: tagged("LAW-T-7", "dup-law-t-8"),
    [`${LAWS}/b.md`]: tagged("LAW-T-8", "dup-law-t-7"),
  });
  assert.throws(() => lawsOf(other), /Law parse rejected/);
  const missing = library({
    [`${LAWS}/survivor.md`]: doc({ id: "LAW-T-9", slug: "real-law", kind: "law" }),
    [`${LAWS}/dup.md`]: tagged("LAW-T-10", "renamed-away"),
  });
  assert.throws(() => lawsOf(missing), /Law parse rejected/);
});

test("law → slug of a published decree: verified across folders", () => {
  const root = library({
    [`${DECREES}/decree.md`]: doc({ id: "DEC-T-1", slug: "moved-to-circulars", kind: "decree" }),
    [`${LAWS}/keep.md`]: doc({ id: "LAW-T-11", slug: "unrelated-law", kind: "law" }),
    [`${LAWS}/dup.md`]: tagged("LAW-T-12", "moved-to-circulars"),
  });
  assert.deepEqual(lawsOf(root), ["unrelated-law"]);
});

test("a slug two untagged files declare is ambiguous: never picked", () => {
  const root = library({
    [`${DECREES}/one.md`]: doc({ id: "DEC-T-2", slug: "twice", kind: "decree" }),
    [`${DECREES}/two.md`]: doc({ id: "DEC-T-3", slug: "twice", kind: "decree" }),
    [`${LAWS}/dup.md`]: tagged("LAW-T-13", "twice"),
  });
  const index = buildSlugIndex({ law: path.join(root, LAWS), decree: path.join(root, DECREES) });
  assert.equal(index.get("twice"), AMBIGUOUS_SLUG);
  assert.equal(resolveSlugSurvivor(index, "twice", ["decree", "law"]), undefined);
  assert.throws(() => lawsOf(root), /Law parse rejected/);
});

// superseded_by written as a FILE PATH (the contract's second form): 39 of the
// owner's pointers, all to existing files, that no lookup followed across folders
// (laws) or at all (decrees).
function decreeIds(root: string): { ids: string[]; exit: number } {
  try {
    const ids = parseDecrees(path.join(root, DECREES), root).decrees.map((d) => d.id).sort();
    return { ids, exit: Number(process.exitCode ?? 0) };
  } finally {
    process.exitCode = 0;
  }
}
const taggedDecree = (id: string, target: string) =>
  doc({ id, status: "superseded_duplicate", supersededBy: target, kind: "decree" });

test("decree → path of a published decree (with or without the library prefix): verified", () => {
  const root = library({
    [`${DECREES}/survivor.md`]: doc({ id: "DEC-P-1", kind: "decree" }),
    [`${DECREES}/dup-a.md`]: taggedDecree("DEC-P-2", `01_المكتبة_القانونية/${DECREES}/survivor.md`),
    [`${DECREES}/dup-b.md`]: taggedDecree("DEC-P-3", `${DECREES}/survivor.md`),
  });
  assert.deepEqual(decreeIds(root), { ids: ["survivor"], exit: 0 });
});

test("law → path of a published decree: verified across folders", () => {
  const root = library({
    [`${DECREES}/moved.md`]: doc({ id: "DEC-P-4", kind: "decree" }),
    [`${LAWS}/keep.md`]: doc({ id: "LAW-P-1", slug: "kept-law", kind: "law" }),
    [`${LAWS}/dup.md`]: tagged("LAW-P-2", `01_المكتبة_القانونية/${DECREES}/moved.md`),
  });
  assert.deepEqual(lawsOf(root), ["kept-law"]);
});

test("path to a missing file, a tagged file, an internal file, or itself: unverified", () => {
  const root = library({
    [`${DECREES}/tagged-target.md`]: taggedDecree("DEC-P-5", "nowhere-slug"),
    [`${DECREES}/internal.md`]: doc({ id: "DEC-P-6", scope: "institutional_reference", kind: "decree" }),
    [`${DECREES}/to-missing.md`]: taggedDecree("DEC-P-7", `${DECREES}/renamed-away.md`),
    [`${DECREES}/to-tagged.md`]: taggedDecree("DEC-P-8", `${DECREES}/tagged-target.md`),
    [`${DECREES}/to-internal.md`]: taggedDecree("DEC-P-9", `${DECREES}/internal.md`),
    [`${DECREES}/to-self.md`]: taggedDecree("DEC-P-10", `${DECREES}/to-self.md`),
  });
  const { ids, exit } = decreeIds(root);
  // nothing verified: every tagged file stays and the run is marked failed
  assert.deepEqual(ids, ["tagged-target", "to-internal", "to-missing", "to-self", "to-tagged"]);
  assert.equal(exit, 1);
});

test("path written in NFC finds a file whose name is stored NFD (macOS)", () => {
  const nfd = "مسار".normalize("NFD") === "مسار" ? "إقرار" : "مسار";
  const root = library({ [`${DECREES}/dup.md`]: taggedDecree("DEC-P-11", `${DECREES}/${nfd.normalize("NFC")}.md`) });
  fs.writeFileSync(path.join(root, DECREES, `${nfd.normalize("NFD")}.md`), doc({ id: "DEC-P-12", kind: "decree" }), "utf8");
  const { ids, exit } = decreeIds(root);
  assert.equal(ids.length, 1);
  assert.equal(exit, 0);
});

test("decree → slug of a published law: verified; decree → its own slug: not", () => {
  const root = library({
    [`${LAWS}/survivor.md`]: doc({ id: "LAW-T-14", slug: "the-law", kind: "law" }),
    [`${DECREES}/dup.md`]: doc({ id: "DEC-T-4", slug: "dup-decree", status: "superseded_duplicate", supersededBy: "the-law", kind: "decree" }),
    [`${DECREES}/self.md`]: doc({ id: "DEC-T-5", slug: "self-decree", status: "superseded_duplicate", supersededBy: "self-decree", kind: "decree" }),
  });
  try {
    const titles = parseDecrees(path.join(root, DECREES), root).decrees.map((d) => d.id).sort();
    // dup.md dropped (verified); self.md kept and reported unverified (exit code 1).
    assert.deepEqual(titles, ["self"]);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = 0;
  }
});
