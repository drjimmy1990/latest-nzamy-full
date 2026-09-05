"use client";

/**
 * /invite/[code]/page.tsx
 * ─────────────────────────────────────────────────────────────
 * Landing page for invited colleagues.
 * URL: /invite/NZM-INV-XXXX
 *
 * Validates the invite code through GET /api/v1/invite/[code] (no session
 * needed — the invitee has not registered yet) and shows a welcome screen
 * with the trial details. "Accept" goes through the real, session-required
 * POST /api/v1/invite/[code]/accept, which grants the entitlement.
 * ─────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen, Gift, CheckCircle, ArrowLeft, ArrowRight,
  Clock, Sparkle, Lock, WarningCircle, ArrowClockwise, MagnifyingGlass, Gavel,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trialLengthLabel } from "@/lib/services/inviteTrialLabel";

// ── Features included in trial ────────────────────────────────────────────

const TRIAL_FEATURES = [
  { icon: MagnifyingGlass, ar: "بحث ذكي AI في كل الأنظمة واللوائح",     en: "AI-powered search across all laws and regulations" },
  { icon: BookOpen,        ar: "نصوص الأنظمة واللوائح التنفيذية كاملة",  en: "Full law and executive regulation texts" },
  { icon: Gavel,           ar: "المبادئ القضائية والسوابق",              en: "Judicial principles and precedents" },
  { icon: Clock,           ar: "تحديثات يومية فور صدور الأنظمة",         en: "Daily updates the moment laws are issued" },
];

// ── Server response shape (GET /api/v1/invite/[code]) ─────────────────────

interface InviteLookupResponse {
  valid: boolean;
  trialDays?: number;
  tier?: string | null;
  expiresAt?: string | null;
  inviterName?: string | null;
  reason?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InvitePage() {
  const { isDark, isRTL } = useTheme();
  const params = useParams();
  // The raw code is the lookup key — invitations.code is a case-sensitive
  // `text` column and both this route and the accept route do an exact
  // `.eq("code", ...)`. Uppercasing it (as the old regex-mock era did, for
  // a case-insensitive comparison it also owned) would silently mismatch a
  // real lowercase/mixed-case code. Uppercase only for the human-readable
  // "كود الدعوة" line below.
  const code = typeof params?.code === "string" ? params.code : "";
  const displayCode = code.toUpperCase();

  // Three real states, not two: a failed lookup (network/server error) is
  // NOT the same as a code the server actually rejected — collapsing them
  // both into "invalid" tells an invitee their real link is dead when the
  // truth is the server (or their connection) hiccuped.
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "error">("loading");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState(30);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [inviterName, setInviterName] = useState<string | null>(null);

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const runLookup = useCallback(async () => {
    if (!code) { setStatus("invalid"); setInvalidReason(null); return; }
    setStatus("loading");
    try {
      const res = await fetch(`/api/v1/invite/${encodeURIComponent(code)}`);
      const json = (await res.json().catch(() => ({}))) as InviteLookupResponse;

      // A 5xx is the SERVER failing, not the code being invalid — keep those
      // apart so a Supabase hiccup doesn't tell the invitee their link is dead.
      if (res.status >= 500) {
        setStatus("error");
        return;
      }

      if (!json.valid) {
        setStatus("invalid");
        setInvalidReason(json.reason ?? null);
        return;
      }

      setStatus("valid");
      setTrialDays(typeof json.trialDays === "number" && json.trialDays > 0 ? json.trialDays : 30);
      setInviterName(json.inviterName ?? null);
    } catch {
      setStatus("error");
    }
  }, [code]);

  useEffect(() => {
    runLookup();
  }, [runLookup]);

  async function handleAccept() {
    if (accepting) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch(
        `/api/v1/invite/${encodeURIComponent(code)}/accept`,
        { method: "POST" },
      );

      // Not logged in → carry the code to the login flow.
      if (res.status === 401) {
        window.location.href = `/login?invite=${encodeURIComponent(code)}`;
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAcceptError(
          (json?.error as string) ||
            (isRTL ? "تعذّر قبول الدعوة" : "Could not accept the invitation"),
        );
        return;
      }

      setAccepted(true);
    } catch {
      setAcceptError(
        isRTL ? "حدث خطأ في الاتصال" : "A connection error occurred",
      );
    } finally {
      setAccepting(false);
    }
  }

  // Loading
  if (status === "loading") {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0c0f12]" : "bg-zinc-50"}`}>
        <div className="w-8 h-8 rounded-full border-2 border-[#0B3D2E] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Couldn't verify — a server/network failure, NOT the same as an invalid
  // code. Offers a retry instead of asserting the invite is dead.
  if (status === "error") {
    return (
      <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-zinc-50 text-zinc-900"}`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className={`rounded-3xl border p-8 text-center max-w-sm ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-100 shadow-lg"}`}>
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
              <WarningCircle size={28} className="text-amber-500" />
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "تعذّر التحقق من الدعوة" : "Couldn't verify the invitation"}
            </h1>
            <p className={`text-sm mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {isRTL
                ? "حدث خطأ أثناء التحقق من رابط الدعوة. حاول مرة أخرى."
                : "Something went wrong while verifying this invitation link. Please try again."}
            </p>
            <button
              type="button"
              onClick={runLookup}
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold"
            >
              <ArrowClockwise size={16} weight="bold" />
              {isRTL ? "إعادة المحاولة" : "Try again"}
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Invalid code
  if (status === "invalid") {
    return (
      <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-zinc-50 text-zinc-900"}`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className={`rounded-3xl border p-8 text-center max-w-sm ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-100 shadow-lg"}`}>
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <Lock size={28} className="text-red-400" />
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "رابط الدعوة غير صالح" : "Invalid Invitation Link"}
            </h1>
            <p className={`text-sm mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {isRTL
                ? (invalidReason ?? "هذا الرابط غير صالح أو منتهي الصلاحية. تواصل مع الشخص الذي أرسل لك الدعوة.")
                : "This link is invalid or expired. Please contact the person who sent you the invitation."}
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold"
            >
              <BookOpen size={16} weight="fill" />
              {isRTL ? "تعرّف على الباقات المتاحة" : "View Available Plans"}
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-zinc-50 text-zinc-900"}`}>
      <Navbar />

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">

          {/* Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={`rounded-3xl border overflow-hidden ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-100 shadow-xl"}`}
          >
            {/* Gradient Header */}
            <div className="relative bg-gradient-to-br from-[#0B3D2E] to-emerald-700 p-7 text-white overflow-hidden">
              <div className="absolute -end-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
              <div className="absolute -start-4 -bottom-6 w-24 h-24 rounded-full bg-white/5" />

              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-[#C8A762]/20 border border-[#C8A762]/30 flex items-center justify-center mb-4">
                  <Gift size={24} weight="fill" className="text-[#C8A762]" />
                </div>
                <h1 className="text-xl font-bold mb-1">
                  {isRTL ? "تم دعوتك للمكتبة القانونية!" : "You've Been Invited to the Legal Library!"}
                </h1>
                <p className="text-white/70 text-sm leading-relaxed">
                  {inviterName
                    ? (isRTL
                        ? `${inviterName} يدعوك للاستفادة من المكتبة القانونية في منصة نظامي مجاناً.`
                        : `${inviterName} is inviting you to access the Legal Library on Nezamy for free.`)
                    : (isRTL
                        ? "أحد زملائك القانونيين يدعوك للاستفادة من المكتبة القانونية في منصة نظامي مجاناً."
                        : "A legal colleague is inviting you to access the Legal Library on Nezamy for free.")}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Trial highlight */}
              {!accepted && (
                <div className={`flex items-center gap-3 rounded-2xl p-4 ${isDark ? "bg-[#C8A762]/8 border border-[#C8A762]/15" : "bg-amber-50 border border-amber-200"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-[#C8A762]/15" : "bg-[#C8A762]/20"}`}>
                    <Sparkle size={20} weight="fill" className="text-[#C8A762]" />
                  </div>
                  <div>
                    <p className={`text-[14px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>
                      {isRTL
                        ? `وصول مجاني لمدة ${trialLengthLabel(trialDays, true)}`
                        : `Free access for ${trialLengthLabel(trialDays, false)}`}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-amber-700/70"}`}>
                      {isRTL ? "بدون بطاقة ائتمانية · لا التزام" : "No credit card · No commitment"}
                    </p>
                  </div>
                </div>
              )}

              {/* Accepted state */}
              {accepted ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center space-y-4 py-4"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle size={36} weight="fill" className="text-emerald-500" />
                  </div>
                  <div>
                    <p className={`text-[16px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>
                      {isRTL ? "تجربتك مفعّلة!" : "Your Trial is Active!"}
                    </p>
                    <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      {isRTL
                        ? `سجّل الآن للاستفادة من ${trialLengthLabel(trialDays, true)} كاملة`
                        : `Register now to enjoy ${trialLengthLabel(trialDays, false)} of full access`}
                    </p>
                  </div>
                  <Link
                    href={`/register?invite=${code}&trial=${trialDays}`}
                    className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-[#0B3D2E] text-white text-[14px] font-bold hover:bg-[#155e41] transition-colors"
                  >
                    {isRTL ? "سجّل وابدأ الاستخدام" : "Register and Start Now"}
                    <Arrow size={16} />
                  </Link>
                  <Link
                    href="/pricing"
                    className={`block text-center text-[12px] font-medium transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}
                  >
                    {isRTL ? "تعرّف على الباقات أولاً →" : "View plans first →"}
                  </Link>
                </motion.div>
              ) : (
                <>
                  {/* Features list */}
                  <div>
                    <p className={`text-[12px] font-semibold mb-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      {isRTL ? "ما ستحصل عليه:" : "What you'll get:"}
                    </p>
                    <div className="space-y-2.5">
                      {TRIAL_FEATURES.map((feat, i) => {
                        const Icon = feat.icon;
                        return (
                          <div key={i} className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDark ? "bg-[#0B3D2E]/60" : "bg-[#0B3D2E]/8"}`}>
                              <Icon size={14} className="text-emerald-500" weight="bold" />
                            </div>
                            <span className={`text-[13px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                              {isRTL ? feat.ar : feat.en}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* CTA */}
                  <motion.button
                    whileHover={accepting ? undefined : { scale: 1.01 }}
                    whileTap={accepting ? undefined : { scale: 0.98 }}
                    onClick={handleAccept}
                    disabled={accepting}
                    className="w-full py-4 rounded-2xl bg-[#0B3D2E] text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-[#155e41] transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Gift size={16} weight="fill" />
                    {accepting
                      ? (isRTL ? "جارٍ التفعيل…" : "Activating…")
                      : (isRTL ? "قبول الدعوة وسجّل مجاناً" : "Accept Invitation & Register Free")}
                  </motion.button>

                  {acceptError && (
                    <p className="text-center text-[11px] font-medium text-red-400">
                      {acceptError}
                    </p>
                  )}

                  <p className={`text-center text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    {isRTL
                      ? `التجربة مجانية لمدة ${trialLengthLabel(trialDays, true)} — لا يتطلب بطاقة ائتمان`
                      : `Free trial for ${trialLengthLabel(trialDays, false)} — no credit card required`}
                  </p>
                </>
              )}
            </div>
          </motion.div>

          {/* Code display */}
          <p className={`text-center text-[11px] mt-4 font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {isRTL ? `كود الدعوة: ${displayCode}` : `Invite code: ${displayCode}`}
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
