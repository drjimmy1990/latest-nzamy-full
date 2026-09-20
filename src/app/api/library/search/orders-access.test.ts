import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isFreeLibraryItem } from '../../../../lib/library-item-access.ts';

test('orders search uses the canonical decrees entitlement key', () => {
  const route = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
  assert.match(route, /results\.orders\s*=\s*orderResults\.map[\s\S]*?isFreeLibraryItem\(\{\s*contentType:\s*'decrees'/);
  assert.doesNotMatch(route, /freeItems\('orders'\)/);
  assert.equal(isFreeLibraryItem({
    contentType: 'decrees', itemId: 'free-order', hasFullAccess: false,
    freeItemsByType: { decrees: ['free-order'], orders: [] }, whitelistedLawSlugs: [],
  }), true);
  assert.equal(isFreeLibraryItem({
    contentType: 'decrees', itemId: 'locked-order', hasFullAccess: false,
    freeItemsByType: { decrees: ['free-order'], orders: ['locked-order'] }, whitelistedLawSlugs: [],
  }), false);
});
