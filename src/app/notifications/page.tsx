"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, CheckCircle, ArrowClockwise, WarningCircle, CaretLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationDateGroup, type NotificationDateGroup } from "@/lib/services/notificationRow";
import type { Notification } from "@/lib/services/notificationService";

/**
 * /notifications — the signed-in user's notifications (BUG-14).
 *
 * It was a demo shell: hard-coded counts per category, nothing fetched, and
 * «تعليم كمقروء» changed only this tab's memory. It now reads the same source
 * as the Navbar bell (useNotifications → GET /api/v1/notifications, table
 * public.notifications) and saves mark-one / mark-all on the server (PATCH);
 * every mounted bell refetches after a save (NOTIFICATIONS_CHANGED_EVENT).
 *
 * The table has no category column, so there are two tabs only: all and
 * unread, each counted by the server. There is no delete: the API has none.
 * The layout (./layout.tsx) supplies the dashboard shell, so this page renders
 * no Navbar or Footer of its own.
 */

const PAGE_SIZE = 20;
const MAX_ROWS = 100; // the route's per-request cap

type Filter = "all" | "unread";

const GROUP_LABEL: Record<NotificationDateGroup, string> = {
  today: "اليوم",
  yesterday: "أمس",
  week: "آخر ٧ أيام",
  older: "أقدم",
};

function ar(n: number): string {
  return n.toLocaleString("ar-SA");
}

export default function NotificationsPage() {
  const user = useUser();
  if (user.loading) {
    return <p role="status" dir="rtl" className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">جارٍ التحميل…</p>;
  }
  if (!user.isLoggedIn) {
    return (
      <div dir="rtl" className="max-w-3xl mx-auto py-16 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4">سجّل الدخول لعرض إشعاراتك.</p>
        <a href="/login?next=%2Fnotifications" className="inline-flex px-4 py-2 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold hover:opacity-90">
          تسجيل الدخول
        </a>
      </div>
    );
  }
  return <NotificationsInbox />;
}

