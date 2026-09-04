"use client";

/**
 * InvitationBanner.tsx
 * ─────────────────────────────────────────────────────────────
 * A subtle, non-intrusive banner shown inside /laws to a
 * signed-in user who does not yet have full library access
 * (tier below Pro — src/hooks/useSubscription.ts's
 * "library-full-access" gate), inviting them to redeem a library
 * invitation code if they have one. Clicking "تفعيل الكود" opens
 * InvitationModal, which spends the code through
 * POST /api/v1/library/invitations/redeem.
 *
 * Previously read src/lib/invitationStore.ts and told a
 * SUBSCRIBER they had "3 invitations for your colleagues" — a
 * count no endpoint ever produced. That flow is gone: this
 * banner only offers what the server can actually do, which is
 * redeem a code an admin issued (see
 * src/lib/services/libraryInvitationsService.ts).
 * ─────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useSubscription } from "@/hooks/useSubscription";
import { isSupabaseMode } from "@/lib/services/api";
import InvitationModal from "./InvitationModal";

export default function InvitationBanner() {
  const { isDark } = useTheme();
  const { isLoggedIn } = useUser();
  const { can } = useSubscription();
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Demo mode cannot redeem anything — the endpoint only exists in Supabase
  // mode (see redeemLibraryInvitation's DEMO guard) — so offering the CTA
  // there would be a control that can only fail.
  const eligible = isLoggedIn && isSupabaseMode && !can("library-full-access");

  if (!eligible || dismissed) {
    return <InvitationModal open={modalOpen} onClose={() => setModalOpen(false)} />;
  }

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
              لديك كود دعوة للمكتبة القانونية؟
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              فعّله للحصول على وصول كامل لنصوص الأنظمة والبحث الذكي
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
            تفعيل الكود
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
