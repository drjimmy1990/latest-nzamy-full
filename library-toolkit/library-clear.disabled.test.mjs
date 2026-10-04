import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'library-clear.mjs');

for (const args of [[], ['--live'], ['--live', '--force-prod', '--type', 'user']]) {
  test(`library clear refuses ${args.join(' ') || 'dry'} before target or credentials`, () => {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SUPABASE_URL: 'https://example.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-credential',
        ALLOW_PROD_CLEAR: '1',
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /disabled in this developer test package/);
    assert.doesNotMatch(result.stdout + result.stderr, /LIVE\)|Library Clear|Confirm|delete\(/);
  });
}
