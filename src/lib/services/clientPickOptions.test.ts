import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clientOptionValue, parseClientOptionValue, clientOptionLabel, orderPickable,
  ensureClientCard, cardInputFor, counterpartyFill, NO_NAME_PROFILE_AR, GENERIC_PROFILE_NAME,
  type PickableClient,
} from "./clientPickOptions.ts";
import {
  parseCounterpartyContact, mergeCounterpartyMetadata, readCounterparty, COUNTERPARTY_ID_INVALID_AR,
} from "./contractCounterparty.ts";

const card = (extra: Partial<PickableClient> = {}): PickableClient => ({
  id: "card-1", source: "card", clientUserId: null, clientType: "company", name: "شركة الأفق",
  phone: "0551234567", commercialRegisterNo: "1010123456", unifiedNumber700: null, ...extra,
});
const profile = (extra: Partial<PickableClient> = {}): PickableClient => ({
  id: "user-9", source: "profile", clientUserId: "user-9", clientType: null, name: "سارة المطيري",
  phone: "+966500000000", commercialRegisterNo: null, unifiedNumber700: null, ...extra,
});

// ── N01-2: both sources, labelled, and the value carries the source ─────────

test("N01-2: an option value says which id it is; labels name the source", () => {
  assert.equal(clientOptionValue(card()), "card:card-1");
  assert.equal(clientOptionValue(profile()), "profile:user-9");
  assert.deepEqual(parseClientOptionValue("profile:user-9"), { source: "profile", id: "user-9" });
  assert.equal(parseClientOptionValue(""), null);
  assert.equal(parseClientOptionValue("user-9"), null);
  assert.equal(clientOptionLabel(card()), "شركة الأفق — بطاقة موكّل");
  assert.equal(clientOptionLabel(profile()), "سارة المطيري — حساب منصة");
  assert.deepEqual(orderPickable([profile(), card(), profile({ id: "u2" })]).map((c) => c.id), ["card-1", "user-9", "u2"]);
});

test("N01-2: a card is used as it is — nothing is created", async () => {
  let calls = 0;
  const got = await ensureClientCard(card(), async () => { calls++; return card({ id: "x" }); });
  assert.equal(got.id, "card-1");
  assert.equal(calls, 0);
});

test("N01-2: a platform account gets a linked card (name + account, no phone sent)", async () => {
  const sent: unknown[] = [];
  const got = await ensureClientCard(profile(), async (input) => {
    sent.push(input);
    return card({ id: "card-new", clientUserId: "user-9", name: input.name });
  });
  assert.deepEqual(sent, [{ name: "سارة المطيري", clientType: "individual", clientUserId: "user-9" }]);
  assert.equal(got.id, "card-new");
  assert.equal(got.source, "card");
});

test("N01-2: an account with no real name is not filed under the placeholder name", async () => {
  assert.equal(cardInputFor(profile({ name: GENERIC_PROFILE_NAME })), null);
  await assert.rejects(
    ensureClientCard(profile({ name: GENERIC_PROFILE_NAME }), async () => card()),
    (e: Error) => e.message === NO_NAME_PROFILE_AR,
  );
});

// ── N01-5: fill «الطرف الآخر» from the client, only what is empty ──────────

test("N01-5: picking a company fills name, phone and the commercial register into empty fields", () => {
  assert.deepEqual(counterpartyFill(card(), { name: "", phone: "", idNo: "" }), {
    name: "شركة الأفق", phone: "0551234567", idNo: "1010123456",
  });
  assert.deepEqual(counterpartyFill(card({ commercialRegisterNo: null, unifiedNumber700: "7001234567" }), { name: "", phone: "", idNo: "" }).idNo, "7001234567");
});

test("N01-5: a typed value is never overwritten; an individual has no ID to fill (hash only)", () => {
  assert.deepEqual(counterpartyFill(card(), { name: "اسم مكتوب", phone: "0509999999", idNo: "2020202020" }), {
    name: "اسم مكتوب", phone: "0509999999", idNo: "2020202020",
  });
  assert.deepEqual(counterpartyFill(profile(), { name: "", phone: "", idNo: "" }), {
    name: "سارة المطيري", phone: "+966500000000", idNo: "",
  });
  assert.equal(counterpartyFill(profile({ name: GENERIC_PROFILE_NAME }), { name: "", phone: "", idNo: "" }).name, "");
});

test("N01-5: the contact is validated and stored in metadata.counterparty, other keys kept", () => {
  const ok = parseCounterpartyContact({ counterpartyPhone: "0551234567", counterpartyIdNo: "١٠١٠١٢٣٤٥٦" });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.idNo, "1010123456");
  assert.equal(ok.ok && typeof ok.phone, "string");
  const bad = parseCounterpartyContact({ counterpartyIdNo: "12345" });
  assert.deepEqual(bad, { ok: false, error: COUNTERPARTY_ID_INVALID_AR });
  assert.equal(parseCounterpartyContact({ counterpartyPhone: "0000000000" }).ok, false);
  const untouched = parseCounterpartyContact({});
  assert.deepEqual(untouched, { ok: true, phone: undefined, idNo: undefined });

  assert.equal(mergeCounterpartyMetadata({ a: 1 }, { phone: undefined, idNo: undefined }), null);
  const merged = mergeCounterpartyMetadata({ a: 1 }, { phone: "0551234567", idNo: undefined });
  assert.deepEqual(merged, { a: 1, counterparty: { phone: "0551234567", idNo: null } });
  assert.deepEqual(readCounterparty(merged), { phone: "0551234567", idNo: null });
  assert.deepEqual(mergeCounterpartyMetadata(merged, { phone: null, idNo: undefined }), { a: 1 });
  assert.deepEqual(readCounterparty(null), { phone: null, idNo: null });
});

// ── wiring: no picker filters platform clients out any more ─────────────────

test("N01-2 wiring: the contract, party and invoice forms no longer drop platform clients", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const file of [
    "app/dashboard/lawyer/_components/contracts/ContractFormModal.tsx",
    "app/dashboard/lawyer/_components/contracts/ContractChildForms.tsx",
    "app/dashboard/lawyer/finance/page.tsx",
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /source\s*===\s*"card"\)\)/, `${file} still filters to cards only`);
    assert.match(src, /ensureClientCard(<\w+>)?\(/,`${file} does not file a card for a platform client`);
  }
});
