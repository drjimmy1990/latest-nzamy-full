// Run after starting moyasar-billing.sim.yaml on port 4919.
// Real client + billing handler over HTTP; the database is the existing fake.
import assert from "node:assert/strict";
import { createMoyasarClient, MOYASAR_API_BASE } from "../../src/lib/payments/moyasarClient.ts";
import { deleteCardWith } from "../../src/lib/payments/billingCore.ts";
import { fakeDb } from "../../src/lib/payments/fakeDb.test-helper.ts";

const id = "00000000-0000-0000-0000-000000000001";
for (const status of [204, 500, 404]) {
  const db = fakeDb(q => ({ data: q.op === "select" ? { id, user_id: "user-a", merchant: "platform", live: false, status: "active", token: "token_fixture" } : [{ id }] }));
  const client = createMoyasarClient({ enabled: true, mode: "test", secretKey: "sk_test_fixture", publishableKey: "pk_test_fixture", webhookSecret: "fixture" },
    ((url, init) => fetch(String(url).replace(MOYASAR_API_BASE, "http://127.0.0.1:4919/moyasar"), { ...init, headers: { ...init?.headers, "x-mock-response-code": String(status) } })) as typeof fetch);
  const reply = await deleteCardWith({ admin: db.client, gateway: async () => client }, "user-a", id);
  assert.equal(reply.status, status === 500 ? 502 : 200);
  assert.equal(db.log.some(q => q.op === "update"), status !== 500);
  console.log(`provider ${status}: billing ${reply.status}, local card ${status === 500 ? "unchanged" : "deleted"}`);
}
