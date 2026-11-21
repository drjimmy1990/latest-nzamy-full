"use client";

/**
 * /dashboard/admin/community/moderation — «مراجعة المجتمع» (owner ٤٢, 18 Nov
 * 2026; batch l7 decision 13).
 *
 * While review before publishing is on, every member's new question and
 * answer waits here ('pending_review', 20261127_60) and is public only after
 * «اعتماد». «رفض» needs a reason, which the author reads on his own row and
 * in a notification. The switch at the top turns the review on or off
 * (platform_settings.community_prepublish_review, settings.write).
 *
 * Everything on this page is what the server returned: no demo rows, and a
 * failed read says so instead of showing an empty queue.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  ChatCircle,
  CheckCircle,
  Flag,
  MagnifyingGlass,
  Question,
  ShieldWarning,
  SpinnerGap,
  Trash,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { toArabicDigits } from "@/lib/services/arabicCount";
import type { ModerationUiStatus } from "@/lib/community/review";

type Kind = "post" | "answer";
type StatusFilter = ModerationUiStatus | "all";

interface QueueItem {
  id: string;
  kind: Kind;
  postId: string;
  postTitle: string;
  body: string;
  author: string;
  isLawyerVerified: boolean;
  status: ModerationUiStatus;
  reviewNote: string | null;
  reportCount: number;
  reportReason: string | null;
  createdAt: string;
}

interface QueueRead {
  data: QueueItem[];
  total: number | null;
  pending: { posts: number | null; answers: number | null };
  prepublishReview: boolean | null;
  /** Q131a (l12): the AI pre-publish review switch; null = 20261202_70 not run. */
  aiReview: { enabled: boolean | null; configured: boolean };
}

const STATUS_LABEL: Record<ModerationUiStatus, string> = {
  pending: "بانتظار المراجعة",
  approved: "معتمد ومنشور",
  rejected: "مرفوض أو محذوف",
  escalated: "مصعّد قانونياً",
};

const FILTERS: Array<[StatusFilter, string]> = [
  ["pending", "بانتظار المراجعة"],
  ["approved", "المعتمد"],
  ["rejected", "المرفوض"],
  ["escalated", "المصعّد"],
  ["all", "الكل"],
];

function whenAr(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
}

