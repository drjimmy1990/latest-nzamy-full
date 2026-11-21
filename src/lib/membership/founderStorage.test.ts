/**
 * N21 (batch l12, 20261202_80): founder storage fair use — the pure rule, the
 * admin write check, the SQL seed, and the cron's wiring. The SQL half is
 * proven by supabase/tests/rls/l12_firm_badge_storage.test.sql (F1–F3).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FOUNDER_STORAGE,
  capBytes,
  founderStorageIssue,
  founderStorageNoticeAr,
  foundersToAlert,
  parseFounderStorage,
  riyadhMonth,
} from "./founderStorage.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
const GB = 1024 ** 3;

test("N21: 25 GB with an alert at 80 %; anything malformed reads as that", () => {
  assert.deepEqual(DEFAULT_FOUNDER_STORAGE, { gb: 25, alertPct: 80 });
  assert.deepEqual(parseFounderStorage(null), { gb: 25, alertPct: 80 });
  assert.deepEqual(parseFounderStorage({ gb: "25", alert_pct: 0 }), { gb: 25, alertPct: 80 });
  assert.deepEqual(parseFounderStorage({ gb: 40, alert_pct: 90 }), { gb: 40, alertPct: 90 });
  assert.equal(capBytes(DEFAULT_FOUNDER_STORAGE), 25 * GB);
  const sql = repo("supabase/migrations/20261202_80_l12_firm_roles_log_badge_storage.sql");
  assert.ok(sql.includes(`('founder_storage_fair_use', '{"gb": 25, "alert_pct": 80}'::jsonb,`));
});

test("N21: who is alerted — at or over the line, never under it, never a zero", () => {
  const out = foundersToAlert(
    [
      { userId: "a", usedBytes: 20 * GB },
      { userId: "b", usedBytes: 19.9 * GB },
      { userId: "c", usedBytes: 30 * GB },
      { userId: "d", usedBytes: 0 },
      { userId: "e", usedBytes: Number.NaN },
    ],
    DEFAULT_FOUNDER_STORAGE,
  );
  assert.deepEqual(out.map((r) => [r.userId, r.pct]), [["a", 80], ["c", 120]]);
});

test("N21: the admin write check", () => {
  assert.equal(founderStorageIssue({ gb: 25, alert_pct: 80 }), null);
  for (const bad of [null, { gb: 25 }, { gb: 0, alert_pct: 80 }, { gb: 25, alert_pct: 101 }, { gb: 2.5, alert_pct: 80 }, { gb: 25, alert_pct: 80, x: 1 }]) {
    assert.ok(founderStorageIssue(bad), JSON.stringify(bad));
  }
  const route = repo("src/app/api/v1/admin/settings/route.ts");
  assert.match(route, /  "founder_storage_fair_use",\n/);
  assert.match(route, /  founder_storage_fair_use: founderStorageIssue,\n/);
});

test("N21: the notice blocks nothing and promises no number beyond the fair-use line; one per Riyadh month", () => {
  const n = founderStorageNoticeAr(21 * GB, DEFAULT_FOUNDER_STORAGE, 84);
  assert.match(n.body, /لم يُوقف شيء/);
  assert.match(n.body, /٨٤٪/);
  assert.match(n.body, /٢٥ جيجابايت/);
  assert.equal(riyadhMonth(new Date("2026-11-30T22:30:00Z")), "2026-12");
  assert.equal(riyadhMonth(new Date("2026-11-30T20:00:00Z")), "2026-11");
  const cron = repo("src/app/api/v1/cron/founder-storage/route.ts");
  assert.match(cron, /cronSecretMatches\(request\.headers\.get\("x-cron-secret"\), process\.env\.CRON_SECRET\)/);
  assert.match(cron, /onConflict: "user_id,period", ignoreDuplicates: true/);
  assert.ok(cron.indexOf("ignoreDuplicates") < cron.indexOf("recordNotification({"), "the marker is written before the notice");
  assert.ok(!/\.from\("storage|block|suspend/i.test(cron.replace(/blocked here/, "")), "the cron never blocks anything");
});
