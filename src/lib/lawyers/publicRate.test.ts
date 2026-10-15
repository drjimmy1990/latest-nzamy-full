import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { withholdHiddenRate } from "./publicRate.ts";

test("the rate is public only when the lawyer turned the switch on", () => {
  const shown: Record<string, unknown> = { hourly_rate: 500, show_hourly_rate: true };
  withholdHiddenRate(shown);
  assert.deepEqual(shown, { hourly_rate: 500 });

  for (const flag of [false, null, undefined, "true", 1]) {
    const lp: Record<string, unknown> = { hourly_rate: 500, show_hourly_rate: flag };
    withholdHiddenRate(lp);
    assert.equal(lp.hourly_rate, null, `flag ${String(flag)}`);
    assert.equal("show_hourly_rate" in lp, false);
  }
});

test("a row read before the migration (no flag) keeps the rate hidden; null rows are ignored", () => {
  const old: Record<string, unknown> = { hourly_rate: 300, slug: "x" };
  withholdHiddenRate(old);
  assert.deepEqual(old, { hourly_rate: null, slug: "x" });
  withholdHiddenRate(null);
  withholdHiddenRate(undefined);
});

test("both public lawyer routes project the flag and apply the rule; price sort lists shown rates only", () => {
  const list = readFileSync(new URL("../../app/api/v1/lawyers/route.ts", import.meta.url), "utf8");
  const one = readFileSync(new URL("../../app/api/v1/lawyers/[id]/route.ts", import.meta.url), "utf8");
  for (const src of [list, one]) {
    assert.match(src, /import \{ withholdHiddenRate \} from "@\/lib\/lawyers\/publicRate";/);
    assert.match(src, /hourly_rate, show_hourly_rate, /);
    assert.match(src, /withholdHiddenRate\(lp\);/);
  }
  assert.match(list, /case "price":(?:\s*\/\/[^\n]*)*\s*query = query\s*\.eq\("lawyer_profiles\.show_hourly_rate", true\)/);
});
