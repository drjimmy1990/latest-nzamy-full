/**
 * seedScriptsGuard.test.ts — owner file 19 (batch l9-secleak): the two
 * test-account seed scripts never write to a live or shared database. They
 * refuse every host that is not local / test AND not named with
 * --confirm-local-host=<host>, before any Supabase client exists — dry-run and
 * --verify included.
 *
 * Two halves: the pure verdict (scripts/lib/seedTargetGuard.mjs) and the real
 * scripts spawned with a live-looking and an unconfirmed local URL: exit 2,
 * the refusal printed, nothing contacted (the hosts are .invalid / an unused
 * local port; the guard runs before createClient).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isLocalSeedHost, seedTargetVerdict } from "../../../scripts/lib/seedTargetGuard.mjs";

const root = join(import.meta.dirname, "..", "..", "..");
const SCRIPTS = ["scripts/seed-clean-test-accounts.mjs", "scripts/seed-test-lawyers.mjs"] as const;

test("local / test hosts only", () => {
  for (const h of ["localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]", "supabase.localhost", "db.nezamy.test", "LOCALHOST."]) {
    assert.equal(isLocalSeedHost(h), true, h);
  }
  for (const h of ["auth.nezamy.sa", "nezamy.sa", "supabase-kong", "10.0.0.5", "192.168.1.10", "localhost.example.com",
                   "test", "my.test.example.com", "abc.supabase.co", "", "0.0.0.0"]) {
    assert.equal(isLocalSeedHost(h), false, h);
  }
});

test("NEGATIVE: a live host is refused even when it is 'confirmed'", () => {
  const v = seedTargetVerdict("https://auth.nezamy.sa", ["--execute", "--confirm-local-host=auth.nezamy.sa"]);
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /not a local\/test host/);
});

test("a local host must still be named explicitly, and exactly", () => {
  assert.equal(seedTargetVerdict("http://localhost:54321", []).ok, false);
  assert.equal(seedTargetVerdict("http://localhost:54321", ["--confirm-local-host=127.0.0.1"]).ok, false);
  assert.equal(seedTargetVerdict("not a url", ["--confirm-local-host=localhost"]).ok, false);
  assert.deepEqual(seedTargetVerdict("http://localhost:54321", ["--confirm-local-host=localhost"]), { ok: true, host: "localhost" });
  assert.deepEqual(seedTargetVerdict("http://[::1]:54321", ["--confirm-local-host=::1"]), { ok: true, host: "::1" });
  assert.deepEqual(seedTargetVerdict("http://kong.nezamy.test:8000", ["--confirm-local-host=KONG.nezamy.test"]), { ok: true, host: "kong.nezamy.test" });
});

test("both scripts call the guard before they create a Supabase client", () => {
  for (const f of SCRIPTS) {
    const src = readFileSync(join(root, f), "utf8");
    assert.match(src, /import \{ refuseUnlessLocalSeedTarget \} from "\.\/lib\/seedTargetGuard\.mjs";/, f);
    const guard = src.indexOf("refuseUnlessLocalSeedTarget(SUPABASE_URL, process.argv.slice(2),");
    const client = src.indexOf("createClient(SUPABASE_URL, SERVICE_KEY");
    assert.ok(guard > -1 && client > guard, `${f}: the guard runs before createClient`);
  }
});

function run(script: string, url: string, args: string[] = []) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    env: {
      PATH: process.env.PATH ?? "",
      SYSTEMROOT: process.env.SYSTEMROOT ?? "",
      NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
      NODE_ENV: "test",
    },
  });
  assert.ifError(res.error);
  return { status: res.status, out: `${res.stdout}\n${res.stderr}` };
}

for (const script of SCRIPTS) {
  test(`${script}: a live-looking host is refused with exit 2 (dry-run, --execute, --verify)`, () => {
    for (const args of [[], ["--execute"], ["--verify"]]) {
      if (script.includes("lawyers") && args[0] === "--verify") continue; // no --verify flag there
      const r = run(script, "https://auth.nezamy-live.invalid", [...args, "--confirm-local-host=auth.nezamy-live.invalid"]);
      assert.equal(r.status, 2, `${args.join(" ")}: ${r.out}`);
      assert.match(r.out, /refusing to run — target host auth\.nezamy-live\.invalid is not a local\/test host/);
      assert.doesNotMatch(r.out, /✓|Created|DRY-RUN\]|VERIFY —/);
    }
  });

  test(`${script}: an unconfirmed local host is refused with exit 2`, () => {
    const r = run(script, "http://localhost:1");
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /--confirm-local-host=localhost/);
  });
}
