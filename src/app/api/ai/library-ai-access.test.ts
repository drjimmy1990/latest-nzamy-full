/**
 * library-ai-access.test.ts — who may reach n8n through the library AI routes.
 * Run with:
 *   node --test src/app/api/ai/library-ai-access.test.ts
 *
 * POST /api/ai/library-chat and POST /api/ai/explain-article proxy to an n8n RAG
 * agent that answers from library text made server-only by 20260929_01
 * (articles) and 20261016_01 (precedent text). Before this check they asked only
 * libraryGate() and a per-IP rate limit, so a guest could read paywalled text
 * through the agent once the webhook URLs were set.
 *
 * The routes and their shared gate import next/server and "@/…" aliases, so
 * (like src/app/api/v1/profile/route.test.ts) this asserts against their source.
 * Multi-line patterns allow \r\n: the routes are CRLF in a Windows checkout.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gateSource = readFileSync(new URL("./_libraryAiAccess.ts", import.meta.url), "utf8");
const accessControlSource = readFileSync(
  new URL("../../../lib/access-control.ts", import.meta.url),
  "utf8",
);

const ROUTES = [
  { name: "library-chat", url: "N8N_LIBRARY_CHAT_WEBHOOK_URL", rateKey: "ai:library-chat:" },
  { name: "explain-article", url: "N8N_EXPLAIN_WEBHOOK_URL", rateKey: "ai:explain-article:" },
] as const;

function at(source: string, needle: string, label: string): number {
  const i = source.indexOf(needle);
  assert.ok(i > -1, `${label}: "${needle}" not found`);
  return i;
}

test("the gate reads the session with getUser, never the unverified getSession", () => {
  assert.match(gateSource, /import \{ createClient \} from '@\/lib\/supabase\/server';/);
  assert.match(gateSource, /const supabase = await createClient\(\);/);
  assert.match(gateSource, /const \{ data: \{ user \}, error: authError \} = await supabase\.auth\.getUser\(\);/);
  assert.doesNotMatch(gateSource, /getSession\(/);
});

test("an auth outage is a 503, checked before the guest 401", () => {
  assert.match(
    gateSource,
    /import \{ isAuthUnavailable, authUnavailableResponse \} from '@\/lib\/auth\/apiAuth';/,
  );
  const unavailable = at(
    gateSource,
    "if (isAuthUnavailable(user, authError)) return authUnavailableResponse();",
    "gate",
  );
  const guest = at(gateSource, "if (!user) {", "gate");
  assert.ok(unavailable < guest, "isAuthUnavailable must run before the !user 401");
  assert.match(
    gateSource,
    /if \(!user\) \{\s*return NextResponse\.json\(\s*\{ error: 'غير مصرح — يرجى تسجيل الدخول' \},\s*\{ status: 401 \},\s*\);/,
  );
});

test("a signed-in user below full library access is a 403, decided after the 401", () => {
  assert.match(gateSource, /import \{ getLibraryAccessForUser \} from '@\/lib\/access-control';/);
  const guest = at(gateSource, "if (!user) {", "gate");
  const tier = at(gateSource, "const { hasFullAccess } = await getLibraryAccessForUser(user.id);", "gate");
  const denied = at(gateSource, "if (!hasFullAccess) {", "gate");
  const allowed = at(gateSource, "return null;", "gate");
  // A guest costs no service-role read; null is only reached past both checks.
  assert.ok(guest < tier && tier < denied && denied < allowed);
  assert.match(
    gateSource,
    /if \(!hasFullAccess\) \{\s*return NextResponse\.json\(\s*\{ error: 'المساعد الذكي للمكتبة يتطلب اشتراك Pro أو أعلى', requiredTier: 'pro' \},\s*\{ status: 403 \},\s*\);/,
  );
  assert.equal(gateSource.match(/return null;/g)?.length, 1);
});

test("the gate is full access, not a per-item free check", () => {
  // A chat answer can draw on any law and explain-article returns other laws'
  // relatedArticles[].text, so a free law or first-N article cannot contain it.
  assert.doesNotMatch(gateSource, /checkLibraryAccess|isFreeLibraryItem|isExplicitlyFreeLibraryItem/);
  // "pro" in the 403 is this rule; if it moves, the message has to move with it.
  assert.match(
    accessControlSource,
    /const hasFullAccess = \(TIER_RANK\[tier\] \?\? 0\) >= TIER_RANK\.pro;/,
  );
});

test("the gate's own error bodies are Arabic", () => {
  const bodies = [...gateSource.matchAll(/\{ error: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(bodies.length, 2, "the 401 and the 403");
  for (const text of bodies) {
    assert.match(text, /[؀-ۿ]/, text);
    // "Pro" is the plan's name, as in checkLibraryAccess's own message.
    assert.doesNotMatch(text.replace(/\bPro\b/g, ""), /[A-Za-z]/, text);
  }
});

for (const route of ROUTES) {
  const source = readFileSync(new URL(`./${route.name}/route.ts`, import.meta.url), "utf8");

  test(`${route.name}: the access gate runs after the rate limit and before any n8n call`, () => {
    assert.match(source, /import \{ libraryAiAccess \} from '\.\.\/_libraryAiAccess';/);
    assert.match(source, /const denied = await libraryAiAccess\(\);\s*if \(denied\) return denied;/);

    const gate = at(source, "const gate = await libraryGate();", route.name);
    const rate = at(source, `rateLimit(\`${route.rateKey}\${ip}\`, { limit: 20, windowMs: 60_000 });`, route.name);
    const access = at(source, "const denied = await libraryAiAccess();", route.name);
    const configured = at(source, `if (!${route.url}) {`, route.name);
    const body = at(source, "await request.json();", route.name);
    const forward = at(source, `await fetch(${route.url}, {`, route.name);
    assert.ok(gate < rate, "libraryGate first");
    assert.ok(rate < access, "the per-IP limit throttles guests before the getUser round-trip");
    assert.ok(access < configured, "a guest learns nothing from the 503 'not configured' branch");
    assert.ok(configured < body && body < forward);
    // The only outbound call is the n8n one.
    assert.equal(source.match(/\bfetch\(/g)?.length, 1);
  });
}
