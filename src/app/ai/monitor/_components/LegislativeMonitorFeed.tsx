"use client";

/**
 * LegislativeMonitorFeed — the live body of «راصد التشريعات».
 *
 * Replaces the hard-coded MOCK_UPDATES arrays that /ai/monitor and
 * /ai/corp/monitor each carried (invented amendments, invented circular
 * numbers, a favourites hub with an invented lawyer's answer, and read /
 * archive / WhatsApp controls that saved nothing). Everything on screen now
 * comes from GET /api/library/monitor, which reads the live library, and every
 * card opens the law or order it names.
 *
 * Owner's ask (owner test 28-9, T28-35a): newest first, laws not yet in force
 * with the days remaining, each card links to the law.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, CalendarBlank, ClockCountdown, CheckCircle, MagnifyingGlass,
  Warning, ArrowsClockwise, Info,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { toArabicDigits } from "@/lib/services/arabicCount";
import type {
  MonitorItem, MonitorDateKind, RecentItem, UpcomingItem,
} from "@/lib/library/monitorFeed";

interface MonitorResponse {
  upcoming: UpcomingItem[];
  recentlyEffective: RecentItem[];
  latest: MonitorItem[];
  today: string;
  ordersAvailable: boolean;
}

type Filter = "all" | "upcoming" | "recent" | "latest";
type AnyItem = MonitorItem | UpcomingItem | RecentItem;

const DATE_KIND_LABEL: Record<MonitorDateKind, string> = {
  issue: "تاريخ الإصدار",
  publication: "تاريخ النشر",
  effective: "تاريخ النفاذ",
};

const FALLBACK_ERROR = "تعذّر تحميل راصد التشريعات من المكتبة — حاول مجدداً بعد قليل.";

type FetchResult = { ok: true; feed: MonitorResponse } | { ok: false; error: string };

/** One read of the feed. Resolves null when aborted (the page was left). */
async function fetchMonitor(signal?: AbortSignal): Promise<FetchResult | null> {
  try {
    const res = await fetch("/api/library/monitor", { cache: "no-store", signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || !Array.isArray(body.upcoming)) {
      // The route's own Arabic message when it sent one (e.g. the library is
      // closed), otherwise the generic one.
      return { ok: false, error: typeof body?.error === "string" && body.error ? body.error : FALLBACK_ERROR };
    }
    return { ok: true, feed: body as MonitorResponse };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return null;
    return { ok: false, error: FALLBACK_ERROR };
  }
}

function isUpcoming(item: AnyItem): item is UpcomingItem {
  return "daysRemaining" in item;
}
function isRecent(item: AnyItem): item is RecentItem {
  return "daysSinceEffective" in item;
}

function matches(item: AnyItem, q: string): boolean {
  if (!q) return true;
  return item.title.includes(q) || (item.typeLabel ?? "").includes(q) || (item.statusLabel ?? "").includes(q);
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function FeedCard({ item, isDark }: { item: AnyItem; isDark: boolean }) {
  const kindLabel = item.typeLabel ?? (item.kind === "law" ? "نظام" : "أمر / تعميم");
  const statusTone =
    item.status === "repealed"
      ? "bg-red-500/10 border-red-500/25 text-red-500"
      : item.status === "deferred_effective" || item.status === "suspended"
        ? "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400";

  const countdown = isUpcoming(item) || isRecent(item) ? item.countdownLabel : null;
  const countdownTone = isUpcoming(item)
    ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";

  return (
    <Link
      href={item.href}
      className={`group block rounded-2xl border p-4 transition-colors ${
        isDark
          ? "bg-zinc-900 border-white/[0.06] hover:border-[#C8A762]/40"
          : "bg-white border-zinc-200/70 hover:border-[#C8A762]/60 shadow-sm"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
          {kindLabel}
        </span>
        {item.statusLabel && (
          <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${statusTone}`}>{item.statusLabel}</span>
        )}
        {countdown && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 ${countdownTone}`}>
            {isUpcoming(item) ? <ClockCountdown size={11} weight="bold" /> : <CheckCircle size={11} weight="fill" />}
            {countdown}
          </span>
        )}
      </div>

      <p className={`text-[13px] font-bold leading-relaxed line-clamp-2 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
        {item.title}
      </p>

      <div className="mt-2 flex items-center justify-between gap-3">
        {/* A deferred law with no effective date already says so in its
            countdown chip — no second «no date» line under it. */}
        {item.dateLabel ? (
          <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <CalendarBlank size={12} className="flex-shrink-0 mt-0.5" />
            <span>{DATE_KIND_LABEL[item.dateKind]}: {item.dateLabel}</span>
          </p>
        ) : (item as { dateLocked?: boolean }).dateLocked ? (
          // T28-22: issue / gazette dates are subscriber data (the API masks them).
          <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <CalendarBlank size={12} className="flex-shrink-0 mt-0.5" />
            <span>🔒 {DATE_KIND_LABEL[item.dateKind]} متاح للمشتركين</span>
          </p>
        ) : <span />}
        <span className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold transition-colors ${isDark ? "text-zinc-400 group-hover:text-[#C8A762]" : "text-zinc-500 group-hover:text-[#0B3D2E]"}`}>
          فتح النص
          <ArrowLeft size={12} />
        </span>
      </div>
    </Link>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title, hint, items, empty, isDark, note,
}: {
  title: string; hint: string; items: AnyItem[]; empty: string; isDark: boolean; note?: string | null;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h2 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
          {title} <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>({toArabicDigits(items.length)})</span>
        </h2>
        <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{hint}</p>
      </div>
      {note && (
        <p className={`flex items-start gap-1.5 text-[11px] rounded-xl border px-3 py-2 ${isDark ? "border-amber-700/30 bg-amber-900/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <Warning size={12} className="flex-shrink-0 mt-0.5" />{note}
        </p>
      )}
      {items.length === 0 ? (
        <div className={`rounded-2xl border border-dashed p-5 text-center text-[12px] ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
          {empty}
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <FeedCard key={`${item.kind}:${item.slug}`} item={item} isDark={isDark} />
          ))}
        </div>
      )}
    </section>
  );
}

function FeedSkeleton({ isDark }: { isDark: boolean }) {
  const block = isDark ? "bg-white/[0.05]" : "bg-slate-100";
  return (
    <div className="space-y-3" aria-busy="true" aria-label="جارٍ تحميل راصد التشريعات">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`rounded-2xl border p-4 space-y-2.5 ${isDark ? "border-white/[0.06]" : "border-zinc-200/70"}`}>
          <div className="flex gap-2">
            <div className={`h-4 w-16 rounded-full animate-pulse ${block}`} />
            <div className={`h-4 w-12 rounded-full animate-pulse ${block}`} />
          </div>
          <div className={`h-4 w-4/5 rounded-lg animate-pulse ${block}`} />
          <div className={`h-3 w-2/5 rounded-lg animate-pulse ${block}`} />
        </div>
      ))}
    </div>
  );
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export default function LegislativeMonitorFeed() {
  const { isDark } = useTheme();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [feed, setFeed] = useState<MonitorResponse | null>(null);
  const [errorText, setErrorText] = useState(FALLBACK_ERROR);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // State is set only once the network has answered; whoever starts a load
  // sets "loading" (the initial state covers the first one).
  const apply = useCallback((result: FetchResult) => {
    if (result.ok) {
      setFeed(result.feed);
      setState("ready");
    } else {
      setErrorText(result.error);
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMonitor(controller.signal).then((result) => {
      if (result) apply(result);
    });
    return () => controller.abort();
  }, [apply]);

  const retry = () => {
    setState("loading");
    fetchMonitor().then((result) => {
      if (result) apply(result);
    });
  };

  const q = query.trim();
  const lists = useMemo(() => ({
    upcoming: (feed?.upcoming ?? []).filter((i) => matches(i, q)),
    recent: (feed?.recentlyEffective ?? []).filter((i) => matches(i, q)),
    latest: (feed?.latest ?? []).filter((i) => matches(i, q)),
  }), [feed, q]);

  const tabs: { id: Filter; label: string; count: number | null }[] = [
    { id: "all", label: "الكل", count: null },
    { id: "upcoming", label: "قيد النفاذ", count: lists.upcoming.length },
    { id: "recent", label: "نافذ حديثاً", count: lists.recent.length },
    { id: "latest", label: "أحدث الإصدارات", count: lists.latest.length },
  ];

  const noMatch = q ? `لا توجد نتائج تطابق «${q}» في هذا القسم.` : null;
  const ordersNote = feed && !feed.ordersAvailable
    ? "تعذّر تحميل الأوامر والتعاميم هذه المرة — القائمة تعرض الأنظمة فقط."
    : null;

  const upcomingSection = (
    <Section
      isDark={isDark}
      title="قيد النفاذ"
      hint="أنظمة ولوائح صدرت ولم يبدأ نفاذها بعد — الأقرب نفاذاً أولاً، مع الأيام المتبقية بتوقيت الرياض."
      items={lists.upcoming}
      empty={noMatch ?? "لا توجد في المكتبة حالياً أنظمة صدرت ولم يبدأ نفاذها."}
    />
  );
  const recentSection = (
    <Section
      isDark={isDark}
      title="نافذ حديثاً"
      hint="ما بدأ نفاذه اليوم أو خلال الأيام الأربعة عشر الماضية."
      items={lists.recent}
      empty={noMatch ?? "لم يبدأ نفاذ أي نظام خلال الأيام الأربعة عشر الماضية بحسب تواريخ النفاذ المسجّلة في المكتبة."}
    />
  );
  const latestSection = (
    <Section
      isDark={isDark}
      title="أحدث الإصدارات"
      hint="الأنظمة واللوائح والأوامر والتعاميم الأحدث بحسب تاريخ الإصدار المسجّل في المكتبة."
      items={lists.latest}
      note={ordersNote}
      empty={noMatch ?? "لا توجد إصدارات مؤرّخة لهذه الفترة في المكتبة."}
    />
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={`p-1.5 rounded-2xl border flex flex-wrap gap-1 ${isDark ? "bg-zinc-900/50 border-white/[0.06]" : "bg-white border-zinc-200/60"}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            aria-pressed={filter === tab.id}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-colors ${
              filter === tab.id
                ? "bg-[#0B3D2E] text-white shadow-sm"
                : isDark ? "text-zinc-400 hover:text-white hover:bg-white/[0.05]" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            {tab.label}
            {state === "ready" && tab.count !== null && (
              <span className={`text-[10px] ${filter === tab.id ? "text-white/80" : isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                ({toArabicDigits(tab.count)})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search within what was loaded */}
      <div className="relative">
        <MagnifyingGlass size={15} className={`absolute inset-y-0 end-3 my-auto ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في العناوين المعروضة..."
          disabled={state !== "ready"}
          className={`w-full rounded-xl border pe-10 ps-4 py-2.5 text-[13px] outline-none disabled:opacity-60 ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}
        />
      </div>

      {state === "loading" && <FeedSkeleton isDark={isDark} />}

      {state === "error" && (
        <div className={`rounded-2xl border p-6 text-center space-y-3 ${isDark ? "border-red-700/30 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
          <Warning size={24} className="mx-auto text-red-500" />
          <p className={`text-[13px] font-semibold ${isDark ? "text-red-300" : "text-red-700"}`}>{errorText}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white"
          >
            <ArrowsClockwise size={13} /> إعادة المحاولة
          </button>
        </div>
      )}

      {state === "ready" && feed && (
        <div className="space-y-6">
          {(filter === "all" || filter === "upcoming") && upcomingSection}
          {(filter === "all" || filter === "recent") && recentSection}
          {(filter === "all" || filter === "latest") && latestSection}
        </div>
      )}

      {/* Source note — what the feed is and is not */}
      <div className={`rounded-2xl p-4 border flex items-start gap-3 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/[0.04]" : "border-amber-200/70 bg-amber-50/60"}`}>
        <Info size={16} className="text-[#C8A762] flex-shrink-0 mt-0.5" />
        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          المصدر: مكتبة نظامي (الأنظمة واللوائح والأوامر والتعاميم) كما هي مسجّلة فيها
          {feed?.today ? <> — اليوم {toArabicDigits(feed.today)} هـ</> : null}.
          التواريخ هجرية بتقويم أم القرى، والأيام المتبقية محسوبة بتوقيت الرياض.
          ارجع إلى النص الرسمي قبل الاعتماد على أي تاريخ نفاذ.
        </p>
      </div>
    </div>
  );
}
