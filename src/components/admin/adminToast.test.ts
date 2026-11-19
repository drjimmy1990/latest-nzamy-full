/**
 * File 15 row 70 (batch l9): the admin console raises no window.alert(); its
 * notices go through adminToast() to the one <AdminToaster/> in the layout.
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/admin/adminToast.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminToast, adminToastMs, subscribeAdminToasts } from "./adminToast.ts";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

test("a subscriber receives each toast; after unsubscribing it does not", () => {
  const got: string[] = [];
  const off = subscribeAdminToasts((t) => got.push(`${t.kind}:${t.message}`));
  adminToast("تعذّر الحذف");
  adminToast("تم", "success");
  off();
  adminToast("لا يصل");
  assert.deepEqual(got, ["error:تعذّر الحذف", "success:تم"]);
  assert.ok(adminToastMs("error") > adminToastMs("success"));
});

test("no window.alert() is left in the admin console, and the toaster is mounted once in its layout", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
  const offenders = filesUnder(path.join(SRC, "app", "dashboard", "admin"))
    .filter((f) => /(^|[^A-Za-z0-9_.])alert\(|window\.alert\(/m.test(strip(readFileSync(f, "utf8"))))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(offenders, []);
  const layout = readFileSync(path.join(SRC, "app", "dashboard", "admin", "layout.tsx"), "utf8");
  assert.equal((layout.match(/<AdminToaster \/>/g) ?? []).length, 1);
});
