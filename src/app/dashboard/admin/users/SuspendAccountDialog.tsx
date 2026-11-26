"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Prohibit, SpinnerGap, X } from "@phosphor-icons/react";
import { apiErrorText } from "@/lib/services/apiErrorText";
import { adminToast } from "@/components/admin/adminToast";
import {
  REASON_MAX,
  SUSPENSION_TEMPLATES,
  parseSuspensionTerms,
  formatSuspensionEndAr,
  type SuspensionTemplate,
} from "@/lib/auth/suspensionTerms";

/**
 * The admin's suspension form (owner س٢١٥): one of the three ready templates
 * (72 hours / 14 days / 7 days) or a custom end, and a written reason — no
 * open-ended suspension. Shared by the users list and the user's own page.
 * The server checks the same rules (parseSuspensionTerms) and refuses
 * anything else.
 */
export default function SuspendAccountDialog({
  userId,
  userLabel,
  onClose,
  onDone,
}: {
  userId: string;
  userLabel: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [template, setTemplate] = useState<SuspensionTemplate>("72h");
  const [customEnd, setCustomEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customIso = (() => {
    if (template !== "custom" || !customEnd) return "";
    const t = new Date(customEnd).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : "";
  })();
  const ready = SUSPENSION_TEMPLATES.find((t) => t.id === template);
  const endLabel = formatSuspensionEndAr(
    ready ? new Date(Date.now() + ready.hours * 60 * 60 * 1000).toISOString() : customIso,
  );

  const submit = async () => {
    setError(null);
    const check = parseSuspensionTerms({ template, reason, ends_at: customIso }, Date.now());
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "suspended",
          suspension: { template, reason: reason.trim(), ...(template === "custom" ? { ends_at: customIso } : {}) },
        }),
      });
      const json = (await res.json().catch(() => null)) as { email?: unknown } | null;
      if (!res.ok) throw new Error(apiErrorText(res.status, json, "تعذّر إيقاف الحساب"));
      // The e-mail is the account's way to its reason, its end and its appeal.
      if (json?.email !== "sent") {
        adminToast("أُوقف الحساب، لكن تعذّر إرسال البريد إليه بالسبب وموعد الانتهاء ورابط الاعتراض — أبلغه بطريقة أخرى.");
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إيقاف الحساب");
    } finally {
      setBusy(false);
    }
  };

  const option = (active: boolean) =>
    `rounded-xl border px-3 py-2 text-[12px] font-bold transition-colors ${
      active ? "border-red-500/50 bg-red-500/15 text-red-300" : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
    }`;

  // A portal: the rows that open it are animated (a transformed ancestor
  // would pin a `fixed` overlay to the row instead of the screen).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="suspend-title">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-zinc-900 p-5 text-zinc-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="suspend-title" className="flex items-center gap-2 text-[15px] font-bold text-white">
              <Prohibit size={16} className="text-red-400" /> إيقاف الحساب مؤقتاً
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">{userLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        <div>
          <p className="mb-2 text-[12px] font-bold text-zinc-300">مدة الإيقاف</p>
          <div className="grid grid-cols-2 gap-2">
            {SUSPENSION_TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => setTemplate(t.id)} className={option(template === t.id)}>
                {t.labelAr}
              </button>
            ))}
            <button type="button" onClick={() => setTemplate("custom")} className={option(template === "custom")}>
              مدة مخصّصة
            </button>
          </div>
          {template === "custom" && (
            <label className="mt-3 block text-[11px] text-zinc-400">
              ينتهي الإيقاف في (بين ساعة وسنة من الآن)
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-[12px] text-zinc-200"
                dir="ltr"
              />
            </label>
          )}
          {endLabel && <p className="mt-2 text-[11px] text-zinc-400">ينتهي الإيقاف تلقائياً في: <span className="font-bold text-zinc-200">{endLabel}</span> (بتوقيت الرياض)</p>}
        </div>

        <label className="block text-[12px] font-bold text-zinc-300">
          سبب الإيقاف
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            rows={3}
            placeholder="يُرسل السبب إلى صاحب الحساب مع موعد انتهاء الإيقاف وطريقة الاعتراض"
            className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-[12px] font-normal text-zinc-200 placeholder:text-zinc-600"
          />
        </label>

        <p className="text-[11px] leading-6 text-zinc-500">
          يُمنع الحساب من الدخول فوراً وتُنهى جلساته المفتوحة، وتُجمَّد اشتراكاته ومنحه ونقاطه دون إلغاء، ثم يُرفع الإيقاف تلقائياً في موعده وتُمدَّد بقدر مدته. ولصاحب الحساب حق الاعتراض.
        </p>

        {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? <SpinnerGap size={14} className="animate-spin" /> : <Prohibit size={14} />} إيقاف الحساب
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-[12px] font-bold text-zinc-300 hover:bg-white/5">
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
