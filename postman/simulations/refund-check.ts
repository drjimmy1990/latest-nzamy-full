// Local HTTP simulation, synthetic keys only. No requests to Moyasar.
import assert from "node:assert/strict";
import { createMoyasarClient, MOYASAR_API_BASE } from "../../src/lib/payments/moyasarClient.ts";
import { refundOrderWith } from "../../src/lib/payments/refundCore.ts";
import { fakeDb } from "../../src/lib/payments/fakeDb.test-helper.ts";
for (const [id,status,finish,release] of [["pay_ok",200,true,false],["pay_outage",502,false,false],["pay_reject",502,false,true],["pay_wrong_currency",502,false,false]] as const) {
  const order = { id:"order_fixture", user_id:"user_fixture", merchant:"platform",kind:"topup",status:"paid",total_halalas:11500,paid_at:"2026-10-20T00:00:00Z",fulfilled_at:"2026-10-20T00:00:01Z",moyasar_payment_id:id,live:false,metadata:{} };
  const db = fakeDb(q => ({ data:q.table === "payment_orders" ? order : q.table === "points_lots" ? [] : q.table === "claim_payment_refund" ? { token:"fixture",method:"refund",state:"processing" } : { done:true } }));
  const client = createMoyasarClient({ enabled:true,mode:"test",secretKey:"sk_test_fixture",publishableKey:"pk_test_fixture",webhookSecret:"fixture" },
    ((url,init) => fetch(String(url).replace(MOYASAR_API_BASE,"http://127.0.0.1:4921/moyasar"),init)) as typeof fetch);
  const result = await refundOrderWith({ admin:db.client,gateway:async()=>client,syncTier:async()=>{},notify:async()=>{} },order.id,"admin_fixture",true);
  assert.equal(result.status,status);
  assert.equal(db.log.some(q=>q.table === "finish_payment_refund"),finish);
  assert.equal(db.log.some(q=>q.table === "release_payment_refund"),release);
  console.log(`${id}: HTTP ${status}; grants ${finish ? "reversed":"unchanged"}; claim ${release ? "retryable":"retained"}`);
}
