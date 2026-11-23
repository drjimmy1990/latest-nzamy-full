/**
 * toolPointsView.test.ts — «المتاح لهذه العملية» beside a paid tool's price
 * (owner ١٦٥, batch l13): the server's figure only, never a guess.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/points/toolPointsView.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseToolPointsAnswer, toolPointsView } from "./toolPointsView.ts";

test("parseToolPointsAnswer: charged with a whole count, or not charged; anything else is null", () => {
  assert.deepEqual(parseToolPointsAnswer({ short: false, charged: true, available: 120 }), { charged: true, available: 120 });
  assert.deepEqual(parseToolPointsAnswer({ short: true, balance: 40, price: 200, charged: true, available: 40 }), { charged: true, available: 40 });
  assert.deepEqual(parseToolPointsAnswer({ short: false, charged: false, available: null }), { charged: false, available: null });
  for (const body of [
    null, "x", [], { short: false }, // the old answer, or one the route could not complete
    { charged: true, available: null }, // an unread figure is not 0
    { charged: true, available: -1 }, { charged: true, available: 1.5 }, { charged: true, available: "120" },
    { charged: "true", available: 120 },
    { error: "سجّل الدخول لاستخدام أدوات الذكاء الاصطناعي" },
  ]) {
    assert.equal(parseToolPointsAnswer(body), null, JSON.stringify(body));
  }
});

test("toolPointsView: the figure beside the price, «لا يكفي» below it", () => {
  assert.deepEqual(toolPointsView({ charged: true, available: 1500 }, 200), { text: "المتاح لهذه العملية: ١٬٥٠٠ نقطة", tone: "ok", short: false });
  assert.deepEqual(toolPointsView({ charged: true, available: 200 }, 200), { text: "المتاح لهذه العملية: ٢٠٠ نقطة", tone: "ok", short: false }, "exactly the price is enough");
  assert.deepEqual(toolPointsView({ charged: true, available: 5 }, 75), { text: "المتاح لهذه العملية: ٥ نقاط — لا يكفي", tone: "short", short: true });
  assert.deepEqual(toolPointsView({ charged: true, available: 0 }, 75), { text: "المتاح لهذه العملية: ٠ نقطة — لا يكفي", tone: "short", short: true });
  // no price known (an admin-set price that could not be read): the figure without a verdict
  assert.deepEqual(toolPointsView({ charged: true, available: 0 }, null), { text: "المتاح لهذه العملية: ٠ نقطة", tone: "ok", short: false });
});

test("toolPointsView: nothing charged says so; no answer shows nothing", () => {
  assert.deepEqual(toolPointsView({ charged: false, available: null }, 200), { text: "لا تُخصم نقاط من رصيدك لهذه العملية حالياً", tone: "free", short: false });
  assert.equal(toolPointsView(null, 200), null);
  assert.equal(toolPointsView({ charged: true, available: null }, 200), null);
});
