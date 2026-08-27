import test from "node:test";
import assert from "node:assert/strict";

import {
  accountDisplayName,
  toCompanyIdentityFields,
  vaultDocumentsPhraseAr,
  countVaultDocuments,
} from "./businessOverview.ts";

// Every invisible character in this file is written as a \uXXXX escape, never
// pasted — see EDGE_BLANKS in the module under test for why. A test whose
// input you cannot see is a test nobody can maintain.
const NBSP = "\u00A0";
const ZWSP = "\u200B";
const LRM = "\u200E";
const RLM = "\u200F";

// ─── accountDisplayName ───────────────────────────────────────────────────────

test("a real trading name is returned as the heading", () => {
  assert.equal(accountDisplayName("مؤسسة الأفق للتجارة"), "مؤسسة الأفق للتجارة");
  // A personal name is still this account's own name; the guard is about
  // placeholders and leaked addresses, not about guessing at name shapes.
  assert.equal(accountDisplayName("عبدالعزيز القرني"), "عبدالعزيز القرني");
});

test("nothing at all is null, never an empty heading", () => {
  assert.equal(accountDisplayName(null), null);
  assert.equal(accountDisplayName(undefined), null);
  assert.equal(accountDisplayName(""), null);
  assert.equal(accountDisplayName("   "), null);
  assert.equal(accountDisplayName(NBSP + ZWSP + LRM + RLM), null);
  // useUser types `name` as a string, but this reads auth metadata that nothing
  // in the database constrains.
  assert.equal(accountDisplayName(42), null);
  assert.equal(accountDisplayName({ name: "شركة" }), null);
});

test("an email address is never printed as a company name", () => {
  // useUser.ts:620 is `display_name ?? full_name ?? user.email ?? ""` — the
  // chain's last real link is the address, and this heading is where it landed.
  assert.equal(accountDisplayName("someone@example.com"), null);
  assert.equal(accountDisplayName("SALES@example.com.sa"), null);
  // Deliberately broad: anything carrying «@» is refused, not only what an
  // email regex would accept. Over-rejecting costs the fallback heading;
  // under-rejecting puts a person's address on a company's dashboard.
  assert.equal(accountDisplayName("admin@localhost"), null);
  assert.equal(accountDisplayName("@"), null);
});

test("the registration fallbacks are not names", () => {
  // /register/client/page.tsx:246 ends its displayName chain at «عميل نظامي»,
  // so a corporate signup that skipped the company field carries it in auth
  // metadata — the same list the profile panel screens the DB column against.
  assert.equal(accountDisplayName("عميل نظامي"), null);
  assert.equal(accountDisplayName("شركة جديدة"), null);
  assert.equal(accountDisplayName("New Company"), null);
  assert.equal(accountDisplayName("جهة جديدة"), null);
  assert.equal(accountDisplayName("مستخدم جديد"), null);
});

test("a placeholder padded with invisible characters is still a placeholder", () => {
  // The trim runs BEFORE the comparison; a copy-pasted value that kept an RLM
  // would otherwise sail past the list.
  assert.equal(accountDisplayName(RLM + "عميل نظامي" + LRM), null);
  assert.equal(accountDisplayName(NBSP + "شركة جديدة" + NBSP), null);
});

test("a real name is handed back without its direction marks", () => {
  assert.equal(accountDisplayName(RLM + "مؤسسة الأفق" + LRM), "مؤسسة الأفق");
});

test("the heading and the identity panel agree about placeholders", () => {
  // The defect this pair exists to prevent: the page printing a string as the
  // company's name while the panel below it refuses the same string and says
  // no record exists. Both must reject exactly the same set.
  for (const placeholder of ["شركة جديدة", "New Company", "جهة جديدة", "عميل نظامي", "مستخدم جديد"]) {
    assert.equal(accountDisplayName(placeholder), null, placeholder);
    assert.deepEqual(
      toCompanyIdentityFields({ company_name_ar: placeholder }),
      [],
      placeholder,
    );
  }
});

// ─── toCompanyIdentityFields ──────────────────────────────────────────────────

test("a row that is not a row produces no identity lines at all", () => {
  assert.deepEqual(toCompanyIdentityFields(null), []);
  assert.deepEqual(toCompanyIdentityFields(undefined), []);
  assert.deepEqual(toCompanyIdentityFields("شركة"), []);
  assert.deepEqual(toCompanyIdentityFields([]), []);
});

test("a company that declared everything gets all four lines, in order", () => {
  const fields = toCompanyIdentityFields({
    company_name_ar: "مؤسسة الأفق للتجارة",
    cr_number: "1010123456",
    legal_rep_name: "عبدالعزيز محمد القرني",
    legal_rep_capacity: "authorized_signatory",
  });
  assert.deepEqual(
    fields.map((f) => f.key),
    ["company_name", "cr_number", "legal_rep_name", "legal_rep_capacity"],
  );
  assert.equal(fields[0].value, "مؤسسة الأفق للتجارة");
  assert.equal(fields[1].value, "1010123456");
  assert.equal(fields[3].value, "المفوّض بالتوقيع");
});

// The whole point of the module: an unanswered column produces NO line — never
// a line with a dash, a zero or a raw English key in it.
test("columns the company never filled in produce no line", () => {
  const fields = toCompanyIdentityFields({
    company_name_ar: "مؤسسة الأفق للتجارة",
    cr_number: null,
    legal_rep_name: null,
    legal_rep_capacity: null,
  });
  assert.deepEqual(fields.map((f) => f.key), ["company_name"]);
});

