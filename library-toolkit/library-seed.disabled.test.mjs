/** The historic shell-interpolating shortcut must never start a seeder. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, "library-seed.mjs");

test("library:seed wrapper has no shell or child-process escape", () => {
  const source = fs.readFileSync(wrapper, "utf8");
  assert.doesNotMatch(source, /from\s+["']node:child_process["']|execSync\(|spawnSync\(/);
  for (const args of [[], ["--dry-run"], ["--apply-live"], ["--type", "laws;unexpected-command"]]) {
    const result = spawnSync(process.execPath, [wrapper, ...args], {
      encoding: "utf8",
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: "test-only" },
      timeout: 5000,
      shell: false,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /library:seed is disabled/);
    assert.doesNotMatch(result.stdout, /Seeder:|LIVE INSERT|Seed Summary/);
  }
});
