"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import { useTheme } from "@/components/ThemeProvider";
import {
  Scales, Gavel, CheckCircle, Clock,
  CaretLeft, Robot, PencilSimple,
  CalendarCheck, Lightning,
  Warning, ArrowClockwise, Plus,
  Flag, Lock, Crown, ArrowRight, Storefront,
  Timer, Folder, Money, Briefcase, ShareNetwork, Graph, MapPin,
} from "@phosphor-icons/react";
import HijriDateWidget from "@/components/HijriDateWidget";
import Link from "next/link";
import { LawyerDashboardSkeleton } from "@/components/ui";
import { OnboardingBanner } from "@/components/OnboardingBanner";

// ─── Subscription Tiers ───────────────────────────────────────────────────────
type LawyerTier = "free" | "starter" | "pro" | "premium";

const TIER_CONFIG: Record<LawyerTier, {
  labelAr: string; labelEn: string;
  color: string; bg: string; border: string;
  canDraft: boolean;   // الصائغ القانوني
  canScribe: boolean;  // مفرغ الجلسات
  caseLimit: number | null;
  consultLimit: number | null;
}> = {
  free:    { labelAr: "مجاني",         labelEn: "Free",     color: "text-slate-500",   bg: "bg-slate-100",      border: "border-slate-200",   canDraft: false, canScribe: false, caseLimit: 3,  consultLimit: 1 },
  starter: { labelAr: "الناشئ",        labelEn: "Starter",  color: "text-blue-600",   bg: "bg-blue-50",        border: "border-blue-200",    canDraft: false, canScribe: false, caseLimit: 10, consultLimit: 5 },
  pro:     { labelAr: "الاحترافي",     labelEn: "Pro",      color: "text-royal",      bg: "bg-royal/8",        border: "border-royal/20",    canDraft: true,  canScribe: true,  caseLimit: null, consultLimit: null },
  premium: { labelAr: "المميز",        labelEn: "Premium",  color: "text-[#C8A762]",  bg: "bg-[#C8A762]/10",   border: "border-[#C8A762]/30", canDraft: true,  canScribe: true,  caseLimit: null, consultLimit: null },
};

// Local imports
import AddCaseModal from "./_components/AddCaseModal";
import AddTaskModal from "./_components/AddTaskModal";
import { AI_QUICK, ACTIVITY_TYPE_CONFIG } from "./_data/mockData";
import {
  getLawyerDashboardSummary,
  type LawyerDashboardSummary,
  type LawyerDashboardHearing,
} from "@/lib/services/lawyerDashboardService";
import { isSupabaseMode } from "@/lib/services/api";
import { describeRequestEvent, type ActivityBadge } from "@/lib/events";
import { orderReference } from "@/lib/services/orderReference";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Arabic label for a real `service_requests.status`.
 *
 * Replaces a two-way `mapStatus()` that collapsed every status into
 * «نشطة»/«انتظار» — which meant a case the office had already delivered was
 * labelled «انتظار» to the lawyer, and one merely sitting unassigned was
 * labelled the same as one under review. The set below is exactly the four
 * statuses the summary route returns.
 */
const CASE_STATUS_LABEL: Record<string, { label: string; tone: "active" | "waiting" | "done" }> = {
  assigned:           { label: "نشطة",             tone: "active" },
  in_review:          { label: "قيد المراجعة",      tone: "active" },
  pending_assignment: { label: "بانتظار الإسناد",   tone: "waiting" },
  completed:          { label: "مكتملة",           tone: "done" },
};

/**
 * Hearing-type labels, mirroring EVENT_CONFIG in
 * src/app/dashboard/lawyer/hearings/page.tsx so the overview and the schedule
 * name the same thing identically. Duplicated rather than imported because that
 * file is a client page, not a module — lifting the map into a shared constant
 * is a followUp on that file's owner, not something to do from here.
 * An unrecognised token yields no label at all rather than a guess.
 */
const HEARING_TYPE_LABEL: Record<string, string> = {
  hearing:       "جلسة قضائية",
  deadline:      "طعن / نهائي",
  gov_review:    "مراجعة حكومية",
  notary:        "كتابة عدل",
  client_meet:   "موعد موكل",
  court_collect: "استلام وثيقة",
  police:        "مركز شرطة",
  expert:        "خبير",
  contract:      "توقيع عقد",
  internal:      "مهمة داخلية",
};

/**
 * Task-category labels, mirroring CATEGORY_CONFIG in
 * src/app/dashboard/lawyer/tasks/_data.ts. Duplicated rather than imported so
 * this page does not take a runtime dependency on another group's private
 * `_data` module; an unknown value falls through to the stored token itself,
 * which is at least true, rather than being dropped or renamed.
 */
const TASK_CATEGORY_LABEL: Record<string, string> = {
  case:     "قضية",
  document: "مستند",
  deadline: "ميعاد",
  admin:    "إداري",
  client:   "موكل",
};

/**
 * Display bucket for a stored task priority.
 *
 * The stored vocabulary is urgent/high/normal/low (src/app/dashboard/lawyer/
 * tasks/_types.ts); this card has three dot colours. This is a rendering
 * decision over a real value — it is NOT the old behaviour, which assigned
 * «high» to whatever happened to be first in the array and «low» to the rest,
 * so the top row always carried a pulsing red urgent dot no matter what the
 * lawyer had chosen.
 */
function priorityBucket(priority: string | null): "high" | "medium" | "low" | null {
  if (priority === "urgent" || priority === "high") return "high";
  if (priority === "normal") return "medium";
  if (priority === "low") return "low";
  return null;
}

/** Relative-time label for an ISO date string */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

/**
 * Whole days from today to a `YYYY-MM-DD` wall-clock date.
 *
 * Same arithmetic as `daysFromToday()` in /dashboard/lawyer/hearings, so «غداً»
 * on this page and «غداً» on the schedule mean the same day. The old version
 * took an ISO instant and `Math.ceil`d it, which turned a hearing 25 hours away
 * into "2 days"; hearings are stored as dates, not instants, so midnight-to-
 * midnight is the correct unit.
 */
function daysUntilDate(dateStr: string): number | null {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
}

