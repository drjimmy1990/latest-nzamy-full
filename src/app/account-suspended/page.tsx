"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Prohibit, SignOut, PaperPlaneTilt } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { ACCOUNT_SUSPENDED_AR, suspensionUntil } from "@/lib/auth/accountSuspension";
import { APPEAL_MESSAGE_MAX, formatSuspensionEndAr, parseAppeal } from "@/lib/auth/suspensionTerms";

/**
 * /account-suspended — TODO 3.5 (owner package 17 Nov, real suspension).
 * src/proxy.ts sends a protected page here when the signed-in account is
 * suspended by the administration (GoTrue ban or app_metadata copy) and its
 * session is still alive — normally the suspension ends the sessions, so the
 * user meets the sign-in refusal instead.
 *
 * Owner س٢١٥ (l16): every suspension has an end, shown here when the session
 * still carries it, and the account has a right of appeal: the form below
 * (POST /api/v1/suspension-appeal) asks for the account's e-mail, because a
 * suspended account cannot sign in. The suspension e-mail links here. The
 * answer never says whether the e-mail is an account.
 *
 * Not a PROTECTED prefix, so the proxy never redirects it (no loop).
 */
export default function AccountSuspendedPage() {
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // The end and the address, from the session when one is still open (read
  // after mount: the page is the same for everyone on the server).
  useEffect(() => {
    let alive = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!alive) return;
        const user = data.session?.user;
        if (!user) return;
        setUntil(suspensionUntil(user));
        if (user.email) setEmail((current) => current || user.email || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const signOut = async () => {
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // The local session is cleared either way; the server already refuses it.
    }
    window.location.href = "/login";
  };

  const sendAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const check = parseAppeal({ email, message });
    if (!check.ok) {
      setNotice({ ok: false, text: check.error });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/v1/suspension-appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: check.email, message: check.message }),
      });
      const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) {
        setNotice({ ok: false, text: json?.error ?? "تعذّر إرسال الاعتراض الآن، حاول بعد قليل." });
        return;
      }
      setNotice({ ok: true, text: json?.message ?? "وصلنا اعتراضك." });
      setMessage("");
    } catch {
      setNotice({ ok: false, text: "تعذّر إرسال الاعتراض الآن، حاول بعد قليل." });
    } finally {
      setSending(false);
    }
  };

  const endLabel = formatSuspensionEndAr(until);

  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-12">
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-zinc-300">
          <div className="flex items-center gap-3">
            <Prohibit size={28} className="text-rose-600 dark:text-rose-400" />
            <h1 className="text-lg font-bold">حسابك موقوف</h1>
          </div>
          <p>{ACCOUNT_SUSPENDED_AR}</p>
          <p>
            {endLabel
              ? `ينتهي الإيقاف تلقائياً في ${endLabel} بتوقيت الرياض.`
              : "الإيقاف مؤقت؛ وللاطلاع على سببه وموعد انتهائه راجع بريد حسابك أو تواصل مع الدعم."}{" "}
            لا يُلغى بالإيقاف شيء من اشتراكاتك أو نقاطك، وما جُمِّد منها أثناءه تُعاد إليه أيام الإيقاف عند رفعه.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/contact"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              تواصل مع الدعم
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              <SignOut size={16} /> تسجيل الخروج
            </button>
          </div>
        </div>

        <form onSubmit={sendAppeal} className="space-y-3 border-t border-slate-200 pt-5 text-sm dark:border-white/10">
          <h2 className="text-base font-bold text-slate-800 dark:text-zinc-100">الاعتراض على الإيقاف</h2>
          <p className="text-[13px] leading-6 text-slate-600 dark:text-zinc-400">
            إن رأيت أن الإيقاف في غير محله فاكتب اعتراضك، وستراجعه الإدارة وتردّ عليك على بريد حسابك.
          </p>
          <label className="block text-[13px] font-semibold text-slate-700 dark:text-zinc-300">
            بريد الحساب الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="block text-[13px] font-semibold text-slate-700 dark:text-zinc-300">
            نص الاعتراض
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={APPEAL_MESSAGE_MAX}
              className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          {notice && (
            <p
              role="status"
              className={
                notice.ok
                  ? "rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              }
            >
              {notice.text}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-1.5 rounded-xl bg-royal px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 dark:bg-emerald-600"
          >
            <PaperPlaneTilt size={16} /> إرسال الاعتراض
          </button>
        </form>
      </div>
    </main>
  );
}
