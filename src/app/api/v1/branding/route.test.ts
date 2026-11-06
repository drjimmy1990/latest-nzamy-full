/**
 * route.test.ts — /api/v1/branding and /api/v1/branding/logo (D4, ٢٥٦).
 * Source assertions (the routes import next/server and a Supabase session, so
 * they cannot be imported here — the technique of firm/members/route.test.ts).
 * The pure rules have their own test: src/lib/branding/brandingVault.test.ts.
 *
 * What is pinned:
 *   1. GATE FIRST — every handler starts with resolveBrandingCaller; in the
 *      logo route the service client is created only after the RLS read of
 *      the vault (vaultForWrite) and after the bytes were sniffed.
 *   2. SESSION WRITES the text fields (PUT has no service client at all);
 *      logo_path is written ONLY by the service client, never the session.
 *   3. The signed URL is issued only for a logo_path that isOwnLogoPath()
 *      accepts for this caller's vault.
 *   4. A missing table answers «يتطلب تحديث قاعدة البيانات», not a 500.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const main = read("./route.ts");
const logo = read("./logo/route.ts");

function handler(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} exported`);
  const next = source.indexOf("export async function ", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

test("every handler passes the caller gate before anything else", () => {
  for (const [src, name] of [[main, "GET"], [main, "PUT"]] as const) {
    const body = handler(src, name);
    const gate = body.indexOf("resolveBrandingCaller(");
    assert.ok(gate > 0, `${name} calls resolveBrandingCaller`);
    for (const later of ["createServiceClient()", "readOwnVault(", ".from("]) {
      const at = body.indexOf(later);
      if (at >= 0) assert.ok(at > gate, `${name}: ${later} comes after the gate`);
    }
  }
  const vfw = logo.slice(logo.indexOf("async function vaultForWrite"), logo.indexOf("export async function POST"));
  assert.ok(vfw.indexOf("resolveBrandingCaller(") < vfw.indexOf("readOwnVault("));
  assert.ok(!vfw.includes("createServiceClient"), "vaultForWrite reads through the session only");
  for (const name of ["POST", "DELETE"]) {
    const body = handler(logo, name);
    assert.ok(body.indexOf("vaultForWrite(") < body.indexOf("createServiceClient()"), `${name}: RLS read before the service role`);
  }
});

test("POST sniffs the bytes and caps the size before the service role touches Storage", () => {
  const body = handler(logo, "POST");
  const sniff = body.indexOf("sniffLogoImage(bytes)");
  const cap = body.indexOf("BRANDING_LOGO_MAX_BYTES");
  const service = body.indexOf("createServiceClient()");
  assert.ok(sniff > 0 && cap > 0 && service > sniff && service > cap);
  assert.match(body, /contentType: kind\.mime/, "the stored Content-Type is the sniffed one, not the browser's");
  assert.ok(!/file\.type/.test(body), "the browser's Content-Type is never used");
});

test("logo_path is written by the service client only; PUT has no service client", () => {
  assert.ok(!handler(main, "PUT").includes("createServiceClient"), "PUT writes through the session");
  for (const src of [main, logo]) {
    for (const m of src.matchAll(/(\w+)\s*\.from\("branding_vaults"\)\s*\.update\(\{ logo_path/g)) {
      assert.equal(m[1], "service", "only the service client sets logo_path");
    }
  }
  assert.ok(/service\.from\("branding_vaults"\)\.update\(\{ logo_path: path \}\)/.test(logo));
});

test("signed URLs only for this vault's own folder", () => {
  const get = handler(main, "GET");
  assert.ok(get.indexOf("isOwnLogoPath(row.logo_path, owner.scope, owner.ownerId)") < get.indexOf("createSignedUrl("));
});

test("a missing table is a clear «needs a database update», not a crash", () => {
  assert.match(handler(main, "GET"), /isMissingBrandingTable\(error\)[\s\S]*available: false/);
  assert.match(handler(main, "PUT"), /isMissingBrandingTable\(error\)[\s\S]*status: 503/);
  assert.match(logo, /isMissingBrandingTable\(error\)[\s\S]*status: 503/);
});

test("the licence number leaves the server only when the profile is verified", () => {
  const get = handler(main, "GET");
  assert.equal((get.match(/number: verified \? /g) ?? []).length, 2, "lawyer and firm both gate on verified");
});

test("q346: an SVG never reaches Storage — the bytes decide, and the refusal says where SVG belongs", () => {
  const body = handler(logo, "POST");
  const refuse = body.indexOf("if (!kind)");
  const service = body.indexOf("createServiceClient()");
  assert.ok(refuse > 0 && refuse < service, "the refusal comes before the service role");
  assert.match(body.slice(refuse, service), /looksLikeSvg\(bytes\)[\s\S]*status: 415/);
  assert.ok(body.includes("ارفع ملف SVG من صفحة الهوية ليُحوَّل تلقائياً إلى PNG"));
  assert.match(body, /brandingLogoPath\(owner\.scope, owner\.ownerId, randomBytes\(8\)\.toString\("hex"\), kind\.ext\)/, "the stored name's extension is the sniffed one");
  const ws = readFileSync(new URL("../../../../components/letterhead/LetterheadWorkspace.tsx", import.meta.url), "utf8");
  assert.ok(ws.includes('accept=".png,.jpg,.jpeg,.webp,.svg,image/svg+xml"'));
  assert.ok(ws.includes("يُقبل SVG ويُحفظ صورة PNG عالية الدقة"));
  assert.ok(!ws.includes("لا يُقبل SVG"), "the old claim is gone");
});

// ── q343: the verification card ────────────────────────────────────────────
const card = read("./verify-card/route.ts");
const publicRoute = read("../letterhead/verify/[token]/route.ts");
const page = read("../../../verify/[token]/page.tsx");
const pageClient = read("../../../verify/[token]/VerifyCardView.tsx");

test("the deploy-order cliff: the new columns are never in the RLS read, so a server without 20261103_69 still reads the vault", () => {
  const server = read("../../../../lib/branding/brandingServer.ts");
  const columns = server.slice(server.indexOf("export const VAULT_COLUMNS"), server.indexOf("export interface VaultRow"));
  assert.ok(!/verify_token|qr_verify_card/.test(columns));
});

test("the branding GET reaches the card through the RLS read first, and only for a lawyer's own row", () => {
  const get = handler(main, "GET");
  const read1 = get.indexOf("readVaultForPrint(") >= 0 ? get.indexOf("readVaultForPrint(") : get.indexOf("readOwnVault(");
  const mint = get.indexOf("resolveLawyerVerifyCard(");
  assert.ok(read1 > 0 && mint > read1, "the mint comes after the RLS read");
  assert.match(get.slice(mint - 200, mint), /owner\.scope === "lawyer"/);
  assert.match(get, /\.eq\("lawyer_user_id", user\.id\)/, "the service read is keyed on the session's own id");
  assert.match(get, /verifyCard/);
});

test("PUT verify-card: the lawyer's own vault through RLS first, then the service role, and a real boolean", () => {
  const put = handler(card, "PUT");
  const gate = put.indexOf('resolveBrandingCaller("lawyer")');
  const parse = put.indexOf("parseVerifyCardBody(");
  const ensure = put.indexOf("ensureOwnVault(supabase, owner)");
  const service = put.indexOf("createServiceClient()");
  assert.ok(gate > 0 && gate < parse && parse < ensure && ensure < service, "gate → body → RLS proof → service role");
  assert.match(put, /service\.from\("branding_vaults"\)\.update\(\{ qr_verify_card: body\.enabled \}\)\.eq\("id", vault\.row\.id\)/);
  assert.ok(!/console\./.test(card));
});

test("the public route: one answer helper, no session, no store, nothing logged", () => {
  const get = handler(publicRoute, "GET");
  assert.match(get, /readPublicCard\(/);
  assert.match(publicRoute, /"Cache-Control": "no-store"/);
  assert.match(get, /service\.rpc\("letterhead_verification_card", \{ p_token/);
  assert.ok(!/assertRole|auth\.getUser|console\./.test(publicRoute));
  assert.ok(!/export (async )?function (POST|PUT|PATCH|DELETE)/.test(publicRoute), "read-only");
});

test("the page: noindex, no data on the server, home on anything but a card, and no fallback to a user id", () => {
  assert.match(page, /robots: \{ index: false, follow: false/);
  assert.ok(!/createServiceClient|createClient|fetch\(/.test(page), "no SSR data");
  assert.match(pageClient, /"use client"/);
  assert.match(pageClient, /router\.replace\("\/"\)/);
  assert.match(pageClient, /answer\.published && answer\.slug/);
  assert.ok(!/userId|user_id|text-gray-(100|200)\b/.test(pageClient));
  assert.match(pageClient, /موثّق على منصة نظامي/);
});

test("/verify and its API are public: no prefix in ROUTE_ACCESS or PROTECTED", () => {
  const access = read("../../../../lib/auth/routeAccess.ts");
  const proxy = read("../../../../proxy.ts");
  assert.ok(!/prefix: "\/verify/.test(access));
  const list = proxy.slice(proxy.indexOf("const PROTECTED = ["), proxy.indexOf("];", proxy.indexOf("const PROTECTED = [")));
  assert.ok(!/"\/verify|letterhead/.test(list));
});

test("the switch sits with the other privacy switches, and the letterhead page links to it", () => {
  const tab = read("../../../settings/components/tabs/ProfessionTab.tsx");
  assert.match(tab, /\/api\/v1\/branding\/verify-card/);
  assert.match(tab, /<ToggleRow[\s\S]{0,200}بطاقة التحقق/);
  const ws = read("../../../../components/letterhead/LetterheadWorkspace.tsx");
  assert.match(ws, /qrNoteAr\(identity\.qr, data\.verifyCard\)/);
  assert.match(ws, /\/settings\?tab=profession/);
});

test("GET reads the vault through the print path (q344, R32), with no print kit", () => {
  const server = readFileSync("src/lib/branding/brandingServer.ts", "utf8");
  const route = readFileSync("src/app/api/v1/branding/route.ts", "utf8");
  assert.match(server, /export async function readVaultForPrint\(/);
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function PUT"));
  assert.ok(get.includes("readVaultForPrint(supabase, owner)"));
  assert.ok(!get.includes("readOwnVault("), "PUT keeps the plain read; GET does not");
  assert.ok(!server.includes("firm_letterhead_print_kit") && !get.includes("firm_letterhead_print_kit"));
  assert.ok(!server.includes("firm_member_permissions"));
  assert.ok(get.indexOf("denied") < get.indexOf("createSignedUrl"), "no signing before the print gate answered");
});

test("GET adds the Word template, signed only after the print read (q345)", () => {
  const get = handler(main, "GET");
  assert.ok(get.includes("letterheadDocxUrl"));
  assert.ok(get.includes("hasLetterheadPdf"));
  const read = get.indexOf("readVaultForPrint(supabase, owner)");
  const sign = get.indexOf("createSignedUrl(docxPath, 600)");
  assert.ok(read > 0 && sign > read, "signed for 600 s, after readVaultForPrint");
  assert.ok(get.includes("if (docxPath)"), "no template, no URL");
});