/** «اليوم» / «غداً» / the weekday, from a real stored date. */
function dayLabel(dateStr: string): string {
  const days = daysUntilDate(dateStr);
  if (days === 0) return "اليوم";
  if (days === 1) return "غداً";
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Map the badge `describeRequestEvent()` returns onto this page's icon config.
 *
 * The previous version substring-matched the raw event token, which was wrong
 * twice over: it never matched anything real (no `request_events` token
 * contains "urgent", "overdue", "success" or "reject", so every row fell to
 * "info"), and the one match it did make was accidental — `email` contains
 * "ai", so `notification.email_sent` was painted as AI activity.
 */
function badgeToActivityType(badge: ActivityBadge): keyof typeof ACTIVITY_TYPE_CONFIG {
  switch (badge) {
    case "delivery":  return "success";
    // Amber «تنبيه» rather than red «عاجل»: a cancellation is a closed outcome,
    // not something the lawyer has to act on right now.
    case "cancelled": return "warning";
    default:          return "info";
  }
}

/** Short order reference — the same one the activity log and admin console quote. */
function shortRequestRef(requestId: string | undefined): string {
  // Owner item ٤ — was a third private copy of the short-reference format.
  return requestId ? `طلب ${orderReference(requestId)}` : "—";
}

/**
 * Copy `text` to the clipboard, reporting whether it actually landed there.
 *
 * Two tiers, because `navigator.clipboard` is unavailable on insecure origins
 * (plain http, which is how the dashboard is reached on the office LAN) and
 * rejects outright when the permission is denied. The textarea +
 * `execCommand("copy")` tier still works in those cases; it is deprecated but
 * not removed, and it returns a boolean we must honour rather than assume.
 *
 * The caller shows a success tick ONLY on `true` — a silent failure that still
 * ticked would send the lawyer off to paste an empty clipboard.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Insecure origin, denied permission, or an unfocused document — fall through.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    // Off-screen rather than hidden: `display:none` / `visibility:hidden`
    // elements cannot be selected, so the copy would silently do nothing.
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LawyerDashboardPage() {
  const { name, tier: userTier, userId, userType } = useUser();
  const { isDark } = useTheme();
  const [activityTab, setActivityTab] = useState<"all" | "ai">("all");
  const [showAddCase, setShowAddCase] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<LawyerDashboardSummary | null>(null);
  // The three states this screen has to keep apart. `loadError` holds the
  // reason the whole summary could not be read; a section that failed on its
  // own arrives as a `null` field inside `dashboardData` instead. Neither may
  // ever be rendered as an empty practice — see the comment on the fetch below.
  const [loadError, setLoadError] = useState<string | null>(null);
  // idle → the button; copied → the tick; manual → both copy tiers failed, so
  // the URL is shown in a selectable field for the lawyer to copy by hand.
  const [shareState, setShareState] = useState<"idle" | "copied" | "manual">("idle");
  const [profileUrl, setProfileUrl] = useState("");

  // Fetch real dashboard data, and re-fetch whenever a workflow item is
  // added/changed (the add-case / add-task modals dispatch nzamy-workflow-updated).
  //
  // This handler used to be `.catch(() => setLoading(false))` with no error
  // state at all, over a service whose own catch returned an all-zero summary.
  // The result was that an expired session or a database error painted four ٠
  // tiles, «لا توجد جلسات قادمة», «لا توجد مواعيد حرجة» and «لا توجد قضايا نشطة» —
  // a clean, complete, entirely false picture of the lawyer's own practice, with
  // nothing anywhere saying the read had failed. A lawyer who believes that
  // misses a hearing. Failure is now a state of its own, and it is visible.
  //
  // Nothing is set synchronously here — the previous error stays on screen
  // until the retry actually answers, rather than blinking away and leaving a
  // reassuring blank while the second attempt is still in flight (and it also
  // keeps this callable straight from an effect without a cascading render).
  const loadSummary = useCallback(() => {
    getLawyerDashboardSummary()
      .then((result) => {
        if (result.ok) {
          setDashboardData(result.summary);
          setLoadError(null);
        } else {
          setDashboardData(null);
          setLoadError(result.reason);
        }
      })
      .catch((err: unknown) => {
        // getLawyerDashboardSummary does not reject, but a future edit to it
        // must not be able to reintroduce a silent empty dashboard.
        console.error("[lawyer dashboard] summary load threw:", err);
        setDashboardData(null);
        setLoadError("تعذّر تحميل بيانات لوحة التحكم.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSummary();
    const handler = () => loadSummary();
    window.addEventListener("nzamy-workflow-updated", handler);
    return () => window.removeEventListener("nzamy-workflow-updated", handler);
  }, [loadSummary]);

  // ─── Public profile link ──────────────────────────────────────────────────
  //
  // The public profile lives at /lawyers/[slug], but `[slug]` is a misnomer:
  // there is no slug column on `profiles` or on `lawyer_profiles`, and every
  // real call site addresses that page by the profile id — the client's
  // find-lawyer list links `/lawyers/${l.id}`, and the route behind it,
  // /api/v1/lawyers/[id], filters `profiles.id`. So the per-user value is
  // `useUser().userId` (= profiles.id = auth user id), NOT a name-shaped slug.
  //
  // Two conditions have to hold before the link is safe to hand out, and BOTH
  // are currently false for at least some sessions:
  //   1. There is a signed-in id at all. Guests and every demo account resolve
  //      to a session with no `userId`, so there is nothing per-user to link.
  //   2. The public directory is open. Under BETA_MONOPOLY_MODE the whole
  //      /lawyers subtree redirects to /services/lawyers (see
  //      src/app/lawyers/layout.tsx), so the copied link would land the
  //      recipient on the firm's intake page instead of this lawyer.
  //
  // ⚠️ A third defect is not — and cannot be — gated from here: the profile
  // page itself never reads its route segment; it renders a module-level mock,
  // so every id shows the same fabricated lawyer. Whoever flips
  // BETA_MONOPOLY_MODE to false must fix src/app/lawyers/[slug]/page.tsx first,
  // or this button starts handing out a link to somebody else's name.
  //
  // The gate is the compile-time const, not a runtime flag: the admin features
  // screen lists BETA_MONOPOLY_MODE but holds it in a local array with no
  // persistence, and no platform_settings row backs it — its own teardown note
  // says removal «لا تتم من الواجهة فقط».
  const canShareProfile = Boolean(userId) && !BETA_MONOPOLY_MODE;
  // Monopoly mode is tested FIRST because it is the reason that applies to
  // everyone today. Ordering it after the id check would tell a demo lawyer —
  // which is how this dashboard is actually tested, demo sessions carry no
  // `userId` — to «sign in» while they are already signed in.
  const shareDisabledReason = BETA_MONOPOLY_MODE
    ? "صفحة الملف العام غير متاحة حالياً — دليل المحامين غير مفتوح للنشر بعد"
    : "سجّل الدخول بحسابك المهني لمشاركة رابط ملفك العام";

  const handleShareProfile = useCallback(async () => {
    if (!canShareProfile) return;
    const url = `${window.location.origin}/lawyers/${userId}`;
    setProfileUrl(url);
    // No tick unless the copy is confirmed; otherwise fall back to manual.
    setShareState((await copyToClipboard(url)) ? "copied" : "manual");
  }, [canShareProfile, userId]);

  // Let the «تم نسخ الرابط ✓» state lapse on its own, and cancel the timer on
  // unmount so it cannot fire against a gone component.
  useEffect(() => {
    if (shareState !== "copied") return;
    const timer = window.setTimeout(() => setShareState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [shareState]);

  // ─── Derived tier ─────────────────────────────────────────────────────────
  // Map the user's real subscription tier (UserTier) to the lawyer page's
  // LawyerTier vocabulary so the upgrade banner + AI-tool gating reflect the
  // actual plan instead of a hardcoded "free".
  function deriveLawyerTier(t: string | undefined | null): LawyerTier {
    switch (t) {
      case "max":
      case "corp":
      case "enterprise":
        return "premium";
      case "pro":
        return "pro";
      case "ai":
      case "shield":
        return "starter";
      default:
        return "free";
    }
  }
  const lawyerTier: LawyerTier = deriveLawyerTier(userTier);

  // ─── Computed stats ───────────────────────────────────────────────────────
  //
  // `value: null` means the server could not read that figure, and the tile
  // renders «تعذّر القراءة» for it. It must never fall back to ٠: this platform
  // legitimately answers ٠ all the time, so a zero standing in for a failure is
  // unfalsifiable from the lawyer's side.
  //
  // The trend badge that used to sit on every tile is gone. It rendered an ↑
  // (or an hourglass) beside an empty `trend` string, i.e. a growth claim with
  // no period, no baseline and no source.
  const stats = useMemo(() => {
    if (!dashboardData) return [];
    const revenue = dashboardData.revenueThisMonth;
    return [
      { label: "القضايا النشطة", value: dashboardData.activeCases === null ? null : String(dashboardData.activeCases), icon: Scales, color: "text-royal", bg: "bg-royal/8", sub: "نشطة" },
      { label: "الاستشارات المعلقة", value: dashboardData.pendingConsultations === null ? null : String(dashboardData.pendingConsultations), icon: Briefcase, color: "text-amber-500", bg: "bg-amber-500/8", sub: "بانتظار رد" },
      // «المواعيد», not «الجلسات»: the store behind it holds every schedule
      // type AddHearingModal offers — جلسة قضائية, طعن, مراجعة حكومية, موعد
      // موكل — so counting a client meeting under «الجلسات القادمة» would
      // overstate the court diary. The COUNT, not the length of the (capped)
      // list in the card beside it.
      { label: "المواعيد القادمة", value: dashboardData.upcomingHearingsCount === null ? null : String(dashboardData.upcomingHearingsCount), icon: Gavel, color: "text-blue-500", bg: "bg-blue-500/8", sub: "قادمة" },
      { label: "الإيرادات", value: revenue === null ? null : `${revenue.toLocaleString("ar-SA")} ﷼`, icon: Money, color: "text-emerald-500", bg: "bg-emerald-500/8", sub: "هذا الشهر" },
    ];
  }, [dashboardData]);

  // ─── Computed urgent tasks ─────────────────────────────────────────────────
  //
  // Real task rows now (`service_requests` with `metadata.task`), carrying the
  // priority and the due date the lawyer actually chose in «+ إضافة مهمة».
  //
  // What this replaces: `recentCases.slice(0,4)` with `priority` assigned from
  // the array index (first row always «high», with the pulsing red dot) and the
  // case's `updated_at` printed under a clock icon as if it were the delivery
  // date — so «تاريخ التسليم» showed a time in the PAST. Both real fields were
  // one metadata key away, and this very card's own «+ إضافة مهمة» button is
  // what writes them. It also meant «المهام العاجلة» and the «القضايا النشطة»
  // table below it rendered the identical four rows under two headings.
  const tasks = useMemo(() => {
    if (!dashboardData?.urgentTasks) return [];
    return dashboardData.urgentTasks.map((t) => {
      const days = t.dueDate ? daysUntilDate(t.dueDate) : null;
      return {
        id: t.id,
        title: t.title,
        // null → the card omits the whole due-date chip rather than printing
        // «—» or, worse, a date it made up.
        dueLabel: t.dueDate ? dayLabel(t.dueDate) : null,
        // A date in the past is stated as past. Without this the chip reads
        // «الخميس ٢٠ أغسطس» and a lawyer scanning the card has to do the
        // subtraction to notice the task is already late.
        overdue: days !== null && days < 0,
        priority: priorityBucket(t.priority),
        category: t.category ? TASK_CATEGORY_LABEL[t.category] ?? t.category : null,
      };
    });
  }, [dashboardData]);

  // ─── Computed recent cases ────────────────────────────────────────────────
  const recentCases = useMemo(() => {
    if (!dashboardData?.recentCases) return [];
    return dashboardData.recentCases.map((c) => ({
      id: c.id,
      title: c.title || "—",
      status: CASE_STATUS_LABEL[c.status] ?? { label: c.status, tone: "waiting" as const },
      date: c.updated_at ? relativeTime(c.updated_at) : null,
      type: c.type,
    }));
  }, [dashboardData]);

  // ─── Computed activity timeline ───────────────────────────────────────────
  const activityTimeline = useMemo(() => {
    if (!dashboardData?.recentActivity) return [];
    // API returns { id, event, created_at, request_id } — nothing else.
    // `event` is a raw namespaced token (`service_request.status_changed`), and
    // it used to be rendered verbatim, so this card showed English to the
    // lawyer. Since the summary route stopped filtering `request_events` by
    // actor, admin-performed claims/deliveries/cancellations land here too —
    // i.e. MORE raw tokens than before. Translate with the same helper the
    // activity log uses so both surfaces read identically.
    //
    // The route hands back neither the request's status nor its Arabic service
    // name, so describeRequestEvent() degrades to its generic line («طلب خدمة»)
    // and a coarse `status_changed` can't be resolved into claim/deliver/cancel
    // here — still Arabic, still accurate, just less specific than the activity
    // log. Widening the route would fix that, but it is not this page's to edit.
    //
    // `requestId` is deliberately not passed: the short reference is rendered
    // once in `caseRef` below, and passing it here would repeat it inside the
    // title of every «تم قيد طلبكم» row.
    const events = dashboardData.recentActivity;
    return events.map((e, i) => {
      const described = describeRequestEvent({ event: e.event });
      return {
        id: i + 1,
        time: relativeTime(e.created_at),
        action: described.title,
        type: badgeToActivityType(described.badge),
        caseRef: shortRequestRef(e.request_id),
        // Nothing in `request_events` records AI-tool usage, so no row can
        // honestly claim it. The old test matched `includes("ai")`, which only
        // ever fired on the "ai" inside `notification.email_sent` — the «نشاط
        // AI» tab was really an email-notice tab. It now shows its empty state
        // until something actually records AI usage.
        // The widening cast is load-bearing, not ceremony: without it this
        // infers the literal "manual" and `item.category === "ai"` in
        // `filteredTimeline` below stops compiling.
        category: "manual" as "ai" | "manual" | "system",
      };
    });
  }, [dashboardData]);

  // ─── Computed hearings and critical dates ─────────────────────────────────
  //
  // Both cards used to read `upcomingDeadlines`, which the summary route filled
  // from the `consultations` table — zero rows in production and no writer in
  // the repo. Real hearings live in `service_requests.metadata.date`, written by
  // AddHearingModal and read back by /dashboard/lawyer/hearings. So this page
  // printed «لا توجد جلسات قادمة» over hearings that page was listing, on the
  // same account, at the same moment. The route now reads the same store the
  // schedule does; these two memos just present it.
  //
  // Every string below comes off a stored field. The old block built `court` and
  // `case` from `d.type` — a column the query did not even select — so both
  // lines were «جلسة» / «موعد قادم» placeholders by construction.
  const hearings = useMemo(() => {
    if (!dashboardData?.upcomingHearings) return [];
    const palette = [
      { color: "text-red-500",   bg: isDark ? "bg-red-500/10"   : "bg-red-50",   borderColor: isDark ? "border-red-500/20"   : "border-red-200" },
      { color: "text-amber-500", bg: isDark ? "bg-amber-500/10" : "bg-amber-50", borderColor: isDark ? "border-amber-500/20" : "border-amber-200" },
      { color: "text-blue-500",  bg: isDark ? "bg-blue-500/10"  : "bg-blue-50",  borderColor: isDark ? "border-blue-500/20"  : "border-blue-200" },
    ];
    return dashboardData.upcomingHearings.map((h: LawyerDashboardHearing, i: number) => ({
      id: h.id,
      title: h.title,
      dateLabel: dayLabel(h.date),
      // Not defaulted: a hearing saved without a time shows no time at all
      // rather than an invented «١٢:٠٠ ص» that a lawyer could plan around.
      time: h.time,
      typeLabel: h.type ? HEARING_TYPE_LABEL[h.type] ?? null : null,
      location: h.location,
      ...palette[i % palette.length],
    }));
  }, [dashboardData, isDark]);

  // «مواعيد حرجة» — the same stored rows, narrowed by the route to the ones the
  // lawyer flagged critical or filed as an appeal/final deadline. `severity` is
  // computed from the real remaining days, not asserted.
  const criticalDeadlines = useMemo(() => {
    if (!dashboardData?.criticalDeadlines) return [];
    return dashboardData.criticalDeadlines.map((d: LawyerDashboardHearing) => {
      const days = daysUntilDate(d.date);
      return {
        id: d.id,
        label: d.title,
        typeLabel: d.type ? HEARING_TYPE_LABEL[d.type] ?? null : null,
        date: dayLabel(d.date),
        daysLeft: days,
        severity: (days === null ? "normal" : days <= 2 ? "urgent" : days <= 7 ? "warning" : "normal") as "urgent" | "warning" | "normal",
      };
    });
  }, [dashboardData]);

  // How many critical dates the card is NOT showing. Unlike «المواعيد القادمة»,
  // this card has no KPI tile beside it carrying the true total, so without
  // this line a fifth critical deadline would simply not exist on this screen.
  const hiddenCriticalCount = Math.max(
    0,
    (dashboardData?.criticalDeadlinesCount ?? 0) - criticalDeadlines.length,
  );

  // The banner below renders THIS row, not `[0]`. The old one was gated on
  // «some row is urgent» but always described row 0, so it could announce a
  // deadline three weeks out as the two-day emergency.
  const soonestUrgent = criticalDeadlines.find((d) => d.severity === "urgent") ?? null;

  if (loading) return <LawyerDashboardSkeleton />;

  // ─── Read failures ────────────────────────────────────────────────────────
  // `loadError` = the whole summary could not be fetched (every section below
  // is therefore unknown). `degraded` = the fetch succeeded but the server
  // could not read these particular sections. Both must be visible; neither may
  // be allowed to reach the screen as an empty practice.
  const failedSections = dashboardData?.degraded ?? [];
  const sectionFailed = (key: string) => Boolean(loadError) || failedSections.includes(key);
  const anyReadFailed = Boolean(loadError) || failedSections.length > 0;

  /** Shared «تعذّر القراءة» body for a card whose own section failed. */
  const readFailedBlock = (retryLabel = "إعادة المحاولة") => (
    <div className={`text-center py-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
      <Warning size={18} weight="fill" className="mx-auto mb-1.5 text-amber-500" />
      <p className="text-xs font-bold">تعذّرت قراءة هذا القسم</p>
      <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
        هذه ليست نتيجة فارغة — لم نتمكن من القراءة
      </p>
      <button
        type="button"
        onClick={loadSummary}
        className="mt-2 text-[11px] font-bold text-royal hover:underline cursor-pointer"
      >
        {retryLabel}
      </button>
    </div>
  );

  const card = `rounded-2xl border ${isDark
    ? "bg-zinc-900/60 border-white/[0.06]"
    : "bg-white border-slate-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"}`;

  const activityIconMap = Object.fromEntries(
    Object.entries(ACTIVITY_TYPE_CONFIG).map(([key, cfg]) => [
      key,
      {
        icon: cfg.icon,
        color: cfg.color,
        bg: isDark ? cfg.bgDark : cfg.bgLight,
        border: isDark ? cfg.borderDark : cfg.borderLight,
      },
    ])
  ) as Record<string, { icon: React.ElementType; color: string; bg: string; border: string }>;

  const filteredTimeline = activityTimeline.filter(
    item => activityTab === "all" || item.category === "ai"
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-5" dir="rtl">

      {/* ── Onboarding Welcome (first-visit only) ── */}
      <OnboardingBanner role="lawyer" name={name} isDark={isDark} />

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}
          >
            مرحباً، {name}
          </motion.h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            نظرة سريعة على أعمالك وقضاياك اليوم
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HijriDateWidget />
          {/* The title sits on the wrapper, not the button: a disabled control
              swallows pointer events in several browsers, and with it the only
              explanation of why this button is greyed out. */}
          <span
            className="inline-flex"
            title={canShareProfile ? "انسخ رابط ملفك المهني العام وشاركه مع موكليك" : shareDisabledReason}
          >
            <button
              type="button"
              onClick={handleShareProfile}
              disabled={!canShareProfile}
              aria-label={canShareProfile ? "مشاركة ملفي المهني" : shareDisabledReason}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                !canShareProfile
                  ? `opacity-50 cursor-not-allowed ${isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`
                  : shareState === "copied"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 cursor-pointer"
                    : `cursor-pointer ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`
              }`}
            >
              <ShareNetwork size={16} weight="duotone" />
              {shareState === "copied" ? "تم نسخ الرابط ✓" : "مشاركة ملفي المهني 🔗"}
            </button>
          </span>
          {/* The graph lives on the case detail page (?tab=graph), so this is a
              deep link and not a second implementation. There is no lawyer-facing
              "all cases" graph route — /dashboard/business/kanban renders a global
              one but its layout only admits corporate and admin — so this opens
              the most recently updated case. With no cases there is nothing to
              draw, and the control says so instead of linking nowhere. */}
          {recentCases.length > 0 ? (
            <Link href={`/dashboard/lawyer/cases/${recentCases[0].id}?tab=graph`}
              title="افتح جراف علاقات آخر قضية عملت عليها"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Graph size={16} weight="duotone" /> جراف القضايا 🕸️
            </Link>
          ) : (
            <span className="inline-flex" title="لا توجد قضايا بعد لعرض الجراف">
              <button type="button" disabled aria-label="لا توجد قضايا بعد لعرض الجراف"
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border opacity-50 cursor-not-allowed ${
                  isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"
                }`}
              >
                <Graph size={16} weight="duotone" /> جراف القضايا 🕸️
              </button>
            </span>
          )}
          <Link href="/dashboard/lawyer/marketplace"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
              isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#C8A762]/40 text-[#C8A762] hover:bg-[#C8A762]/5"
            }`}
          >
            <Storefront size={16} weight="duotone" /> نشر في السوق
          </Link>
          <Link href="/ai/draft"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90 transition-colors"
          >
            <PencilSimple size={16} weight="duotone" /> الصائغ القانوني
          </Link>
          <button onClick={() => setShowAddCase(true)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <Plus size={16} weight="bold" /> قضية جديدة
          </button>
        </div>
      </div>

      {/* ── Manual copy fallback ── */}
      {/* Last resort: neither the Clipboard API nor execCommand worked, so the
          link is put on screen in a selectable field. Deliberately no tick —
          nothing has been copied yet. */}
      {shareState === "manual" && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex flex-wrap items-center gap-3 ${
            isDark ? "border-white/[0.08] bg-zinc-900/60" : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex-1 min-w-[220px]">
            <p className={`text-[13px] font-bold mb-1.5 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
              تعذّر النسخ تلقائياً — انسخ الرابط يدوياً
            </p>
            <input
              type="text"
              dir="ltr"
              readOnly
              value={profileUrl}
              onFocus={(e) => e.currentTarget.select()}
              className={`w-full rounded-xl border px-3 py-2 text-[12px] font-mono text-left ${
                isDark ? "border-white/10 bg-black/20 text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => setShareState("idle")}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            إغلاق
          </button>
        </motion.div>
      )}

      {/* ── Read-failure banner ── */}
      {/* The single most important element on this page when it appears. Six
          practising lawyers read this screen for their hearings; without this
          banner a failed read is indistinguishable from a quiet week. */}
      {anyReadFailed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex flex-wrap items-center gap-3 ${isDark ? "border-amber-500/30 bg-amber-900/15" : "border-amber-300 bg-amber-50"}`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
            <Warning size={18} weight="fill" className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              {loadError ? "تعذّر تحميل بيانات لوحة التحكم" : "تعذّرت قراءة بعض بيانات لوحة التحكم"}
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-amber-700/70"}`}>
              {loadError
                ? `${loadError} لا تعتمد على ما يظهر هنا الآن — راجع جدول الجلسات مباشرة.`
                : "الأقسام المعلَّمة أدناه لم تُقرأ، وليست فارغة. باقي الأرقام سليمة."}
            </p>
          </div>
          <button
            type="button"
            onClick={loadSummary}
            className={`shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              isDark ? "bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14]" : "bg-white text-amber-800 border border-amber-300 hover:bg-amber-100"
            }`}
          >
            <ArrowClockwise size={13} weight="bold" /> إعادة المحاولة
          </button>
        </motion.div>
      )}

      {/* ── Subscription Banner ── */}
      {(lawyerTier === "free" || lawyerTier === "starter") && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex flex-wrap items-center gap-3 ${
            isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/70"
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B3D2E] text-[#C8A762]">
            <Crown size={17} weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
              باقة {TIER_CONFIG[lawyerTier].labelAr} — الصائغ القانوني ومفرغ الجلسات غير متاحَين
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {lawyerTier === "free"
                ? `حد الاشتراك: ${TIER_CONFIG.free.caseLimit} قضايا · ${TIER_CONFIG.free.consultLimit} استشارة`
                : `حد الاشتراك: ${TIER_CONFIG.starter.caseLimit} قضايا · ${TIER_CONFIG.starter.consultLimit} استشارات`
              } · ترقَّ للاحترافي أو المميز للوصول الكامل
            </p>
          </div>
          <Link
            href="/settings?tab=subscription"
            className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-[#C8A762] hover:bg-[#155e41] transition-colors"
          >
            ترقية الباقة <ArrowRight size={12} />
          </Link>
        </motion.div>
      )}

      {/* ── Demo Data Banner (only in demo mode) ── */}
      {!isSupabaseMode && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
            <Warning size={18} weight="fill" className="text-amber-500" />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>تعمل المنصة في الوضع التجريبي — اضبط NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase لعرض بياناتك الفعلية.</p>
          </div>
        </motion.div>
      )}

      {/* ── Urgent Deadlines Banner ── */}
      {/* Describes the row that triggered it, in its own words. The previous
          version hardcoded «لديك موعد طعن خلال يومين» over whatever happened to
          be first in the list — so a client meeting could be announced as an
          appeal deadline, and a date eight days out as two days away. */}
      {soonestUrgent && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-700/30 bg-red-900/10" : "border-red-200 bg-red-50"}`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/15" : "bg-red-100"}`}>
            <Lightning size={18} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>
              <Warning size={14} weight="fill" className="inline mb-0.5 me-1" />
              {soonestUrgent.daysLeft === 0
                ? "موعد اليوم"
                : soonestUrgent.daysLeft === 1
                  ? "موعد غداً"
                  : `موعد خلال ${soonestUrgent.daysLeft} أيام`} — {soonestUrgent.label}
            </p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-red-600/60"}`}>
              {soonestUrgent.date}{soonestUrgent.typeLabel ? ` · ${soonestUrgent.typeLabel}` : ""}
            </p>
          </div>
          <Link href="/dashboard/lawyer/hearings"
            className="flex items-center gap-1 text-[12px] font-bold text-red-500 hover:underline flex-shrink-0"
          >
            عرض المواعيد <CaretLeft size={11} />
          </Link>
        </motion.div>
      )}

      {/* ── Quick Actions Bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, type: "spring", stiffness: 180, damping: 22 }}
        className={`rounded-2xl border p-3 ${isDark
          ? "bg-zinc-900/40 border-white/[0.05]"
          : "bg-white border-slate-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"}`}
      >
        <div className="flex items-center gap-1 flex-wrap">
          {/* Section label */}
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 shrink-0 ${
            isDark ? "text-zinc-600" : "text-slate-400"
          }`}>
            إجراءات سريعة
          </span>
          <div className={`h-4 w-px mx-1 shrink-0 ${ isDark ? "bg-white/10" : "bg-slate-200"}`} />

          {[
            { label: "قضية جديدة",      icon: Plus,          action: () => setShowAddCase(true),  shortcut: "Q",  accent: false },
            { label: "استشارة جديدة",    icon: CalendarCheck, href: "/dashboard/lawyer/consultations?book=1", shortcut: "C",  accent: false },
            { label: "صيغ مستند",       icon: PencilSimple,  href: "/ai/draft",   shortcut: "D",  accent: true  },
            { label: "جدول الجلسات",     icon: Gavel,         href: "/dashboard/lawyer/hearings", shortcut: "",   accent: false },
            { label: "مستنداتي",           icon: Folder,        href: "/dashboard/lawyer/documents", shortcut: "",  accent: false },
            { label: "تتبع الوقت",        icon: Timer,         href: "/dashboard/lawyer/tasks",    shortcut: "",   accent: false },
          ].map((item) => {
            const Icon = item.icon;
            const base = `flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all select-none ${
              item.accent
                ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90"
                : isDark
                  ? "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            }`;
            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={base}>
                  <Icon size={14} weight="duotone" />
                  {item.label}
                  {item.shortcut && (
                    <kbd className={`ms-1 hidden sm:inline text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      item.accent ? "bg-white/10 text-[#C8A762]/70" : isDark ? "bg-white/[0.07] text-zinc-600" : "bg-slate-200 text-slate-400"
                    }`}>{item.shortcut}</kbd>
                  )}
                </Link>
              );
            }
            return (
              <button key={item.label} onClick={item.action} className={base}>
                <Icon size={14} weight="duotone" />
                {item.label}
                {item.shortcut && (
                  <kbd className={`ms-1 hidden sm:inline text-[9px] px-1.5 py-0.5 rounded font-mono ${
                    isDark ? "bg-white/[0.07] text-zinc-600" : "bg-slate-200 text-slate-400"
                  }`}>{item.shortcut}</kbd>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ── KPI Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.length === 0 ? (
          // Reached only when the whole summary failed; the banner above already
          // says why, so this states the same fact rather than «لا توجد إحصائيات»,
          // which reads as "you have none".
          <div className={`col-span-full text-center py-8 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            <p className="text-sm font-bold">تعذّرت قراءة الإحصائيات</p>
            <button type="button" onClick={loadSummary} className="mt-1.5 text-xs font-bold text-royal hover:underline cursor-pointer">
              إعادة المحاولة
            </button>
          </div>
        ) : stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`${card} p-5`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg}`}>
                  <Icon size={20} weight="duotone" className={stat.color} />
                </div>
                {/* A failed figure is marked on the tile itself, so the number
                    slot below can never be mistaken for a real ٠. */}
                {stat.value === null && (
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                    isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-600 border border-amber-200"
                  }`}>
                    <Warning size={9} weight="fill" /> تعذّرت القراءة
                  </span>
                )}
              </div>
              <p className={`text-[11px] mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{stat.label}</p>
              {stat.value === null ? (
                <p className={`text-xl font-bold font-mono ${isDark ? "text-zinc-600" : "text-slate-300"}`}>—</p>
              ) : (
                <p className={`text-xl font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{stat.value}</p>
              )}
              <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {stat.value === null ? "غير معروف" : stat.sub}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* ── Secondment: no real data yet — entry point is the sidebar link to /dashboard/lawyer/secondment (gated there) ── */}

      {/* ── Second Grid: Tasks + Hearings + Deadlines ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Urgent Tasks */}
        <div className={`${card} p-5 flex flex-col`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              {/* «أقرب المهام», not «المهام العاجلة»: this list is the lawyer's
                  open tasks sorted by the due date they set — nothing marks any
                  of them urgent. The old heading was the invented-priority bug
                  restated in the title bar. */}
              <CheckCircle size={15} className="text-royal" weight="duotone" /> أقرب المهام
            </h2>
            <Link href="/dashboard/lawyer/tasks" className="text-xs text-royal hover:underline">عرض الكل</Link>
          </div>
          <div className="space-y-2 flex-1">
            {sectionFailed("tasks") ? readFailedBlock() : tasks.length === 0 ? (
              <div className={`text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">لا توجد مهام مفتوحة</p>
              </div>
            ) : tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-2.5 p-3 rounded-xl border transition-colors ${isDark ? "border-white/[0.04] bg-white/[0.02]" : "border-slate-100 bg-slate-50/80"}`}
              >
                {/* No dot when the task carries no priority — a grey-green
                    "low" marker over an unset field is a claim about urgency
                    the lawyer never made. */}
                {task.priority && (
                  <div className={`w-2 h-2 mt-1.5 flex-shrink-0 rounded-full ${task.priority === "high" ? "bg-red-400" : task.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium leading-snug mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{task.title}</p>
                  <div className={`flex flex-wrap items-center gap-2 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {/* Both chips are omitted entirely when their field is
                        unset, rather than rendered as «—» or back-filled from
                        some other column. */}
                    {task.dueLabel && (
                      <span className={`flex items-center gap-1 ${task.overdue ? "text-red-500 font-bold" : ""}`}>
                        <Clock size={10} /> {task.overdue ? `متأخرة · ${task.dueLabel}` : task.dueLabel}
                      </span>
                    )}
                    {task.category && (
                      <span className={`px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{task.category}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowAddTask(true)} className={`w-full mt-3 py-2.5 border border-dashed rounded-xl text-xs font-medium transition-colors ${isDark ? "border-white/10 text-zinc-600 hover:border-white/20 hover:text-zinc-400" : "border-slate-200 text-slate-400 hover:border-royal/30 hover:text-royal"}`}>
            + إضافة مهمة
          </button>
        </div>

        {/* Upcoming Hearings */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <CalendarCheck size={15} className="text-blue-500" weight="duotone" /> المواعيد القادمة
            </h2>
            <Link href="/dashboard/lawyer/hearings" className="text-xs text-royal hover:underline">الجدول الكامل</Link>
          </div>
          <div className="space-y-2.5">
            {sectionFailed("hearings") ? readFailedBlock() : hearings.length === 0 ? (
              <div className={`text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">لا توجد جلسات قادمة</p>
              </div>
            ) : hearings.map((h) => (
              <div key={h.id} className={`p-3.5 rounded-xl border ${h.borderColor} ${h.bg}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[11px] font-bold ${h.color}`}>
                    {h.dateLabel}{h.time ? ` · ${h.time}` : ""}
                  </span>
                  <Gavel size={13} className={h.color} weight="duotone" />
                </div>
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{h.title}</p>
                {(h.typeLabel || h.location) && (
                  <p className={`flex items-center gap-1 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {h.typeLabel}
                    {h.typeLabel && h.location ? " · " : ""}
                    {h.location && <><MapPin size={10} weight="duotone" />{h.location}</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Critical Deadlines */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Flag size={15} className="text-red-500" weight="fill" /> مواعيد حرجة
            </h2>
          </div>
          <div className="space-y-2">
            {sectionFailed("hearings") ? readFailedBlock() : criticalDeadlines.length === 0 ? (
              <div className={`text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">لا توجد مواعيد حرجة</p>
              </div>
            ) : criticalDeadlines.map((d, i) => {
              const severityConfig = {
                urgent:  { bar: "bg-red-500",   text: isDark ? "text-red-400"   : "text-red-600",   bg: isDark ? "bg-red-500/10"   : "bg-red-50",   border: isDark ? "border-red-500/20"   : "border-red-200" },
                warning: { bar: "bg-amber-500", text: isDark ? "text-amber-400" : "text-amber-600", bg: isDark ? "bg-amber-500/10" : "bg-amber-50", border: isDark ? "border-amber-500/20" : "border-amber-200" },
                normal:  { bar: "bg-blue-500",  text: isDark ? "text-blue-400"  : "text-blue-600",  bg: isDark ? "bg-blue-500/10"  : "bg-blue-50",  border: isDark ? "border-blue-500/20"  : "border-blue-200" },
              };
              const cfg = severityConfig[d.severity];
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={`rounded-xl p-3.5 border ${cfg.border} ${cfg.bg}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-[13px] font-bold ${cfg.text}`}>{d.label}</p>
                    {/* `daysLeft` is null only when the stored date will not
                        parse; then the countdown chip is omitted rather than
                        showing «٠ أيام», which would read as "today". */}
                    {d.daysLeft !== null && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.severity === "urgent" ? "bg-red-500 text-white" : isDark ? "bg-white/[0.06] text-zinc-400" : "bg-white text-slate-500"}`}>
                        {d.daysLeft === 0 ? "اليوم!" : d.daysLeft === 1 ? "غداً" : `${d.daysLeft} أيام`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarCheck size={11} className={cfg.text} />
                    <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      {d.date}{d.typeLabel ? ` · ${d.typeLabel}` : ""}
                    </span>
                  </div>
                  {d.daysLeft !== null && (
                    <div className={`h-1 rounded-full mt-2 overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-white"}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(10, 100 - (d.daysLeft * 10)))}%` }}
                        transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                        className={`h-full rounded-full ${cfg.bar}`}
                      />
                    </div>
                  )}
                </motion.div>
              );
            })}
            {hiddenCriticalCount > 0 && (
              <Link href="/dashboard/lawyer/hearings"
                className={`block text-center text-[11px] font-bold pt-1 text-royal hover:underline`}
              >
                و{hiddenCriticalCount} موعد حرج آخر — عرض الجدول
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Grid: Activity + Cases ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activity Timeline */}
        <div className={`${card} p-5 flex flex-col`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Clock size={15} className="text-[#C8A762]" weight="duotone" /> سجل النشاط
            </h2>
            <div className={`p-0.5 rounded-lg border flex ${isDark ? "bg-black/20 border-white/5" : "bg-slate-100 border-slate-200"}`}>
              <button
                onClick={() => setActivityTab("all")}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${activityTab === "all" ? (isDark ? "bg-[#C8A762] text-zinc-900" : "bg-white text-slate-800 shadow-sm") : (isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700")}`}
              >الكل</button>
              <button
                onClick={() => setActivityTab("ai")}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${activityTab === "ai" ? (isDark ? "bg-[#C8A762] text-zinc-900" : "bg-white text-[#C8A762] shadow-sm") : (isDark ? "text-zinc-500 hover:text-[#C8A762]" : "text-slate-500 hover:text-[#C8A762]")}`}
              >
                <Robot size={12} weight={activityTab === "ai" ? "fill" : "regular"} /> نشاط AI
              </button>
            </div>
          </div>
          <div className="space-y-0 flex-1 relative mt-2">
            <div className={`absolute top-3 bottom-3 w-px ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} style={{ right: "13px" }} />
            {sectionFailed("recentActivity") ? readFailedBlock() : filteredTimeline.length === 0 ? (
              <div className={`text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">
                  {activityTab === "ai" ? "لا يُسجَّل استخدام أدوات الذكاء الاصطناعي بعد" : "لا يوجد نشاط حالياً"}
                </p>
              </div>
            ) : (
            <AnimatePresence mode="popLayout">
              {filteredTimeline.map((item, i) => {
                const config = activityIconMap[item.type] ?? activityIconMap["info"];
                const ActivityIcon = config.icon;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: 8, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.95 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-3 py-2.5 relative"
                  >
                    <div className={`flex-shrink-0 w-[27px] h-[27px] rounded-lg flex items-center justify-center z-10 ${config.bg} border ${config.border}`}>
                      <ActivityIcon size={12} weight={item.type === "ai" ? "duotone" : "fill"} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-bold leading-snug ${item.type === "ai" ? (isDark ? "text-[#C8A762]" : "text-slate-800") : (isDark ? "text-zinc-300" : "text-slate-700")}`}>
                        {item.action}
                      </p>
                      <div className={`flex items-center gap-2 mt-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                        <span className="flex items-center gap-1"><Clock size={10} /> {item.time}</span>
                        <span>·</span>
                        <span className="truncate">{item.caseRef}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            )}
          </div>
        </div>

        {/* Cases Table */}
        <div className={`lg:col-span-2 ${card} p-5`}>
          <div className="flex items-center justify-between mb-4">
            {/* «أحدث القضايا», not «القضايا النشطة»: this list deliberately
                includes completed cases, so the old heading contradicted the
                «مكتملة» rows inside it. The active COUNT is the KPI tile above. */}
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Scales size={15} className="text-royal" weight="duotone" /> أحدث القضايا
            </h2>
            <Link href="/dashboard/lawyer/cases" className="text-xs text-royal hover:underline flex items-center gap-1">
              إدارة القضايا <CaretLeft size={10} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[500px]">
              <thead>
                <tr className={`border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                  {/* «الخطوة القادمة» was dropped: it read `metadata.next_step`,
                      a key NOTHING in this repository writes, so the column was
                      «—» on every row of every account — a heading promising a
                      case-plan feature that does not exist. */}
                  {["اسم القضية", "النوع", "الحالة", "آخر تحديث", ""].map((h, i) => (
                    <th key={i} className={`pb-3 text-[11px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-white/[0.04]" : "divide-slate-50"}`}>
                {sectionFailed("cases") ? (
                  <tr>
                    <td colSpan={5} className="py-2">{readFailedBlock()}</td>
                  </tr>
                ) : recentCases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      <p className="text-xs">لا توجد قضايا بعد</p>
                    </td>
                  </tr>
                ) : recentCases.map((c) => (
                  <tr key={c.id} className={`group transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/50"}`}>
                    <td className="py-3.5">
                      <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.title}</p>
                    </td>
                    <td className="py-3.5">
                      {/* No «عام» default: the row's real type or nothing. */}
                      {c.type && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                          {c.type}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        c.status.tone === "active"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : c.status.tone === "done"
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      }`}>
                        {c.status.label}
                      </span>
                    </td>
                    <td className={`py-3.5 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{c.date ?? ""}</td>
                    <td className="py-3.5 pl-2">
                      <Link href={`/dashboard/lawyer/cases/${c.id}`}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${isDark ? "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300" : "text-slate-300 hover:bg-royal hover:text-white"}`}
                      >
                        <CaretLeft size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── AI Quick Access ── */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Robot size={14} className="text-[#C8A762]" weight="duotone" />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              أدوات نظامي AI — وصول سريع
            </span>
          </div>
          <Link href="/ai" className={`text-xs font-semibold text-royal hover:underline`}>عرض الكل</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {AI_QUICK.map((item) => {
            const Icon = item.icon;
            // Lock الصائغ ومحترف العقود (can act as المفرغ) for free/starter
            const isLocked =
              (item.href === "/ai/draft" && !TIER_CONFIG[lawyerTier].canDraft) ||
              (item.href === "/ai/contracts" && !TIER_CONFIG[lawyerTier].canScribe);

            if (isLocked) {
              return (
                <div key={item.href}
                  className={`group relative flex flex-col items-center gap-2 px-4 py-4 rounded-xl border text-center opacity-50 cursor-not-allowed select-none ${
                    isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <span className={`absolute -top-1.5 -left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-600 text-white`}>
                    محجوب
                  </span>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isDark ? "bg-white/[0.03]" : "bg-slate-100"
                  }`}>
                    <Lock size={18} weight="duotone" className={isDark ? "text-zinc-600" : "text-slate-300"} />
                  </div>
                  <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.label}</span>
                  <span className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>متاح في الاحترافي ↑</span>
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href}
                className={`group relative flex flex-col items-center gap-2 px-4 py-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-[#0B3D2E]/15 hover:border-[#C8A762]/20" : "border-slate-100 hover:border-royal/20 hover:bg-royal/[0.02]"}`}
              >
                {item.badge && (
                  <span className={`absolute -top-1.5 -left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.hot ? "bg-royal text-white" : "bg-amber-500/20 text-amber-600 border border-amber-500/30"}`}>
                    {item.badge}
                  </span>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isDark ? "bg-white/[0.04] group-hover:bg-[#0B3D2E]/30" : "bg-royal/5 group-hover:bg-royal/10"}`}>
                  <Icon size={20} weight="duotone" className="text-royal" />
                </div>
                <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{item.label}</span>
                <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.desc}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── AI Secretary Notice — REMOVED ────────────────────────────────────
          Deleted here: a card, rendered unconditionally with no state and no
          query, that told every lawyer «التقرير اليومي من السكرتير الذكي جاهز»
          and «جداولك مزدحمة غداً — تم تحضير مسودات الردود المطلوبة تلقائياً»,
          over a «مراجعة» link to /ai/secretary.

          Nothing on the page computed a schedule density; no daily report is
          fetched anywhere; and it appeared identically on an account with zero
          hearings and zero requests. The destination does not hold the report
          either — /ai/secretary is built entirely on literals, down to a
          greeting hardcoded to a different person's name. So the claim, the
          drafts it promised, and the evidence page behind it were all fiction,
          and a lawyer could act on it: «مسودات الردود جاهزة» is a reason not to
          write the replies yourself tonight.

          Not replaced with an honest empty state, because there is no daily
          report — no record, no table, no job. There is nothing here to be
          empty of. /ai/secretary itself is out of this group's file list and is
          reported as a followUp. ────────────────────────────────────────────── */}

      {/* ── Modals ── */}
      <AnimatePresence>
        {/* `user` is what makes the case land in this lawyer's workspace.
            Without it AddCaseModal sends `assignedTo: undefined` → the server
            stores `assigned_to: null` → every summary query here filters on
            that column, so a case created from this page showed a «تم» success
            screen and then never appeared again. The identical flow on
            /dashboard/lawyer/cases passes the prop and works, which is exactly
            what made this look like the lawyer's mistake. */}
        {showAddCase && (
          <AddCaseModal
            onClose={() => setShowAddCase(false)}
            isDark={isDark}
            user={{ userId, name, userType, tier: userTier }}
          />
        )}
        {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} isDark={isDark} />}
      </AnimatePresence>

    </div>
  );
}
