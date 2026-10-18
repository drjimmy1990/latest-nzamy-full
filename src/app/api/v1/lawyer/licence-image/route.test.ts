/**
 * route.test.ts — POST /api/v1/lawyer/licence-image contract (owner answer
 * ٢١٩, ruling P12). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/v1/lawyer/licence-image/route.test.ts
 *
 * A source-contract test (the technique
 * src/app/api/v1/admin/entitlements/grant/route.test.ts uses): the route
 * imports `next/server` and a Supabase session, so `node --test` cannot
 * execute it. The checks themselves are unit-tested in
 * src/lib/services/licenceUpload.test.ts.
 *
 * What it pins:
 *   - the lawyer-only auth gate runs before the body is read or anything is
 *     written;
 *   - Storage and the `licence_image_path` write go through the service
 *     client (only the service role holds a privilege on that column);
 *   - a failed or zero-row update removes the uploaded object, and a missing
 *     column (before 20261019_20) answers 503, never 500;
 *   - the stored path never goes back to the browser.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

/** The POST handler's body, from its signature to the end of the file. */
const post = (() => {
  const at = src.indexOf("export async function POST(");
  assert.ok(at > -1, "the route no longer exports POST");
  return src.slice(at);
})();

function at(needle: string): number {
  const i = post.indexOf(needle);
  assert.ok(i > -1, `POST no longer contains ${needle}`);
  return i;
}

test("the lawyer-only gate runs first", () => {
  const gate = at('await assertRole(["lawyer"])');
  assert.ok(gate < at("return auth.response"), "the gate's refusal is returned");
  for (const later of ["request.formData()", "content-length", "createServiceClient()", ".upload(", ".update("]) {
    assert.ok(gate < at(later), `assertRole runs before ${later}`);
  }
  // assertRole always admits a platform admin; an admin has no lawyer_profiles row.
  assert.match(post, /userType\s*!==\s*"lawyer"/, "a non-lawyer (the admin assertRole lets through) is refused");
});

test("the body is checked with the pure validator before Storage is touched", () => {
  const check = at("validateLicenceUpload(");
  assert.ok(check < at(".upload("), "validated before the upload");
  assert.ok(at("safeLicenceName(") < at(".upload("));
  assert.match(src, /from "@\/lib\/services\/licenceUpload"/);
});

test("Storage and the column write use the service client", () => {
  assert.match(src, /import \{[^}]*createServiceClient[^}]*\} from "@\/lib\/supabase\/server"/);
  assert.match(post, /service\.storage\s*\.from\("documents"\)\s*\.upload\(/);
  assert.match(post, /upsert:\s*false/);
  assert.match(post, /service\s*\.from\("lawyer_profiles"\)\s*\.update\(\{\s*licence_image_path:\s*path\s*\}\)/);
  assert.ok(!/auth\.supabase|\bsupabase\.storage|\bsupabase\s*\.from\("lawyer_profiles"\)/.test(post), "the session client never writes here");
});

test("the path is the caller's own licence folder", () => {
  assert.match(post, /`\$\{user\.id\}\/licence\/\$\{Date\.now\(\)\}-\$\{safeLicenceName\(/);
});

test("the update counts its rows, and a failed or zero-row update removes the object", () => {
  const update = at(".update({ licence_image_path: path })");
  assert.match(post.slice(update, update + 200), /\.select\("user_id"\)/, "zero rows must be visible, not a silent success");
  const remove = post.indexOf('.remove([path])', update);
  assert.ok(remove > update, "the uploaded object is removed after a failed update");
  const okAt = at("{ ok: true }");
  assert.ok(remove < okAt, "the cleanup sits on the failure path, before the success answer");
});

test("a missing column answers 503 «الخدمة غير متاحة مؤقتاً» and removes the object", () => {
  assert.match(src, /"42703"/);
  assert.match(src, /"PGRST204"/);
  assert.match(src, /unavailable:\s*"الخدمة غير متاحة مؤقتاً"/);
  const branch = at("if (isMissingColumn(updateError))");
  assert.ok(post.indexOf(".remove([path])") < branch, "the object is removed before the 503");
  assert.match(post.slice(branch, branch + 400), /\{ error: AR\.unavailable \}, \{ status: 503 \}/);
});

test("the stored path is never echoed to the browser", () => {
  // Every JSON answer's body — none may carry the path, a URL, or the signed link.
  const bodies = [...post.matchAll(/NextResponse\.json\(\s*(\{[^)]*?\})/g)].map((m) => m[1]);
  assert.ok(bodies.length >= 3, "found the JSON answers");
  for (const body of bodies) {
    assert.ok(!/\bpath\b|url|signed/i.test(body), `a response body carries the path: ${body}`);
  }
  assert.ok(bodies.some((b) => /^\{\s*ok:\s*true\s*\}$/.test(b)), "the success body is exactly { ok: true }");
});

test("every refusal is Arabic", () => {
  // Answers take their copy from the AR table (or the validator's own Arabic
  // LICENCE_ERRORS / check.error) — never an inline English string.
  const errors = [...post.matchAll(/NextResponse\.json\(\{ error:\s*([^\s},]+)/g)].map((m) => m[1]);
  assert.ok(errors.length >= 6, "found the refusals");
  for (const e of errors) {
    assert.ok(/^(AR\.\w+|LICENCE_ERRORS\.\w+|check\.error)$/.test(e), `inline or unknown error copy: ${e}`);
  }
  const arAt = src.indexOf("const AR = {");
  assert.ok(arAt > -1, "the AR copy table moved");
  const table = src.slice(arAt, src.indexOf("} as const;", arAt));
  const values = [...table.matchAll(/:\s*"([^"]*)"/g)].map((m) => m[1]);
  assert.ok(values.length >= 6);
  for (const v of values) assert.match(v, /[؀-ۿ]/, `not Arabic: ${v}`);
});
