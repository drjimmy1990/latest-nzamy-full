"use client";

/**
 * «مغادرة المكتب» — F7, the member's own exit (POST /api/v1/me/firm/leave,
 * public.leave_firm, migration 20261125_40). Shown to accounts that are not a
 * firm account; the API answers 404 for someone with no active membership and
 * 403 for the firm owner, and both are shown as said.
 *
 * The confirmation names what really moves: trg_firm_members_removed_transfer
 * (20261026_70) hands the member's rows of this firm to the firm owner — the
 * columns listed in public.firm_asset_specs().
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut, Spinner } from "@phosphor-icons/react";

const CONFIRM_TEXT =
  "مغادرة المكتب نهائية من جهتك:\n\n" +
  "• تنتقل إلى صاحب المكتب سجلاتك في هذا المكتب: القضايا التي أنشأتها أو أُسندت إليك ومراحلها وجلساتها ومواعيدها ومهامها، " +
  "وملاحظاتك على القضايا (حتى الخاصة)، ومستنداتك المرفوعة على قضايا المكتب، وموكّلو المكتب الذين أضفتهم وملاحظاتهم، والاستشارات والعقود.\n" +
  "• يبقى في سجل المكتب أنك كاتبها الأصلي، ويُبلَّغ صاحب المكتب بعدد ما انتقل.\n" +
  "• لن تصل بعد المغادرة إلى قضايا المكتب ولا ملفاته، ولا تعود إلا بدعوة جديدة.\n\n" +
  "هل تريد مغادرة المكتب؟";

export default function LeaveFirmCard({ isDark, card }: { isDark: boolean; card: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (!window.confirm(CONFIRM_TEXT)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/me/firm/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "تعذّرت مغادرة المكتب.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("تعذّرت مغادرة المكتب — تحقّق من الاتصال.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${card} p-5 space-y-2`} dir="rtl" aria-labelledby="leave-firm-title">
      <h2 id="leave-firm-title" className={`text-base font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>مغادرة المكتب</h2>
      <p className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
        تنهي عضويتك في هذا المكتب، وتنتقل سجلاتك فيه (قضاياه ومهامه وملاحظاته ومستنداتك عليها) إلى صاحب المكتب.
      </p>
      <button type="button" disabled={busy} onClick={() => void leave()}
        className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50 ${
          isDark ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
        {busy ? <Spinner size={14} className="animate-spin" /> : <SignOut size={14} />} مغادرة المكتب
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-red-500">{error}</p>}
    </section>
  );
}
