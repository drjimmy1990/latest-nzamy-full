"use client";

/**
 * InvitationModal.tsx
 * ─────────────────────────────────────────────────────────────
 * Redeems an admin-issued library invitation code
 * (POST /api/v1/library/invitations/redeem, via
 * src/lib/services/libraryInvitationsService.ts's
 * redeemLibraryInvitation) for full legal-library access.
 *
 * Replaces the old localStorage "you have 3 invitations to give
 * your colleagues, each with its own trial length" mock
 * (src/lib/invitationStore.ts) — that flow had no server behind
 * it: no endpoint ever created, tracked or redeemed a
 * subscriber-issued invite. The real system is the reverse of
 * that shape — an admin issues a code centrally, and this modal
 * is where any signed-in user spends one.
 * ─────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, X, CheckCircle, WarningCircle, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { redeemLibraryInvitation } from "@/lib/services/libraryInvitationsService";
import { redeemSuccessMessageAr } from "@/lib/services/libraryInvitationDisplay";

interface InvitationModalProps {
  open: boolean;
  onClose: () => void;
}

export default function InvitationModal({ open, onClose }: InvitationModalProps) {
  const { isDark } = useTheme();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Every time this modal surfaces codes to the user, re-sync them
  // server-side (best-effort, idempotent). Covers codes generated while the
  // visitor was still a guest — this retries once they're logged in.
  useEffect(() => {
    if (open && invitations.length > 0) {
      syncInvitationCodes(invitations.map((inv) => inv.code));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleClose() {
    setCode("");
    setResult(null);
    setSubmitting(false);
    onClose();
  }

  async function handleRedeem() {
    const trimmed = code.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await redeemLibraryInvitation(trimmed);
      setResult({ ok: true, message: redeemSuccessMessageAr(res.tier, res.until) });
    } catch (err) {
      // apiMutate throws with the server's own Arabic message (bad code,
      // expired, exhausted, demo mode …) — surfaced verbatim, never replaced
      // with an invented reason.
      setResult({ ok: false, message: err instanceof Error ? err.message : "تعذّر تفعيل الكود" });
    } finally {
      setSubmitting(false);
    }
  }

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
            onClick={handleClose}
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
            dir="rtl"
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
                      تفعيل كود دعوة المكتبة
                    </h2>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      كود من فريق نظامي يمنحك وصولاً كاملاً للمكتبة القانونية
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                    isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"
                  }`}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="px-5 pb-5 space-y-4">
              {!result?.ok && (
                <>
                  <label className="block space-y-1.5">
                    <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                      كود الدعوة
                    </span>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRedeem();
                      }}
                      placeholder="أدخل كود الدعوة"
                      dir="ltr"
                      disabled={submitting}
                      className={`w-full rounded-xl border px-3 py-2.5 text-sm font-mono text-center tracking-widest outline-none ${
                        isDark
                          ? "bg-zinc-800/80 border-white/[0.08] text-white placeholder:text-zinc-600"
                          : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                      }`}
                    />
                  </label>

                  {result && !result.ok && (
                    <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${
                      isDark ? "bg-rose-500/10 border border-rose-500/20 text-rose-300" : "bg-rose-50 border border-rose-200 text-rose-700"
                    }`}>
                      <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" />
                      <span>{result.message}</span>
                    </div>
                  )}

                  <button
                    onClick={() => void handleRedeem()}
                    disabled={!code.trim() || submitting}
                    className={`w-full py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                      !code.trim() || submitting
                        ? isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                        : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#155e41]"
                    }`}
                  >
                    {submitting && <ArrowClockwise size={15} className="animate-spin" />}
                    {submitting ? "جارٍ التفعيل…" : "تفعيل الكود"}
                  </button>
                </>
              )}

              {result?.ok && (
                <div className="space-y-4">
                  <div className={`flex items-start gap-2 rounded-xl px-3 py-3 text-[13px] leading-relaxed font-semibold ${
                    isDark ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                  }`}>
                    <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" />
                    <span>{result.message}</span>
                  </div>
                  {/* Server state is already updated — the reload only
                      refreshes THIS browser's session so useUser() picks up
                      the new tier from user_metadata. Not triggered
                      automatically on close: a page reloading itself because
                      the user tapped the backdrop is jarring, and the grant
                      does not depend on it. */}
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-2.5 rounded-xl text-[13px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#155e41] transition-all"
                  >
                    تحديث الوصول الآن
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
