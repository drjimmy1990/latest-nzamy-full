"use client";

/**
 * InvitationModal.tsx
 * ─────────────────────────────────────────────────────────────
 * Full invitation management modal — shows 3 invitation links,
 * allows copying each individually, and composing a WhatsApp
 * share message. Appears after subscription or via banner CTA.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift, X, Copy, CheckCircle, ShareNetwork,
  WhatsappLogo, Clock, Users,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getLibrarySubscription,
  type Invitation,
  TRIAL_DAYS_BY_PLAN,
  PLAN_LABELS,
} from "@/lib/invitationStore";

// ── Props ──────────────────────────────────────────────────────────────────

interface InvitationModalProps {
  open: boolean;
  onClose: () => void;
  /** If true, shows "مبروك" welcome screen first */
  isPostSubscription?: boolean;
}

// ── Helper ─────────────────────────────────────────────────────────────────

function buildShareMessage(link: string, trialDays: number, isAr: boolean): string {
  if (isAr) {
    const period = trialDays === 30 ? "شهر" : trialDays === 60 ? "شهرين" : "3 أشهر";
    return `السلام عليكم،\n\nاشتركت في المكتبة القانونية على منصة نظامي وأودّ دعوتك للاستفادة منها مجاناً لمدة ${period}.\n\nالرابط: ${link}\n\nنظامي — المرجع القانوني السعودي الشامل`;
  }
  const period = trialDays === 30 ? "1 month" : trialDays === 60 ? "2 months" : "3 months";
  return `Hello,\n\nI subscribed to the Legal Library on Nezamy and would like to invite you to use it for free for ${period}.\n\nLink: ${link}\n\nNezamy — Saudi Legal Reference`;
}

// ── Sub-component: InvitationCard ──────────────────────────────────────────

