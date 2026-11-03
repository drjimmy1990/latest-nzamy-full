import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAT_ID_MAX,
  DEFAULT_FOLDER_COLOR,
  DEFAULT_FOLDER_ICON,
  ENTITY_ID_MAX,
  FOLDER_ENTITY_TYPES,
  FOLDER_NAME_MAX,
  ITEM_TITLE_MAX,
  TITLE_LOOKUP_MAX_PER_KIND,
  checkFolderItem,
  checkTitleLookup,
  checkFolderName,
  checkFolderPatch,
  folderColorOrDefault,
  folderIconOrDefault,
  isUuid,
  readJsonObject,
} from './validate.ts';

const FOLDER = '3f2dd638-350c-42a1-a5e3-889decb7aa96';
const here = path.dirname(fileURLToPath(import.meta.url));

const req = (body: string) => new Request('http://x/api/library/folders', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });

test('non-JSON, null, array and scalar bodies are rejected', async () => {
  for (const body of ['not json', '{', 'null', '[]', '[{"name":"x"}]', '"x"', '42', '']) {
    assert.equal(await readJsonObject(req(body)), null, body);
  }
  assert.deepEqual(await readJsonObject(req('{"name":"x"}')), { name: 'x' });
});

test('folder name: trimmed, 1–80 characters (Arabic and emoji count once)', () => {
  assert.deepEqual(checkFolderName('  أنظمة العمل  '), { ok: true, value: 'أنظمة العمل' });
  for (const bad of ['', '   ', undefined, null, 42, ['x'], {}]) assert.equal(checkFolderName(bad).ok, false, String(bad));
  assert.equal(checkFolderName('ن'.repeat(FOLDER_NAME_MAX)).ok, true);
  assert.equal(checkFolderName('ن'.repeat(FOLDER_NAME_MAX + 1)).ok, false);
  assert.equal(checkFolderName('📁'.repeat(FOLDER_NAME_MAX)).ok, true);
});

test('colour must be #RRGGBB, icon 1–8 characters; POST falls back to the defaults', () => {
  assert.equal(folderColorOrDefault('#10b981'), '#10b981');
  assert.equal(folderColorOrDefault('#10B98F'), '#10B98F');
  for (const bad of ['red', '#fff', '#10b9811', '10b981', 'url(javascript:alert(1))', '#10b98g', '', null, 7]) {
    assert.equal(folderColorOrDefault(bad), DEFAULT_FOLDER_COLOR, String(bad));
  }
  assert.equal(folderIconOrDefault('📁'), '📁');
  assert.equal(folderIconOrDefault('star'), 'star');
  for (const bad of ['', '   ', 'x'.repeat(9), '<script>x', 5, null]) {
    assert.equal(folderIconOrDefault(bad), DEFAULT_FOLDER_ICON, String(bad));
  }
});

test('ids are UUIDs (a client-made "folder-123" id is a 400, not a database 500)', () => {
  assert.ok(isUuid(FOLDER));
  for (const bad of ['folder-1730000000000', '', '1', `${FOLDER}x`, `'; drop table x;--`, null, 1]) assert.equal(isUuid(bad), false, String(bad));
});

test('a saved item: whitelisted type, bounded id and titles', () => {
  const ok = checkFolderItem({ folderId: FOLDER, entityType: 'law', entityId: ' labor-law ', title: 'نظام العمل', titleEn: 'Labor Law', catId: 'SA-04' });
  assert.deepEqual(ok, { ok: true, value: { folderId: FOLDER, entityType: 'law', entityId: 'labor-law', title: 'نظام العمل', titleEn: 'Labor Law', catId: 'SA-04' } });
  assert.deepEqual([...FOLDER_ENTITY_TYPES], ['law', 'order', 'precedent', 'book']);
  for (const t of FOLDER_ENTITY_TYPES) assert.equal(checkFolderItem({ folderId: FOLDER, entityType: t, entityId: 'x' }).ok, true, t);
  for (const t of ['article', 'principle', 'decree', 'LAW', '', null, ['law']]) {
    assert.equal(checkFolderItem({ folderId: FOLDER, entityType: t, entityId: 'x' }).ok, false, String(t));
  }
  assert.equal(checkFolderItem({ folderId: 'folder-1', entityType: 'law', entityId: 'x' }).ok, false);
  assert.equal(checkFolderItem({ folderId: FOLDER, entityType: 'law', entityId: '  ' }).ok, false);
  assert.equal(checkFolderItem({ folderId: FOLDER, entityType: 'book', entityId: 'ك'.repeat(ENTITY_ID_MAX) }).ok, true);
  assert.equal(checkFolderItem({ folderId: FOLDER, entityType: 'book', entityId: 'ك'.repeat(ENTITY_ID_MAX + 1) }).ok, false);
  assert.equal(checkFolderItem({ folderId: FOLDER, entityType: 'law', entityId: 'x', title: 'ن'.repeat(ITEM_TITLE_MAX + 1) }).ok, false);
  assert.equal(checkFolderItem({ folderId: FOLDER, entityType: 'law', entityId: 'x', titleEn: 'n'.repeat(ITEM_TITLE_MAX + 1) }).ok, false);
  assert.equal(checkFolderItem({ folderId: FOLDER, entityType: 'law', entityId: 'x', title: { x: 1 } }).ok, false);
  // Missing titles become null; an over-long or non-string catId is dropped (display only).
  const bare = checkFolderItem({ folderId: FOLDER, entityType: 'law', entityId: 'x', catId: 'c'.repeat(CAT_ID_MAX + 1) });
  assert.ok(bare.ok && bare.value.title === null && bare.value.titleEn === null && bare.value.catId === null);
});

