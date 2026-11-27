"use client";

/**
 * «نوع الحساب ومحوّله» on the admin user page — l16 C14 (owner package
 * 25 Nov, §٣.٣), first slice.
 *
 * Shows the account's FULL type («محامٍ — مستشار قانوني», «مزوّد خدمة —
 * موثّق») and converts, for the three moves of this slice only: محامٍ مترافع ↔
 * مستشار قانوني, and from عميل فرد to محامٍ (مترافع | مستشار) or مزوّد خدمة
 * (موثّق | محكّم | مراجع حكومي). GET / POST /api/v1/admin/users/[id]/account-type.
 *
 * A written reason is required and the change takes a confirm step. The
 * server refuses an account with open commitments (and the card lists them
 * before the admin even tries); it keeps a copy of the old sector row and
 * deletes nothing; it writes the audit row with the reason. Converting is
 * users.change_type (super admin); other roles see the type only.
 */
import { useCallback, useEffect, useState } from "react";
import { SpinnerGap, UserSwitch, Warning } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { staffMaySee } from "@/lib/auth/adminNavAccess";
import {
  CONVERT_TARGET_LABEL_AR,
  REASON_MAX,
  REASON_MIN,
  blockerLabelsAr,
  fullAccountTypeLabelAr,
  isConvertTarget,
  type ConvertTarget,
} from "@/lib/admin/accountTypeConvert";

interface TypeState {
  user_type: string;
  kind: string | null;
  lawyer_verification: string | null;
  provider_verification: string | null;
  blockers: string[];
  targets: string[];
}

const VERIFICATION_AR: Record<string, string> = {
  pending: "قيد المراجعة",
  verified: "موثّق",
  rejected: "مرفوض",
  suspended: "موقوف",
};

export default function AccountTypeConverterCard({
  userId,
  isDark,
  card,
  onConverted,
}: {
  userId: string;
  isDark: boolean;
  card: string;
  onConverted: () => void;
}) {
  const { staffRole } = useUser();
  const canConvert = staffMaySee(staffRole, "users.change_type");
  const [state, setState] = useState<TypeState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<ConvertTarget | "">("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/account-type`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: TypeState; error?: string } | null;
      if (!res.ok || !body?.data) {
        setState(null);
        setLoadError(body?.error ?? "تعذّر قراءة نوع الحساب الآن.");
        return;
      }
      setState({
        ...body.data,
        blockers: Array.isArray(body.data.blockers) ? body.data.blockers : [],
        targets: Array.isArray(body.data.targets) ? body.data.targets.filter(isConvertTarget) : [],
      });
    } catch {
      setState(null);
      setLoadError("تعذّر الاتصال بالخادم.");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setTarget("");
    setReason("");
    setConfirming(false);
  };

  const convert = async () => {
    if (!target || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/account-type`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, reason }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? "تعذّر تحويل نوع الحساب. لم يُحفظ أي تغيير." });
        setConfirming(false);
        return;
      }
      setMsg({
        ok: true,
        text: `تم التحويل إلى «${CONVERT_TARGET_LABEL_AR[target]}» وسُجّل السبب في سجل التدقيق. تسري الصلاحيات الجديدة خلال دقيقة.`,
      });
      reset();
      await load();
      onConverted();
    } catch {
      setMsg({ ok: false, text: "تعذّر الاتصال بالخادم. لم يُحفظ أي تغيير." });
    } finally {
      setBusy(false);
    }
  };

  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const strong = isDark ? "text-zinc-200" : "text-slate-700";
  const reasonOk = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;
  const verification = state?.user_type === "lawyer" ? state.lawyer_verification : state?.user_type === "provider" ? state.provider_verification : null;
  const blockers = blockerLabelsAr(state?.blockers);

  return (
    <div className={`${card} p-5`}>
      <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-white" : "text-slate-800"}`}>نوع الحساب الكامل</p>

      {loadError && <p className={`text-[11px] leading-6 ${isDark ? "text-amber-300" : "text-amber-700"}`}>{loadError}</p>}
      {!state && !loadError && <SpinnerGap size={14} className="animate-spin text-zinc-400" />}

      {state && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-[12px] font-bold ${strong}`}>{fullAccountTypeLabelAr(state.user_type, state.kind)}</span>
            {verification && <span className={`text-[11px] ${muted}`}>التوثيق: {VERIFICATION_AR[verification] ?? "غير معروف"}</span>}
          </div>

          {msg && (
            <p className={`text-[11px] px-3 py-2 rounded-xl leading-6 ${msg.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{msg.text}</p>
          )}

          {state.targets.length === 0 ? (
            <p className={`text-[11px] leading-6 ${muted}`}>
              لا يتاح تحويل هذا النوع من هنا. المحوّل يغطي الآن: محامٍ مترافع ↔ مستشار قانوني، ومن عميل فرد إلى محامٍ أو مزوّد خدمة.
            </p>
          ) : !canConvert ? (
            <p className={`text-[11px] leading-6 ${muted}`}>تحويل نوع الحساب لقيادة المنصة فقط.</p>
          ) : blockers.length > 0 ? (
            <p className={`text-[11px] leading-6 ${isDark ? "text-amber-300" : "text-amber-700"}`}>
              لا يمكن تحويل هذا الحساب الآن لوجود التزامات قائمة: {blockers.join("، ")}.
            </p>
          ) : !confirming ? (
            <div className="space-y-2">
              <select
                value={target}
                onChange={(e) => setTarget(isConvertTarget(e.target.value) ? e.target.value : "")}
                aria-label="النوع الجديد"
                className={`w-full rounded-xl px-3 py-2 text-[11px] font-bold border ${isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-700"}`}
              >
                <option value="">اختر النوع الجديد</option>
                {state.targets.filter(isConvertTarget).map((t) => (
                  <option key={t} value={t}>
                    {t === "advocate" || t === "consultant" ? `محامٍ — ${CONVERT_TARGET_LABEL_AR[t]}` : `مزوّد خدمة — ${CONVERT_TARGET_LABEL_AR[t]}`}
                  </option>
                ))}
              </select>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={REASON_MAX}
                placeholder="سبب التحويل (إلزامي) — يُحفظ في سجل التدقيق"
                className={`w-full rounded-xl p-2.5 text-[11px] border ${isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-slate-200"}`}
              />
              <button
                type="button"
                disabled={!target || !reasonOk}
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40"
              >
                <UserSwitch size={13} /> متابعة
              </button>
            </div>
          ) : (
            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-amber-300/50 bg-amber-50"}`}>
              <p className={`flex items-center gap-1.5 text-[11px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                <Warning size={13} weight="fill" /> تأكيد تحويل نوع الحساب
              </p>
              <p className={`text-[11px] leading-6 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                من «{fullAccountTypeLabelAr(state.user_type, state.kind)}» إلى «{target ? CONVERT_TARGET_LABEL_AR[target] : ""}». يتغيّر معه مسار لوحة التحكم وما يصل إليه صاحب الحساب.
                {/* Owner answer ٢٢٣ (27 Nov, 20261208_52): the conversion keeps the verification. */}
                {" "}تبقى حالة توثيق ملفه المهني كما هي، ويمكن تعديلها يدوياً عند الحاجة (الحساب الذي لم يكن له ملف مهني من قبل يبدأ ملفه «قيد المراجعة»).
                {" "}تُحفظ نسخة من بياناته السابقة ولا يُحذف شيء.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void convert()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                >
                  {busy && <SpinnerGap size={13} className="animate-spin" />} تأكيد التحويل
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-bold disabled:opacity-40 ${muted}`}
                >
                  رجوع
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
