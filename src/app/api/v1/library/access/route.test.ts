/**
 * route.test.ts — GET /api/v1/library/access. Run with:
 *   node --test src/app/api/v1/library/access/route.test.ts
 *
 * The route answers one question for a client page that does not load
 * /api/library/init (/laws/subscribe's redeem CTA, the /laws invitation
 * banner): does THIS caller have the full library? The rule is the server's
 * (hasFullLibraryAccess: a Pro+ tier, an active library grant, or an admin,
 * owner ٢٠٥/٢٠٩), never the client's tier-only can("library-full-access").
 *
 * The route imports next/server and "@/…" aliases, so (like
 * src/app/api/v1/profile/route.test.ts) this asserts against its source.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("the answer is the server's full-library rule, for a guest too", () => {
  assert.match(source, /import \{ hasFullLibraryAccess \} from "@\/lib\/access-control";/);
  assert.match(source, /hasFullLibraryAccess\(user\?\.id \?\? null\)/);
  assert.match(source, /NextResponse\.json\(\{ hasFullAccess \}/);
  // A guest is a 200 with false, never a 401.
  assert.doesNotMatch(source, /status: 401/);
  assert.doesNotMatch(source, /library-full-access/);
});

test("the session check uses the shared getUser + isAuthUnavailable 503 pattern", () => {
  assert.match(source, /const supabase = await createClient\(\);/);
  assert.match(source, /const \{ data: \{ user \}, error: authError \} = await supabase\.auth\.getUser\(\);/);
  assert.match(source, /if \(isAuthUnavailable\(user, authError\)\)/);
  assert.match(source, /authUnavailableResponse\(\)/);
});

test("the answer is per viewer: never cached, evaluated per request", () => {
  assert.match(source, /"Cache-Control": "private, no-store"/);
  assert.match(source, /export const dynamic = "force-dynamic";/);
});

test("a failed read answers false, never a 500 (deploy-order rule)", () => {
  assert.doesNotMatch(source, /status: 500/);
  assert.match(source, /catch \(err\)[\s\S]*hasFullAccess: false/);
});

test("the library gate is not asked: the flag carries no library content", () => {
  assert.doesNotMatch(source, /from "@\/lib\/library-gate"/);
  assert.doesNotMatch(source, /await libraryGate\(/);
});
