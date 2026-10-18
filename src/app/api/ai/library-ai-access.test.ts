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
 * Who passes (owner answers ٢٠٦ / ٢٠٧ / ٢٠٩, decisions of 2026-10-18): a tier
 * of pro or above, or a platform admin. A library subscription
 * (library_access_grants) opens the library's texts, not the assistant.
 *
 * Two halves, as in src/lib/libraryAccessDecision.test.ts:
 *   1. the rule, through the pure ./libraryAiDecision.ts, against the real tier
 *      ranking lifted out of src/lib/access-control.ts (that module imports
 *      "@/lib/supabase/server" and cannot load under node --test, so the rule
 *      takes the ranking as `ranks` and keeps no copy of it);
 *   2. the routes and their shared gate, which import next/server and "@/…"
 *      aliases, so (like src/app/api/v1/profile/route.test.ts) this asserts
 *      against their source. Multi-line patterns allow \r\n: the routes are CRLF
 *      in a Windows checkout.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { libraryAiDecision } from "./libraryAiDecision.ts";

const gateSource = readFileSync(new URL("./_libraryAiAccess.ts", import.meta.url), "utf8");
const decisionSource = readFileSync(new URL("./libraryAiDecision.ts", import.meta.url), "utf8");
const accessControlSource = readFileSync(
  new URL("../../../lib/access-control.ts", import.meta.url),
  "utf8",
);

/** access-control.ts's TIER_RANK, read out of its source (the ONE table). */
function readTierRank(source: string): Record<string, number> {
  const block = source.match(/export const TIER_RANK: Record<ServerTier, number> = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error("src/lib/access-control.ts no longer exports TIER_RANK in the shape this test reads");
  const table: Record<string, number> = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(\w+):\s*(\d+),/);
    if (m) table[m[1]] = Number(m[2]);
  }
  return table;
}

const RANKS = readTierRank(accessControlSource);
const member = { signedIn: true, isAdmin: false };

const ROUTES = [
  { name: "library-chat", url: "N8N_LIBRARY_CHAT_WEBHOOK_URL", rateKey: "ai:library-chat:" },
  { name: "explain-article", url: "N8N_EXPLAIN_WEBHOOK_URL", rateKey: "ai:explain-article:" },
] as const;

function at(source: string, needle: string, label: string): number {
  const i = source.indexOf(needle);
  assert.ok(i > -1, `${label}: "${needle}" not found`);
  return i;
}

test("the ranking read here is access-control.ts's, and pro sits above ai", () => {
  assert.ok(RANKS.pro > RANKS.ai && RANKS.ai > RANKS.shield && RANKS.shield > RANKS.free, JSON.stringify(RANKS));
});

// ── 1. the rule ─────────────────────────────────────────────────────────────

test("a guest is asked to sign in, whatever the other fields say", () => {
  assert.equal(libraryAiDecision({ signedIn: false, tier: "free", isAdmin: false }, RANKS), "sign_in");
  assert.equal(libraryAiDecision({ signedIn: false, tier: "enterprise", isAdmin: true }, RANKS), "sign_in");
});

test("a platform admin on the free tier may use the assistant (٢٠٩)", () => {
  assert.equal(libraryAiDecision({ signedIn: true, tier: "free", isAdmin: true }, RANKS), "allow");
});

test("pro and every tier above it may use the assistant", () => {
  for (const tier of ["pro", "max", "corp", "enterprise"]) {
    assert.equal(libraryAiDecision({ tier, ...member }, RANKS), "allow", tier);
  }
});

test("a free user with a library grant is asked to upgrade: the grant is ignored (٢٠٧)", () => {
  // The rule takes no grant field at all; one passed anyway changes nothing.
  const withGrant = { signedIn: true, tier: "free", isAdmin: false, hasLibraryGrant: true };
  assert.equal(libraryAiDecision(withGrant, RANKS), "upgrade");
  assert.equal(libraryAiDecision({ tier: "free", ...member }, RANKS), "upgrade");
});

test("ai and shield are below pro, so they are asked to upgrade", () => {
  assert.equal(libraryAiDecision({ tier: "ai", ...member }, RANKS), "upgrade");
  assert.equal(libraryAiDecision({ tier: "shield", ...member }, RANKS), "upgrade");
});

test("an unknown tier ranks -1 and is asked to upgrade — inherited object keys included", () => {
  for (const tier of ["gold", "", "constructor", "__proto__", "toString", "PRO"]) {
    assert.equal(libraryAiDecision({ tier, ...member }, RANKS), "upgrade", JSON.stringify(tier));
  }
  // An admin does not depend on the tier.
  assert.equal(libraryAiDecision({ signedIn: true, tier: "gold", isAdmin: true }, RANKS), "allow");
});

test("only a literal true counts as signed in or admin", () => {
  const looseSession = { signedIn: 1, tier: "pro", isAdmin: false } as unknown as Parameters<typeof libraryAiDecision>[0];
  assert.equal(libraryAiDecision(looseSession, RANKS), "sign_in");
  const looseAdmin = { signedIn: true, tier: "free", isAdmin: "yes" } as unknown as Parameters<typeof libraryAiDecision>[0];
  assert.equal(libraryAiDecision(looseAdmin, RANKS), "upgrade");
});

