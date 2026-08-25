/**
 * _corporateIdentity.test.ts — proves the form→trigger contract.
 *
 * The bug this guards against is invisible at runtime: the form wrote
 * `full_name`, the trigger read `company_name`, nothing errored, and every
 * corporate row in production silently became «شركة جديدة». Only an assertion
 * on the literal key names catches that class of defect, so the key names are
 * asserted here as literals — do NOT rewrite these to use a shared constant,
 * that would make the test pass for a renamed key.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import {
  LEGAL_REP_CAPACITIES,
  isLegalRepCapacity,
  normalizeCrNumber,
  crNumberHint,
  isCorporateIdentityComplete,
  corporateSignupMetadata,
  microSignupMetadata,
} from './_corporateIdentity.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

const FULL: Record<string, string> = {
  companyName: 'شركة الأفق للمقاولات',
  crNumber: '1010123456',
  legalRepName: 'عبدالعزيز محمد القرني',
  legalRepCapacity: 'authorized_signatory',
};

// ── The key names the trigger reads ─────────────────────────────────────────

test('the trading name is sent under company_name — the key the trigger reads', () => {
  assert.equal(corporateSignupMetadata(FULL).company_name, 'شركة الأفق للمقاولات');
});

test('the CR is sent under cr_number', () => {
  assert.equal(corporateSignupMetadata(FULL).cr_number, '1010123456');
});

test('the legal representative is sent under legal_rep_name / legal_rep_capacity', () => {
  const meta = corporateSignupMetadata(FULL);
  assert.equal(meta.legal_rep_name, 'عبدالعزيز محمد القرني');
  assert.equal(meta.legal_rep_capacity, 'authorized_signatory');
});

test('company_name_en is never fabricated from the Arabic name', () => {
  assert.equal('company_name_en' in corporateSignupMetadata(FULL), false);
});

test('a blank optional field is omitted, never sent as an empty string', () => {
  const meta = corporateSignupMetadata({ ...FULL, legalRepName: '   ' });
  assert.equal('legal_rep_name' in meta, false);
});

test('an unknown capacity is dropped rather than sent to a CHECK-constrained column', () => {
  // A value outside the list would abort the whole auth.users insert if it
  // reached the constraint (cf. 20260821 provider sub_role).
  const meta = corporateSignupMetadata({ ...FULL, legalRepCapacity: 'ceo' });
  assert.equal('legal_rep_capacity' in meta, false);
});

test('micro sends business_name — its own trigger key, not company_name', () => {
  const meta = microSignupMetadata({ companyName: 'بقالة الرياض', crNumber: '4030999888' });
  assert.equal(meta.business_name, 'بقالة الرياض');
  assert.equal('company_name' in meta, false);
  assert.equal(meta.business_type, 'micro');
});

// ── CR normalization ────────────────────────────────────────────────────────

test('Arabic-Indic digits become ASCII', () => {
  assert.equal(normalizeCrNumber('١٠١٠١٢٣٤٥٦'), '1010123456');
});

test('Persian digits become ASCII', () => {
  assert.equal(normalizeCrNumber('۱۰۱۰۱۲۳۴۵۶'), '1010123456');
});

test('separators and stray text are stripped, not rejected', () => {
  assert.equal(normalizeCrNumber(' CR 1010-123 456 '), '1010123456');
});

test('an empty or missing CR normalizes to the empty string', () => {
  assert.equal(normalizeCrNumber(''), '');
  assert.equal(normalizeCrNumber(undefined), '');
  assert.equal(normalizeCrNumber(null), '');
});

// ── The hint is advisory, and Saudi-only ────────────────────────────────────

test('a 10-digit Saudi CR draws no hint', () => {
  assert.equal(crNumberHint('1010123456', 'SA', true), null);
});

test('a short Saudi CR draws an Arabic hint', () => {
  const hint = crNumberHint('101012', 'SA', true);
  assert.ok(hint && hint.includes('١٠'));
});

test('a non-Saudi company is never hinted about Saudi CR length', () => {
  assert.equal(crNumberHint('12345', 'AE', true), null);
});

test('an empty field draws no hint — that is the gate\'s job, not the hint\'s', () => {
  assert.equal(crNumberHint('', 'SA', true), null);
});

// ── The step-2 gate ─────────────────────────────────────────────────────────

test('a complete corporate identity passes the gate', () => {
  assert.equal(isCorporateIdentityComplete(FULL), true);
});

test('each of the four required values blocks the gate on its own', () => {
  for (const key of ['companyName', 'crNumber', 'legalRepName', 'legalRepCapacity']) {
    assert.equal(
      isCorporateIdentityComplete({ ...FULL, [key]: '' }),
      false,
      `blank ${key} should block «التالي»`,
    );
  }
});

test('whitespace does not satisfy the gate', () => {
  assert.equal(isCorporateIdentityComplete({ ...FULL, companyName: '   ' }), false);
});

test('a CR of pure punctuation does not satisfy the gate', () => {
  assert.equal(isCorporateIdentityComplete({ ...FULL, crNumber: '---' }), false);
});

// ── The capacity list ───────────────────────────────────────────────────────

test('every capacity option is accepted by its own validator', () => {
  for (const c of LEGAL_REP_CAPACITIES) assert.equal(isLegalRepCapacity(c.value), true);
});

test('every capacity option carries both an Arabic and an English label', () => {
  for (const c of LEGAL_REP_CAPACITIES) {
    assert.ok(c.ar.trim().length > 0, `${c.value} needs an Arabic label`);
    assert.ok(c.en.trim().length > 0, `${c.value} needs an English label`);
  }
});

test('a value outside the list is rejected', () => {
  assert.equal(isLegalRepCapacity('admin'), false);
  assert.equal(isLegalRepCapacity(''), false);
  assert.equal(isLegalRepCapacity(undefined), false);
});

console.log(`✓ _corporateIdentity: ${passed} assertions passed`);
