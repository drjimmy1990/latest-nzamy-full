"use client";

/**
 * توثيق ترخيص المحامي بعد إنشاء الحساب (قرارا المالك ٢٠–٢١).
 *
 * Shown on the signup's last step when signUp gave a session, and on
 * /register/provider/verify after sign-in (e-mail confirmation on: a File
 * picked before cannot survive the round trip, so it is asked again there).
 *
 * Steps, driven by GET /api/v1/lawyer/signup-verification:
 *   1. licence photo (mandatory) — uploaded at once when the signup form
 *      already holds it;
 *   2. the code to the mobile in the lawyers' REGISTRY (only its last two
 *      digits are shown): WhatsApp first; SMS after 60 s or by the button,
 *      when an SMS provider is set up;
 *   3. «رقمي تغيّر»: the new mobile + the licence photo → human review, no code;
 *   4. the e-mail code (confirms the address only), when the channel is on.
 * Every dead end — no channel, registry miss, service down — shows
 * «سجّلنا بياناتك وسنتواصل معك». Nothing here decides anything: the server does.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Info, SpinnerGap, UploadSimple, WhatsappLogo, ChatText, EnvelopeSimple } from "@phosphor-icons/react";
import { LICENCE_ACCEPT, LICENCE_MAX_BYTES, LICENCE_MIME_TYPES, LICENCE_ERRORS } from "@/lib/services/licenceUpload";
import { normalizeSaudiMobile, sanitizePhoneDigits, saudiMobileMessage } from "@/lib/services/saudiMobile";

const API = "/api/v1/lawyer/signup-verification";
const HOLD_AR = "سجّلنا بياناتك وسنتواصل معك";
const HOLD_EN = "We have recorded your details and will contact you.";
const SMS_AFTER_SEC = 60;

type State = {
  status: "verified" | "approved" | "pending" | "review";
  next: "upload_licence" | "identity_otp" | null;
  practiceKind: "advocate" | "consultant";
  licenceUploaded: boolean;
  mobileHint: string | null;
  identity: { verified: boolean; whatsapp: boolean; sms: boolean; lastChannel: "whatsapp" | "sms" | null; lastSentAt: string | null };
  email: { masked: string | null; verified: boolean; available: boolean; throwaway: boolean; lastSentAt: string | null };
  mobileChangeRequested: boolean;
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
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [sentChannel, setSentChannel] = useState<"whatsapp" | "sms" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showChange, setShowChange] = useState(false);
  const [newMobile, setNewMobile] = useState("");
  const [changeFile, setChangeFile] = useState<File | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const autoUploaded = useRef(false);
  const autoSms = useRef(false);

  const applyResponse = useCallback(async (res: Response) => {
    if (res.status === 401) return setLoad({ kind: "signin" });
    const body = await res.json().catch(() => null);
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

  useEffect(() => {
    if (!sentAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);

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
        if (!res.ok && res.status !== 503 && res.status !== 401) {
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

  const sendCode = useCallback(
    async (first: "whatsapp" | "sms") => {
      setBusy(true);
      setError(null);
      // WhatsApp that cannot deliver falls straight through to SMS, when SMS exists.
      const order: Array<"whatsapp" | "sms"> = first === "whatsapp" && state?.identity.sms ? ["whatsapp", "sms"] : [first];
      try {
        for (const channel of order) {
          const res = await fetch(`${API}/identity/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel }),
          });
          const b = await res.json().catch(() => null);
          if (res.ok && b?.ok) {
            setSentAt(Date.now());
            setSentChannel(channel);
            if (channel === "sms") autoSms.current = true;
            return;
          }
          if (res.status === 429) {
            setError(isAr ? `محاولات كثيرة. حاول بعد ${b?.retryAfterSec ?? 60} ثانية.` : `Too many attempts. Try again in ${b?.retryAfterSec ?? 60}s.`);
            return;
          }
          if (res.status !== 503) break;
        }
        await refresh();
        setError(isAr ? HOLD_AR : HOLD_EN);
      } catch {
        setError(isAr ? "تعذّر الإرسال، حاول مرة أخرى." : "Could not send, try again.");
      } finally {
        setBusy(false);
      }
    },
    [isAr, refresh, state?.identity.sms],
  );

  const secondsLeft = sentAt ? Math.max(0, SMS_AFTER_SEC - Math.floor((now - sentAt) / 1000)) : SMS_AFTER_SEC;

  // decision ٢١: SMS goes by itself ~60 s after the WhatsApp code, when an SMS provider exists.
  useEffect(() => {
    if (sentChannel === "whatsapp" && secondsLeft === 0 && state?.identity.sms && !state.identity.verified && !autoSms.current) {
      autoSms.current = true;
      void sendCode("sms");
    }
  }, [secondsLeft, sentChannel, state?.identity.sms, state?.identity.verified, sendCode]);

  async function verifyCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/identity/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const b = await res.json().catch(() => null);
      if (res.ok && b?.ok && b.state) {
        setLoad({ kind: "ready", state: b.state as State });
        setCode("");
      } else if (b?.reason === "wrong") {
        setError(isAr ? `الرمز غير صحيح. المحاولات المتبقية: ${b.attemptsLeft ?? 0}` : `Wrong code. Attempts left: ${b.attemptsLeft ?? 0}`);
      } else if (b?.reason === "locked" || b?.reason === "expired") {
        setError(isAr ? "انتهت صلاحية الرمز أو استُنفدت المحاولات. اطلب رمزاً جديداً." : "The code expired or ran out of attempts. Request a new one.");
        setSentAt(null);
        setSentChannel(null);
      } else if (b?.reason === "format") {
        setError(isAr ? "الرمز ستة أرقام." : "The code is six digits.");
      } else {
        setError(isAr ? HOLD_AR : HOLD_EN);
      }
    } catch {
      setError(isAr ? "تعذّر التحقق، حاول مرة أخرى." : "Could not verify, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitChange() {
    const m = normalizeSaudiMobile(newMobile);
    if (!m.ok) return setError(isAr ? saudiMobileMessage(m) : "Invalid mobile number");
    if (!changeFile) return setError(isAr ? "أرفق صورة الترخيص." : "Attach the licence photo.");
    const bad = clientFileError(changeFile, isAr);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("mobile", m.e164);
      form.append("file", changeFile);
      const res = await fetch(`${API}/mobile-change`, { method: "POST", body: form });
      if (!res.ok && res.status !== 503 && res.status !== 401) {
        const b = await res.json().catch(() => null);
        setError((b && typeof b.error === "string" && b.error) || (isAr ? "تعذّر الإرسال" : "Could not submit"));
        return;
      }
      await applyResponse(res);
      setShowChange(false);
    } catch {
      setError(isAr ? "تعذّر الإرسال، حاول مرة أخرى." : "Could not submit, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function emailStart() {
    setEmailMsg(null);
    try {
      const res = await fetch(`${API}/email/start`, { method: "POST" });
      const b = await res.json().catch(() => null);
      if (res.ok && b?.ok) setEmailSent(true);
      else if (res.status === 400 && b?.error) setEmailMsg(b.error);
      else if (res.status === 429) setEmailMsg(isAr ? "انتظر قليلاً قبل طلب رمز جديد." : "Wait a moment before requesting another code.");
      else setEmailMsg(isAr ? "تأكيد البريد غير متاح الآن." : "E-mail confirmation is not available now.");
    } catch {
      setEmailMsg(isAr ? "تعذّر الإرسال." : "Could not send.");
    }
  }

  async function emailVerify() {
    setEmailMsg(null);
    try {
      const res = await fetch(`${API}/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: emailCode }),
      });
      const b = await res.json().catch(() => null);
      if (res.ok && b?.ok) {
        setEmailCode("");
        await refresh();
      } else if (b?.reason === "wrong") setEmailMsg(isAr ? `الرمز غير صحيح. المتبقي: ${b.attemptsLeft ?? 0}` : `Wrong code. Left: ${b.attemptsLeft ?? 0}`);
      else setEmailMsg(isAr ? "انتهت صلاحية الرمز. اطلب رمزاً جديداً." : "The code expired. Request a new one.");
    } catch {
      setEmailMsg(isAr ? "تعذّر التحقق." : "Could not verify.");
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
              <span className="text-xs text-ink-muted dark:text-gray-400">{file ? file.name : isAr ? "اختر الصورة" : "Choose the photo"}</span>
              <span className="text-[10px] text-ink-faint dark:text-gray-500">JPG, PNG, WEBP, PDF — {isAr ? "حتى ٥ ميغابايت" : "up to 5 MB"}</span>
              <input type="file" accept={LICENCE_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" className={`${btn} mt-3`} disabled={!file || busy} onClick={() => file && upload(file)}>
              {busy ? <SpinnerGap size={16} className="animate-spin" /> : <UploadSimple size={16} />}
              {isAr ? "رفع الصورة" : "Upload"}
            </button>
          </div>
        )}

        {state.next === "identity_otp" && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-ink dark:text-gray-300">
              {isAr
                ? `سنرسل رمز التحقق إلى الجوال المسجّل في سجل المحامين${state.mobileHint ? `، المنتهي بالرقمين ${state.mobileHint}` : ""}.`
                : `We will send a code to the mobile on the lawyers' register${state.mobileHint ? `, ending in ${state.mobileHint}` : ""}.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {state.identity.whatsapp && (
                <button type="button" className={btn} disabled={busy || (sentChannel === "whatsapp" && secondsLeft > 0)} onClick={() => sendCode("whatsapp")}>
                  <WhatsappLogo size={16} />
                  {sentChannel === "whatsapp"
                    ? secondsLeft > 0
                      ? isAr ? `إعادة الإرسال بعد ${secondsLeft} ث` : `Resend in ${secondsLeft}s`
                      : isAr ? "أعد الإرسال عبر واتساب" : "Resend on WhatsApp"
                    : isAr ? "أرسل الرمز عبر واتساب" : "Send the code on WhatsApp"}
                </button>
              )}
              {state.identity.sms && (
                <button type="button" className={btnGhost} disabled={busy || (sentChannel === "sms" && secondsLeft > 0)} onClick={() => sendCode("sms")}>
                  <ChatText size={16} />
                  {isAr ? "أرسل الرمز برسالة نصية" : "Send the code by SMS"}
                </button>
              )}
            </div>
            {sentChannel && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="______"
                  aria-label={isAr ? "رمز التحقق" : "Verification code"}
                  className={`${input} max-w-[10rem] text-center tracking-[0.4em]`}
                />
                <button type="button" className={btn} disabled={busy || code.trim().length < 6} onClick={verifyCode}>
                  {isAr ? "تحقّق" : "Verify"}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300" aria-live="polite">{error}</p>}

        {!done && state.practiceKind === "advocate" && !state.mobileChangeRequested && (
          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-white/10">
            {!showChange ? (
              <button type="button" className="text-sm font-semibold text-royal underline-offset-2 hover:underline dark:text-gold" onClick={() => setShowChange(true)}>
                {isAr ? "رقمي تغيّر" : "My number changed"}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-ink-muted dark:text-gray-400">
                  {isAr
                    ? "اكتب جوالك الجديد وأرفق صورة الترخيص. لن نرسل رمزاً إلى الرقم الجديد؛ يراجع فريق المنصّة طلبك."
                    : "Enter your new mobile and attach the licence photo. No code goes to the new number; the team reviews your request."}
                </p>
                <input
                  type="tel"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="05XXXXXXXX"
                  value={newMobile}
                  onChange={(e) => setNewMobile(sanitizePhoneDigits(e.target.value))}
                  className={input}
                />
                <input type="file" accept={LICENCE_ACCEPT} onChange={(e) => setChangeFile(e.target.files?.[0] ?? null)} className="block text-xs text-ink-muted dark:text-gray-400" />
                <button type="button" className={btn} disabled={busy} onClick={submitChange}>
                  {isAr ? "أرسل الطلب" : "Submit"}
                </button>
              </div>
            )}
          </div>
        )}
        {state.mobileChangeRequested && !done && (
          <p className="mt-3 text-xs text-ink-muted dark:text-gray-400">
            {isAr ? "استلمنا طلب تغيير الرقم، ويراجعه فريق المنصّة." : "We received your number change; the team will review it."}
          </p>
        )}
      </div>

      {(state.email.available || state.email.verified || state.email.throwaway) && (
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
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-ink-muted dark:text-gray-400" dir="auto">
                {isAr ? `سنرسل رمزاً إلى ${state.email.masked ?? "بريدك"}.` : `We will send a code to ${state.email.masked ?? "your e-mail"}.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btnGhost} onClick={emailStart}>
                  {emailSent ? (isAr ? "أعد الإرسال" : "Resend") : isAr ? "أرسل الرمز" : "Send code"}
                </button>
                {emailSent && (
                  <>
                    <input
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={8}
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      aria-label={isAr ? "رمز البريد" : "E-mail code"}
                      className={`${input} max-w-[10rem] text-center tracking-[0.4em]`}
                    />
                    <button type="button" className={btn} disabled={emailCode.trim().length < 6} onClick={emailVerify}>
                      {isAr ? "تأكيد" : "Confirm"}
                    </button>
                  </>
                )}
              </div>
              {emailMsg && <p className="text-xs text-red-700 dark:text-red-300">{emailMsg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
