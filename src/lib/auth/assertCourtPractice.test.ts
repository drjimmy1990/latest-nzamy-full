/**
 * assertCourtPractice.test.ts — Art. 18 of نظام المحاماة on the server: the
 * court APIs (hearings, case stages, deadlines) refuse a legal consultant.
 * Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/assertCourtPractice.test.ts
 *
 * Two halves:
 *   1. The decision itself (courtPracticeDecision.ts, pure): who is refused,
 *      and how a read of `lawyer_profiles.practice_kind` that failed, found no
 *      row, or hit a database without the column (before 20261019_20 runs)
 *      falls open to "advocate" — today's behaviour.
 *   2. Source pins on the route files (the technique
 *      src/app/api/v1/admin/entitlements/grant/route.test.ts uses — a route
 *      imports `next/server` and a Supabase session, so `node --test` cannot
 *      execute it): every write handler under hearings/, case-stages/ and
 *      deadlines/ awaits the guard after its auth check and before it parses
 *      the body or writes, and returns the refusal. Reads stay open.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { courtPracticeDecision, practiceKindFromRead } from "./courtPracticeDecision.ts";

// ── 1. The decision ─────────────────────────────────────────────────────────

test("a consultant who is not an admin is refused", () => {
  assert.equal(courtPracticeDecision({ practiceKind: "consultant", isAdmin: false }), "refuse");
});

test("an admin passes even when the row says consultant", () => {
  assert.equal(courtPracticeDecision({ practiceKind: "consultant", isAdmin: true }), "allow");
});

test("an advocate passes, whatever the admin flag", () => {
  assert.equal(courtPracticeDecision({ practiceKind: "advocate", isAdmin: false }), "allow");
  assert.equal(courtPracticeDecision({ practiceKind: "advocate", isAdmin: true }), "allow");
  assert.equal(courtPracticeDecision({ practiceKind: "advocate" }), "allow");
});

test("anything but exactly 'consultant' passes (fail open)", () => {
  for (const practiceKind of [undefined, null, "", "Consultant", "CONSULTANT", " consultant", 1, {}]) {
    assert.equal(courtPracticeDecision({ practiceKind, isAdmin: false }), "allow", String(practiceKind));
  }
});

test("a consultant whose admin check was never made is refused", () => {
  // isPlatformAdmin returns false on any error; an unknown admin flag is "not an admin".
  assert.equal(courtPracticeDecision({ practiceKind: "consultant" }), "refuse");
});

test("a read that found the consultant row reads consultant", () => {
  assert.deepEqual(practiceKindFromRead({ data: { practice_kind: "consultant" }, error: null }), {
    practiceKind: "consultant",
    missingColumn: false,
    readFailed: false,
  });
});

test("a read that found an advocate row reads advocate", () => {
  assert.equal(practiceKindFromRead({ data: { practice_kind: "advocate" }, error: null }).practiceKind, "advocate");
});

test("a missing row reads advocate (firm accounts have no lawyer_profiles row)", () => {
  assert.deepEqual(practiceKindFromRead({ data: null, error: null }), {
    practiceKind: "advocate",
    missingColumn: false,
    readFailed: false,
  });
});

test("a row without the field reads advocate", () => {
  assert.equal(practiceKindFromRead({ data: {}, error: null }).practiceKind, "advocate");
  assert.equal(practiceKindFromRead({ data: { practice_kind: null }, error: null }).practiceKind, "advocate");
});

test("a missing column (42703 / PGRST204) reads advocate and says so", () => {
  for (const code of ["42703", "PGRST204"]) {
    assert.deepEqual(
      practiceKindFromRead({ data: null, error: { code, message: "column lawyer_profiles.practice_kind does not exist" } }),
      { practiceKind: "advocate", missingColumn: true, readFailed: true },
      code,
    );
  }
});

test("any other read error reads advocate, even if data came back", () => {
  for (const code of ["42501", "PGRST116", "57014", undefined]) {
    const out = practiceKindFromRead({ data: { practice_kind: "consultant" }, error: { code, message: "x" } });
    assert.deepEqual(out, { practiceKind: "advocate", missingColumn: false, readFailed: true }, String(code));
  }
});

test("a malformed read result reads advocate", () => {
  assert.equal(practiceKindFromRead(undefined).practiceKind, "advocate");
  assert.equal(practiceKindFromRead(null).practiceKind, "advocate");
  assert.equal(practiceKindFromRead({}).practiceKind, "advocate");
});

// ── 2. Source pins on the court routes ──────────────────────────────────────

const API = join(import.meta.dirname, "..", "..", "app", "api", "v1");
const COURT_DIRS = ["lawyer/hearings", "lawyer/case-stages", "lawyer/deadlines"];
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
const GUARD_IMPORT = 'import { assertCourtPractice } from "@/lib/auth/assertCourtPractice";';

/** Every route.ts under the court directories, so a new subroute is pinned too. */
function courtRouteFiles(): string[] {
  const files: string[] = [];
  for (const dir of COURT_DIRS) {
    const root = join(API, dir);
    assert.ok(existsSync(root), `${dir} moved`);
    for (const entry of readdirSync(root, { recursive: true }) as string[]) {
      if (entry.split(/[\\/]/).pop() === "route.ts") files.push(join(root, entry));
    }
  }
  return files.sort();
}

