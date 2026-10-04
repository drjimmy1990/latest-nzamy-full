import { test } from "node:test";
import assert from "node:assert/strict";
import { liveWriteDecision, parseSeedOwnerArgs, type SeedOwnerOptions } from "./seedOwnerArgs.ts";

const HOST = "auth.nezamy.sa";

function opts(argv: string[]): SeedOwnerOptions {
  const r = parseSeedOwnerArgs(argv);
  if (!r.ok) assert.fail(r.error);
  return r.options;
}

test("the 2026-10-04 accident: --help is help, never a run", () => {
  const r = parseSeedOwnerArgs(["--help"]);
  assert.equal(r.ok && r.options.help, true);
});

test("unknown flags and typos are errors, not a live run", () => {
  for (const bad of [["--dry-run", "--rows", "x"], ["--rows", "x", "--aply"], ["--rows", "x", "--confirm"], ["--wipe"]]) {
    const r = parseSeedOwnerArgs(bad);
    assert.equal(r.ok, false, bad.join(" "));
  }
});

test("npm without `--` hands the script bare values: rejected", () => {
  // `npm run library:seed:owner --dry --rows /tmp/rows` → argv ["/tmp/rows"]
  const r = parseSeedOwnerArgs(["/tmp/rows"]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /npm/);
});

test("bare run without --rows is an error (no silent package pick)", () => {
  assert.equal(parseSeedOwnerArgs([]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--dry"]).ok, false);
});

test("--rows alone is a DRY run", () => {
  const o = opts(["--rows", "/r"]);
  assert.deepEqual(liveWriteDecision(o, HOST), { live: false });
});

test("--apply needs a matching --confirm-host", () => {
  const noHost = liveWriteDecision(opts(["--rows", "/r", "--apply"]), HOST);
  assert.equal(noHost.live, false);
  assert.ok((noHost as { error?: string }).error);

  const wrong = liveWriteDecision(opts(["--rows", "/r", "--apply", "--confirm-host", "auth.example.com"]), HOST);
  assert.equal(wrong.live, false);
  assert.ok((wrong as { error?: string }).error);

  assert.deepEqual(liveWriteDecision(opts(["--rows", "/r", "--apply", "--confirm-host", "AUTH.nezamy.sa "]), HOST), { live: true });
});

test("conflicting or half-given options are errors", () => {
  assert.equal(parseSeedOwnerArgs(["--rows", "/r", "--dry", "--apply"]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--rows", "/r", "--confirm-host", HOST]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--rows", "/r", "--table", "laws", "--from", "chapters"]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--rows"]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--rows", "--apply"]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--rows", "/a", "--rows", "/b"]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--rows", "/r", "--limit", "0"]).ok, false);
  assert.equal(parseSeedOwnerArgs(["--rows", "/r", "--limit", "2.5"]).ok, false);
});

test("table, from, limit, allow-cloud parse", () => {
  const o = opts(["--rows", "/r", "--table", "laws", "--limit", "50", "--allow-cloud"]);
  assert.equal(o.table, "laws");
  assert.equal(o.limit, 50);
  assert.equal(o.allowCloud, true);
});
