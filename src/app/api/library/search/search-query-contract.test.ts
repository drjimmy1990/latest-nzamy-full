import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

test('search route sends the strict parser tsquery through raw PostgREST fts', () => {
  assert.match(routeSource, /const ftsQuery = parsed\.tsquery/);
  assert.doesNotMatch(routeSource, /const ftsQuery = parsed\.raw/);
  assert.doesNotMatch(routeSource, /textSearch\([^\n]+type:\s*['"]plain['"]/);

  const calls = routeSource.match(/\.textSearch\('fts', ftsQuery, \{ config: LIBRARY_FTS_CONFIG \}\)/g) ?? [];
  assert.equal(calls.length, 4, 'laws, precedents, orders and feqh must use the same tsquery transport');
});

test('search route reports malformed operator syntax as a client error', () => {
  assert.match(routeSource, /error instanceof SearchQuerySyntaxError/);
  assert.match(routeSource, /code: error\.code/);
  assert.match(routeSource, /index: error\.index/);
  assert.match(routeSource, /\{ status: 400 \}/);
});
