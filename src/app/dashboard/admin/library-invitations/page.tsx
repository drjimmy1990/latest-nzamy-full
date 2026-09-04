"use client";

import { useCallback, useEffect, useState } from "react";
import { Ticket, Plus, Copy, CheckCircle, XCircle, ArrowClockwise } from "@phosphor-icons/react";
import {
  adminListLibraryInvitations, adminCreateLibraryInvitation,
  type LibraryInvitation, type LibraryInvitationStatus,
} from "@/lib/services/libraryInvitationsService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { formatArabicDate, toArabicDigits } from "@/lib/services/clientDashboardCards";

/**
 * Admin → Library invitation codes (Phase 6).
 * GET  /api/v1/admin/library-invitations — list, newest first
 * POST /api/v1/admin/library-invitations — create { code?, maxUses, expiresAt? }
 *
 * Every code grants the SAME thing regardless of who creates it or how many
 * uses it has: the "pro" tier for 30 days (see redeem route). There is no
 * per-code trial length to configure here — that belongs to the OTHER,
 * unrelated invitation system (public.invitations, colleague referrals).
 */

const STATUS_LABEL_AR: Record<LibraryInvitationStatus, string> = {
  active:    "نشط",
  exhausted: "مستنفد",
  expired:   "منتهي",
};

const STATUS_BADGE: Record<LibraryInvitationStatus, string> = {
  active:    "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  exhausted: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  expired:   "bg-red-500/10 text-red-300 border-red-500/20",
};

const DEFAULT_MAX_USES = 1;

