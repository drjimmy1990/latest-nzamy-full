/**
 * notificationRow.ts — one row of public.notifications, as the screens read it.
 *
 * GET /api/v1/notifications returns the table's own rows: (id bigint, user_id,
 * title, body, href nullable, read_at, created_at). The bell, the admin bell and
 * /notifications all read the client `Notification` shape (read, time, href,
 * severity…), and the rows used to be handed over unmapped: `read` was
 * undefined, so every row looked unread; `time` was blank; and a row without a
 * link sent the bell to "/null". This maps each row once, in the service, so
 * every screen gets the same answer.
 *
 * The table has no type or severity column: every row is "system"/"info" here,
 * and no screen may pretend to sort rows into categories it cannot know.
 *
 * Pure (no client-only imports), so `node --test` runs it.
 */
import type { Notification } from "../notificationsStore.ts";

export interface NotificationRow {
  id: number | string;
  title?: string | null;
  body?: string | null;
  href?: string | null;
  read_at?: string | null;
  created_at?: string | null;
}

/** A link the app may follow: a same-site path only, else none. */
export function safeNotificationHref(href: unknown): string {
  if (typeof href !== "string") return "";
  const h = href.trim();
  return h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/\\") ? h : "";
}

const DAY_MS = 86_400_000;

function arNum(n: number): string {
  return n.toLocaleString("ar-SA");
}

/**
 * «منذ ٥ دقائق» / «منذ ٣ ساعات» / «أمس» / «منذ ٤ أيام» / a date, from an ISO
 * time and the reader's clock (both handed in, so it is testable and never
 * frozen into a server-rendered page).
 */
export function notificationTimeAr(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "الآن";
  if (min < 60) return min === 1 ? "منذ دقيقة" : min === 2 ? "منذ دقيقتين" : `منذ ${arNum(min)} ${min <= 10 ? "دقائق" : "دقيقة"}`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "منذ ساعة" : hours === 2 ? "منذ ساعتين" : `منذ ${arNum(hours)} ${hours <= 10 ? "ساعات" : "ساعة"}`;
  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return "أمس";
  if (days < 7) return days === 2 ? "منذ يومين" : `منذ ${arNum(days)} أيام`;
  return new Date(t).toLocaleDateString("ar-SA-u-nu-arab", { year: "numeric", month: "long", day: "numeric" });
}

export type NotificationDateGroup = "today" | "yesterday" | "week" | "older";

/** The day bucket of an ISO time, by the reader's local calendar day. */
export function notificationDateGroup(iso: string | null | undefined, now: number): NotificationDateGroup {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "older";
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today0 = startOfToday.getTime();
  if (t >= today0) return "today";
  if (t >= today0 - DAY_MS) return "yesterday";
  if (t >= today0 - 6 * DAY_MS) return "week";
  return "older";
}

/** One API row → the screens' Notification. A row already in that shape (demo mode) passes through. */
export function notificationFromRow(row: NotificationRow | Notification, now: number = Date.now()): Notification {
  if (typeof (row as Notification).read === "boolean" && !("read_at" in row)) return row as Notification;
  const r = row as NotificationRow;
  const createdAt = typeof r.created_at === "string" ? r.created_at : "";
  return {
    id: String(r.id),
    type: "system",
    title: typeof r.title === "string" ? r.title : "",
    body: typeof r.body === "string" ? r.body : "",
    href: safeNotificationHref(r.href),
    time: notificationTimeAr(createdAt, now),
    createdAt,
    read: r.read_at !== null && r.read_at !== undefined && r.read_at !== "",
    severity: "info",
  };
}
