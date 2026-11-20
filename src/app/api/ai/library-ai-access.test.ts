/**
 * library-ai-access.test.ts — who may use the library's AI.
 * Run with:
 *   node --test src/app/api/ai/library-ai-access.test.ts
 *
 * The library assistant (tool library-assistant on POST /api/v1/ai/runs)
 * answers from library text made server-only by 20260929_01 (articles) and
 * 20261016_01 (precedent text). The run route asks this gate for every library
 * tool, before the charge. (The old free routes /api/ai/library-chat and
 * /api/ai/explain-article, which this gate first guarded, are deleted.)
 *
 * Who passes (owner answers ٢٠٦ / ٢٠٩, decisions of 2026-10-18): a tier of pro
 * or above, or a platform admin. Owner ٥ as amended by ١٥ (17 Nov 2026,
 * replacing ٢٠٧): the library ASSISTANT (library-assistant) also opens to an
 * active library grant holder and an active founder member — every question
 * still paid in points. The other library tools keep the Pro rule (the
 * founder also passes for his plan's own tools, 0.5).
 *
 * Two halves, as in src/lib/libraryAccessDecision.test.ts:
 *   1. the rule, through the pure ./libraryAiDecision.ts, against the real tier
 *      ranking lifted out of src/lib/access-control.ts (that module imports
 *      "@/lib/supabase/server" and cannot load under node --test, so the rule
 *      takes the ranking as `ranks` and keeps no copy of it);
 *   2. the shared gate, which imports next/server and "@/…" aliases, so (like
 *      src/app/api/v1/profile/route.test.ts) this asserts against its source.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { libraryAiDecision, libraryAiReads } from "./libraryAiDecision.ts";

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

test("owner ٥ / ١٥: a free user with an active library grant is allowed when the caller sets libraryGrant (the library assistant only)", () => {
  assert.equal(libraryAiDecision({ signedIn: true, tier: "free", isAdmin: false, libraryGrant: true }, RANKS), "allow");
  assert.equal(libraryAiDecision({ signedIn: true, tier: "free", isAdmin: false, libraryGrant: false }, RANKS), "upgrade");
  assert.equal(libraryAiDecision({ signedIn: false, tier: "free", isAdmin: false, libraryGrant: true }, RANKS), "sign_in");
  // only a literal true, and only under its own name
  const loose = { signedIn: true, tier: "free", isAdmin: false, libraryGrant: "yes" as unknown as boolean };
  assert.equal(libraryAiDecision(loose, RANKS), "upgrade");
  const otherName = { signedIn: true, tier: "free", isAdmin: false, hasLibraryGrant: true };
  assert.equal(libraryAiDecision(otherName, RANKS), "upgrade");
  assert.equal(libraryAiDecision({ tier: "free", ...member }, RANKS), "upgrade");
});

test("libraryAiReads: the grant is read for library-assistant only; the founder seat for it and the founder plan's tools", () => {
  assert.deepEqual(libraryAiReads("library-assistant"), { founderSeat: true, libraryGrant: true });
  for (const t of ["legal-drafter", "contracts-pro", "legal-opinion-consult", "legal-opinion-letter", "wargaming"]) {
    assert.deepEqual(libraryAiReads(t), { founderSeat: true, libraryGrant: false }, t);
  }
  for (const t of ["quick-answer", "assistant", "canvas-card", "case-brief", "", undefined, null, 5]) {
    assert.deepEqual(libraryAiReads(t), { founderSeat: false, libraryGrant: false }, String(t));
  }
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

// ── 2. the gate ──────────────────────────────────────────────

test("the gate reads the session with getUser, never the unverified getSession", () => {
  assert.match(gateSource, /import \{ createClient \} from '@\/lib\/supabase\/server';/);
  assert.match(gateSource, /const supabase = await createClient\(\);/);
  assert.match(gateSource, /const \{ data: \{ user \}, error: authError \} = await supabase\.auth\.getUser\(\);/);
  assert.doesNotMatch(gateSource, /getSession\(/);
});

test("an auth outage is a 503, checked before the guest 401", () => {
  assert.match(
    gateSource,
    /import \{ isAuthUnavailable, authUnavailableResponse, frozenAccountResponse \} from '@\/lib\/auth\/apiAuth';/,
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
  // D6: a frozen account (a pending deletion) is refused after the 401, before
  // any service-role tier read.
  const frozen = at(gateSource, "const frozen = frozenAccountResponse(user);", "gate");
  const tier = at(gateSource, "getUserTier(user.id)", "gate");
  assert.ok(guest < frozen && frozen < tier, "401 → frozen → tier");
});

test("a signed-in user below pro who is not an admin is a 403, decided after the 401", () => {
  assert.match(
    gateSource,
    /import \{ getUserTier, isPlatformAdmin, TIER_RANK \} from '@\/lib\/access-control';/,
  );
  assert.match(gateSource, /import \{ libraryAiDecision, libraryAiReads \} from '\.\/libraryAiDecision';/);
  const guest = at(gateSource, "if (!user) {", "gate");
  const reads = at(
    gateSource,
    "const [tier, isAdmin, founderMember, libraryGrant] = await Promise.all([",
    "gate",
  );
  const decided = at(
    gateSource,
    "const decision = libraryAiDecision({ signedIn: true, tier, isAdmin, founderMember, libraryGrant }, TIER_RANK);",
    "gate",
  );
  const allowed = at(gateSource, "if (decision === 'allow') return null;", "gate");
  const denied = at(gateSource, "{ status: 403 }", "gate");
  // A guest costs no service-role read. null only when the rule says allow;
  // every other answer falls through to the 403, so an outcome added to the
  // rule later cannot open the assistant by accident.
  assert.ok(guest < reads && reads < decided && decided < allowed && allowed < denied);
  const tail = gateSource.slice(allowed);
  assert.match(tail, /^if \(decision === 'allow'\) return null;(?:\s*\/\/[^\n]*)*\s*return NextResponse\.json\(/);
  assert.match(tail, /requiredTier: 'pro',\s*\},\s*\{ status: 403 \},\s*\);\s*\}\s*$/);
  assert.equal(gateSource.match(/return null;/g)?.length, 1);
});

test("owner ٥ / ١٥: the gate reads the library grant and the founder seat only for the tools libraryAiReads names", () => {
  // The library grant opens the library ASSISTANT only: the read is guarded by
  // libraryAiReads(toolId).libraryGrant, so quick-answer, the deep assistant
  // and the other library tools never see it. The library's full-access flag
  // is still not used (it also counts a Pro tier and an admin, read here
  // separately). (Comments may name them; the code is what is checked.)
  const gateCode = gateSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(gateCode, /import \{ hasActiveLibraryGrant \} from '@\/lib\/libraryAccessServer';/);
  assert.match(gateCode, /const reads = libraryAiReads\(toolId\);/);
  assert.match(gateCode, /reads\.libraryGrant \? hasActiveLibraryGrant\(user\.id\) : Promise\.resolve\(false\),/);
  assert.match(gateCode, /reads\.founderSeat \? isFounderMemberForTool\(user\.id, toolId\) : Promise\.resolve\(false\),/);
  assert.equal(gateCode.match(/hasActiveLibraryGrant\(/g)?.length, 1);
  assert.doesNotMatch(gateCode, /getLibraryAccessForUser|hasFullAccess|hasFullLibraryAccess|fullLibraryAccess|library_access_grants/);
  // "pro" in the 403 is the rule for every other library tool.
  assert.match(gateSource, /requiredTier: 'pro'/);
});

test("the gate is all or nothing, not a per-item free check", () => {
  // A chat answer can draw on any law and explain-article returns other laws'
  // relatedArticles[].text, so a free law or first-N article cannot contain it.
  assert.doesNotMatch(gateSource, /checkLibraryAccess|isFreeLibraryItem|isExplicitlyFreeLibraryItem/);
});

test("the gate's own error bodies are Arabic", () => {
  // The 401 body, and the 403's two messages (the library assistant names the
  // library subscription too; the other library tools need the professional plan).
  const code = gateSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const bodies = [...code.matchAll(/'([^'\n]*[؀-ۿ][^'\n]*)'/g)].map((m) => m[1]);
  assert.equal(bodies.length, 3, "the 401 and the two 403 messages");
  for (const text of bodies) {
    // N05-L11/12 (batch l11): no "Pro" and no other Latin word — the plans by their Arabic names.
    assert.doesNotMatch(text, /[A-Za-z]/, text);
  }
});

test("N05-L11/12: the 403s name the real plans in Arabic and the assistant's price per question", () => {
  const code = gateSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const bodies = [...code.matchAll(/'([^'\n]*[؀-ۿ][^'\n]*)'/g)].map((m) => m[1]);
  const assistant = bodies.find((b) => b.includes("مساعد المكتبة"));
  const other = bodies.find((b) => b.includes("هذه الأداة"));
  assert.ok(assistant && other, "both 403 messages");
  for (const plan of ["باقة المكتبة القانونية", "الأعضاء المؤسسين", "الباقة الاحترافية"]) assert.ok(assistant.includes(plan), plan);
  assert.match(assistant, /5 نقاط عن كل سؤال/);
  assert.ok(other.includes("الباقة الاحترافية"));
  assert.ok(!other.includes("باقة المكتبة القانونية"), "a library subscription does not open the other library tools");
});

// 0.5 (owner package 17 Nov): a founder member passes for the founder plan's tools only
test("libraryAiDecision: an active founder member running a founder-plan tool is allowed", () => {
  assert.equal(libraryAiDecision({ signedIn: true, tier: "free", isAdmin: false, founderMember: true }, RANKS), "allow");
  assert.equal(libraryAiDecision({ signedIn: true, tier: "free", isAdmin: false, founderMember: false }, RANKS), "upgrade");
  assert.equal(libraryAiDecision({ signedIn: false, tier: "free", isAdmin: false, founderMember: true }, RANKS), "sign_in");
  const loose = { signedIn: true, tier: "free", isAdmin: false, founderMember: 1 as unknown as boolean };
  assert.equal(libraryAiDecision(loose, RANKS), "upgrade");
});

test("isFounderPlanTool: the drafter and the four output tools, nothing else", async () => {
  const { isFounderPlanTool } = await import("./founderPlanTool.ts");
  for (const t of ["legal-drafter", "contracts-pro", "legal-opinion-consult", "legal-opinion-letter", "wargaming"]) {
    assert.equal(isFounderPlanTool(t), true, t);
  }
  for (const t of ["library-assistant", "quick-answer", "assistant", "canvas-card", "", undefined, null, 5]) {
    assert.equal(isFounderPlanTool(t), false, String(t));
  }
});