test("the signup trigger's placeholder name is never printed as a trading name", () => {
  // Every corporate row in production read «شركة جديدة» until 20260826 ran.
  assert.deepEqual(toCompanyIdentityFields({ company_name_ar: "شركة جديدة" }), []);
  assert.deepEqual(toCompanyIdentityFields({ company_name_ar: "New Company" }), []);
  assert.deepEqual(toCompanyIdentityFields({ company_name_ar: "عميل نظامي" }), []);
  assert.deepEqual(toCompanyIdentityFields({ company_name_ar: "مستخدم جديد" }), []);
});

test("a placeholder name does not suppress the CR beside it", () => {
  const fields = toCompanyIdentityFields({
    company_name_ar: "شركة جديدة",
    cr_number: "4030999888",
  });
  assert.deepEqual(fields.map((f) => f.key), ["cr_number"]);
});

test("a value of nothing but invisible characters is not a value", () => {
  const fields = toCompanyIdentityFields({
    company_name_ar: NBSP + ZWSP,
    cr_number: "   ",
    legal_rep_name: LRM + RLM,
  });
  assert.deepEqual(fields, []);
});

test("direction marks are stripped from a value that is otherwise real", () => {
  const [cr] = toCompanyIdentityFields({ cr_number: RLM + "1010123456" + LRM });
  assert.equal(cr.value, "1010123456");
});

test("an unrecognised capacity is dropped, not printed raw", () => {
  // The column's CHECK would refuse this today, but a hand-edited row or a
  // future widening of the constraint would not — and «vice_president» in the
  // middle of Arabic copy is the English-key leak this codebase keeps fixing.
  assert.deepEqual(toCompanyIdentityFields({ legal_rep_capacity: "vice_president" }), []);
  assert.deepEqual(toCompanyIdentityFields({ legal_rep_capacity: "" }), []);
});

test("a capacity naming an Object.prototype member prints nothing", () => {
  // A plain lookup would find the inherited value and put a function's source
  // on a company's dashboard.
  assert.deepEqual(toCompanyIdentityFields({ legal_rep_capacity: "constructor" }), []);
  assert.deepEqual(toCompanyIdentityFields({ legal_rep_capacity: "toString" }), []);
});

test("every capacity the database accepts has Arabic wording", () => {
  for (const capacity of [
    "owner",
    "partner",
    "manager",
    "authorized_signatory",
    "legal_counsel",
    "other",
  ]) {
    const [field] = toCompanyIdentityFields({ legal_rep_capacity: capacity });
    assert.ok(field, `no line for ${capacity}`);
    // No Latin letter anywhere in the rendered value: one would mean the raw
    // column value reached the screen instead of its Arabic wording.
    assert.equal(/[A-Za-z]/.test(field.value), false, `${capacity} → ${field.value}`);
  }
});

test("size and legal_structure are never printed — they are column defaults", () => {
  // `size not null default 'medium'`, `legal_structure not null default 'llc'`:
  // every row carries them and no registration form has ever asked for them.
  const fields = toCompanyIdentityFields({
    company_name_ar: "مؤسسة الأفق للتجارة",
    size: "medium",
    legal_structure: "llc",
    verification_status: "pending",
  });
  assert.deepEqual(fields.map((f) => f.key), ["company_name"]);
});

// ─── vaultDocumentsPhraseAr ───────────────────────────────────────────────────

test("an empty vault produces no phrase, so the caller can invite instead", () => {
  assert.equal(vaultDocumentsPhraseAr(0), null);
  assert.equal(vaultDocumentsPhraseAr(-3), null);
  assert.equal(vaultDocumentsPhraseAr(Number.NaN), null);
});

test("Arabic number agreement across all four branches", () => {
  assert.equal(vaultDocumentsPhraseAr(1), "وثيقة واحدة محفوظة");
  assert.equal(vaultDocumentsPhraseAr(2), "وثيقتان محفوظتان");
  assert.equal(vaultDocumentsPhraseAr(3), "٣ وثائق محفوظة");
  assert.equal(vaultDocumentsPhraseAr(10), "١٠ وثائق محفوظة");
  // The tamyiz: SINGULAR noun from eleven up. A naive plural rule writes
  // «وثائق» here and is wrong.
  assert.equal(vaultDocumentsPhraseAr(11), "١١ وثيقة محفوظة");
  assert.equal(vaultDocumentsPhraseAr(42), "٤٢ وثيقة محفوظة");
});

// ─── countVaultDocuments ──────────────────────────────────────────────────────

test("the vault is the documents bound to no order", () => {
  const docs = [
    { id: "a", request_id: null },
    { id: "b", request_id: "8f14e45f-ceea-467a-9c6f-000000000000" },
    { id: "c" },
    { id: "d", request_id: null },
  ];
  assert.equal(countVaultDocuments(docs), 3);
});

test("a list we were never given is null, not zero", () => {
  // Zero would render «لا توجد وثائق», which is a statement about the company's
  // files that nothing here is in a position to make.
  assert.equal(countVaultDocuments(null), null);
  assert.equal(countVaultDocuments(undefined), null);
  assert.equal(countVaultDocuments({ data: [] }), null);
});

test("a genuinely empty list counts zero", () => {
  assert.equal(countVaultDocuments([]), 0);
});

test("junk entries are skipped rather than counted", () => {
  assert.equal(countVaultDocuments([null, "x", 7, { id: "a", request_id: null }]), 1);
});
