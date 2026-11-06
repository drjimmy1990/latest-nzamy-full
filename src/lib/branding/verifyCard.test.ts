/**
 * verifyCard.test.ts — q343: what the public verification page can reveal, and
 * when a token is minted. The route and the page only carry these answers.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/branding/verifyCard.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  HOME_ANSWER,
  base32Token,
  isVerifyToken,
  parseVerifyCardBody,
  publicCardAnswer,
  readPublicCard,
  resolveLawyerVerifyCard,
} from "./verifyCard.ts";

const GOOD = "abcdefghijklmnopqrstuvwxyz234567";

test("base32Token: 20 bytes make 32 characters of the database's alphabet", () => {
  assert.equal(base32Token(new Uint8Array(20)), "a".repeat(32));
  assert.equal(base32Token(new Uint8Array(20).fill(0xff)), "7".repeat(32));
  // RFC 4648's own vector, lowercased.
  assert.equal(base32Token(new TextEncoder().encode("foobarfoobarfoobarfo")).slice(0, 8), "mzxw6ytb");
  for (let i = 0; i < 50; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    assert.ok(isVerifyToken(base32Token(bytes)));
  }
  assert.throws(() => base32Token(new Uint8Array(16)), "any other length is refused");
});

test("isVerifyToken is the shape of the column's CHECK", () => {
  assert.equal(isVerifyToken(GOOD), true);
  for (const bad of ["", "short", GOOD.toUpperCase(), `${GOOD}a`, GOOD.replace("a", "1"), "0f8e2c1a-5b7d-4e3a-9c1f-2a6b8d4e0c9f", `${GOOD}\n`]) {
    assert.equal(isVerifyToken(bad), false, JSON.stringify(bad));
  }
});

test("publicCardAnswer carries the listed keys only, whatever the database returned", () => {
  const answer = publicCardAnswer({
    state: "card", name: "أ. فهد", licence: "12345", published: true, slug: "fahad",
    user_id: "0f8e2c1a", email: "l@secret.example", phone: "050", client_name: "موكل", document_text: "نص", token: GOOD,
  });
  assert.deepEqual(answer, { state: "card", name: "أ. فهد", licence: "12345", published: true, slug: "fahad" });
  assert.deepEqual(Object.keys(answer).sort(), ["licence", "name", "published", "slug", "state"]);
});

test("publicCardAnswer: a slug only with published; a licence or name of the wrong type drops out", () => {
  assert.deepEqual(
    publicCardAnswer({ state: "card", name: "س", licence: null, published: false, slug: "hidden" }),
    { state: "card", name: "س", licence: null, published: false, slug: null },
  );
  assert.deepEqual(
    publicCardAnswer({ state: "card", name: "س", licence: 123, published: "yes", slug: 5 }),
    { state: "card", name: "س", licence: null, published: false, slug: null },
  );
});

test("publicCardAnswer: anything else is the one home answer", () => {
  for (const raw of [null, undefined, "card", 7, [], {}, { state: "home" }, { state: "other", name: "س" }, { state: "card" }, { state: "card", name: "" }, { state: "card", name: 5 }]) {
    assert.deepEqual(publicCardAnswer(raw), HOME_ANSWER, JSON.stringify(raw));
  }
});

test("readPublicCard: a bad shape never reaches the database", async () => {
  let calls = 0;
  const rpc = async () => { calls++; return { data: { state: "card", name: "س" }, error: null }; };
  for (const bad of ["", "short", GOOD.toUpperCase(), "0f8e2c1a-5b7d-4e3a-9c1f-2a6b8d4e0c9f", "' or 1=1 --"]) {
    assert.deepEqual(await readPublicCard(bad, rpc), HOME_ANSWER, bad);
  }
  assert.equal(calls, 0);
});

test("readPublicCard: unknown, off, unverified, a missing function, an error and a throw all answer byte-identically", async () => {
  const bodies = await Promise.all([
    readPublicCard(GOOD, async () => ({ data: { state: "home" }, error: null })),
    readPublicCard(GOOD, async () => ({ data: null, error: { code: "PGRST202", message: "not found" } })),
    readPublicCard(GOOD, async () => ({ data: null, error: { code: "57014", message: "timeout" } })),
    readPublicCard(GOOD, async () => { throw new Error("no network"); }),
    readPublicCard("bad", async () => ({ data: { state: "card", name: "س" }, error: null })),
  ]);
  for (const body of bodies) assert.equal(JSON.stringify(body), '{"state":"home"}');
});

test("readPublicCard: the card, with the token passed through unchanged", async () => {
  const seen: string[] = [];
  const answer = await readPublicCard(GOOD, async (t) => { seen.push(t); return { data: { state: "card", name: "س", licence: "1", published: false, slug: null }, error: null }; });
  assert.equal(answer.state, "card");
  assert.deepEqual(seen, [GOOD]);
});

test("parseVerifyCardBody takes a real boolean only", () => {
  assert.deepEqual(parseVerifyCardBody({ enabled: true }), { enabled: true });
  assert.deepEqual(parseVerifyCardBody({ enabled: false, other: 1 }), { enabled: false });
  for (const bad of [null, undefined, {}, { enabled: "false" }, { enabled: 0 }, "x", []]) {
    assert.equal(parseVerifyCardBody(bad), null, JSON.stringify(bad));
  }
});

// ── The mint ───────────────────────────────────────────────────────────────
function deps(row: { id: string; verify_token: string | null; qr_verify_card: boolean } | null, over: { readError?: { code: string }; mintError?: { code: string }; mintReturns?: string } = {}) {
  const log = { mints: [] as Array<[string, string]> };
  return {
    log,
    d: {
      read: async () => ({ data: over.readError ? null : row, error: over.readError ?? null }),
      mint: async (vault: string, token: string) => {
        log.mints.push([vault, token]);
        return { data: over.mintError ? null : (over.mintReturns ?? token), error: over.mintError ?? null };
      },
      newToken: () => GOOD,
    },
  };
}
const QUALIFIES = { verified: true, marketplaceVisible: false };

test("verified, unpublished, switch on, no token: minted once, and the stored token is what comes back (a race agrees)", async () => {
  const { d, log } = deps({ id: "v1", verify_token: null, qr_verify_card: true }, { mintReturns: "z".repeat(32) });
  assert.deepEqual(await resolveLawyerVerifyCard(QUALIFIES, d), { token: "z".repeat(32), enabled: true });
  assert.deepEqual(log.mints, [["v1", GOOD]]);
});

test("a token already there is returned, never replaced", async () => {
  const { d, log } = deps({ id: "v1", verify_token: GOOD, qr_verify_card: true });
  assert.deepEqual(await resolveLawyerVerifyCard(QUALIFIES, d), { token: GOOD, enabled: true });
  assert.equal(log.mints.length, 0);
});

test("the switch off: nothing minted and no token leaves the server, even an old one", async () => {
  for (const verify_token of [null, GOOD]) {
    const { d, log } = deps({ id: "v1", verify_token, qr_verify_card: false });
    assert.deepEqual(await resolveLawyerVerifyCard(QUALIFIES, d), { token: null, enabled: false });
    assert.equal(log.mints.length, 0);
  }
});

test("published or unverified: nothing minted", async () => {
  for (const who of [{ verified: true, marketplaceVisible: true }, { verified: false, marketplaceVisible: false }]) {
    const { d, log } = deps({ id: "v1", verify_token: null, qr_verify_card: true });
    assert.deepEqual(await resolveLawyerVerifyCard(who, d), { token: null, enabled: true });
    assert.equal(log.mints.length, 0);
  }
});

test("no vault yet: the switch reads on, no token, nothing written", async () => {
  const { d, log } = deps(null);
  assert.deepEqual(await resolveLawyerVerifyCard(QUALIFIES, d), { token: null, enabled: true });
  assert.equal(log.mints.length, 0);
});

test("before 20261103_69 runs: null, today's behaviour", async () => {
  for (const code of ["42703", "PGRST204"]) {
    assert.equal(await resolveLawyerVerifyCard(QUALIFIES, deps(null, { readError: { code } }).d), null, code);
  }
  assert.equal(await resolveLawyerVerifyCard(QUALIFIES, deps({ id: "v1", verify_token: null, qr_verify_card: true }, { mintError: { code: "PGRST202" } }).d), null);
});

test("a failed read or mint never breaks the letterhead: no card, and the page still prints", async () => {
  assert.equal(await resolveLawyerVerifyCard(QUALIFIES, deps(null, { readError: { code: "57014" } }).d), null);
  assert.deepEqual(
    await resolveLawyerVerifyCard(QUALIFIES, deps({ id: "v1", verify_token: null, qr_verify_card: true }, { mintError: { code: "57014" } }).d),
    { token: null, enabled: true },
  );
});
