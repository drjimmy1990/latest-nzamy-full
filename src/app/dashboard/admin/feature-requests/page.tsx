"use client";

import { useCallback, useEffect, useState } from "react";
import { Lightbulb, CheckCircle, XCircle, ArrowClockwise, User } from "@phosphor-icons/react";
import {
  adminListFeatureRequests, adminUpdateFeatureRequest, FEATURE_REQUEST_STATUS_AR,
  type FeatureRequest, type FeatureRequestStatus,
} from "@/lib/services/feedbackService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";

/**
 * Admin → Feature requests triage (Phase 6).
 * GET  /api/v1/admin/feature-requests?status=  — newest first (route's own order).
 * PATCH /api/v1/admin/feature-requests/[id]    — { status?, implementedNote? }
 */

const STATUS_TABS: Array<{ key: FeatureRequestStatus | "all"; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "new", label: FEATURE_REQUEST_STATUS_AR.new },
  { key: "planned", label: FEATURE_REQUEST_STATUS_AR.planned },
  { key: "implemented", label: FEATURE_REQUEST_STATUS_AR.implemented },
  { key: "declined", label: FEATURE_REQUEST_STATUS_AR.declined },
];

const STATUS_BADGE: Record<FeatureRequestStatus, string> = {
  new:         "bg-amber-500/10 text-amber-300 border-amber-500/20",
  planned:     "bg-blue-500/10 text-blue-300 border-blue-500/20",
  implemented: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  declined:    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const STATUS_OPTIONS = (Object.keys(FEATURE_REQUEST_STATUS_AR) as FeatureRequestStatus[]);

// Same wording as CATEGORY_OPTIONS/PRIORITY_OPTIONS in the submitter's
// FeatureRequestBanner (src/components/FeatureRequestBanner.tsx) — the
// admin screen and the user's own "طلباتي" list must read the same words.
// `category` carries no server-side enum (feedbackInput.ts's allowlist is
// app-level only), so this map falls back to the raw value for anything
// outside it rather than hiding an unrecognized category.
const CATEGORY_AR: Record<string, string> = {
  ui: "واجهة الاستخدام",
  library: "المكتبة القانونية",
  billing: "الفواتير والاشتراك",
  performance: "الأداء والسرعة",
  mobile: "تطبيق الجوال",
  other: "أخرى",
};

const PRIORITY_AR: Record<FeatureRequest["priority"], string> = {
  high: "ضروري جداً",
  normal: "مفيد",
  low: "لطيف أن يكون",
};

export default function AdminFeatureRequestsPage() {
  const [filter, setFilter] = useState<FeatureRequestStatus | "all">("all");
  const [read, setRead] = useState<ListRead<FeatureRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<Record<string, FeatureRequestStatus>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRead(await adminListFeatureRequests({ status: filter }));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function saveRow(row: FeatureRequest) {
    const nextStatus = statusDraft[row.id] ?? row.status;
    const nextNote = noteDraft[row.id] ?? row.implementedNote ?? "";
    setBusyId(row.id);
    setToast(null);
    try {
      const patch: { status?: FeatureRequestStatus; implementedNote?: string | null } = {};
      if (nextStatus !== row.status) patch.status = nextStatus;
      const trimmedNote = nextNote.trim();
      const currentNote = row.implementedNote ?? "";
      if (trimmedNote !== currentNote) patch.implementedNote = trimmedNote.length > 0 ? trimmedNote : null;
      if (patch.status === undefined && patch.implementedNote === undefined) {
        setBusyId(null);
        return;
      }
      await adminUpdateFeatureRequest(row.id, patch);
      setToast({ ok: true, msg: "تم حفظ التعديل" });
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : "تعذّر حفظ التعديل" });
    } finally {
      setBusyId(null);
    }
  }

  const state = listViewState(loading, read);
  const rows = itemsOf(read);

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
          <Lightbulb size={22} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">طلبات الميزات</h1>
          <p className="text-[12px] text-zinc-500">مقترحات المستخدمين — راجعها وحدّث حالتها.</p>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold border ${
          toast.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`rounded-xl px-4 py-2 text-[12px] font-bold transition-all border ${
              filter === s.key
                ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/60 text-emerald-300"
                : "bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-zinc-300"
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {state === "loading" && <p className="text-center text-[12px] text-zinc-600 py-10">جارٍ التحميل…</p>}

      {state === "unreadable" && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-[13px] text-red-400">تعذّر تحميل طلبات الميزات</p>
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 text-[12px] font-bold text-zinc-300 hover:bg-white/[0.08]">
            <ArrowClockwise size={13} />
            إعادة المحاولة
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="flex flex-col items-center py-14 text-center">
          <Lightbulb size={38} weight="thin" className="text-zinc-700 mb-2" />
          <p className="text-[13px] text-zinc-600">لا توجد طلبات في هذه الحالة</p>
        </div>
      )}

      {state === "ready" && (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const currentStatus = statusDraft[row.id] ?? row.status;
            const currentNote = noteDraft[row.id] ?? row.implementedNote ?? "";
            const dirty = currentStatus !== row.status || currentNote.trim() !== (row.implementedNote ?? "");
            return (
              <div key={row.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-bold text-white">{row.title}</p>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[row.status]}`}>
                        {FEATURE_REQUEST_STATUS_AR[row.status]}
                      </span>
                      <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#C8A762]">{CATEGORY_AR[row.category] ?? row.category}</span>
                      <span className="text-[10px] text-zinc-500">أولوية: {PRIORITY_AR[row.priority] ?? row.priority}</span>
                    </div>
                    {row.description && <p className="mt-1.5 text-[12px] text-zinc-400 whitespace-pre-wrap">{row.description}</p>}
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
                      <User size={11} />
                      {row.userName ?? row.userId}
                      <span className="mx-1">·</span>
                      {new Date(row.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={currentStatus}
                        onChange={(e) => setStatusDraft((p) => ({ ...p, [row.id]: e.target.value as FeatureRequestStatus }))}
                        className="rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1.5 text-[11px] text-white focus:outline-none"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s} className="bg-[#0d0d15]">{FEATURE_REQUEST_STATUS_AR[s]}</option>
                        ))}
                      </select>
                      {currentStatus === "implemented" && (
                        <input
                          value={currentNote}
                          onChange={(e) => setNoteDraft((p) => ({ ...p, [row.id]: e.target.value }))}
                          placeholder="ملاحظة التنفيذ (تظهر للمستخدم)"
                          className="flex-1 min-w-[180px] rounded-lg bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:outline-none"
                        />
                      )}
                      <button
                        onClick={() => saveRow(row)}
                        disabled={busyId === row.id || !dirty}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
                      >
                        <CheckCircle size={13} weight="fill" />
                        {busyId === row.id ? "جارٍ الحفظ..." : "حفظ"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
