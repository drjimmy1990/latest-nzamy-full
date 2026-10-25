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
