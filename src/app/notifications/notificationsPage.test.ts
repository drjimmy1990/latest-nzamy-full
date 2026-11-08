/**
 * notificationsPage.test.ts — /notifications reads and writes the real inbox
 * (BUG-14), and the bells follow it.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/notifications/notificationsPage.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("the page reads the bell's source, not a demo list", () => {
  const page = src("app/notifications/page.tsx");
  assert.match(page, /import \{ useNotifications \} from "@\/hooks\/useNotifications";/);
  assert.match(page, /useNotifications\(limit, \{ unreadOnly: filter === "unread" \}\)/);
  for (const gone of ["DEMO_NOTIFICATIONS", "count: 15", "deleteNotification", "<Navbar", "<Footer"]) {
    assert.ok(!page.includes(gone), gone);
  }
});

test("counts are the server's, and a failed read is never shown as an empty inbox", () => {
  const page = src("app/notifications/page.tsx");
  assert.match(page, /unreadCountKnown \? ar\(unreadCount\) : null/);
  assert.match(page, /state === "unreadable"/);
  assert.match(page, /state === "empty"/);
  assert.match(page, /actionError/);
  assert.match(page, /عرض المزيد/);
});

test("rows open only a same-site link; dark mode avoids the surface grays as text", () => {
  const page = src("app/notifications/page.tsx");
  assert.match(page, /if \(n\.href\) router\.push\(n\.href\)/);
  assert.doesNotMatch(page, /text-(gray|slate)-(50|100|200)\b/);
});

test("every copy of the hook refetches after a saved change; channels are per copy", () => {
  const hook = src("hooks/useNotifications.ts");
  assert.match(hook, /export const NOTIFICATIONS_CHANGED_EVENT = "nzamy-notifications-changed";/);
  assert.equal((hook.match(/announceChange\(instanceId\);/g) ?? []).length, 3, "mark one, mark all, remove");
  assert.match(hook, /window\.addEventListener\(NOTIFICATIONS_CHANGED_EVENT, onChanged\)/);
  assert.match(hook, /\.channel\(`notifications-realtime-\$\{instanceId\}`\)/);
  // A late answer to an older read never overwrites a newer one.
  assert.match(hook, /const seq = \+\+requestSeq\.current;/);
  assert.match(hook, /if \(seq !== requestSeq\.current\) return;/);
});

test("the bells never navigate to a missing link", () => {
  assert.match(src("components/Navbar.tsx"), /if \(n\.href\) window\.location\.href = n\.href;/);
  assert.match(src("components/admin/AdminSidebar.tsx"), /href=\{n\.href \|\| "\/notifications"\}/);
});

test("the route clamps limit and offset", () => {
  const route = src("app/api/v1/notifications/route.ts");
  assert.match(route, /Math\.min\(Math\.max\(rawLimit, 1\), 100\)/);
  assert.match(route, /Math\.max\(rawOffset, 0\)/);
});
