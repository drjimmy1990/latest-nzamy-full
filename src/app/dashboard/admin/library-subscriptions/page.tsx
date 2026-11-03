"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen, MagnifyingGlass, DownloadSimple, CheckCircle, XCircle,
  ArrowClockwise, Prohibit, CalendarBlank,
} from "@phosphor-icons/react";
import {
  GRANT_STATUS_LABEL_AR, LIBRARY_PLAN_LABEL_AR, LIBRARY_SOURCE_LABEL_AR,
  LIST_PAGE_SIZE, REASON_MIN_CHARS, riyadhEndOfDayIso,
  type GrantListRow, type GrantStatus,
} from "@/lib/libraryAccessAdmin";

/**
 * Admin → «اشتراكات المكتبة» (owner note ١٨ C03 / C04).
 * GET   /api/v1/admin/library-grants            the list (50 a page) and,
 *       with format=csv, the same filtered list as a server-built CSV (BOM)
 * PATCH /api/v1/admin/library-grants/[id]       { action: "revoke", reason }
 *                                               { action: "adjust", reason, newEndsAt }
 * Every change needs a written reason; the server refuses one without it
 * and logs each change in the admin audit log. Revoke / end change touch the
 * one grant only — the holder's later grants do not move (20261030_65).
 * New grants are made on /dashboard/admin/entitlements («منح اشتراك المكتبة»).
 */

type Row = GrantListRow & { status: GrantStatus };

const STATUS_BADGE: Record<GrantStatus, string> = {
  active:   "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  expiring: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  upcoming: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  expired:  "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  revoked:  "bg-red-500/10 text-red-300 border-red-500/20",
};

const STATUS_FILTERS: readonly GrantStatus[] = ["active", "expiring", "upcoming", "expired", "revoked"];

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("ar-SA", {
        calendar: "gregory", timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric",
      })
    : "—";

/** The date an <input type="date"> shows for an ISO instant, in Riyadh. */
const riyadhDay = (iso: string) =>
  new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

interface Filters {
  q: string; status: string; source: string; plan: string;
  orderId: string; endsFrom: string; endsTo: string;
}
const EMPTY: Filters = { q: "", status: "", source: "", plan: "", orderId: "", endsFrom: "", endsTo: "" };

function queryString(f: Filters, page: number, csv: boolean): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.status) p.set("status", f.status);
  if (f.source) p.set("source", f.source);
  if (f.plan) p.set("plan", f.plan);
  if (f.orderId.trim()) p.set("orderId", f.orderId.trim());
  if (f.endsFrom) p.set("endsFrom", f.endsFrom);
  if (f.endsTo) p.set("endsTo", f.endsTo);
  if (csv) p.set("format", "csv");
  else p.set("page", String(page));
  return p.toString();
}

export default function AdminLibrarySubscriptionsPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // the open change form: one row at a time
  const [editing, setEditing] = useState<{ id: string; action: "revoke" | "adjust" } | null>(null);
  const [reason, setReason] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/v1/admin/library-grants?${queryString(filters, page, false)}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: Row[]; total?: number; error?: string };
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        setLoadError(json.error ?? "تعذّر تحميل اشتراكات المكتبة");
        return;
      }
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setLoadError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { void load(); }, [load]);

  function apply() {
    setPage(1);
    setFilters(draft);
  }

  function openChange(row: Row, action: "revoke" | "adjust") {
    setEditing({ id: row.id, action });
    setReason("");
    setNewEnd(action === "adjust" ? riyadhDay(row.ends_at) : "");
    setToast(null);
  }

  async function saveChange() {
    if (!editing) return;
    if (reason.trim().length < REASON_MIN_CHARS) {
      setToast({ ok: false, msg: "السبب إلزامي (ثلاثة أحرف على الأقل)" });
      return;
    }
    const body: Record<string, unknown> = { action: editing.action, reason: reason.trim() };
    if (editing.action === "adjust") {
      const iso = riyadhEndOfDayIso(newEnd);
      if (!iso) {
        setToast({ ok: false, msg: "اختر تاريخ الانتهاء الجديد" });
        return;
      }
      body.newEndsAt = iso;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/library-grants/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({ ok: false, msg: json.error ?? "تعذّر تنفيذ التعديل" });
        return;
      }
      setToast({ ok: true, msg: editing.action === "revoke" ? "تم سحب الاشتراك" : "تم تعديل تاريخ الانتهاء" });
      setEditing(null);
      await load();
    } catch {
      setToast({ ok: false, msg: "تعذّر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const input =
    "rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C8A762]/40";

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
            <BookOpen size={22} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">اشتراكات المكتبة</h1>
            <p className="text-[12px] text-zinc-500">كل منحة مكتبة: الشراء والطلب والكود والزميل والأدمن — مع السحب وتعديل تاريخ الانتهاء.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/admin/entitlements"
            className="rounded-xl border border-white/[0.08] px-3 py-2 text-[12px] font-bold text-zinc-300 hover:bg-white/[0.05]">
            منح جديدة
          </Link>
          <a href={`/api/v1/admin/library-grants?${queryString(filters, 1, true)}`}
            className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3 py-2 text-[12px] font-bold text-emerald-300 hover:bg-[#0B3D2E]/80">
            <DownloadSimple size={14} /> تصدير CSV
          </a>
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

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button onClick={() => { setDraft({ ...draft, status: "" }); setPage(1); setFilters({ ...draft, status: "" }); }}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${filters.status === "" ? "border-[#C8A762]/50 text-[#C8A762]" : "border-white/[0.08] text-zinc-400"}`}>
            الكل
          </button>
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => { setDraft({ ...draft, status: s }); setPage(1); setFilters({ ...draft, status: s }); }}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold ${filters.status === s ? "border-[#C8A762]/50 text-[#C8A762]" : "border-white/[0.08] text-zinc-400"}`}>
              {GRANT_STATUS_LABEL_AR[s]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="اسم المشترك أو بريده" className={input} />
          <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={input} aria-label="المصدر">
            <option value="" className="bg-[#0d0d15]">كل المصادر</option>
            {Object.entries(LIBRARY_SOURCE_LABEL_AR).map(([k, v]) => <option key={k} value={k} className="bg-[#0d0d15]">{v}</option>)}
          </select>
          <select value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })} className={input} aria-label="الباقة">
            <option value="" className="bg-[#0d0d15]">كل الباقات</option>
            {Object.entries(LIBRARY_PLAN_LABEL_AR).map(([k, v]) => <option key={k} value={k} className="bg-[#0d0d15]">{v}</option>)}
          </select>
          <input value={draft.orderId} onChange={(e) => setDraft({ ...draft, orderId: e.target.value })}
            placeholder="رقم الطلب (اختياري)" className={input} dir="ltr" />
          <label className="flex items-center gap-2 text-[11px] text-zinc-500">
            ينتهي من
            <input type="date" value={draft.endsFrom} onChange={(e) => setDraft({ ...draft, endsFrom: e.target.value })} className={`${input} flex-1`} />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-zinc-500">
            إلى
            <input type="date" value={draft.endsTo} onChange={(e) => setDraft({ ...draft, endsTo: e.target.value })} className={`${input} flex-1`} />
          </label>
          <button onClick={apply}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-emerald-300 hover:bg-[#0B3D2E]/80">
            <MagnifyingGlass size={14} /> بحث
          </button>
          <button onClick={() => { setDraft(EMPTY); setPage(1); setFilters(EMPTY); }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-4 py-2 text-[12px] font-bold text-zinc-400 hover:bg-white/[0.05]">
            <ArrowClockwise size={14} /> مسح الفلاتر
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 text-[12px] text-zinc-400">
          <span>{loading ? "جارٍ التحميل…" : `${total.toLocaleString("ar-SA")} منحة`}</span>
          {pages > 1 && (
            <span className="flex items-center gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="rounded-lg border border-white/[0.08] px-2 py-1 disabled:opacity-40">السابق</button>
              <span>{page.toLocaleString("ar-SA")} / {pages.toLocaleString("ar-SA")}</span>
              <button disabled={page >= pages || loading} onClick={() => setPage(page + 1)} className="rounded-lg border border-white/[0.08] px-2 py-1 disabled:opacity-40">التالي</button>
            </span>
          )}
        </div>

        {loadError ? (
          <p className="px-4 py-10 text-center text-[13px] text-red-300">{loadError}</p>
        ) : !loading && rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-zinc-500">لا توجد اشتراكات مطابقة</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {rows.map((r) => {
              const open = editing?.id === r.id ? editing.action : null;
              const changeable = r.status !== "revoked" && r.status !== "expired";
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-bold text-white">{r.user_name ?? "—"}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status]}`}>
                          {GRANT_STATUS_LABEL_AR[r.status]}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500" dir="ltr">{r.user_email ?? r.user_id}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                        <span>الباقة: <b className="text-zinc-200">{LIBRARY_PLAN_LABEL_AR[r.plan_ref] ?? r.plan_ref}</b></span>
                        <span>المصدر: <b className="text-zinc-200">{LIBRARY_SOURCE_LABEL_AR[r.source] ?? r.source}</b></span>
                        <span>من {fmt(r.starts_at)} إلى <b className="text-zinc-200">{fmt(r.ends_at)}</b></span>
                        {r.granted_by && <span>منحها: {r.granted_by_name ?? r.granted_by}</span>}
                        {r.order_id && <span dir="ltr">order {r.order_id.slice(0, 8)}</span>}
                      </div>
                      {(r.reason || r.revoke_reason || r.adjust_reason || r.notes) && (
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-zinc-500">
                          {r.reason && <p>سبب المنح: {r.reason}</p>}
                          {r.notes && <p>ملاحظات: {r.notes}</p>}
                          {r.adjust_reason && <p>سبب آخر تعديل: {r.adjust_reason}</p>}
                          {r.revoke_reason && <p className="text-red-300/80">سبب السحب ({fmt(r.revoked_at)}): {r.revoke_reason}</p>}
                        </div>
                      )}
                    </div>
                    {changeable && !open && (
                      <div className="flex gap-1.5">
                        <button onClick={() => openChange(r, "adjust")}
                          className="flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-white/[0.05]">
                          <CalendarBlank size={13} /> تعديل الانتهاء
                        </button>
                        <button onClick={() => openChange(r, "revoke")}
                          className="flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/10">
                          <Prohibit size={13} /> سحب
                        </button>
                      </div>
                    )}
                  </div>

                  {open && (
                    <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <p className="mb-2 text-[12px] font-bold text-white">
                        {open === "revoke" ? "سحب هذا الاشتراك" : "تعديل تاريخ انتهاء هذا الاشتراك"}
                      </p>
                      <p className="mb-2 text-[11px] text-zinc-500">
                        {open === "revoke"
                          ? "ينتهي وصول المستخدم إلى المكتبة من هذه المنحة فوراً. منحه اللاحقة (إن وجدت) لا تتحرك."
                          : "يغيّر نهاية هذه المنحة وحدها (نهاية اليوم بتوقيت الرياض). لا يُقبل تمديد يتداخل مع منحة أخرى سارية."}
                      </p>
                      {open === "adjust" && (
                        <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} aria-label="تاريخ الانتهاء الجديد"
                          className={`${input} mb-2 w-full sm:w-56`} />
                      )}
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000}
                        placeholder="السبب (إلزامي) — يُحفظ في سجل الإدارة" className={`${input} w-full`} />
                      <div className="mt-2 flex gap-2">
                        <button onClick={saveChange} disabled={saving || reason.trim().length < REASON_MIN_CHARS}
                          className={`rounded-lg px-4 py-2 text-[12px] font-bold disabled:opacity-50 ${
                            open === "revoke" ? "bg-red-500/20 text-red-200 hover:bg-red-500/30" : "bg-[#0B3D2E] text-emerald-300 hover:bg-[#0B3D2E]/80"
                          }`}>
                          {open === "revoke" ? "تأكيد السحب" : "حفظ التاريخ"}
                        </button>
                        <button onClick={() => setEditing(null)} disabled={saving}
                          className="rounded-lg border border-white/[0.08] px-4 py-2 text-[12px] font-bold text-zinc-400 hover:bg-white/[0.05]">
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
