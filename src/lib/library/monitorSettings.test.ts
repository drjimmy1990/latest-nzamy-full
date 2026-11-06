/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/monitorSettings.test.ts
 *
 * The bounds below are pinned against the migration's CHECK constraints by
 * reading the SQL file, so the form, the route and the table cannot drift.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MONITOR_SETTINGS_DEFAULTS,
  MONITOR_SETTINGS_FIELDS,
  MONITOR_SETTINGS_SELECT,
  MONITOR_SETTINGS_SELECT_V1,
  parseSettingsPatch,
  settingsFromRow,
} from "./monitorSettings.ts";
import { LIBRARY_READ_QUOTA } from "./readQuota.ts";

const SQL = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261031_10_library_activity_monitor.sql"),
  "utf8",
);
const SQL_AUTO_LOCK = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261103_10_library_auto_lock_hours.sql"),
  "utf8",
);

test("every field is a column of the settings table, with the same bounds and default", () => {
  const table = SQL.slice(SQL.indexOf("create table if not exists public.library_monitor_settings"), SQL.indexOf("insert into public.library_monitor_settings"));
  for (const f of MONITOR_SETTINGS_FIELDS) {
    if (f.column === "auto_lock_hours") continue; // added by 20261103_10 — its own test below
    const line = table.split("\n").find((l) => l.trim().startsWith(`${f.column} `));
    assert.ok(line, `${f.column} is not a column`);
    const def = MONITOR_SETTINGS_DEFAULTS[f.key];
    if (f.type === "int") {
      assert.match(line, new RegExp(`check \\(${f.column} between ${f.min} and ${f.max}\\)`), f.column);
      assert.match(line, new RegExp(`default ${def}\\b`), `${f.column} default`);
    } else if (f.type === "bool") {
      assert.match(line, new RegExp(`default ${def}\\b`), `${f.column} default`);
    } else {
      assert.match(line, new RegExp(`default '${def}'`), `${f.column} default`);
    }
  }
});

test("auto_lock_hours (owner q362, 20261103_10): a «الحدود» field with the migration's bounds and default 24", () => {
  const f = MONITOR_SETTINGS_FIELDS.find((x) => x.key === "autoLockHours");
  assert.ok(f && f.type === "int", "autoLockHours is an int field");
  assert.equal(f.column, "auto_lock_hours");
  assert.equal(f.group, "caps");
  assert.equal(f.min, 0);
  assert.equal(f.max, 720);
  assert.match(f.labelAr, /٠ = حتى يرفعه المسؤول/);
  assert.equal(MONITOR_SETTINGS_DEFAULTS.autoLockHours, 24);
  assert.match(SQL_AUTO_LOCK, /add column if not exists auto_lock_hours int not null default 24;/);
  assert.match(SQL_AUTO_LOCK, /check \(auto_lock_hours between 0 and 720\)/);
});

test("auto_lock_hours: the patch bounds, and a row without the column reads 24", () => {
  assert.equal(parseSettingsPatch({ autoLockHours: 721 }).ok, false);
  assert.equal(parseSettingsPatch({ autoLockHours: -1 }).ok, false);
  const zero = parseSettingsPatch({ autoLockHours: 0 });
  assert.equal(zero.ok, true);
  if (zero.ok) assert.equal(zero.columns.auto_lock_hours, 0);
  assert.equal(settingsFromRow({}).autoLockHours, 24);
  assert.equal(settingsFromRow({ auto_lock_hours: 48 }).autoLockHours, 48);
});

test("MONITOR_SETTINGS_SELECT_V1 is the select before 20261103_10 (no auto_lock_hours); the full select names it", () => {
  assert.ok(!MONITOR_SETTINGS_SELECT_V1.split(", ").includes("auto_lock_hours"));
  assert.ok(MONITOR_SETTINGS_SELECT.split(", ").includes("auto_lock_hours"));
  assert.deepEqual(
    MONITOR_SETTINGS_SELECT.split(", ").filter((c) => c !== "auto_lock_hours"),
    MONITOR_SETTINGS_SELECT_V1.split(", "),
  );
});

test("the settings route reads before 20261103_10 too: GET and PUT fall back to the V1 select on the missing column", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "..", "app", "api", "v1", "admin", "library-monitor", "settings", "route.ts"),
    "utf8",
  );
  const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function PUT"));
  assert.ok(get.includes("readSettingsRow(") || get.includes("isMissingColumnError"), "GET reads through the tolerant helper");
  assert.ok(src.includes('isMissingColumnError(') && src.includes('"auto_lock_hours"'));
  assert.ok(src.includes("MONITOR_SETTINGS_SELECT_V1"));
  assert.ok(src.includes("autoLockMigrationMissing"));
  assert.ok(src.includes("شغّل ملف الترحيل 20261103_10_library_auto_lock_hours.sql أولاً"));
});

test("the seeded caps are the old constants, so the deploy changes nothing a reader sees", () => {
  assert.equal(MONITOR_SETTINGS_DEFAULTS.dailyDocs, LIBRARY_READ_QUOTA.dailyDocs);
  assert.equal(MONITOR_SETTINGS_DEFAULTS.memberDailyDocs, LIBRARY_READ_QUOTA.memberDailyDocs);
  assert.equal(MONITOR_SETTINGS_DEFAULTS.hourlyDocs, LIBRARY_READ_QUOTA.hourlyDocs);
  assert.equal(MONITOR_SETTINGS_DEFAULTS.lockAfterRefused, LIBRARY_READ_QUOTA.lockAfterRefused);
  assert.equal(MONITOR_SETTINGS_DEFAULTS.flagAction, "notify");
});

test("a row maps to settings; an odd or missing column keeps its default", () => {
  const s = settingsFromRow({ daily_docs: 300, rule_night_on: true, flag_action: "slow", hourly_docs: "x", rule_near_cap_pct: 1.5 });
  assert.equal(s.dailyDocs, 300);
  assert.equal(s.ruleNightOn, true);
  assert.equal(s.flagAction, "slow");
  assert.equal(s.hourlyDocs, 120);
  assert.equal(s.ruleNearCapPct, 80);
  assert.deepEqual(settingsFromRow(null), { ...MONITOR_SETTINGS_DEFAULTS });
});

test("a patch: known fields only, typed, inside the bounds", () => {
  const ok = parseSettingsPatch({ dailyDocs: 250, ruleNightOn: true, flagAction: "lock", slowHours: "12" });
  assert.deepEqual(ok, {
    ok: true,
    columns: { daily_docs: 250, rule_night_on: true, flag_action: "lock", slow_hours: 12 },
    changed: ["dailyDocs", "ruleNightOn", "flagAction", "slowHours"],
  });
  assert.equal(parseSettingsPatch({ dailyDocs: 0 }).ok, false);
  assert.equal(parseSettingsPatch({ dailyDocs: 100001 }).ok, false);
  assert.equal(parseSettingsPatch({ dailyDocs: 2.5 }).ok, false);
  assert.equal(parseSettingsPatch({ lockAfterRefused: 0 }).ok, true);
  assert.equal(parseSettingsPatch({ ruleNightOn: "yes" }).ok, false);
  assert.equal(parseSettingsPatch({ flagAction: "ban" }).ok, false);
  assert.equal(parseSettingsPatch({ updated_by: "x" }).ok, false);
  assert.equal(parseSettingsPatch({}).ok, false);
  assert.equal(parseSettingsPatch([]).ok, false);
  const bad = parseSettingsPatch({ ruleNearCapPct: 5 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /بين 10 و100/);
});
