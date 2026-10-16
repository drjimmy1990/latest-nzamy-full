/**
 * N8 (fix plan 2026-10-16): the admin console had no logout. Its footer link
 * «العودة للموقع» wore the sign-out icon but only opened the home page, still
 * signed in. Source-read: the sidebar is a "use client" .tsx with `@/`
 * imports, which `node --test` cannot load.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./AdminSidebar.tsx", import.meta.url), "utf8");
const footer = src.slice(src.indexOf("{/* Footer"));

test("the admin sidebar signs out through the shared logout()", () => {
  assert.match(src, /import \{ logout \} from "@\/hooks\/useUser";/);
  assert.match(footer, /onClick=\{\(\) => logout\(\)\}/);
  assert.match(footer, /تسجيل الخروج/);
});

test("only the real sign-out wears the sign-out icon", () => {
  const backToSite = footer.slice(footer.indexOf("<Link href=\"/\""), footer.indexOf("</Link>"));
  assert.ok(backToSite.includes("العودة للموقع"));
  assert.doesNotMatch(backToSite, /<SignOut/);
  assert.equal((footer.match(/<SignOut/g) || []).length, 1);
});
