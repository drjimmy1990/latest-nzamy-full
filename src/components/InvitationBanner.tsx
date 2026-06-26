"use client";

/**
 * InvitationBanner.tsx
 * ─────────────────────────────────────────────────────────────
 * A subtle, non-intrusive banner shown inside /laws to
 * subscribers who have pending colleague invitations.
 * Clicking "إدارة الدعوات" opens InvitationModal.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getLibrarySubscription,
  hasActiveLibrarySubscription,
  getRemainingInvitations,
} from "@/lib/invitationStore";
import InvitationModal from "./InvitationModal";

export default function InvitationBanner() {
  const { isDark, isRTL } = useTheme();
  const [show, setShow]         = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const active = hasActiveLibrarySubscription();
    const rem    = getRemainingInvitations();
    setRemaining(rem);
    setShow(active && rem > 0);
  }, []);

  if (!show || dismissed) return (
    <>
      <InvitationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );

  const sub = getLibrarySubscription();

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="inv-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 mb-4 ${
            isDark
              ? "bg-[#0B3D2E]/40 border border-[#C8A762]/20"
              : "bg-[#0B3D2E]/5 border border-[#0B3D2E]/15"
          }`}
        >
          {/* Icon */}
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            isDark ? "bg-[#C8A762]/10 border border-[#C8A762]/20" : "bg-[#0B3D2E]/10"
          }`}>
            <Gift size={16} weight="fill" className="text-[#C8A762]" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-semibold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
              {isRTL
                ? `لديك ${remaining} ${remaining === 1 ? "دعوة" : "دعوات"} متبقية لزملائك`
                : `You have ${remaining} pending invitation${remaining !== 1 ? "s" : ""} for colleagues`}
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {isRTL
                ? `ادعُهم للاستفادة من المكتبة مجاناً لمدة ${sub?.trialDaysPerInvite ?? 30} يوماً`
                : `Invite them to try the library free for ${sub?.trialDaysPerInvite ?? 30} days`}
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={() => setModalOpen(true)}
            className={`shrink-0 text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              isDark
                ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25"
                : "bg-[#0B3D2E] text-white hover:bg-[#155e41]"
            }`}
          >
            {isRTL ? "ادعُ زميلك" : "Invite Colleague"}
          </button>

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
            }`}
            aria-label="dismiss"
          >
            <X size={13} />
          </button>
        </motion.div>
      </AnimatePresence>

      <InvitationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
