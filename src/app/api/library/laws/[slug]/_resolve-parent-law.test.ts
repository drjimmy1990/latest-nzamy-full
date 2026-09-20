import assert from "node:assert/strict";
import test from "node:test";
import { resolveParentLawLink, type ParentLawCandidate } from "./_resolve-parent-law.ts";

function candidate(overrides: Partial<ParentLawCandidate> = {}): ParentLawCandidate {
  return {
    slug: "parent-law",
    title: "النظام الأب",
    status: "active",
    type: "نظام",
    instrument_id: "LAW-PARENT-001",
    ...overrides,
  };
}

test("resolves exactly one registry-identity match across every current DB status", () => {
  const statuses = [
    "active",
    "partially_active",
    "deferred_effective",
    "issued_publication_unverified",
    "suspended",
    "repealed",
    "status_undeclared",
  ];
  for (const status of statuses) {
    assert.deepEqual(
      resolveParentLawLink("child", "LAW-PARENT-001", [candidate({ status })]),
      { slug: "parent-law", title: "النظام الأب" },
    );
  }
});

test("ambiguity, self-links, secondary parents, archival status, and wrong ids fail closed", () => {
  assert.equal(resolveParentLawLink("child", "LAW-PARENT-001", [candidate(), candidate({ slug: "other" })]), null);
  assert.equal(resolveParentLawLink("parent-law", "LAW-PARENT-001", [candidate()]), null);
  assert.equal(resolveParentLawLink("child", "LAW-PARENT-001", [candidate({ type: "لائحة تنفيذية" })]), null);
  assert.equal(resolveParentLawLink("child", "LAW-PARENT-001", [candidate({ status: "superseded_duplicate" })]), null);
  assert.equal(resolveParentLawLink("child", "LAW-PARENT-001", [candidate({ instrument_id: "LAW-OTHER" })]), null);
  assert.equal(resolveParentLawLink("child", "", [candidate()]), null);
});

test("a Decision or Royal Order can be the parent when the source identity is unambiguous", () => {
  for (const type of ["قرار", "أمر ملكي"]) {
    assert.deepEqual(
      resolveParentLawLink("child", "LAW-PARENT-001", [candidate({ type })]),
      { slug: "parent-law", title: "النظام الأب" },
    );
  }
});