export default function AdminLibraryInvitationsPage() {
  const [read, setRead] = useState<ListRead<LibraryInvitation> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState(String(DEFAULT_MAX_USES));
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRead(await adminListLibraryInvitations());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const state = listViewState(loading, read);
  const rows = itemsOf(read);
  // Only meaningful once a read succeeded — printing 0 over a failed read
  // would claim "no codes exist" when the truth is "could not check".
  const countsKnown = state === "empty" || state === "ready";
  const activeCount = rows.filter((r) => r.status === "active").length;
  const totalUses = rows.reduce((sum, r) => sum + r.currentUses, 0);

  function resetForm() {
    setCodeInput("");
    setMaxUsesInput(String(DEFAULT_MAX_USES));
    setExpiresAtInput("");
  }

  async function handleCreate() {
    // Bounds mirror validateMaxUses in src/lib/services/libraryInvitationRules.ts
    // (1..1000) — the server stays the source of truth; this only catches the
    // obvious cases before a round trip. Code FORMAT is deliberately not
    // re-validated here (that regex lives in a module reached via
    // node:crypto and stays server/route-only) — a malformed custom code
    // comes back as the server's own Arabic 400, shown below as-is.
    const maxUses = Number(maxUsesInput);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
      setToast({ ok: false, msg: "الحد الأقصى لعدد الاستخدامات يجب أن يكون عدداً صحيحاً بين ١ و١٠٠٠" });
      return;
    }
    setCreating(true);
    setToast(null);
    try {
      const created = await adminCreateLibraryInvitation({
        maxUses,
        // Sent only when actually provided — an empty string is neither a
        // code nor "no expiry", it is nothing to send at all (the deploy-
        // order rule: new columns go only when non-null).
        ...(codeInput.trim() ? { code: codeInput.trim() } : {}),
        ...(expiresAtInput ? { expiresAt: expiresAtInput } : {}),
      });
      setToast({ ok: true, msg: `تم إنشاء الكود ${created.code}` });
      resetForm();
      setShowForm(false);
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : "تعذّر إنشاء كود الدعوة" });
    } finally {
      setCreating(false);
    }
  }

  async function copyCode(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      // Never claim a copy succeeded when the clipboard API refused it — an
      // admin who thinks the code is on their clipboard and pastes something
      // else hands a customer a dead code.
      setToast({ ok: false, msg: "تعذّر نسخ الكود — انسخه يدوياً" });
    }
  }

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
            <Ticket size={22} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">أكواد دعوة المكتبة</h1>
            <p className="text-[12px] text-zinc-500">
              كل كود يمنح باقة Pro لمدة ٣٠ يوماً — أي مستخدم مسجّل يفعّله من صفحة اشتراك المكتبة.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[13px] font-bold text-[#C8A762] hover:bg-[#155e41] transition-colors"
        >
          <Plus size={16} weight="bold" />
          كود جديد
        </button>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold border ${
          toast.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ["إجمالي الأكواد", rows.length],
          ["أكواد نشطة", activeCount],
          ["إجمالي مرات الاستخدام", totalUses],
        ] as [string, number][]).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-[11px] text-zinc-500 mb-1.5">{label}</p>
            <p className={`text-xl font-black font-mono ${countsKnown ? "text-white" : "text-zinc-700"}`}>
              {countsKnown ? toArabicDigits(value) : "—"}
            </p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1 block">
              <span className="text-[11px] font-bold text-zinc-500">الكود (اختياري — يُولَّد تلقائياً إن تُرك فارغاً)</span>
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="مثلاً NZAMY2026"
                dir="ltr"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0d1117] px-3 py-2 text-sm font-mono text-white outline-none"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[11px] font-bold text-zinc-500">الحد الأقصى للاستخدامات</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-[#0d1117] px-3 py-2 text-sm text-white outline-none"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[11px] font-bold text-zinc-500">تاريخ الانتهاء (اختياري)</span>
              <input
                type="date"
                value={expiresAtInput}
                onChange={(e) => setExpiresAtInput(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-[#0d1117] px-3 py-2 text-sm text-white outline-none"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="rounded-xl border border-white/[0.08] px-4 py-2 text-[12px] font-bold text-zinc-300 hover:bg-white/[0.04]"
            >
              إلغاء
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={creating}
              className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#155e41] disabled:opacity-50 transition-colors"
            >
              {creating ? "جارٍ الإنشاء…" : "إنشاء الكود"}
            </button>
          </div>
        </div>
      )}

      {state === "loading" && <p className="text-center text-[12px] text-zinc-600 py-10">جارٍ التحميل…</p>}

      {state === "unreadable" && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-[13px] text-red-400">تعذّر تحميل أكواد الدعوة</p>
          <p className="text-[11px] text-zinc-600 max-w-sm">
            هذه ليست قائمة فارغة — لم نتمكن من القراءة. قد توجد أكواد فعّالة لا تظهر هنا.
          </p>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 text-[12px] font-bold text-zinc-300 hover:bg-white/[0.08]"
          >
            <ArrowClockwise size={13} />
            إعادة المحاولة
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="flex flex-col items-center py-14 text-center">
          <Ticket size={38} weight="thin" className="text-zinc-700 mb-2" />
          <p className="text-[13px] text-zinc-600">لا توجد أكواد دعوة بعد</p>
        </div>
      )}

      {state === "ready" && (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-zinc-500">
                <th className="px-4 py-3 text-start font-bold">الكود</th>
                <th className="px-4 py-3 text-start font-bold">الاستخدام</th>
                <th className="px-4 py-3 text-start font-bold">الانتهاء</th>
                <th className="px-4 py-3 text-start font-bold">الحالة</th>
                <th className="px-4 py-3 text-start font-bold">أُنشئ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-mono font-bold text-white" dir="ltr">{row.code}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {toArabicDigits(row.currentUses)}
                    <span className="text-zinc-600">/{toArabicDigits(row.maxUses)}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {row.expiresAt ? (formatArabicDate(row.expiresAt) ?? "—") : "بلا انتهاء"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[row.status]}`}>
                      {STATUS_LABEL_AR[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{formatArabicDate(row.createdAt) ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void copyCode(row.id, row.code)}
                      className="flex items-center gap-1 rounded-lg bg-white/[0.05] border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-white/[0.08]"
                    >
                      {copiedId === row.id ? <CheckCircle size={12} weight="fill" className="text-emerald-400" /> : <Copy size={12} />}
                      {copiedId === row.id ? "تم النسخ" : "نسخ"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
