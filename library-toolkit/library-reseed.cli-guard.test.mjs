/** Offline regression: legacy reseed/wipe may not reach a DB subprocess. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertFreshExternalOutput, protectedPackageRoot } from "./safe-output-path.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const reseed = path.join(here, "library-reseed.mjs");
const parser = path.join(here, "library-parse.mjs");

function invoke(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: "test-only" },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.error, undefined);
  return result;
}

test("historic --wipe alias is refused before any child step", () => {
  const result = invoke(reseed, ["--wipe", "--input", root]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /محظوران/);
  assert.doesNotMatch(result.stdout, /── (?:parse|dry seed)/);
});

test("all live/clean flags are refused before parse or seed", () => {
  for (const flag of ["--force-prod", "--apply-live", "--clean", "--allow-clean"]) {
    const result = invoke(reseed, ["--input", root, "--output", path.join(root, "never-create"), flag]);
    assert.equal(result.status, 2, flag);
    assert.match(result.stderr, /محظوران/, flag);
    assert.doesNotMatch(result.stdout, /── (?:parse|dry seed)/, flag);
  }
});

test("normal invocation requires a fresh external output", () => {
  assert.equal(invoke(reseed, ["--input", root]).status, 2);
  assert.equal(invoke(reseed, ["--input", root, "--output", path.join(root, "existing-or-contained")]).status, 2);
});

test("parse and reseed reject a relative output before creating anything", () => {
  for (const script of [parser, reseed]) {
    const result = invoke(script, ["--input", root, "--output", "../relative-output-must-not-be-created"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--output must be an absolute path/);
  }
});

test("an unpacked ZIP rejects parse and reseed outputs anywhere under its root", (t) => {
  const packageRoot = protectedPackageRoot(root);
  if (packageRoot === root) return t.skip("standalone web source has no sibling bundle manifest");
  for (const output of [
    path.join(packageRoot, "never-create-root"),
    path.join(packageRoot, "corpus", "never-create-corpus"),
  ]) {
    assert.throws(() => assertFreshExternalOutput(output, [packageRoot, root]), /overlaps protected root/);
    for (const script of [reseed, parser]) {
      const result = invoke(script, ["--input", root, "--output", output]);
      assert.equal(result.status, 2, script);
      assert.match(result.stderr, /overlaps protected root/);
    }
    assert.equal(fs.existsSync(output), false);
  }
});

test("direct parse refuses implicit legacy output", () => {
  const result = invoke(parser, ["--input", root]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--output/);
});

test("symlinked external-looking output cannot write back into the repo", (t) => {
  // Private, tiny fixture outside the project. It is intentionally retained
  // rather than deleting any file under the project's no-delete policy.
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-reseed-symlink-"));
  const link = path.join(fixture, "looks-external");
  try { fs.symlinkSync(root, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(`symlink unavailable: ${error.code}`);
    throw error;
  }
  const prospectiveOutput = path.join(link, "never-create");
  for (const script of [reseed, parser]) {
    const result = invoke(script, ["--input", root, "--output", prospectiveOutput]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /realpath/);
  }
  assert.equal(fs.existsSync(path.join(root, "never-create")), false);
  t.diagnostic(`retained tiny fixture: ${fixture}`);
});
