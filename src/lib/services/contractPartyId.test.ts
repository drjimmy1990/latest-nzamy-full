/**
 * N01-5 (owner ٢٤, batch l11) — the other party's national ID on a contract:
 * encrypted with an env key, author-only, every read logged, hash-only without
 * the key. SQL side: supabase/tests/rls/l11_firm_statements_party_ids.test.sql.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  CONTRACT_PARTY_ID_KEY_ENV,
  decryptPartyId,
  encryptPartyId,
  parsePartyIdKey,
  readPartyIdKey,
} from "./contractPartyIdCrypto.ts";
import { isContractAuthor, isMissingTable, parsePartyNationalId, partyIdStatus } from "./contractPartyId.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
const KEY = randomBytes(32);

test("N01-5: AES-GCM round trip, bound to the contract", () => {
  const c = encryptPartyId("1012345678", "k-1", KEY);
  assert.match(c, /^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/, "the shape the SQL CHECK accepts");
  assert.ok(!c.includes("1012345678"));
  assert.equal(decryptPartyId(c, "k-1", KEY), "1012345678");
  assert.equal(decryptPartyId(c, "k-2", KEY), null, "moved to another contract");
  assert.equal(decryptPartyId(c, "k-1", randomBytes(32)), null, "wrong key");
  const parts = c.split(":");
  const flipped = Buffer.from(parts[3], "base64");
  flipped[0] ^= 1;
  assert.equal(decryptPartyId([parts[0], parts[1], parts[2], flipped.toString("base64")].join(":"), "k-1", KEY), null, "tampered");
  assert.equal(decryptPartyId("garbage", "k-1", KEY), null);
  assert.notEqual(encryptPartyId("1012345678", "k-1", KEY), c, "a fresh IV per write");
});

test("N01-5: the key is 32 bytes as hex or base64; anything else is no key", () => {
  assert.equal(parsePartyIdKey(KEY.toString("hex"))?.equals(KEY), true);
  assert.equal(parsePartyIdKey(KEY.toString("base64"))?.equals(KEY), true);
  for (const bad of [undefined, null, "", "short", randomBytes(16).toString("base64"), "z".repeat(64)]) {
    assert.equal(parsePartyIdKey(bad as string | undefined), null, String(bad));
  }
  assert.equal(CONTRACT_PARTY_ID_KEY_ENV, "CONTRACT_PARTY_ID_KEY");
  assert.equal(readPartyIdKey({}), null);
  assert.equal(readPartyIdKey({ CONTRACT_PARTY_ID_KEY: KEY.toString("base64") })?.equals(KEY), true);
});

test("N01-5: only the author, only a valid Saudi ID", () => {
  assert.equal(isContractAuthor({ owner_user_id: "u1" }, "u1"), true);
  assert.equal(isContractAuthor({ owner_user_id: "u1" }, "u2"), false);
  assert.equal(isContractAuthor({ owner_user_id: null }, "u1"), false);
  assert.equal(isContractAuthor(null, "u1"), false);
  assert.deepEqual(parsePartyNationalId({ nationalId: "١٠١٢٣٤٥٦٧٨" }), { ok: true, value: "1012345678" });
  for (const bad of [{}, { nationalId: 1012345678 }, { nationalId: "3012345678" }, { nationalId: "12345" }, null]) {
    assert.equal(parsePartyNationalId(bad).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(partyIdStatus(null, true), { stored: false, encrypted: false, keyConfigured: true });
  assert.deepEqual(partyIdStatus({ ciphertext: null }, false), { stored: true, encrypted: false, keyConfigured: false });
  assert.equal(isMissingTable("42P01"), true);
  assert.equal(isMissingTable("23505"), false);
});

test("N01-5: the route checks the author before the service role, logs every reveal, never stores plain", () => {
  const route = repo("src/app/api/v1/lawyer/contracts/[id]/party-id/route.ts");
  const read = route.indexOf('.from("contracts")');
  const gate = route.indexOf("isContractAuthor(");
  assert.ok(read > 0 && gate > read);
  // a refused reveal is logged, then 403
  assert.match(route, /if \(reveal\) await logAccess\(gate\.service, id, gate\.uid, "read", "refused"\);\n\s*return forbidden\(\);/);
  // the number leaves only after the log row was written
  const log = route.indexOf('logAccess(gate.service, id, gate.uid, "read", plain ? "ok" : "no_key")');
  const out = route.indexOf("nationalId: plain }");
  assert.ok(log > 0 && out > log);
  assert.match(route, /if \(!logged\) return NextResponse\.json\(\{ error: PARTY_ID_LOG_FAILED_AR \}/);
  // without a key: hash only
  assert.match(route, /const ciphertext = key \? encryptPartyId\(parsed\.value, id, key\) : null;/);
  assert.match(route, /id_hash: hash, ciphertext/);
  assert.doesNotMatch(route, /national_id:|nationalId: parsed/);
});

test("N01-5: the number never rides on the contract DTO or the client's read", () => {
  for (const f of ["src/app/api/v1/lawyer/contracts/_shared.ts", "src/app/api/v1/client/contracts/_clientRead.ts"]) {
    assert.doesNotMatch(repo(f), /contract_party_national_ids/, f);
  }
  const detail = repo("src/app/dashboard/lawyer/_components/contracts/ContractDetail.tsx");
  assert.match(detail, /<CounterpartyNationalIdPanel contractId=\{contractId\} isDark=\{isDark\} \/>/);
});
