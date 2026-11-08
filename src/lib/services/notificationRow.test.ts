/**
 * notificationRow.test.ts — a public.notifications row as the bell and
 * /notifications read it (BUG-14).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/notificationRow.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  notificationDateGroup,
  notificationFromRow,
  notificationTimeAr,
  safeNotificationHref,
} from "./notificationRow.ts";

const NOW = Date.parse("2026-11-09T12:00:00Z");

test("a table row becomes the screens' Notification: read from read_at, string id, ISO kept", () => {
  const unread = notificationFromRow(
    { id: 42, title: "تم قبول طلبك", body: "", href: "/dashboard/client/requests/7", read_at: null, created_at: "2026-11-09T11:55:00Z" },
    NOW,
  );
  assert.equal(unread.id, "42");
  assert.equal(unread.read, false);
  assert.equal(unread.href, "/dashboard/client/requests/7");
  assert.equal(unread.createdAt, "2026-11-09T11:55:00Z");
  assert.equal(unread.time, "منذ ٥ دقائق");
  assert.equal(unread.type, "system");
  assert.equal(unread.severity, "info");

  const read = notificationFromRow({ id: 1, title: "t", body: null, href: null, read_at: "2026-11-09T10:00:00Z", created_at: "2026-11-08T09:00:00Z" }, NOW);
  assert.equal(read.read, true);
  assert.equal(read.body, "");
  assert.equal(read.href, "", "no link is no link, never the string \"null\"");
});

test("a demo-store row passes through unchanged", () => {
  const demo = { id: "n1", type: "payment", title: "x", body: "y", href: "/a", time: "منذ 5 دقائق", read: true, severity: "success" } as const;
  assert.deepEqual(notificationFromRow(demo, NOW), demo);
});

test("only same-site paths are followed", () => {
  assert.equal(safeNotificationHref("/laws/a"), "/laws/a");
  assert.equal(safeNotificationHref("https://other.example/x"), "");
  assert.equal(safeNotificationHref("//other.example"), "");
  assert.equal(safeNotificationHref("/\\other.example"), "");
  assert.equal(safeNotificationHref("javascript:void(0)"), "");
  assert.equal(safeNotificationHref(null), "");
});

test("relative time in Arabic, from the reader's clock", () => {
  assert.equal(notificationTimeAr("2026-11-09T11:59:40Z", NOW), "الآن");
  assert.equal(notificationTimeAr("2026-11-09T11:59:00Z", NOW), "منذ دقيقة");
  assert.equal(notificationTimeAr("2026-11-09T11:58:00Z", NOW), "منذ دقيقتين");
  assert.equal(notificationTimeAr("2026-11-09T11:30:00Z", NOW), "منذ ٣٠ دقيقة");
  assert.equal(notificationTimeAr("2026-11-09T09:00:00Z", NOW), "منذ ٣ ساعات");
  assert.equal(notificationTimeAr("2026-11-08T11:00:00Z", NOW), "أمس");
  assert.equal(notificationTimeAr("2026-11-05T12:00:00Z", NOW), "منذ ٤ أيام");
  assert.equal(notificationTimeAr("", NOW), "");
  assert.equal(notificationTimeAr("not a date", NOW), "");
});

test("day groups follow the local calendar day", () => {
  const now = new Date(2026, 10, 9, 15, 0).getTime();
  assert.equal(notificationDateGroup(new Date(2026, 10, 9, 0, 5).toISOString(), now), "today");
  assert.equal(notificationDateGroup(new Date(2026, 10, 8, 23, 0).toISOString(), now), "yesterday");
  assert.equal(notificationDateGroup(new Date(2026, 10, 4, 10, 0).toISOString(), now), "week");
  assert.equal(notificationDateGroup(new Date(2026, 9, 1).toISOString(), now), "older");
  assert.equal(notificationDateGroup(null, now), "older");
});

test("the service maps every row it serves", () => {
  const src = readFileSync(new URL("./notificationService.ts", import.meta.url), "utf8");
  assert.match(src, /response\.notifications\.map\(\(row\) => notificationFromRow\(row, now\)\)/);
  assert.match(src, /unread_only: true/);
});
