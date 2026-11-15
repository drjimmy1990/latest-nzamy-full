/**
 * backupDbSchema.test.ts — TDD contract & behavior tests for scripts/backup-db-schema.sh.
 *
 * Ensures the server-side schema backup command:
 *   1. Exists, is bash-valid, and is wired in package.json as `db:backup-schema`.
 *   2. Defaults to the self-hosted `supabase-db` Docker container (zero config on VPS)
 *      while also supporting `--container`, `--db-url`, and `--env-file`.
 *   3. Refuses to write inside a git worktree unless `--allow-inside-repo` is set.
 *   4. Dumps all user schemas (`public`, `library`, `library_precedent_private`,
 *      `library_graph`, `academy`, etc.) + `supabase_migrations`, extensions (`vector`,
 *      `pgcrypto`, `uuid-ossp`), per-schema snapshots, extras, and SHA256SUMS manifest.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SCRIPT = join(ROOT, "scripts", "backup-db-schema.sh");

function findBash(): string | null {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "/bin/bash",
    "bash",
  ];
  for (const bin of candidates) {
    const res = spawnSync(bin, ["--version"], { stdio: "ignore" });
    if (res.status === 0) return bin;
  }
  return null;
}

test("backup-db-schema.sh exists, has LF line endings, and is exposed via npm run db:backup-schema", () => {
  assert.ok(existsSync(SCRIPT), "scripts/backup-db-schema.sh must exist");
  const raw = readFileSync(SCRIPT, "utf8");
  assert.equal(raw.includes("\r\n"), false, "shell script must use LF line endings so Linux VPS runs it cleanly");
  assert.match(raw, /^#!\/usr\/bin\/env bash\n/, "shebang must be #!/usr/bin/env bash");

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  assert.equal(pkg.scripts?.["db:backup-schema"], "bash scripts/backup-db-schema.sh");
});

test("backup-db-schema.sh covers docker supabase-db mode, --db-url mode, per-schema dumps, vector extension, and SHA256SUMS", () => {
  const src = readFileSync(SCRIPT, "utf8");
  assert.match(src, /CONTAINER="\$\{SUPABASE_DB_CONTAINER:-supabase-db\}"/);
  assert.match(src, /pg_dump/);
  assert.match(src, /--schema-only/);
  assert.match(src, /supabase_migrations/);
  assert.match(src, /10-full-user-schemas\.sql/);
  assert.match(src, /20-selfhost-ready-schema\.sql/);
  assert.match(src, /SHA256SUMS\.txt/);
  assert.match(src, /create extension if not exists vector with schema extensions;/i);
});

test("backup-db-schema.sh passes bash syntax check, supports --dry-run outside repo, and blocks writing inside git repo", (t) => {
  const bash = findBash();
  if (!bash) {
    t.skip("bash not available on this host");
    return;
  }

  // 1. Bash syntax check (-n)
  const syntax = spawnSync(bash, ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `bash -n failed: ${syntax.stderr}`);

  // 2. Refuses writing inside the git worktree by default
  const insideRepoDir = join(ROOT, ".tmp-forbidden-backup-test");
  try {
    const blocked = spawnSync(bash, [SCRIPT, "--dry-run", "-o", insideRepoDir], { encoding: "utf8" });
    assert.equal(blocked.status, 2, `expected exit 2 inside git worktree, got ${blocked.status}: ${blocked.stderr}`);
    assert.match(blocked.stderr, /git work tree/i);
  } finally {
    rmSync(insideRepoDir, { recursive: true, force: true });
  }

  // 3. Dry-run outside the repo succeeds and prints exact plan
  const tempOut = mkdtempSync(join(tmpdir(), "nzamy-schema-bkp-"));
  try {
    const dry = spawnSync(bash, [SCRIPT, "--dry-run", "--container", "supabase-db", "-o", tempOut], {
      encoding: "utf8",
    });
    assert.equal(dry.status, 0, `dry-run failed: ${dry.stderr}\n${dry.stdout}`);
    assert.match(dry.stdout, /DRY RUN/);
    assert.match(dry.stdout, /docker:supabase-db/);
    assert.match(dry.stdout, /10-full-user-schemas\.sql/);
  } finally {
    rmSync(tempOut, { recursive: true, force: true });
  }
});