function InvitationCard({
  inv, index, trialDays, isDark, isRTL,
}: {
  inv: Invitation;
  index: number;
  trialDays: number;
  isDark: boolean;
  isRTL: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(inv.link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleWhatsApp() {
    const msg = buildShareMessage(inv.link, trialDays, isRTL);
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener");
  }

  const statusColor = {
    pending: isDark ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-emerald-700 bg-emerald-50 border-emerald-200",
    used:    isDark ? "text-zinc-400 bg-zinc-800 border-zinc-700" : "text-zinc-500 bg-zinc-100 border-zinc-200",
    expired: isDark ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-red-600 bg-red-50 border-red-200",
  }[inv.status];

  const statusLabel = {
    pending: isRTL ? "متاحة" : "Available",
    used:    isRTL ? "مُستخدمة" : "Used",
    expired: isRTL ? "منتهية" : "Expired",
  }[inv.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={`rounded-2xl border p-4 ${
        inv.status === "pending"
          ? isDark
            ? "bg-zinc-900/80 border-white/[0.06]"
            : "bg-white border-zinc-100 shadow-sm"
          : isDark
            ? "bg-zinc-900/40 border-white/[0.04] opacity-60"
            : "bg-zinc-50 border-zinc-100 opacity-60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
            isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
          }`}>
            {index + 1}
          </div>
          <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
            {isRTL ? `دعوة ${["الأولى", "الثانية", "الثالثة"][index]}` : `Invitation ${index + 1}`}
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Trial info */}
      <div className={`flex items-center gap-1.5 mb-3 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        <Clock size={11} />
        {isRTL
          ? `مدة التجربة: ${trialDays === 30 ? "شهر" : trialDays === 60 ? "شهرين" : "3 أشهر"} مجاناً`
          : `Trial: ${trialDays === 30 ? "1 month" : trialDays === 60 ? "2 months" : "3 months"} free`}
      </div>

      {/* Link row */}
      {inv.status === "pending" && (
        <>
          <div className={`flex items-center gap-2 rounded-xl p-2 mb-3 font-mono text-[11px] truncate ${
            isDark ? "bg-zinc-800/80 border border-white/[0.04]" : "bg-zinc-50 border border-zinc-200"
          }`}>
            <span className={`flex-1 truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {inv.link}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleCopy}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                copied
                  ? "bg-emerald-600 text-white"
                  : isDark
                    ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] border border-white/[0.06]"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200"
              }`}
            >
              {copied ? <CheckCircle size={13} weight="fill" /> : <Copy size={13} />}
              {copied ? (isRTL ? "تم النسخ" : "Copied!") : (isRTL ? "نسخ الرابط" : "Copy Link")}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 hover:bg-[#25D366]/20 transition-colors"
              title={isRTL ? "شارك عبر واتساب" : "Share via WhatsApp"}
            >
              <WhatsappLogo size={14} weight="fill" />
              {isRTL ? "واتساب" : "WhatsApp"}
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────

export default function InvitationModal({
  open,
  onClose,
  isPostSubscription = false,
}: InvitationModalProps) {
  const { isDark, isRTL } = useTheme();
  const [showWelcome, setShowWelcome] = useState(isPostSubscription);
  const sub = getLibrarySubscription();

  useEffect(() => {
    setShowWelcome(isPostSubscription);
  }, [isPostSubscription, open]);

  if (!open) return null;

  const invitations = sub?.invitations ?? [];
  const trialDays   = sub?.trialDaysPerInvite ?? 30;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="inv-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="inv-modal"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className={`fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-3xl max-w-md mx-auto overflow-hidden ${
              isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-100 shadow-2xl"
            }`}
            dir={isRTL ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`relative px-5 pt-5 pb-4 ${
              isDark
                ? "bg-gradient-to-b from-[#0B3D2E]/40 to-transparent"
                : "bg-gradient-to-b from-[#0B3D2E]/5 to-transparent"
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    isDark ? "bg-[#C8A762]/15 border border-[#C8A762]/20" : "bg-[#0B3D2E]/10"
                  }`}>
                    <Gift size={20} weight="fill" className="text-[#C8A762]" />
                  </div>
                  <div>
                    <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                      {showWelcome
                        ? (isRTL ? "مبروك! 🎉 اشتراكك نشط" : "Congratulations! 🎉")
                        : (isRTL ? "دعوات الزملاء" : "Colleague Invitations")}
                    </h2>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      {isRTL
                        ? `${sub?.planLabel ?? ""} — لديك 3 دعوات لزملائك`
                        : `${sub?.planLabel ?? ""} — 3 invitations for your colleagues`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                    isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"
                  }`}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Welcome message */}
              {showWelcome && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className={`mt-3 rounded-xl p-3 text-[12px] leading-relaxed ${
                    isDark ? "bg-[#C8A762]/10 border border-[#C8A762]/15 text-zinc-300" : "bg-amber-50 border border-amber-200 text-zinc-700"
                  }`}
                >
                  {isRTL
                    ? `ادعُ 3 من زملائك للاستفادة من المكتبة مجاناً لمدة ${trialDays === 30 ? "شهر" : trialDays === 60 ? "شهرين" : "3 أشهر"} — ابعت لهم الرابط مباشرة أو عبر واتساب 👇`
                    : `Invite 3 colleagues to use the library free for ${trialDays === 30 ? "1 month" : trialDays === 60 ? "2 months" : "3 months"} — send them the link or via WhatsApp 👇`}
                </motion.div>
              )}
            </div>

            {/* Invitations list */}
            <div className="px-5 pb-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Stats row */}
              <div className={`flex items-center gap-1.5 text-[11px] mb-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                <Users size={12} />
                {isRTL
                  ? `${invitations.filter(i => i.status === "used").length} مستخدمة · ${invitations.filter(i => i.status === "pending").length} متبقية`
                  : `${invitations.filter(i => i.status === "used").length} used · ${invitations.filter(i => i.status === "pending").length} remaining`}
              </div>

              {invitations.map((inv, i) => (
                <InvitationCard
                  key={inv.id}
                  inv={inv}
                  index={i}
                  trialDays={trialDays}
                  isDark={isDark}
                  isRTL={isRTL}
                />
              ))}

              {/* How it works note */}
              <div className={`rounded-xl px-3 py-2.5 text-[11px] leading-relaxed ${
                isDark ? "bg-zinc-800/60 text-zinc-500" : "bg-zinc-50 text-zinc-400 border border-zinc-100"
              }`}>
                {isRTL
                  ? "⚙️ بمجرد تسجيل صديقك عبر الرابط، يُفعَّل وصوله للمكتبة تلقائياً للمدة المحددة."
                  : "⚙️ Once your colleague registers via the link, their library access is activated automatically for the specified period."}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