/** Source of one exported handler: from its `export async function` to the next one (or EOF). */
function handlerSlices(source: string): Map<string, string> {
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g;
  const starts = [...source.matchAll(re)].map((m) => ({ method: m[1], at: m.index! }));
  const out = new Map<string, string>();
  starts.forEach((s, i) => out.set(s.method, source.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : source.length)));
  return out;
}

function firstIndex(source: string, needles: string[]): number {
  const hits = needles.map((n) => source.indexOf(n)).filter((i) => i > -1);
  return hits.length ? Math.min(...hits) : -1;
}

const GUARD_CALL = /const (\w+) = await assertCourtPractice\(supabase, user\.id\);\s*if \(\1\) return \1;/;

const rel = (f: string) => relative(API, f).replace(/\\/g, "/");

test("the court route set is the one the ruling names", () => {
  assert.deepEqual(courtRouteFiles().map(rel), [
    "lawyer/case-stages/[caseId]/route.ts",
    "lawyer/case-stages/route.ts",
    "lawyer/deadlines/[id]/route.ts",
    "lawyer/deadlines/route.ts",
    "lawyer/hearings/route.ts",
  ]);
});

test("the expected write handlers exist (so the pins below are not vacuous)", () => {
  const writes = Object.fromEntries(
    courtRouteFiles().map((f) => [
      rel(f),
      [...handlerSlices(readFileSync(f, "utf8")).keys()].filter((m) => (WRITE_METHODS as readonly string[]).includes(m)),
    ]),
  );
  assert.deepEqual(writes, {
    "lawyer/case-stages/[caseId]/route.ts": ["POST", "PATCH"],
    "lawyer/case-stages/route.ts": [],
    "lawyer/deadlines/[id]/route.ts": ["PATCH"],
    "lawyer/deadlines/route.ts": ["POST"],
    "lawyer/hearings/route.ts": ["POST"],
  });
});

test("every court write handler awaits the guard after auth and before the body or any write", () => {
  for (const file of courtRouteFiles()) {
    const source = readFileSync(file, "utf8");
    const slices = handlerSlices(source);
    const writeMethods = [...slices.keys()].filter((m) => (WRITE_METHODS as readonly string[]).includes(m));
    if (writeMethods.length > 0) {
      assert.ok(source.includes(GUARD_IMPORT), `${rel(file)} does not import assertCourtPractice`);
    }
    for (const method of writeMethods) {
      const body = slices.get(method)!;
      const where = `${rel(file)} ${method}`;
      const auth = body.indexOf("if (!auth.ok) return auth.response;");
      const guard = body.search(GUARD_CALL);
      assert.ok(auth > -1, `${where}: the auth check moved`);
      assert.ok(guard > -1, `${where}: must \`const x = await assertCourtPractice(supabase, user.id); if (x) return x;\``);
      assert.ok(auth < guard, `${where}: the guard must come after the auth check`);

      const parse = body.indexOf("request.json(");
      assert.ok(parse > -1, `${where}: the body parse moved`);
      assert.ok(guard < parse, `${where}: the guard must come before the body is parsed`);

      const firstRead = body.indexOf(".from(");
      assert.ok(firstRead > -1 && guard < firstRead, `${where}: the guard must come before the first table access`);

      const write = firstIndex(body, [".insert(", ".update(", ".upsert(", ".delete("]);
      assert.ok(write > -1, `${where}: no write found — did the handler move?`);
      assert.ok(guard < write, `${where}: the guard must come before the first write`);
    }
  }
});

test("reads stay open: no GET handler calls the guard", () => {
  for (const file of courtRouteFiles()) {
    const get = handlerSlices(readFileSync(file, "utf8")).get("GET");
    if (get) assert.ok(!get.includes("assertCourtPractice"), `${rel(file)} GET must not refuse a consultant`);
  }
});

test("a route with no write handler does not import the guard", () => {
  const bulk = readFileSync(join(API, "lawyer/case-stages/route.ts"), "utf8");
  assert.ok(!bulk.includes("assertCourtPractice"), "case-stages/route.ts is GET-only; an unused import fails lint");
});

test("the guard reads practice_kind, refuses with the Art. 18 message, and asks about admin only for a consultant", () => {
  const src = readFileSync(join(import.meta.dirname, "assertCourtPractice.ts"), "utf8");
  assert.ok(src.includes('.from("lawyer_profiles")'), "reads lawyer_profiles");
  assert.ok(src.includes('.select("practice_kind")'), "selects practice_kind only");
  assert.ok(src.includes('.eq("user_id", userId)'), "for the caller");
  assert.ok(src.includes("{ error: CONSULTANT_BLOCKED_MESSAGE }, { status: 403 }"), "403 with the shared Arabic message");
  const consultantCheck = src.indexOf('!== "consultant"');
  const adminCheck = src.indexOf("isPlatformAdmin(userId)");
  assert.ok(consultantCheck > -1 && adminCheck > consultantCheck, "the admin read happens only after the row says consultant");
});