test('PATCH: each field checked, unknown fields ignored, an empty update is a 400', () => {
  assert.deepEqual(checkFolderPatch({ folderId: FOLDER, name: ' جديد ' }), { ok: true, value: { folderId: FOLDER, updates: { name: 'جديد' } } });
  assert.deepEqual(checkFolderPatch({ folderId: FOLDER, color: '#f43f5e', isPinned: true }), { ok: true, value: { folderId: FOLDER, updates: { color: '#f43f5e', is_pinned: true } } });
  assert.equal(checkFolderPatch({ folderId: FOLDER }).ok, false);
  assert.equal(checkFolderPatch({ folderId: FOLDER, user_id: 'someone-else' }).ok, false, 'user_id is never an updatable field');
  assert.equal(checkFolderPatch({ folderId: FOLDER, name: '' }).ok, false);
  assert.equal(checkFolderPatch({ folderId: FOLDER, name: 'n'.repeat(81) }).ok, false);
  assert.equal(checkFolderPatch({ folderId: FOLDER, color: 'red' }).ok, false);
  assert.equal(checkFolderPatch({ folderId: FOLDER, icon: 'x'.repeat(9) }).ok, false);
  assert.equal(checkFolderPatch({ folderId: FOLDER, isPinned: 'yes' }).ok, false);
  assert.equal(checkFolderPatch({ folderId: 'folder-1', name: 'x' }).ok, false);
});

test('both folder routes use these checks and keep the auth-unavailable branch', () => {
  const folders = readFileSync(path.join(here, 'route.ts'), 'utf8');
  const items = readFileSync(path.join(here, 'items', 'route.ts'), 'utf8');
  for (const src of [folders, items]) {
    assert.ok(!src.includes('await request.json()'), 'bodies go through readJsonObject');
    assert.match(src, /isAuthUnavailable\(user, authError\)\) return authUnavailableResponse\(\)/);
    // Writes are service-role, so every one is pinned to the signed-in user.
    assert.match(src, /\.eq\('user_id', user\.id\)/);
  }
  assert.match(folders, /checkFolderName\(body\.name\)/);
  assert.match(folders, /checkFolderPatch\(body\)/);
  assert.match(folders, /isUuid\(itemId\)/);
  assert.match(items, /checkFolderItem\(body\)/);
  assert.equal((folders.match(/isAuthUnavailable\(user, authError\)/g) ?? []).length, 4, 'GET, POST, PATCH, DELETE');
});

test('title lookup (owner note ٠٣ §٢.٢): ids per table, deduped, uuids only for orders, capped at 100', () => {
  const ok = checkTitleLookup({ laws: [' labor-law ', 'labor-law', ''], orders: [FOLDER, 'not-a-uuid'], books: ['الروض المربع'] });
  assert.deepEqual(ok, { ok: true, value: { laws: ['labor-law'], orders: [FOLDER], precedents: [], books: ['الروض المربع'] } });
  assert.equal(checkTitleLookup({}).ok, false, 'nothing to look up');
  assert.equal(checkTitleLookup({ orders: ['x'] }).ok, false, 'a malformed uuid is dropped, never sent to .in()');
  assert.equal(checkTitleLookup({ laws: 'labor-law' }).ok, false);
  assert.equal(checkTitleLookup({ laws: [1] }).ok, false);
  assert.equal(checkTitleLookup({ laws: Array.from({ length: TITLE_LOOKUP_MAX_PER_KIND + 1 }, (_, i) => `l${i}`) }).ok, false);
  assert.equal(checkTitleLookup({ laws: Array.from({ length: TITLE_LOOKUP_MAX_PER_KIND }, (_, i) => `l${i}`) }).ok, true);
  assert.ok(TITLE_LOOKUP_MAX_PER_KIND < 396, 'under the PostgREST .in() ceiling');
});

test('titles route: gated, validated, request client only (no service role, no locked column)', () => {
  const src = readFileSync(path.join(here, 'titles', 'route.ts'), 'utf8');
  assert.match(src, /const gate = await libraryGate\(\);\s*if \(gate\) return gate;/);
  assert.match(src, /checkTitleLookup\(body\)/);
  assert.ok(!src.includes('createServiceClient'), 'titles are anon-readable; the service role is not needed');
  assert.match(src, /\.select\(`\$\{idColumn\}, title`\)/);
  for (const locked of ['issue_date', 'latest_update', 'summary_brief', 'official_url', 'issuing_instrument']) {
    assert.ok(!src.includes(locked), `never reads ${locked}`);
  }
});