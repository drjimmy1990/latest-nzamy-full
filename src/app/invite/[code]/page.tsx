"use client";

/**
 * /invite/[code]/page.tsx
 * ─────────────────────────────────────────────────────────────
 * Landing page for invited colleagues.
 * URL: /invite/NZM-INV-XXXX
 *
 * Validates the invite code and shows a welcome screen with
 * the trial details. After clicking "Register", the code is
 * stored and carried through the registration flow.
 * ─────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen, Gift, CheckCircle, ArrowLeft, ArrowRight,
  Clock, Sparkle, Lock, MagnifyingGlass, Gavel,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useParams } from "next/navigation";
import { validateInviteCode, acceptInvitation, getInvitationByCode, getLawyerLicense } from "@/lib/invitationStore";

// ── Features included in trial ────────────────────────────────────────────

const TRIAL_FEATURES = [
  { icon: MagnifyingGlass, ar: "بحث ذكي AI في كل الأنظمة واللوائح",     en: "AI-powered search across all laws and regulations" },
  { icon: BookOpen,        ar: "نصوص الأنظمة واللوائح التنفيذية كاملة",  en: "Full law and executive regulation texts" },
  { icon: Gavel,           ar: "المبادئ القضائية والسوابق",              en: "Judicial principles and precedents" },
  { icon: Clock,           ar: "تحديثات يومية فور صدور الأنظمة",         en: "Daily updates the moment laws are issued" },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function InvitePage() {
  const { isDark, isRTL } = useTheme();
  const params = useParams();
  const code   = typeof params?.code === "string" ? params.code.toUpperCase() : "";

  const [valid, setValid]       = useState<boolean | null>(null);
  const [trialDays, setTrialDays] = useState(30);
  const [accepted, setAccepted] = useState(false);
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [licenseNumber, setLicenseNumber] = useState<string | null>(null);

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  useEffect(() => {
    if (!code) { setValid(false); return; }
    const result = validateInviteCode(code);
    setValid(result.valid);
    setTrialDays(result.trialDays);

    const inv = getInvitationByCode(code);
    if (inv && inv.recipientPhone) {
      const name = (inv as any).recipientName || "";
      setRecipientName(name);
      const license = getLawyerLicense(inv.recipientPhone, name);
      setLicenseNumber(license);
    }
  }, [code]);

  function handleAccept() {
    acceptInvitation(code, trialDays);
    setAccepted(true);
  }

  const trialLabel = (days: number, ar: boolean) => {
    if (days === 30) return ar ? "شهر كامل"    : "1 full month";
    if (days === 60) return ar ? "شهرين كاملين" : "2 full months";
    return ar ? "3 أشهر كاملة" : "3 full months";
  };

  // Loading
  if (valid === null) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0c0f12]" : "bg-zinc-50"}`}>
        <div className="w-8 h-8 rounded-full border-2 border-[#0B3D2E] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Invalid code
  if (!valid) {
    return (
      <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-zinc-50 text-zinc-900"}`}>
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className={`rounded-3xl border p-8 text-center max-w-sm ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-100 shadow-lg"}`}>
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <Lock size={28} className="text-red-400" />
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "رابط الدعوة غير صالح" : "Invalid Invitation Link"}
            </h1>
            <p className={`text-sm mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {isRTL
                ? "هذا الرابط غير صالح أو منتهي الصلاحية. تواصل مع الشخص الذي أرسل لك الدعوة."
                : "This link is invalid or expired. Please contact the person who sent you the invitation."}
            </p>
            <Link
              href="/laws"
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold"
            >
              <BookOpen size={16} weight="fill" />
              {isRTL ? "تصفح المكتبة مجاناً" : "Browse Library for Free"}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-zinc-50 text-zinc-900"}`}>
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-16">
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
                  {recipientName
                    ? (isRTL ? `أهلاً بك زميلنا ${recipientName}!` : `Welcome, Colleague ${recipientName}!`)
                    : (isRTL ? "تم دعوتك للمكتبة القانونية!" : "You've Been Invited to the Legal Library!")}
                </h1>
                <p className="text-white/70 text-sm leading-relaxed">
                  {isRTL
                    ? `أحد زملائك القانونيين يدعوك للاستفادة من المكتبة القانونية في منصة نظامي مجاناً.${licenseNumber ? ` تم التحقق من هويتك المهنية كعضو مرخص برقم ترخيص: ${licenseNumber}.` : ""}`
                    : `A legal colleague is inviting you to access the Legal Library on Nezamy for free.${licenseNumber ? ` Your professional license (${licenseNumber}) has been verified.` : ""}`}
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
                        ? `وصول مجاني لمدة ${trialLabel(trialDays, true)}`
                        : `Free access for ${trialLabel(trialDays, false)}`}
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
                        ? `سجّل الآن للاستفادة من ${trialLabel(trialDays, true)} كاملة`
                        : `Register now to enjoy ${trialLabel(trialDays, false)} of full access`}
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
                    href="/laws"
                    className={`block text-center text-[12px] font-medium transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}
                  >
                    {isRTL ? "تصفح المكتبة أولاً →" : "Browse the library first →"}
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
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAccept}
                    className="w-full py-4 rounded-2xl bg-[#0B3D2E] text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-[#155e41] transition-colors shadow-lg"
                  >
                    <Gift size={16} weight="fill" />
                    {isRTL ? "قبول الدعوة وسجّل مجاناً" : "Accept Invitation & Register Free"}
                  </motion.button>

                  <p className={`text-center text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    {isRTL
                      ? `التجربة مجانية لمدة ${trialLabel(trialDays, true)} — لا يتطلب بطاقة ائتمان`
                      : `Free trial for ${trialLabel(trialDays, false)} — no credit card required`}
                  </p>
                </>
              )}
            </div>
          </motion.div>

          {/* Code display */}
          <p className={`text-center text-[11px] mt-4 font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {isRTL ? `كود الدعوة: ${code}` : `Invite code: ${code}`}
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
