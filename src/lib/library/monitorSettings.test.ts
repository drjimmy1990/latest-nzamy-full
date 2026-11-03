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
  parseSettingsPatch,
  settingsFromRow,
} from "./monitorSettings.ts";
import { LIBRARY_READ_QUOTA } from "./readQuota.ts";

const SQL = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261031_10_library_activity_monitor.sql"),
  "utf8",
);

test("every field is a column of the settings table, with the same bounds and default", () => {
  const table = SQL.slice(SQL.indexOf("create table if not exists public.library_monitor_settings"), SQL.indexOf("insert into public.library_monitor_settings"));
  for (const f of MONITOR_SETTINGS_FIELDS) {
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
