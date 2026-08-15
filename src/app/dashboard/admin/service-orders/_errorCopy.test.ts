/**
 * _errorCopy.test.ts — proves deliver()'s catch never surfaces raw,
 * untranslated English/technical text to the admin (review finding
 * IMPORTANT 3: the project's error copy must be Arabic everywhere).
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import { uploadErrorMessage } from './_errorCopy.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

const GENERIC = 'تعذّر رفع الملف. حاول مرة أخرى.';

// ── Causes actually traced from uploadDocumentFile() ────────────────────────

test('the demo-mode sentinel falls back to the generic Arabic message', () => {
  assert.equal(uploadErrorMessage(new Error('upload_unavailable_demo')), GENERIC);
});

test('a dropped-session "Unauthorized" falls back', () => {
  assert.equal(uploadErrorMessage(new Error('Unauthorized')), GENERIC);
});

test('a raw Supabase Storage error string falls back', () => {
  assert.equal(uploadErrorMessage(new Error('The resource already exists')), GENERIC);
});

test('apiMutate\'s generic "API error: <status>" fallback falls back', () => {
  assert.equal(uploadErrorMessage(new Error('API error: 500')), GENERIC);
});

// ── Already-correct Arabic bodies must survive untouched ────────────────────

test('an already-Arabic API error body passes through unchanged', () => {
  assert.equal(uploadErrorMessage(new Error('غير مصرح')), 'غير مصرح');
});

test('a mixed Arabic/Latin message (e.g. containing a filename) still passes through', () => {
  const msg = 'تعذّر ربط المستند report.docx بالطلب';
  assert.equal(uploadErrorMessage(new Error(msg)), msg);
});

// ── Defensive edge cases ─────────────────────────────────────────────────────

test('a non-Error throw falls back rather than rendering blank/undefined', () => {
  assert.equal(uploadErrorMessage('some string'), GENERIC);
  assert.equal(uploadErrorMessage(undefined), GENERIC);
  assert.equal(uploadErrorMessage(null), GENERIC);
});

test('an Error with an empty message falls back', () => {
  assert.equal(uploadErrorMessage(new Error('')), GENERIC);
});

console.log(`✔ _errorCopy: ${passed} tests passed`);