test("a ranking without pro opens nothing by tier; an admin still passes", () => {
  assert.equal(libraryAiDecision({ tier: "max", ...member }, { free: 0, max: 4 }), "upgrade");
  assert.equal(libraryAiDecision({ signedIn: true, tier: "max", isAdmin: true }, { free: 0, max: 4 }), "allow");
});

test("the rule module stays pure: no alias imports and no TIER_RANK copy", () => {
  assert.doesNotMatch(decisionSource, /from\s+["']@\//);
  assert.doesNotMatch(decisionSource, /(?:export )?const TIER_RANK/);
});

// ── 2. the gate and the routes ──────────────────────────────────────────────

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

test("a signed-in user below pro who is not an admin is a 403, decided after the 401", () => {
  assert.match(
    gateSource,
    /import \{ getUserTier, isPlatformAdmin, TIER_RANK \} from '@\/lib\/access-control';/,
  );
  assert.match(gateSource, /import \{ libraryAiDecision \} from '\.\/libraryAiDecision';/);
  const guest = at(gateSource, "if (!user) {", "gate");
  const reads = at(
    gateSource,
    "const [tier, isAdmin] = await Promise.all([getUserTier(user.id), isPlatformAdmin(user.id)]);",
    "gate",
  );
  const decided = at(
    gateSource,
    "const decision = libraryAiDecision({ signedIn: true, tier, isAdmin }, TIER_RANK);",
    "gate",
  );
  const allowed = at(gateSource, "if (decision === 'allow') return null;", "gate");
  const denied = at(gateSource, "{ status: 403 }", "gate");
  // A guest costs no service-role read. null only when the rule says allow;
  // every other answer falls through to the 403, so an outcome added to the
  // rule later cannot open the assistant by accident.
  assert.ok(guest < reads && reads < decided && decided < allowed && allowed < denied);
  assert.match(
    gateSource,
    /if \(decision === 'allow'\) return null;(?:\s*\/\/[^\n]*)*\s*return NextResponse\.json\(\s*\{ error: 'المساعد الذكي للمكتبة يتطلب اشتراك Pro أو أعلى', requiredTier: 'pro' \},\s*\{ status: 403 \},\s*\);\s*\}\s*$/,
  );
  assert.equal(gateSource.match(/return null;/g)?.length, 1);
});

test("the gate ignores the library subscription: Pro+ or admin only (٢٠٧)", () => {
  // getLibraryAccessForUser().hasFullAccess is the full LIBRARY rule since
  // owner ٢٠٥/٢٠٩: a Pro+ tier, an active library grant, or an admin. The
  // assistant is not part of the library subscription, so the gate reads none
  // of that: not the flag, not the grant, not the library rule. (Comments may
  // name them to say why; the code may not.)
  const gateCode = gateSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    gateCode,
    /getLibraryAccessForUser|hasFullAccess|hasActiveLibraryGrant|hasFullLibraryAccess|fullLibraryAccess|libraryAccessServer|library_access_grants/,
  );
  // "pro" in the 403 is this rule; if the rule moves, the message moves with it.
  assert.match(gateSource, /requiredTier: 'pro'/);
});

test("the gate is all or nothing, not a per-item free check", () => {
  // A chat answer can draw on any law and explain-article returns other laws'
  // relatedArticles[].text, so a free law or first-N article cannot contain it.
  assert.doesNotMatch(gateSource, /checkLibraryAccess|isFreeLibraryItem|isExplicitlyFreeLibraryItem/);
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

  test(`${route.name}: the access gate runs after the config check and before any n8n call`, () => {
    assert.match(source, /import \{ libraryAiAccess \} from '\.\.\/_libraryAiAccess';/);
    assert.match(source, /const denied = await libraryAiAccess\(\);\s*if \(denied\) return denied;/);

    const gate = at(source, "const gate = await libraryGate();", route.name);
    const rate = at(source, `rateLimit(\`${route.rateKey}\${ip}\`, { limit: 20, windowMs: 60_000 });`, route.name);
    const configured = at(source, `if (!${route.url}) {`, route.name);
    const access = at(source, "const denied = await libraryAiAccess();", route.name);
    const body = at(source, "await request.json();", route.name);
    const forward = at(source, `await fetch(${route.url}, {`, route.name);
    assert.ok(gate < rate, "libraryGate first");
    assert.ok(rate < configured, "the per-IP limit comes before everything else");
    // The client turns 401/403 into "sign in" / "subscribe"
    // (src/app/laws/[slug]/_ai-reply.ts). While the webhook is unset everyone
    // gets the 503 «قيد التفعيل», so nobody is asked to pay for an offline
    // assistant.
    assert.ok(configured < access, "the 503 'not configured' answer comes before 401/403");
    assert.ok(access < body && body < forward, "401/403 come before the body is read and before n8n");
    // The only outbound call is the n8n one.
    assert.equal(source.match(/\bfetch\(/g)?.length, 1);
  });
}
