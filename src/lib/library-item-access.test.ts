import assert from 'node:assert/strict';
import test from 'node:test';
import { isExplicitlyFreeLibraryItem, isFreeLibraryItem } from './library-item-access.ts';

const freeItemsByType = {
  principles: ['principle-free'],
  precedents: ['legacy-principle'],
  laws: ['law-free'],
};

test('the canonical principles list unlocks only the matching principle id', () => {
  assert.equal(isFreeLibraryItem({
    contentType: 'principles',
    itemId: 'principle-free',
    hasFullAccess: false,
    freeItemsByType,
    whitelistedLawSlugs: [],
  }), true);
  assert.equal(isFreeLibraryItem({
    contentType: 'principles',
    itemId: 'principle-locked',
    hasFullAccess: false,
    freeItemsByType,
    whitelistedLawSlugs: [],
  }), false);
});

test('the unproven precedents alias never unlocks a principle', () => {
  assert.equal(isExplicitlyFreeLibraryItem({
    contentType: 'principles',
    itemId: 'legacy-principle',
    freeItemsByType,
    whitelistedLawSlugs: [],
  }), false);
});

test('Pro access remains open independently of the explicit free list', () => {
  assert.equal(isFreeLibraryItem({
    contentType: 'principles',
    itemId: 'principle-locked',
    hasFullAccess: true,
    freeItemsByType,
    whitelistedLawSlugs: [],
  }), true);
});

test('a law whitelist collision cannot unlock a principle', () => {
  const collision = 'same-id';
  assert.equal(isExplicitlyFreeLibraryItem({
    contentType: 'principles',
    itemId: collision,
    freeItemsByType: { principles: [] },
    whitelistedLawSlugs: [collision],
  }), false);
  assert.equal(isExplicitlyFreeLibraryItem({
    contentType: 'laws',
    itemId: collision,
    freeItemsByType: { laws: [] },
    whitelistedLawSlugs: [collision],
  }), true);
});
