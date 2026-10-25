"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowCounterClockwise, SignOut, Snowflake, WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_FREEZE_AR, FREEZE_DAYS, frozenUntilAr, isAdminFreeze } from "@/lib/auth/accountFreeze";
import { toArabicDigits } from "@/lib/services/arabicCount";

/**
 * /account-frozen — D6 (owner ٢٩٨). The one page a frozen account opens:
 * src/proxy.ts sends every protected page here while the account's deletion
 * is pending. It says until when, and offers «استعادة الحساب» (POST
 * /api/v1/me/account-deletion/cancel) and sign-out. A freeze the
 * administration made (requestedBy "admin") has no restore button: it says
 * «تم تجميد الحساب بقرار من الإدارة — تواصل مع الدعم» (the database refuses
 * the user's own cancel of it).
 *
 * Not a PROTECTED prefix, so the proxy never redirects it (no loop); it reads
 * its state from GET /api/v1/me/account-deletion, which is not behind
 * assertRole.
 */
type Status =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "active" }
  | { kind: "frozen"; purgeAfter: string | null; status: string; byAdmin: boolean }
  | { kind: "error"; message: string };

interface StatusBody {
  data?: {
    available: boolean;
    frozen: boolean;
    request: { purgeAfter: string; status: string; requestedBy?: string | null } | null;
  };
  error?: string;
}

export default function AccountFrozenPage() {
  const [state, setState] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/me/account-deletion", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as StatusBody;
        if (cancelled) return;
        if (res.status === 401) return setState({ kind: "signed_out" });
        if (!res.ok || !body.data) return setState({ kind: "error", message: body.error ?? "تعذّر قراءة حالة الحساب الآن." });
        if (!body.data.frozen || !body.data.request) return setState({ kind: "active" });
        setState({
          kind: "frozen",
          purgeAfter: body.data.request.purgeAfter,
          status: body.data.request.status,
          byAdmin: isAdminFreeze(body.data.request.requestedBy),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "تعذّر الاتصال الآن. تحقق من اتصالك ثم أعد تحميل الصفحة." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/v1/me/account-deletion/cancel", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "تعذّر استعادة الحساب الآن.");
      // A full load: the proxy reads the restored account afresh.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذّر استعادة الحساب الآن.");
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } finally {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    }
  };

  const until = state.kind === "frozen" ? frozenUntilAr(state.purgeAfter) : null;

  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        {state.kind === "loading" && <p className="text-sm text-slate-500 dark:text-zinc-400">جارٍ التحقق من حالة حسابك…</p>}

        {state.kind === "signed_out" && (
          <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
            <p className="font-bold">سجّل الدخول أولاً</p>
            <p>سجّل الدخول لترى حالة حسابك أو تستعيده.</p>
            <Link href="/login?from=/account-frozen" className="font-semibold text-royal hover:underline dark:text-emerald-400">
              تسجيل الدخول
            </Link>
          </div>
        )}

        {state.kind === "active" && (
          <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
            <p className="font-bold">حسابك نشط</p>
            <p>لا يوجد طلب حذف على حسابك.</p>
            <Link href="/dashboard" className="font-semibold text-royal hover:underline dark:text-emerald-400">
              الذهاب إلى لوحة التحكم
            </Link>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
            <WarningCircle size={18} weight="fill" />
            {state.message}
          </div>
        )}

        {state.kind === "frozen" && (
          <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-zinc-300">
            <div className="flex items-center gap-3">
              <Snowflake size={28} className="text-sky-600 dark:text-sky-400" />
              <h1 className="text-lg font-bold">{until ? `حسابك مجمّد حتى ${until}` : "حسابك مجمّد"}</h1>
            </div>
            {state.status === "purging" ? (
              <p>انتهت مهلة الاستعادة ويجري حذف الحساب نهائياً الآن.</p>
            ) : state.byAdmin ? (
              <>
                <p className="font-bold">{ADMIN_FREEZE_AR}</p>
                <p>
                  ملفك العام مخفي، ولا يمكن استخدام المنصة.{" "}
                  {until ? `في ${until} يُحذف الحساب نهائياً` : "بعد انتهاء المهلة يُحذف الحساب نهائياً"} ما لم ترفع
                  الإدارة التجميد.{" "}
                  <Link href="/contact" className="font-semibold text-royal hover:underline dark:text-emerald-400">
                    تواصل مع الدعم
                  </Link>
                </p>
              </>
            ) : (
              <>
                <p>
                  طُلب حذف هذا الحساب، فجُمِّد {toArabicDigits(String(FREEZE_DAYS))} يوماً: ملفك العام مخفي، ولا يمكن استخدام
                  المنصة. {until ? `في ${until} يُحذف الحساب نهائياً` : "بعد انتهاء المهلة يُحذف الحساب نهائياً"} مع مستنداتك
                  وملاحظاتك الشخصية، وتبقى الفواتير الضريبية، وتبقى ملفات المكتب لصاحبه إن كنت عضواً في مكتب.
                </p>
                <p>إن غيّرت رأيك فاستعد حسابك الآن، وسيعود كما كان.</p>
              </>
            )}
            {actionError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                <WarningCircle size={15} weight="fill" />
                {actionError}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {state.status !== "purging" && !state.byAdmin && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={restore}
                  className="inline-flex items-center gap-2 rounded-xl bg-royal px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  <ArrowCounterClockwise size={14} />
                  {busy ? "جارٍ الاستعادة…" : "استعادة الحساب"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300"
              >
                <SignOut size={14} />
                تسجيل الخروج
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
