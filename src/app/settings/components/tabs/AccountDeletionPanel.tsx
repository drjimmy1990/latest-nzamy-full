"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Trash, WarningCircle } from "@phosphor-icons/react";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import {
  ACCOUNT_FROZEN_PATH,
  DELETE_CONFIRM_PHRASE_AR,
  FREEZE_DAYS,
  entityOwnerBlockAr,
  normalizeOwnerBlock,
  phraseMatches,
  type EntityOwnerBlock,
} from "@/lib/auth/accountFreeze";
import { toArabicDigits } from "@/lib/services/arabicCount";

/**
 * «حذف الحساب» — D6, owner ٢٩٨. Settings → الأمان → منطقة الخطر.
 *
 * GET /api/v1/me/account-deletion says whether the feature exists here
 * (`available: false` before 20261026_70 runs, and in demo mode): then the
 * old «تواصل مع الدعم» panel (`fallback`) is shown unchanged.
 * POST freezes the account for 60 days and the browser goes to
 * /account-frozen, the one page a frozen account may open.
 */
type StatusEnvelope = { data: { available: boolean; frozen: boolean; ownerBlock?: unknown } };

export function AccountDeletionPanel({ fallback }: { fallback: ReactNode }) {
  const [state, setState] = useState<"loading" | "available" | "unavailable">(isSupabaseMode ? "loading" : "unavailable");
  // Owner ٣٠٧: the owner of an entity with members is refused until its
  // ownership is transferred — said before he types anything, no button.
  const [ownerBlock, setOwnerBlock] = useState<EntityOwnerBlock | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    apiGet<StatusEnvelope>("/api/v1/me/account-deletion")
      .then((res) => {
        if (cancelled) return;
        if (res.data.frozen) {
          // A full load, so the proxy re-reads the account on the next page.
          window.location.assign(ACCOUNT_FROZEN_PATH);
          return;
        }
        setOwnerBlock(normalizeOwnerBlock(res.data.ownerBlock));
        setState(res.data.available ? "available" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <p className="text-xs text-gray-500 dark:text-gray-400">جارٍ التحقق من خيارات الحساب…</p>;
  }
  if (state === "unavailable") return <>{fallback}</>;

  const confirmed = phraseMatches(typed, DELETE_CONFIRM_PHRASE_AR);
  const days = toArabicDigits(String(FREEZE_DAYS));

  const submit = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiMutate("/api/v1/me/account-deletion", "POST", { confirm: typed, reason: reason.trim() || undefined });
      // A full load: the proxy must read the now-frozen account, not a cached page.
      window.location.assign(ACCOUNT_FROZEN_PATH);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(/[؀-ۿ]/.test(raw) ? raw : "تعذّر تنفيذ الطلب الآن. أعد المحاولة بعد قليل.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-500/20 dark:bg-rose-500/5">
      <div className="flex items-start gap-3">
        <Trash size={20} className="mt-0.5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
        <div className="space-y-2 text-xs leading-6 text-gray-700 dark:text-gray-300">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">حذف الحساب</p>
          <p>
            عند طلب الحذف <strong>يُجمَّد حسابك {days} يوماً</strong>: يختفي ملفك العام فوراً، ولا تستطيع استخدام
            المنصة إلا لاستعادة الحساب. تستطيع استعادته في أي وقت خلال المهلة بتسجيل الدخول والضغط على «استعادة الحساب».
          </p>
          <p>
            <strong>بعد {days} يوماً يُحذف نهائياً</strong> ولا يمكن التراجع: ملفك وبياناتك، ومستنداتك وملاحظاتك
            الشخصية، واشتراكك ونقاطك.
          </p>
          <div>
            <p className="font-semibold">ما يبقى بعد الحذف:</p>
            <ul className="list-disc space-y-1 pr-5">
              <li>الفواتير الضريبية التي يُلزم النظام بحفظها، باسمك كما صدرت.</li>
              <li>إن كنت عضواً في مكتب محاماة: ملفات قضايا المكتب وملاحظاته ومستندات موكليه تبقى للمكتب وتنتقل لصاحبه.</li>
              <li>
                ملاحظاتك «الخاصة بي فقط» على قضايا المكتب تنتقل لصاحب المكتب خاصةً به، ويبقى مسجّلاً أنك كاتبها.
              </li>
              <li>
                إن غادرت مكتباً استشارياً: جلساتك ومواعيدك فيه بقيت باسمك، وعند حذف حسابك تنتقل لصاحب المكتب للعرض
                والحفظ لا للتمثيل.
              </li>
              <li>مستنداتك على قضية فيها طرف آخر (موكلك أو محاميك) تبقى لذلك الطرف.</li>
            </ul>
            <p className="mt-1">
              عضو الفريق القانوني في شركة حسابه مستقل: لا ينتقل منه شيء للشركة، ويُحذف كحساب مستقل.
            </p>
          </div>
        </div>
      </div>

      {ownerBlock ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-6 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <WarningCircle size={15} weight="fill" className="mt-1 flex-shrink-0" />
          <span>{entityOwnerBlockAr(ownerBlock)}</span>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-xl border border-rose-300 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          أريد حذف حسابي
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            سبب الحذف (اختياري)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={2}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            />
          </label>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            للتأكيد اكتب: «{DELETE_CONFIRM_PHRASE_AR}»
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
              autoComplete="off"
            />
          </label>
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              <WarningCircle size={15} weight="fill" />
              {error}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!confirmed || busy}
              onClick={submit}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "جارٍ التجميد…" : `تجميد الحساب وحذفه بعد ${days} يوماً`}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600 dark:border-gray-600 dark:text-gray-300"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
