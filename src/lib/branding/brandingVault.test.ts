import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BRANDING_DEFAULT_ACCENT,
  BRANDING_TEXT_FIELDS,
  FIRM_BRANDING_ROLES,
  brandingLogoPath,
  isMissingBrandingTable,
  isOwnLogoPath,
  sniffLogoImage,
  validateBrandingFields,
} from "./brandingVault.ts";

const MIGRATION = readFileSync(
  new URL("../../../supabase/migrations/20261026_63_branding_vault.sql", import.meta.url), "utf8");

test("a body is trimmed, collapsed, defaulted, and the website gets https://", () => {
  const v = validateBrandingFields({ display_name_ar: "  مكتب   النخبة\n", website: "f-law.sa", accent_color: "#0b3d2e", extra: 1 });
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.equal(v.fields.display_name_ar, "مكتب النخبة");
  assert.equal(v.fields.website, "https://f-law.sa");
  assert.equal(v.fields.accent_color, "#0B3D2E");
  assert.equal(v.fields.email, "");
  const empty = validateBrandingFields({});
  assert.equal(empty.ok && empty.fields.accent_color, BRANDING_DEFAULT_ACCENT);
});

test("bad values are refused with the field named", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ accent_color: "red" }, "accent_color"],
    [{ accent_color: "#12345" }, "accent_color"],
    [{ email: "not-an-email" }, "email"],
    [{ website: "javascript:alert(1)" }, "website"],
    [{ website: "https://a b.sa" }, "website"],
    [{ phone: 123 }, "phone"],
    [{ display_name_ar: "x".repeat(121) }, "display_name_ar"],
    [{ address: "x".repeat(301) }, "address"],
  ];
  for (const [body, field] of cases) {
    const v = validateBrandingFields(body);
    assert.equal(v.ok, false, JSON.stringify(body));
    if (!v.ok) assert.equal(v.field, field);
  }
});

test("the length caps are the migration's", () => {
  for (const [field, max] of Object.entries(BRANDING_TEXT_FIELDS)) {
    assert.match(MIGRATION, new RegExp(`char_length\\(${field}\\) <= ${max}\\b`), field);
  }
});

test("the firm roles are the migration's", () => {
  assert.match(MIGRATION, /m\.role in \('managing_partner', 'office_admin'\)/);
  assert.deepEqual([...FIRM_BRANDING_ROLES].sort(), ["managing_partner", "office_admin"]);
});

test("logos are sniffed from their bytes; SVG and anything else is refused", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  assert.deepEqual(sniffLogoImage(png), { mime: "image/png", ext: "png" });
  assert.deepEqual(sniffLogoImage(jpg), { mime: "image/jpeg", ext: "jpg" });
  assert.deepEqual(sniffLogoImage(webp), { mime: "image/webp", ext: "webp" });
  for (const bad of ['<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>', "GIF89a....", "%PDF-1.7", "", "RIFF\0\0\0\0WAVE"]) {
    assert.equal(sniffLogoImage(new TextEncoder().encode(bad)), null, bad.slice(0, 10));
  }
});

test("logo paths have the one shape the table CHECK and the Storage policies accept", () => {
  const uid = "0F8E2C1A-5B7D-4E3A-9C1F-2A6B8D4E0C9F";
  const p = brandingLogoPath("lawyer", uid, "a1b2c3d4e5f60718", "png");
  assert.equal(p, "u/0f8e2c1a-5b7d-4e3a-9c1f-2a6b8d4e0c9f/logo-a1b2c3d4e5f60718.png");
  assert.match(p, /^[uf]\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/logo-[a-z0-9]{8,40}\.(png|jpg|webp)$/);
  assert.equal(isOwnLogoPath(p, "lawyer", uid), true);
  assert.equal(isOwnLogoPath(p, "firm", uid), false);
  assert.equal(isOwnLogoPath(p, "lawyer", "11111111-1111-1111-1111-111111111111"), false);
  assert.equal(brandingLogoPath("firm", uid, "abcdefgh", "webp").startsWith("f/"), true);
  assert.throws(() => brandingLogoPath("firm", "../x", "abcdefgh", "png"));
  assert.throws(() => brandingLogoPath("firm", uid, "ABC", "png"));
});

test("a missing table is recognised, other errors are not", () => {
  assert.equal(isMissingBrandingTable({ code: "PGRST205" }), true);
  assert.equal(isMissingBrandingTable({ code: "42P01" }), true);
  assert.equal(isMissingBrandingTable({ code: "42501", message: "permission denied for table branding_vaults" }), false);
  assert.equal(isMissingBrandingTable(null), false);
});
