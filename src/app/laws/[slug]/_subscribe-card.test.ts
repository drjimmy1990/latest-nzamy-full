/**
 * _subscribe-card.test.ts — owner file 16 §2 (19 Nov 2026, screenshot 02): an
 * admin, the team, a library subscriber and an active founder saw the sidebar's
 * «وصول كامل للمكتبة / اشترك الآن» card. It was keyed on the account TYPE
 * (`userType !== "lawyer" && userType !== "firm"`): every admin and non-lawyer
 * subscriber saw it always, and a lawyer saw it while useUser() still served
 * its loading guest session. It now keys on the server's answer for THIS law
 * (`paywall.isSubscriber`), unknown until that answer arrives. Source contract.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SIDEBAR = read("./_sidebar.tsx");
const PAGE = read("./page.tsx");
const ROUTE = read("../../api/library/laws/[slug]/route.ts");

test("the card shows only when the server said the viewer has no library entitlement", () => {
  assert.match(SIDEBAR, /viewerIsSubscriber: boolean \| null;/);
  assert.match(SIDEBAR, /\{viewerIsSubscriber === false && \(/);
  assert.doesNotMatch(SIDEBAR, /userType/, "never the account type");
});

test("the page holds the entitlement as unknown until this law's response arrives", () => {
  assert.match(PAGE, /useState<boolean \| null>\(null\)/);
  assert.match(PAGE, /setViewerIsSubscriber\(null\);/, "reset for every law");
  assert.match(PAGE, /setViewerIsSubscriber\(typeof data\?\.paywall\?\.isSubscriber === "boolean" \? data\.paywall\.isSubscriber : null\);/);
  assert.equal((PAGE.match(/viewerIsSubscriber=\{viewerIsSubscriber\}/g) ?? []).length, 4, "both sidebars and both phone sheets");
  assert.doesNotMatch(PAGE, /userType=\{userType\}/);
});

test("the law API sends the viewer's own entitlement apart from a whitelisted law", () => {
  assert.match(ROUTE, /hasFullLibraryAccess\(userId\),/);
  assert.match(ROUTE, /const hasFullAccess = isSubscriber \|\| isWhitelisted;/);
  assert.match(ROUTE, /paywall: \{[\s\S]*?hasFullAccess,[\s\S]*?isSubscriber,[\s\S]*?totalArticles/);
});