export default function AdminCommunityModerationPage() {
  const { isDark } = useTheme();
  const [kind, setKind] = useState<Kind>("post");
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [read, setRead] = useState<QueueRead | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const params = new URLSearchParams({ kind, status: filter, limit: "100" });
      if (query) params.set("search", query);
      const res = await fetch(`/api/v1/admin/community/moderation?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as QueueRead;
      setRead({
        data: Array.isArray(json.data) ? json.data : [],
        total: typeof json.total === "number" ? json.total : null,
        pending: json.pending ?? { posts: null, answers: null },
        prepublishReview: typeof json.prepublishReview === "boolean" ? json.prepublishReview : null,
        aiReview: {
          enabled: typeof json.aiReview?.enabled === "boolean" ? json.aiReview.enabled : null,
          configured: json.aiReview?.configured === true,
        },
      });
      setState("ready");
    } catch {
      setState("error");
    }
  }, [kind, filter, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(item: QueueItem, action: "approve" | "reject" | "escalate" | "remove", why?: string) {
    if (busy) return;
    setBusy(item.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/community/moderation/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, action, reason: why }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "تعذّر حفظ القرار");
      setRejecting(null);
      setReason("");
      setMessage({
        tone: "ok",
        text:
          action === "approve"
            ? "اعتُمد وأصبح ظاهراً للأعضاء، وأُبلغ صاحبه."
            : action === "reject"
              ? "رُفض، وأُبلغ صاحبه بالسبب."
              : action === "escalate"
                ? "صُعّد للمراجعة القانونية ولا يظهر للأعضاء."
                : "حُذف ولا يظهر للأعضاء.",
      });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "تعذّر حفظ القرار — لم يتغيّر شيء." });
    } finally {
      setBusy(null);
    }
  }

  async function setReview(on: boolean) {
    if (busy) return;
    setBusy("setting");
    setMessage(null);
    try {
      const res = await fetch("/api/v1/admin/community/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepublishReview: on }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "تعذّر حفظ الإعداد");
      setMessage({
        tone: "ok",
        text: on
          ? "المراجعة قبل النشر مفعّلة: كل سؤال أو إجابة جديدة تنتظر الاعتماد."
          : "أُوقفت المراجعة قبل النشر: الجديد يُنشر فوراً، وما ينتظر في الطابور يبقى حتى تقرر فيه.",
      });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "تعذّر حفظ الإعداد" });
    } finally {
      setBusy(null);
    }
  }

  async function setAiReview(on: boolean) {
    if (busy) return;
    setBusy("ai-setting");
    setMessage(null);
    try {
      const res = await fetch("/api/v1/admin/community/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiReview: on }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "تعذّر حفظ الإعداد");
      setMessage({
        tone: "ok",
        text: on
          ? "المراجعة الآلية مفعّلة: يقرر الوكيل النشر أو الرفض، وما لا يحسمه يبقى هنا."
          : "أُوقفت المراجعة الآلية: كل ما ينتظر المراجعة يُعتمد من هنا.",
      });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "تعذّر حفظ الإعداد" });
    } finally {
      setBusy(null);
    }
  }

  const card = `rounded-2xl border ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const strong = isDark ? "text-white" : "text-gray-900";
  const items = read?.data ?? [];
  const review = read?.prepublishReview ?? null;
  const ai = read?.aiReview ?? null;
  const count = (n: number | null | undefined) => (typeof n === "number" ? toArabicDigits(n) : "—");

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-[1400px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-rose-500/10 text-rose-300" : "bg-rose-50 text-rose-700"}`}>
              <ShieldWarning size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black ${strong}`}>مراجعة المجتمع</h1>
          </div>
          <p className={`text-sm ${muted}`}>
            الأسئلة والإجابات الجديدة لا تظهر للأعضاء قبل اعتمادها (هنا، أو بالمراجعة الآلية إن كانت مفعّلة). أسماء الكاتبين تظهر لفريق المراجعة فقط.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border w-fit ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
        >
          <ArrowClockwise size={14} /> تحديث
        </button>
      </div>

      {/* The switch (owner ٤٢: «في الأسابيع الأولى») */}
      <div className={`${card} p-5 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div>
          <p className={`font-black ${strong}`}>المراجعة قبل النشر</p>
          <p className={`text-xs mt-1 ${muted}`}>
            {review === null
              ? "حالة الإعداد غير معروفة الآن (تعذّرت قراءته، أو لم يُشغَّل ملف الترحيل 20261127_60 بعد — وعندها يُنشر كل جديد فوراً)."
              : review
                ? "مفعّلة: كل سؤال أو إجابة جديدة من عضو تنتظر الاعتماد. منشورات فريق الإدارة تُنشر فوراً."
                : "موقوفة: الجديد يُنشر فوراً. التعديل على منشور معتمد لا يعود إلى المراجعة."}
          </p>
        </div>
        {review !== null && (
          <button
            type="button"
            disabled={busy === "setting"}
            onClick={() => void setReview(!review)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-50 ${review ? isDark ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10" : "border-amber-300 text-amber-800 hover:bg-amber-50" : "border-emerald-500/30 bg-emerald-600 text-white hover:bg-emerald-700"}`}
          >
            {review ? "إيقاف المراجعة قبل النشر" : "تفعيل المراجعة قبل النشر"}
          </button>
        )}
      </div>

      {/* Q131a (l12): the AI pre-publish review — a filter only, it never answers */}
      <div className={`${card} p-5 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div>
          <p className={`font-black ${strong}`}>المراجعة الآلية قبل النشر (وكيل ذكاء اصطناعي)</p>
          <p className={`text-xs mt-1 ${muted}`}>
            {ai === null || ai.enabled === null
              ? "غير متاحة بعد (لم يُشغَّل ملف الترحيل 20261202_70)."
              : ai.enabled
                ? ai.configured
                  ? "مفعّلة: يقرأ الوكيل كل سؤال أو إجابة تنتظر المراجعة فيقرر النشر أو الرفض بسبب محدد، وما لا يحسمه أو يتعذّر عليه يبقى هنا. لا يجيب الوكيل عن الأسئلة."
                  : "مفعّلة، لكن الخادم غير موصول بخدمة الذكاء الاصطناعي الآن، فيبقى كل جديد هنا للمراجعة."
                : "موقوفة: كل ما ينتظر المراجعة يُعتمد من هذه الصفحة."}
          </p>
        </div>
        {ai !== null && ai.enabled !== null && (
          <button
            type="button"
            disabled={busy === "ai-setting"}
            onClick={() => void setAiReview(!ai.enabled)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-50 ${ai.enabled ? isDark ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10" : "border-amber-300 text-amber-800 hover:bg-amber-50" : "border-emerald-500/30 bg-emerald-600 text-white hover:bg-emerald-700"}`}
          >
            {ai.enabled ? "إيقاف المراجعة الآلية" : "تفعيل المراجعة الآلية"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {([
          ["post", "أسئلة بانتظار المراجعة", read?.pending.posts, Question],
          ["answer", "إجابات بانتظار المراجعة", read?.pending.answers, ChatCircle],
        ] as const).map(([k, label, n, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setKind(k); setFilter("pending"); }}
            className={`${card} p-5 flex items-center justify-between text-right ${kind === k ? "ring-2 ring-[#C8A762]" : ""}`}
          >
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{label}</p>
              <p className={`text-2xl font-black font-mono ${strong}`}>{state === "ready" ? count(n) : "…"}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white/5 text-[#C8A762]" : "bg-gray-100 text-[#0B3D2E]"}`}>
              <Icon size={22} weight="duotone" />
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className={`flex gap-1 p-1 rounded-2xl border w-fit ${isDark ? "border-white/10" : "border-gray-200 bg-white"}`} role="tablist">
          {(["post", "answer"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`px-4 py-2 rounded-xl text-xs font-bold ${kind === k ? "bg-[#0B3D2E] text-white" : muted}`}
            >
              {k === "post" ? "الأسئلة" : "الإجابات"}
            </button>
          ))}
        </div>
        <div className={`flex flex-wrap gap-1 p-1 rounded-2xl border w-fit ${isDark ? "border-white/10" : "border-gray-200 bg-white"}`}>
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-bold ${filter === f ? "bg-[#C8A762] text-[#0B3D2E]" : muted}`}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className={`${card} px-3 flex items-center gap-2 flex-1`}
          onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
        >
          <MagnifyingGlass size={16} className={muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث في النص ثم اضغط Enter…"
            className={`w-full bg-transparent outline-none py-2 text-sm ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`}
          />
        </form>
      </div>

      {message && (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${message.tone === "error" ? isDark ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700" : isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {state === "loading" ? (
        <div className={`${card} p-12 flex flex-col items-center`}>
          <SpinnerGap size={28} className="animate-spin text-[#C8A762] mb-3" />
          <p className={`text-sm ${muted}`}>جارٍ تحميل طابور المراجعة…</p>
        </div>
      ) : state === "error" ? (
        <div className={`${card} p-12 flex flex-col items-center text-center`}>
          <WarningCircle size={32} weight="fill" className="text-amber-500 mb-3" />
          <p className={`font-black mb-1 ${strong}`}>تعذّر تحميل طابور المراجعة</p>
          <p className={`text-sm mb-4 ${muted}`}>هذا ليس طابوراً فارغاً — لم نتمكّن من قراءته الآن.</p>
          <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3D2E] text-white">
            إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className={`${card} p-12 text-center ${muted}`}>
          {filter === "pending"
            ? kind === "post" ? "لا أسئلة تنتظر المراجعة." : "لا إجابات تنتظر المراجعة."
            : "لا يوجد ما يطابق هذا التصفية."}
        </div>
      ) : (
        <div className="space-y-4">
          {read?.total !== null && read && read.total > items.length && (
            <p className={`text-xs ${muted}`}>يُعرض {toArabicDigits(items.length)} من {toArabicDigits(read.total)}.</p>
          )}
          {items.map((item) => (
            <article key={item.id} className={`${card} p-5 space-y-3`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs mb-1 ${muted}`}>
                    {item.kind === "post" ? "سؤال" : "إجابة على"} · {whenAr(item.createdAt)}
                  </p>
                  <a
                    href={`/community/${encodeURIComponent(item.postId)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`font-black hover:underline ${strong}`}
                  >
                    {item.postTitle || "—"}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  {item.reportCount > 0 && (
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-bold ${isDark ? "bg-rose-500/10 text-rose-300" : "bg-rose-50 text-rose-700"}`}>
                      <Flag size={11} /> {toArabicDigits(item.reportCount)} بلاغ
                    </span>
                  )}
                  <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${item.status === "approved" ? "bg-emerald-500/10 text-emerald-500" : item.status === "rejected" ? "bg-rose-500/10 text-rose-500" : item.status === "escalated" ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
              </div>

              <p className={`text-sm whitespace-pre-wrap leading-relaxed p-3 rounded-xl ${isDark ? "bg-white/[0.03] text-gray-300" : "bg-gray-50 text-gray-800"}`}>
                {item.body || "—"}
              </p>

              <div className={`flex flex-wrap gap-2 text-xs ${muted}`}>
                <span>الكاتب (للمراجعين فقط): {item.author}{item.isLawyerVerified ? " · محامٍ موثّق" : ""}</span>
                {item.reportReason && <span>· البلاغات: {item.reportReason}</span>}
                {item.reviewNote && <span>· سبب الرفض: {item.reviewNote}</span>}
              </div>

              {rejecting === item.id ? (
                <div className="space-y-2">
                  <label className={`block text-xs font-bold ${muted}`} htmlFor={`reason-${item.id}`}>
                    سبب الرفض (يقرؤه صاحب المحتوى)
                  </label>
                  <textarea
                    id={`reason-${item.id}`}
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0c0f12] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!reason.trim() || busy === item.id}
                      onClick={() => void decide(item, "reject", reason.trim())}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white disabled:opacity-50"
                    >
                      <XCircle size={14} /> تأكيد الرفض
                    </button>
                    <button type="button" onClick={() => { setRejecting(null); setReason(""); }} className={actionClass(isDark)}>
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {item.status !== "approved" && (
                    <button type="button" disabled={busy === item.id} onClick={() => void decide(item, "approve")} className={actionClass(isDark)}>
                      <CheckCircle size={14} /> اعتماد ونشر
                    </button>
                  )}
                  {item.status !== "rejected" && (
                    <button type="button" disabled={busy === item.id} onClick={() => { setRejecting(item.id); setReason(""); }} className={actionClass(isDark)}>
                      <XCircle size={14} /> رفض مع السبب
                    </button>
                  )}
                  {item.status !== "escalated" && (
                    <button type="button" disabled={busy === item.id} onClick={() => void decide(item, "escalate")} className={actionClass(isDark)}>
                      <ShieldWarning size={14} /> تصعيد قانوني
                    </button>
                  )}
                  <button type="button" disabled={busy === item.id} onClick={() => void decide(item, "remove")} className={actionClass(isDark)}>
                    <Trash size={14} /> حذف
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function actionClass(isDark: boolean) {
  return `inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border disabled:opacity-50 ${
    isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"
  }`;
}
