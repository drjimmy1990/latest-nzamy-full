/**
 * vault-explorer route.test.ts — owner note ١٣ C06 (source contract; the
 * route imports next/server and the Supabase server client).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/v1/academy/vault-explorer/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fs
  .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "route.ts"), "utf8")
  .replace(/\r\n/g, "\n");

test("admins only: requireAdmin runs before anything reads the disk", () => {
  const get = SRC.indexOf("export async function GET(");
  const gate = SRC.indexOf("await requireAdmin()", get);
  const firstFs = SRC.indexOf("fs.", get);
  assert.ok(get > 0 && gate > get, "GET calls requireAdmin()");
  assert.ok(firstFs > gate, "no fs call before the admin check");
  assert.match(SRC, /if \(!admin\.isAdmin\) \{\n\s+return NextResponse\.json\(/);
});

test("the server's error text is never echoed to the caller", () => {
  assert.doesNotMatch(SRC, /error:\s*err\.message/);
  assert.doesNotMatch(SRC, /err\.message/);
});
