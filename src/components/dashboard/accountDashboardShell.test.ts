/**
 * Live check of 13 Nov, row 12: /dashboard/billing opened under the public
 * site navbar, without the account's dashboard sidebar. The shared account
 * pages now sit in AccountDashboardShell (SharedSidebar).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/dashboard/accountDashboardShell.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

for (const page of ["app/dashboard/billing/page.tsx", "app/dashboard/offers/page.tsx"]) {
  test(`${page} is framed by the account's own sidebar, not the site navbar`, () => {
    const src = read(page);
    assert.match(src, /<AccountDashboardShell>/);
    assert.match(src, /<\/AccountDashboardShell>/);
    assert.doesNotMatch(src, /<Navbar \/>/);
    assert.doesNotMatch(src, /<Footer \/>/);
    // The fixed navbar's clearance is gone with it.
    assert.doesNotMatch(src, /\bpt-32\b/);
  });
}

test("the shell draws SharedSidebar with the same content offset as the client dashboard", () => {
  const shell = read("components/dashboard/AccountDashboardShell.tsx");
  const client = read("app/dashboard/client/layout.tsx");
  assert.match(shell, /<SharedSidebar \/>/);
  const offset = /print-main lg:mr-64 pt-\[calc\(env\(safe-area-inset-top\)\+60px\)\] lg:pt-0/;
  assert.match(shell, offset);
  assert.match(client, offset);
});

test("the printable receipt and credit note keep their own document frame", () => {
  for (const doc of ["app/dashboard/billing/receipt/[orderId]/page.tsx", "app/dashboard/billing/credit-note/[orderId]/page.tsx"]) {
    assert.doesNotMatch(read(doc), /AccountDashboardShell/, doc);
  }
});
