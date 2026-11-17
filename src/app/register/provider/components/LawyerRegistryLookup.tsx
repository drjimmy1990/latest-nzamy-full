"use client";

/**
 * «تحقّق من ترخيصك» on the lawyer signup's step 2 (launch batch R2/R3/R5).
 *
 * The lawyer types his full name (as on the licence) OR his licence number
 * and presses «تحقّق»; POST /api/v1/auth/lawyer-registry-lookup answers from
 * the lawyers' registry and, on a valid licence, this fills the licence and
 * the first / last name fields and greets him.
 *
 * It never verifies anything: without an OTP (R4) anyone could type someone
 * else's licence, so the account stays pending and the admin decides (the
 * admin queue shows the registry match from the database). Every failure —
 * not found, expired, the security check, the service down — ends in the same
 * «سجّل بياناتك وسنتواصل معك» and the form goes on: «التالي» never depends on
 * this check.
 *
 * Its own Turnstile widget (action registry_lookup): a token is single-use,
 * and step 4's widget belongs to the signUp call.
 */

import { useState } from "react";
import { CheckCircle, Info, MagnifyingGlass, SpinnerGap } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useTurnstile } from "@/components/auth/useTurnstile";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { canSubmitWithCaptcha, captchaSubmitError } from "@/lib/auth/captcha";
import {
  formatExpiry,
  splitRegistryName,
  type LookupResponse,
} from "@/lib/registry/lawyerRegistryLookup";

type Outcome =
  | { kind: "valid"; result: Extract<LookupResponse, { status: "valid" }> }
  | { kind: "ambiguous" }
  | { kind: "unverified" }
  | { kind: "busy" }
  | { kind: "input"; message: string };

const UNVERIFIED_AR = "لم نتمكن من التحقق من ترخيصك، سجّل بياناتك وسنتواصل معك.";
const UNVERIFIED_EN = "We could not verify your licence. Complete your details and we will contact you.";

