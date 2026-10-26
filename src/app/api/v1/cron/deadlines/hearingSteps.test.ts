/**
 * Source pins for the scheduler's hearing steps (P4 N3.2). The route cannot
 * load under node --test (Next server imports), so this reads its source.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

test("the deadline DELIVER query reads deadline rows only, so hearing rows cannot starve it", () => {
  const deliver = src.slice(src.indexOf("// ── (b) DELIVER"), src.indexOf("// ── (b2) HEARINGS"));
  assert.match(deliver, /\.not\("deadline_id", "is", null\)/);
});

test("hearings are queued, then delivered, in the same run and before the purge", () => {
  const q = src.indexOf("await queueHearingReminders(admin");
  const d = src.indexOf("await deliverHearingReminders(admin");
  const purge = src.indexOf("// ── (c) PURGE");
  assert.ok(q > 0 && d > q && purge > d, "queue → deliver → purge");
});

test("hearing delivery runs only after a queue step that re-checked the recipients", () => {
  assert.match(src, /const hearingDelivery = hearingQueue\.recipientsChecked\s*\?\s*await deliverHearingReminders\(admin/);
});

test("the run still fails closed on the cron secret", () => {
  assert.match(src, /if \(!cronSecretMatches\(request\.headers\.get\("x-cron-secret"\), process\.env\.CRON_SECRET\)\)/);
});
