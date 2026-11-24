"use client";

/**
 * توثيق ترخيص المحامي بعد إنشاء الحساب (قرارا المالك ٢٠–٢١، وقرار ٢٧:
 * التوثيق بالبريد فقط).
 *
 * Shown on the signup's last step when signUp gave a session, and on
 * /register/provider/verify after sign-in (e-mail confirmation on: a File
 * picked before cannot survive the round trip, so it is asked again there).
 *
 * Steps, driven by GET /api/v1/lawyer/signup-verification:
 *   1. licence photo (mandatory) — uploaded at once when the signup form
 *      already holds it;
 *   2. the code to the account's OWN e-mail — the one code of the signup (no
 *      WhatsApp, no SMS, no registry-mobile code, no new-number request).
 * Every dead end — the e-mail channel switched off, a registry miss, the
 * service down — shows «سجّلنا بياناتك وسنتواصل معك». Nothing here decides
 * anything: the server does.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Info, SpinnerGap, UploadSimple, EnvelopeSimple } from "@phosphor-icons/react";
import { LICENCE_ACCEPT, LICENCE_MAX_BYTES, LICENCE_MIME_TYPES, LICENCE_ERRORS } from "@/lib/services/licenceUpload";
import { latinDigitsOnly } from "@/lib/forms/latinDigits";

const API = "/api/v1/lawyer/signup-verification";
const HOLD_AR = "سجّلنا بياناتك وسنتواصل معك";
const HOLD_EN = "We have recorded your details and will contact you.";

type State = {
  status: "verified" | "approved" | "pending" | "review";
  next: "upload_licence" | "email_otp" | null;
  practiceKind: "advocate" | "consultant";
  licenceUploaded: boolean;
  email: { masked: string | null; verified: boolean; available: boolean; throwaway: boolean; lastSentAt: string | null };
};

type Load =
  | { kind: "loading" }
  | { kind: "signin" }
  | { kind: "unavailable" }
  | { kind: "ready"; state: State };

function clientFileError(file: File, isAr: boolean): string | null {
  if (file.size <= 0) return isAr ? LICENCE_ERRORS.empty : "The file is empty.";
  if (file.size > LICENCE_MAX_BYTES) return isAr ? LICENCE_ERRORS.tooLarge : "The file is over 5 MB.";
  if (!(LICENCE_MIME_TYPES as readonly string[]).includes(file.type)) return isAr ? LICENCE_ERRORS.badType : "JPG, PNG, WEBP or PDF only.";
  return null;
}

export function LawyerVerificationPanel({
  isAr,
  initialFile = null,
  fullName = null,
}: {
  isAr: boolean;
  initialFile?: File | null;
  fullName?: string | null;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const autoUploaded = useRef(false);

  const applyResponse = useCallback(async (res: Response) => {
    if (res.status === 401) return setLoad({ kind: "signin" });
    const body = await res.json().catch(() => null);
    // Batch l15: a new account confirms its mobile by WhatsApp first; the
    // proxy refuses this API until then. Back here once it is confirmed.
    if (res.status === 403 && body && typeof body === "object" && (body as { code?: unknown }).code === "phone_unverified") {
      window.location.assign("/verify-phone?next=/register/provider/verify");
      return body;
    }
    if (res.status === 503 || res.status >= 500) return setLoad({ kind: "unavailable" });
    if (body && typeof body === "object" && "status" in body && "next" in body) setLoad({ kind: "ready", state: body as State });
    return body;
  }, []);

  const refresh = useCallback(async () => {
    try {
      await applyResponse(await fetch(API, { cache: "no-store" }));
    } catch {
      setLoad({ kind: "unavailable" });
    }
  }, [applyResponse]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (f: File) => {
      const bad = clientFileError(f, isAr);
      if (bad) return setError(bad);
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", f);
        if (fullName) form.append("fullName", fullName);
        const res = await fetch(`${API}/licence`, { method: "POST", body: form });
        if (!res.ok && res.status !== 503 && res.status !== 401 && res.status !== 403) {
          const b = await res.json().catch(() => null);
          setError((b && typeof b.error === "string" && b.error) || (isAr ? "تعذّر رفع الصورة" : "Upload failed"));
          return;
        }
        await applyResponse(res);
      } catch {
        setError(isAr ? "تعذّر رفع الصورة، حاول مرة أخرى." : "Upload failed, try again.");
      } finally {
        setBusy(false);
      }
    },
    [applyResponse, fullName, isAr],
  );

  const state = load.kind === "ready" ? load.state : null;

  // The photo picked in the signup form goes up as soon as the server asks for it.
  useEffect(() => {
    if (state?.next === "upload_licence" && initialFile && !autoUploaded.current) {
      autoUploaded.current = true;
      void upload(initialFile);
    }
  }, [state?.next, initialFile, upload]);

  async function emailStart() {
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await fetch(`${API}/email/start`, { method: "POST" });
      const b = await res.json().catch(() => null);
      if (res.ok && b?.ok) setEmailSent(true);
      else if (res.status === 400 && b?.error) setEmailMsg(b.error);
      else if (res.status === 429) setEmailMsg(isAr ? "انتظر قليلاً قبل طلب رمز جديد." : "Wait a moment before requesting another code.");
      else if (res.status === 409) await refresh();
      else {
        // The channel cannot deliver: the account waits for a human, never a dead end.
        setEmailMsg(isAr ? HOLD_AR : HOLD_EN);
        await refresh();
      }
    } catch {
      setEmailMsg(isAr ? "تعذّر الإرسال، حاول مرة أخرى." : "Could not send, try again.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function emailVerify() {
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await fetch(`${API}/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: emailCode }),
      });
      const b = await res.json().catch(() => null);
      if (res.ok && b?.ok) {
        setEmailCode("");
        if (b.state && typeof b.state === "object") setLoad({ kind: "ready", state: b.state as State });
        else await refresh();
      } else if (b?.reason === "wrong") {
        setEmailMsg(isAr ? `الرمز غير صحيح. المحاولات المتبقية: ${b.attemptsLeft ?? 0}` : `Wrong code. Attempts left: ${b.attemptsLeft ?? 0}`);
      } else if (b?.reason === "locked" || b?.reason === "expired") {
        setEmailMsg(isAr ? "انتهت صلاحية الرمز أو استُنفدت المحاولات. اطلب رمزاً جديداً." : "The code expired or ran out of attempts. Request a new one.");
        setEmailSent(false);
      } else if (b?.reason === "format") {
        setEmailMsg(isAr ? "الرمز ستة أرقام." : "The code is six digits.");
      } else {
        setEmailMsg(isAr ? HOLD_AR : HOLD_EN);
      }
    } catch {
      setEmailMsg(isAr ? "تعذّر التحقق، حاول مرة أخرى." : "Could not verify, try again.");
    } finally {
      setEmailBusy(false);
    }
  }

  const box = "rounded-2xl border border-slate-200 bg-white p-5 text-start dark:border-white/10 dark:bg-dark-card";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-royal-light disabled:opacity-40";
  const btnGhost =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-royal/30 bg-white px-4 py-2.5 text-sm font-semibold text-royal transition-colors hover:bg-royal/5 disabled:opacity-40 dark:border-gold/30 dark:bg-dark-card dark:text-gold";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink outline-none focus:border-royal dark:border-white/10 dark:bg-dark-card dark:text-gray-300";

  if (load.kind === "loading") {
    return (
      <div className={box}>
        <p className="flex items-center gap-2 text-sm text-ink-muted dark:text-gray-400">
          <SpinnerGap size={16} className="animate-spin" />
          {isAr ? "جارٍ تحميل حالة التوثيق…" : "Loading verification…"}
        </p>
      </div>
    );
  }
  if (load.kind === "signin") {
    return (
      <div className={box}>
        <p className="text-sm text-ink dark:text-gray-300">
          {isAr
            ? "أكّد بريدك الإلكتروني من الرسالة التي وصلتك، ثم سجّل الدخول لإكمال توثيق ترخيصك."
            : "Confirm your e-mail from the message we sent, then sign in to finish verifying your licence."}
        </p>
        {initialFile && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            {isAr
              ? "صورة الترخيص التي اخترتها لم تُرفع بعد، لأن الحساب لا يُفتح قبل تأكيد البريد. بعد تسجيل الدخول اخترها مرة أخرى واضغط «رفع الصورة»."
              : "The licence photo you chose is not uploaded yet: the account opens only after the e-mail is confirmed. After signing in, choose it again and press Upload."}
          </p>
        )}
        <a href="/login?next=/register/provider/verify" className={`${btn} mt-4`}>
          {isAr ? "تسجيل الدخول" : "Sign in"}
        </a>
      </div>
    );
  }
  if (load.kind === "unavailable" || !state) {
    return (
      <div className={box}>
        <p className="flex items-start gap-2 text-sm text-ink dark:text-gray-300">
          <Info size={18} className="mt-0.5 flex-shrink-0" />
          {isAr ? HOLD_AR : HOLD_EN}
        </p>
      </div>
    );
  }

  const done = state.status === "verified" || state.status === "approved";
  const emailStep = state.next === "email_otp";
  // The e-mail card: the main step when the server asks for it; also offered
  // to a held account (the reviewer then sees a confirmed address).
  const showEmail = !done && (emailStep || state.email.verified || state.email.throwaway || state.email.available);

  return (
    <div className="space-y-4">
      <div className={box}>
        <h3 className="font-brand text-lg font-bold text-ink">{isAr ? "توثيق الترخيص" : "Licence verification"}</h3>

        {done && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
            <CheckCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
            {isAr ? "تم توثيق حسابك." : "Your account is verified."}
          </p>
        )}

        {!done && state.licenceUploaded && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" aria-live="polite">
            <CheckCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
            {isAr ? "تم رفع صورة الترخيص، وستراجعها الإدارة." : "Your licence photo is uploaded and will be reviewed."}
          </p>
        )}

        {state.status === "review" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-ink dark:border-white/10 dark:bg-dark-card dark:text-gray-300">
            <Info size={18} className="mt-0.5 flex-shrink-0" />
            {isAr ? HOLD_AR : HOLD_EN}
          </p>
        )}

        {state.next === "upload_licence" && (
          <div className="mt-3">
            <p className="text-sm text-ink-muted dark:text-gray-400">
              {isAr ? "ارفع صورة واضحة لترخيص المحاماة (إلزامي)." : "Upload a clear photo of your licence (required)."}
            </p>
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-5 hover:border-royal/30 dark:border-white/10 dark:hover:border-gold/30">
              <UploadSimple size={22} className="text-ink-faint dark:text-gray-500" />
              {file ? <CheckCircle size={18} weight="fill" className="text-emerald-600 dark:text-emerald-400" /> : null}
              <span className={`text-xs ${file ? "font-semibold text-emerald-800 dark:text-emerald-300" : "text-ink-muted dark:text-gray-400"}`} dir={file ? "ltr" : undefined}>
                {file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : isAr ? "اختر الصورة" : "Choose the photo"}
              </span>
              <span className="text-[10px] text-ink-faint dark:text-gray-500">JPG, PNG, WEBP, PDF — {isAr ? "حتى ٥ ميغابايت" : "up to 5 MB"}</span>
              <input type="file" accept={LICENCE_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" className={`${btn} mt-3`} disabled={!file || busy} onClick={() => file && upload(file)}>
              {busy ? <SpinnerGap size={16} className="animate-spin" /> : <UploadSimple size={16} />}
              {busy ? (isAr ? "جارٍ رفع الصورة…" : "Uploading…") : isAr ? "رفع الصورة" : "Upload"}
            </button>
          </div>
        )}

        {emailStep && (
          <p className="mt-3 text-sm text-ink dark:text-gray-300">
            {isAr
              ? "بقيت خطوة واحدة: أكّد بريدك الإلكتروني بالرمز الذي نرسله إليه."
              : "One step left: confirm your e-mail with the code we send to it."}
          </p>
        )}

        {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300" aria-live="polite">{error}</p>}
      </div>

      {showEmail && (
        <div className={box}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-gray-300">
            <EnvelopeSimple size={16} />
            {isAr ? "تأكيد البريد الإلكتروني" : "Confirm your e-mail"}
          </h3>
          {state.email.verified ? (
            <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{isAr ? "تم تأكيد بريدك." : "Your e-mail is confirmed."}</p>
          ) : state.email.throwaway ? (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              {isAr ? "بريدك من نطاق بريد مؤقت؛ سيتواصل معك فريق المنصّة." : "Your e-mail is on a throwaway domain; the team will contact you."}
            </p>
          ) : !state.email.available ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-ink dark:text-gray-300">
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              {isAr ? HOLD_AR : HOLD_EN}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-ink-muted dark:text-gray-400" dir="auto">
                {isAr ? `سنرسل رمزاً من ستة أرقام إلى ${state.email.masked ?? "بريدك"}.` : `We will send a six-digit code to ${state.email.masked ?? "your e-mail"}.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={emailStep ? btn : btnGhost} disabled={emailBusy} onClick={emailStart}>
                  {emailBusy && !emailSent ? <SpinnerGap size={16} className="animate-spin" /> : <EnvelopeSimple size={16} />}
                  {emailSent ? (isAr ? "أعد الإرسال" : "Resend") : isAr ? "أرسل الرمز" : "Send code"}
                </button>
                {emailSent && (
                  <>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      dir="ltr"
                      maxLength={8}
                      value={emailCode}
                      onChange={(e) => setEmailCode(latinDigitsOnly(e.target.value, 8))}
                      placeholder="______"
                      aria-label={isAr ? "رمز البريد" : "E-mail code"}
                      className={`${input} max-w-[10rem] text-center tracking-[0.4em]`}
                    />
                    <button type="button" className={btn} disabled={emailBusy || emailCode.trim().length < 6} onClick={emailVerify}>
                      {isAr ? "تأكيد" : "Confirm"}
                    </button>
                  </>
                )}
              </div>
              {emailMsg && <p className="text-xs text-red-700 dark:text-red-300" aria-live="polite">{emailMsg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
