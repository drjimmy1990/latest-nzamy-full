import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

test('init and search use the canonical principles key rather than the legacy alias', () => {
  const init = source('./init/route.ts');
  const search = source('./search/route.ts');
  for (const route of [init, search]) {
    assert.match(route, /contentType:\s*['"]principles['"]/);
    assert.doesNotMatch(route, /freeItems\(\s*['"]precedents['"]\s*\)/);
  }
});

test('precedent detail evaluates each principle id and preserves its first-N gate', () => {
  const detail = source('./precedents/[slug]/route.ts');
  assert.match(detail, /includeExplicitFreeItem:\s*false/);
  assert.match(detail, /itemId:\s*p\.id as string/);
  assert.match(detail, /const isLocked = !isFree && idx >= freeLimit/);
});

test('the shared helper confines the law whitelist to law items', () => {
  const helper = source('../../../lib/library-item-access.ts');
  assert.match(helper, /contentType === "laws" && whitelistedLawSlugs\.includes\(itemId\)/);
});