export function LawyerRegistryLookup({
  isAr,
  data,
  onChange,
  inputClassName,
}: {
  isAr: boolean;
  data: Record<string, string>;
  onChange: (k: string, v: string) => void;
  inputClassName: string;
}) {
  const { theme } = useTheme();
  const captcha = useTurnstile({ isAr, theme, action: "registry_lookup" });
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [checkedLicence, setCheckedLicence] = useState<string | null>(null);

  const licence = (data.licenseNumber ?? "").trim();
  const fullName = (data.registryFullName ?? "").trim();
  const hasInput = !!licence || !!fullName;
  const captchaReady = canSubmitWithCaptcha(captcha.state);

  // A greeting for a licence the lawyer has since edited is no longer true.
  const shown = outcome?.kind === "valid" && checkedLicence !== licence ? null : outcome;

  async function check() {
    if (!hasInput || loading) return;
    if (!captchaReady) {
      setOutcome({ kind: "input", message: captchaSubmitError(captcha.state, isAr) || (isAr ? "أكمل التحقق الأمني أولاً" : "Complete the security check first") });
      return;
    }
    setLoading(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/v1/auth/lawyer-registry-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          licence
            ? { licenseNumber: licence, turnstileToken: captcha.token }
            : { fullName, turnstileToken: captcha.token },
        ),
      });
      const body = (await res.json().catch(() => null)) as (LookupResponse & { error?: string }) | { error?: string } | null;
      if (res.status === 429) {
        setOutcome({ kind: "busy" });
      } else if (res.status === 400) {
        setOutcome({ kind: "input", message: (body && "error" in body && body.error) || (isAr ? "بيانات غير صالحة" : "Invalid input") });
      } else if (res.ok && body && "status" in body && body.status === "valid") {
        const { firstName, lastName } = splitRegistryName(body.name);
        onChange("licenseNumber", body.licence);
        onChange("registryFullName", body.name);
        if (firstName) onChange("firstName", firstName);
        if (lastName) onChange("lastName", lastName);
        setCheckedLicence(body.licence);
        setOutcome({ kind: "valid", result: body });
      } else if (res.ok && body && "status" in body && body.status === "ambiguous") {
        setOutcome({ kind: "ambiguous" });
      } else {
        // not_found / expired / unverifiable / captcha refused / unavailable
        setOutcome({ kind: "unverified" });
      }
    } catch {
      setOutcome({ kind: "unverified" });
    } finally {
      // The token went to the server either way: the next check gets a fresh one.
      captcha.spend();
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-royal/15 bg-royal/[0.03] p-4 dark:border-gold/20 dark:bg-gold/[0.04]">
      <p className="text-sm font-semibold text-ink dark:text-gray-300">
        {isAr ? "تحقّق من ترخيصك" : "Check your licence"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted dark:text-gray-400">
        {isAr
          ? "اكتب رقم ترخيصك في الحقل السابق، أو اسمك الكامل كما يظهر في الترخيص هنا، ثم اضغط «تحقّق» لنملأ بقية البيانات من سجل المحامين المرخّصين."
          : "Enter your licence number above, or your full name exactly as on your licence here, then press “Check” to fill in the rest from the licensed lawyers' register."}
      </p>
      <input
        type="text"
        value={data.registryFullName || ""}
        onChange={(e) => onChange("registryFullName", e.target.value)}
        placeholder={isAr ? "الاسم الكامل كما في الترخيص" : "Full name as on the licence"}
        aria-label={isAr ? "الاسم الكامل كما في الترخيص" : "Full name as on the licence"}
        className={`${inputClassName} mt-3`}
        maxLength={120}
      />

      <div className="mt-3">
        <TurnstileWidget control={captcha} isAr={isAr} />
      </div>

      <button
        type="button"
        onClick={check}
        disabled={!hasInput || loading || !captchaReady}
        className="inline-flex items-center gap-2 rounded-xl border border-royal/30 bg-white px-4 py-2 text-sm font-semibold text-royal transition-colors hover:bg-royal/5 disabled:opacity-40 dark:border-gold/30 dark:bg-dark-card dark:text-gold"
      >
        {loading ? <SpinnerGap size={16} className="animate-spin" /> : <MagnifyingGlass size={16} />}
        {loading ? (isAr ? "جارٍ التحقق…" : "Checking…") : isAr ? "تحقّق" : "Check"}
      </button>

      <div aria-live="polite">
        {shown?.kind === "valid" && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
            <p className="flex items-start gap-2 font-semibold">
              <CheckCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>
                {isAr
                  ? `أهلاً ${shown.result.name}، ترخيص رقم ${shown.result.licence}، سارٍ حتى ${formatExpiry(shown.result.expiry)}.`
                  : `Welcome ${shown.result.name}, licence no. ${shown.result.licence}, valid until ${formatExpiry(shown.result.expiry)}.`}
              </span>
            </p>
            {shown.result.mobileHint && (
              <p className="mt-1 text-xs" dir={isAr ? "rtl" : "ltr"}>
                {isAr
                  ? `الجوال المسجّل في السجل ينتهي بالرقمين ${shown.result.mobileHint}.`
                  : `The mobile on the register ends in ${shown.result.mobileHint}.`}
              </p>
            )}
            <p className="mt-1 text-xs">
              {isAr
                ? "أكمل التسجيل، وتراجع إدارة المنصّة طلبك قبل توثيق الحساب."
                : "Complete your registration; the platform team reviews it before the account is verified."}
            </p>
          </div>
        )}
        {shown?.kind === "ambiguous" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <Info size={18} className="mt-0.5 flex-shrink-0" />
            {isAr
              ? "وجدنا أكثر من محامٍ بهذا الاسم. اكتب رقم ترخيصك في الحقل السابق ثم اضغط «تحقّق»."
              : "More than one lawyer has this name. Enter your licence number above, then press “Check”."}
          </p>
        )}
        {shown?.kind === "unverified" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-300">
            <Info size={18} className="mt-0.5 flex-shrink-0" />
            {isAr ? UNVERIFIED_AR : UNVERIFIED_EN}
          </p>
        )}
        {shown?.kind === "busy" && (
          <p className="mt-3 text-sm text-ink-muted dark:text-gray-300">
            {isAr
              ? "محاولات كثيرة. حاول بعد قليل، أو أكمل التسجيل وسنتواصل معك."
              : "Too many attempts. Try again shortly, or complete your registration and we will contact you."}
          </p>
        )}
        {shown?.kind === "input" && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">{shown.message}</p>
        )}
      </div>
    </div>
  );
}