function NotificationsInbox() {
  const { isRTL } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const {
    notifications,
    read,
    state,
    unreadCount,
    unreadCountKnown,
    actionError,
    clearActionError,
    markRead,
    markAllRead,
    refresh,
  } = useNotifications(limit, { unreadOnly: filter === "unread" });
  const [busy, setBusy] = useState(false);

  const total = read && read.ok ? read.total : null;
  const canLoadMore = total !== null && notifications.length < total && limit < MAX_ROWS;
  const capped = total !== null && notifications.length < total && limit >= MAX_ROWS;

  // Grouped by the reader's own calendar day, read in the browser when the page opens.
  const [now] = useState(() => Date.now());
  const groups = useMemo(() => {
    const order: NotificationDateGroup[] = ["today", "yesterday", "week", "older"];
    const by = new Map<NotificationDateGroup, Notification[]>();
    for (const n of notifications) {
      const g = notificationDateGroup(n.createdAt, now);
      by.set(g, [...(by.get(g) ?? []), n]);
    }
    return order.filter((g) => by.has(g)).map((g) => ({ group: g, items: by.get(g)! }));
  }, [notifications, now]);

  // In the unread tab a row read leaves the list, so the server's total is read again.
  const markOne = async (id: string) => {
    await markRead(id);
    if (filter === "unread") await refresh();
  };

  const open = async (n: Notification) => {
    if (!n.read) await markOne(n.id);
    if (n.href) router.push(n.href);
  };

  const onMarkAll = async () => {
    setBusy(true);
    await markAllRead();
    setBusy(false);
  };

  const switchFilter = (f: Filter) => {
    setFilter(f);
    setLimit(PAGE_SIZE);
  };

  const tabs: { id: Filter; label: string; count: string | null }[] = [
    { id: "all", label: "الكل", count: filter === "all" && total !== null ? ar(total) : null },
    { id: "unread", label: "غير مقروء", count: unreadCountKnown ? ar(unreadCount) : null },
  ];

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="max-w-3xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">الإشعارات</h1>
          {unreadCountKnown && unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 text-xs font-bold text-white bg-[#0B3D2E] dark:bg-[#C8A762] dark:text-[#0B3D2E] rounded-full">
              {ar(unreadCount)}
            </span>
          )}
        </div>
        {unreadCountKnown && unreadCount > 0 && (
          <button
            onClick={onMarkAll}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B3D2E] dark:text-[#C8A762] hover:underline disabled:opacity-50"
          >
            <CheckCircle size={16} />
            {busy ? "جارٍ الحفظ…" : "تعليم الكل كمقروء"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={filter === tab.id}
            onClick={() => switchFilter(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === tab.id
                ? "bg-[#0B3D2E] text-white shadow-sm"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10 hover:border-[#0B3D2E] dark:hover:border-[#C8A762]"
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === tab.id ? "bg-white/20 text-white" : "bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-300"}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {actionError && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span>{actionError}</span>
          <button onClick={clearActionError} className="text-xs font-bold hover:underline flex-shrink-0">إخفاء</button>
        </div>
      )}

      {/* Stale rows stay visible under a "could not refresh" marker; never «لا توجد إشعارات» on a failed read. */}
      {state === "unreadable" && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <span className="flex items-center gap-2"><WarningCircle size={18} /> تعذّرت قراءة الإشعارات الآن.</span>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-1 text-xs font-bold hover:underline">
            <ArrowClockwise size={14} /> إعادة المحاولة
          </button>
        </div>
      )}

      {state === "loading" && notifications.length === 0 ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-white/5 animate-pulse" />
          ))}
        </div>
      ) : state === "empty" ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 mb-5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-white/10 flex items-center justify-center">
            <Bell size={36} className="text-zinc-400 dark:text-zinc-500" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-200 mb-2">
            {filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
            {filter === "unread" ? "قرأت كل إشعاراتك." : "ستظهر هنا إشعارات طلباتك وحسابك عند وصولها."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ group, items }) => (
            <section key={group}>
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3 px-1">{GROUP_LABEL[group]}</h2>
              <ul className="space-y-2">
                {items.map((n) => (
                  <motion.li key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                    <div
                      className={`relative flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                        !n.read
                          ? "bg-[#0B3D2E]/[0.04] dark:bg-[#C8A762]/[0.06] border-[#0B3D2E]/20 dark:border-[#C8A762]/25"
                          : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-white/[0.06]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${!n.read ? "bg-[#0B3D2E] dark:bg-[#C8A762]" : "bg-zinc-300 dark:bg-zinc-600"}`}
                      />
                      <button
                        type="button"
                        onClick={() => void open(n)}
                        className="flex-1 min-w-0 text-start"
                        aria-label={n.href ? `${n.title} — فتح` : n.title}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-semibold ${!n.read ? "text-zinc-900 dark:text-white" : "text-zinc-700 dark:text-zinc-300"}`}>
                            {n.title}
                          </p>
                          <span className="flex-shrink-0 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{n.time}</span>
                        </div>
                        {n.body && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">{n.body}</p>}
                        {n.href && (
                          <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-[#0B3D2E] dark:text-[#C8A762]">
                            فتح <CaretLeft size={12} className={isRTL ? "" : "rotate-180"} />
                          </span>
                        )}
                      </button>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => void markOne(n.id)}
                          className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:text-[#0B3D2E] hover:border-[#0B3D2E] dark:hover:text-[#C8A762] dark:hover:border-[#C8A762] transition-colors"
                        >
                          تعليم كمقروء
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            </section>
          ))}

          {(canLoadMore || capped) && (
            <div className="text-center pt-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                يُعرض {ar(notifications.length)} من {ar(total ?? 0)}
              </p>
              {canLoadMore && (
                <button
                  onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_ROWS))}
                  disabled={state === "loading"}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:border-[#0B3D2E] dark:hover:border-[#C8A762] disabled:opacity-50"
                >
                  عرض المزيد
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
