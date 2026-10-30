/**
 * brandingAssets.test.ts — the office's uploaded stationery (NOTE-09-C01,
 * LIVE-F08, package 2026-10-30): the byte sniffing, the object path, and the
 * agreement with supabase/migrations/20261030_10_branding_assets.sql and with
 * /api/v1/branding/assets (source assertions — the route imports next/server).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BRANDING_ASSET_KINDS,
  BRANDING_ASSET_SPEC,
  BRANDING_FILES_BUCKET,
  DOCX_MIME,
  brandingAssetPath,
  isMissingBrandingAssetsTable,
  isOwnAssetPath,
  parseBrandingAssetKind,
  safeAssetFileName,
  sniffBrandingAsset,
} from "./brandingAssets.ts";
import { BRANDING_BUCKET, isOwnLogoPath } from "./brandingVault.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = read("../../../supabase/migrations/20261030_10_branding_assets.sql");
const ROUTE = read("../../app/api/v1/branding/assets/route.ts");

const UID = "0f8e2c1a-5b7d-4e3a-9c1f-2a6b8d4e0c9f";
const FIRM = "a1b2c3d4-0000-4000-8000-000000000001";
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? ascii(p) : p)));
const PK = [0x50, 0x4b, 0x03, 0x04];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];

test("a .docx is a zip with word/document.xml and [Content_Types].xml; macros are refused", () => {
  const docx = bytes(PK, "....[Content_Types].xml....word/document.xml....");
  assert.deepEqual(sniffBrandingAsset("letterhead_docx", docx), { ok: true, mime: DOCX_MIME, ext: "docx" });
  assert.equal(sniffBrandingAsset("letterhead_docx", bytes(PK, "[Content_Types].xml xl/workbook.xml")).ok, false, "an .xlsx is not a Word file");
  assert.equal(sniffBrandingAsset("letterhead_docx", bytes("%PDF-1.7 word/document.xml [Content_Types].xml")).ok, false, "not a zip");
  const docm = sniffBrandingAsset("letterhead_docx", bytes(PK, "[Content_Types].xml word/document.xml word/vbaProject.bin"));
  assert.equal(docm.ok, false);
  assert.match(!docm.ok ? docm.error : "", /ماكرو/);
});

test("a PDF starts with %PDF-; the stamp and signature are PNG or WebP only", () => {
  assert.deepEqual(sniffBrandingAsset("letterhead_pdf", bytes("%PDF-1.4\n")), { ok: true, mime: "application/pdf", ext: "pdf" });
  assert.equal(sniffBrandingAsset("letterhead_pdf", bytes(PNG)).ok, false);
  for (const kind of ["stamp", "signature"] as const) {
    assert.deepEqual(sniffBrandingAsset(kind, bytes(PNG, [0, 0])), { ok: true, mime: "image/png", ext: "png" });
    assert.deepEqual(sniffBrandingAsset(kind, bytes(WEBP)), { ok: true, mime: "image/webp", ext: "webp" });
    assert.equal(sniffBrandingAsset(kind, bytes([0xff, 0xd8, 0xff, 0xe0])).ok, false, "no JPEG (no transparency)");
    assert.equal(sniffBrandingAsset(kind, bytes("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>")).ok, false, "no SVG");
    assert.equal(sniffBrandingAsset(kind, bytes("%PDF-1.4")).ok, false);
  }
});

test("the object path is the vault owner's own folder, three segments, never a logo name", () => {
  const p = brandingAssetPath("lawyer", UID.toUpperCase(), "letterhead_docx", "abcdef12", "docx");
  assert.equal(p, `u/${UID}/asset-letterhead-docx-abcdef12.docx`);
  assert.equal(p.split("/").length, 3);
  assert.equal(isOwnAssetPath(p, "lawyer", UID, "letterhead_docx"), true);
  assert.equal(isOwnAssetPath(p, "lawyer", UID, "letterhead_pdf"), false, "another kind");
  assert.equal(isOwnAssetPath(p, "firm", UID, "letterhead_docx"), false, "another scope");
  assert.equal(isOwnAssetPath(p, "lawyer", FIRM, "letterhead_docx"), false, "another owner");
  assert.equal(isOwnLogoPath(p, "lawyer", UID), false, "an asset is never taken for the logo");
  assert.equal(brandingAssetPath("firm", FIRM, "stamp", "0123456789abcdef", "png"), `f/${FIRM}/asset-stamp-0123456789abcdef.png`);
  assert.throws(() => brandingAssetPath("lawyer", "../x", "stamp", "abcdef12", "png"));
  assert.throws(() => brandingAssetPath("lawyer", UID, "stamp", "../../x", "png"));
  assert.equal(isOwnAssetPath(`u/${UID}/../f/${FIRM}/asset-stamp-abcdef12.png`, "lawyer", UID, "stamp"), false);
});

test("the download name keeps the office's name, without folders, controls or bidi tricks", () => {
  assert.equal(safeAssetFileName("C:\\fakepath\\ورق مكتب النخبة.docx", "docx"), "ورق مكتب النخبة.docx");
  assert.equal(safeAssetFileName("evil\u202Efdp.exe", "pdf"), "evilfdp.pdf");
  assert.equal(safeAssetFileName("", "png"), "file.png");
  assert.ok(safeAssetFileName("x".repeat(400), "pdf").length <= 120);
  assert.equal(parseBrandingAssetKind("stamp"), "stamp");
  assert.equal(parseBrandingAssetKind("logo"), null);
  assert.equal(isMissingBrandingAssetsTable({ code: "PGRST205" }), true);
  assert.equal(isMissingBrandingAssetsTable({ code: "42501" }), false);
});

test("the migration mirrors the rules: kinds, mime per kind, size caps, path shape, private bucket", () => {
  assert.notEqual(BRANDING_FILES_BUCKET, BRANDING_BUCKET, "a separate bucket — _verify pins the logo bucket to 1 MB images");
  for (const kind of BRANDING_ASSET_KINDS) assert.match(MIGRATION, new RegExp(`'${kind}'`));
  assert.match(MIGRATION, new RegExp(`'${BRANDING_FILES_BUCKET}', '${BRANDING_FILES_BUCKET}', false, ${BRANDING_ASSET_SPEC.letterhead_pdf.maxBytes},`));
  assert.match(MIGRATION, new RegExp(`then ${BRANDING_ASSET_SPEC.stamp.maxBytes} else ${BRANDING_ASSET_SPEC.letterhead_docx.maxBytes} end`));
  assert.ok(MIGRATION.includes(DOCX_MIME));
  assert.match(MIGRATION, /constraint branding_assets_one_per_kind unique \(vault_id, kind\)/);
  // Sessions read only — through the vault's own manager rule of 63.
  assert.match(MIGRATION, /grant select on public\.branding_assets to authenticated;/);
  assert.ok(!/grant (insert|update|delete|all)[^;]*branding_assets to authenticated/i.test(MIGRATION));
  assert.match(MIGRATION, /public\.can_manage_branding_vault\(v\.lawyer_user_id, v\.firm_id\)/);
  // A path the route builds passes the CHECK's regex.
  const re = /path ~ '(\^\[uf\][^']+)'/.exec(MIGRATION);
  assert.ok(re, "path regex found");
  const check = new RegExp(re[1]);
  assert.ok(check.test(brandingAssetPath("lawyer", UID, "letterhead_pdf", "abcdef12", "pdf")));
  assert.ok(!check.test(`u/${UID}/logo-abcdef12.png`));
  assert.match(MIGRATION, /notify pgrst, 'reload schema';/);
});

test("the route: explicit permission gate first, RLS reads before the service role, bytes sniffed", () => {
  const section = (name: string) => {
    const start = ROUTE.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, name);
    const next = ROUTE.indexOf("export async function ", start + 10);
    return ROUTE.slice(start, next === -1 ? undefined : next);
  };
  assert.match(section("GET"), /resolveBrandingCaller\(.*, "letterhead\.print"\);/);
  for (const name of ["POST", "DELETE"]) {
    const body = section(name);
    const gate = body.indexOf("resolveBrandingCaller(request.nextUrl.searchParams.get(\"scope\"));");
    assert.ok(gate > 0, `${name} asks for branding.manage (the default)`);
    const rls = Math.max(body.indexOf("ensureOwnVault("), body.indexOf("readOwnVault("));
    const service = body.indexOf("createServiceClient()");
    assert.ok(rls > gate && service > rls, `${name}: gate → RLS vault read → service role`);
  }
  const post = section("POST");
  assert.ok(post.indexOf("sniffBrandingAsset(") < post.indexOf("createServiceClient()"), "bytes sniffed before any write");
  assert.match(post, /content-length/);
  assert.match(ROUTE, /createSignedUrl\(r\.path, 600, \{ download:/);
  assert.match(ROUTE, /isOwnAssetPath\(r\.path, owner\.scope, owner\.ownerId, kind\)/, "only this vault's own objects are signed");
});
