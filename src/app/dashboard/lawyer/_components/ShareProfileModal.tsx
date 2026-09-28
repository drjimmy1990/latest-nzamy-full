"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  XCircle, Copy, Check, ShareNetwork,
  WhatsappLogo, XLogo, LinkedinLogo,
} from "@phosphor-icons/react";
import { copyToClipboard } from "@/lib/services/publicProfileLink";
import { buildProfileShareTargets, PROFILE_SHARE_TEXT, type ProfileShareTargetId } from "./profileShareTargets";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /** from buildPublicProfileUrl — the caller has already passed the canShareProfile gate */
  url: string;
  lawyerName: string;
}

const TARGET_ICON: Record<ProfileShareTargetId, { Icon: React.ElementType; color: string }> = {
  whatsapp: { Icon: WhatsappLogo, color: "#25d366" },
  x:        { Icon: XLogo,        color: "" }, // follows the text colour, so it stays visible in both themes
  linkedin: { Icon: LinkedinLogo, color: "#0a66c2" },
};

/**
 * «مشاركة ملفي المهني» (T28-29b): the link in a read-only field with a copy
 * button, plus WhatsApp / X / LinkedIn share links. Opened by the dashboard
 * home's button and by the profile page's twin — both only when
 * `canShareProfile` (publicProfileLink.ts) allows it, which under
 * BETA_MONOPOLY_MODE it does not; this modal does not re-check the gate.
 *
 * No QR code: that waits on the owner's PDF/QR library decision, and a
 * placeholder square would be a promise with nothing behind it.
 *
 * The read-only field doubles as the manual-copy fallback the two pages used
 * to render inline: when both clipboard tiers fail the field is selected and
 * the hint says to copy it by hand.
 */
export default function ShareProfileModal({ onClose, isDark, url, lawyerName }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const fieldRef = useRef<HTMLInputElement>(null);
  const targets = buildProfileShareTargets(url);

  // Let «نُسخ» lapse, and cancel the timer if the modal closes first.
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  // Escape closes, like the backdrop click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = async () => {
    if (await copyToClipboard(url)) {
      setCopyState("copied");
    } else {
      setCopyState("failed");
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }
  };

  const name = lawyerName.trim();

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-profile-title"
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-royal/5"}`}>
              <ShareNetwork size={20} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-royal"} />
            </div>
            <div className="min-w-0">
              <h3 id="share-profile-title" className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                مشاركة الملف المهني
              </h3>
              {name && (
                <p className={`text-[12px] truncate ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{name}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}
          >
            <XCircle size={16} />
          </button>
        </div>

        {/* The link */}
        <label htmlFor="share-profile-url" className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          رابط ملفك العام
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id="share-profile-url"
            ref={fieldRef}
            type="text"
            dir="ltr"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-[12px] font-mono text-left outline-none ${
              isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          />
          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold transition-colors flex-shrink-0 ${
              copyState === "copied"
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/40"
                : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
            }`}
          >
            {copyState === "copied" ? <Check size={14} weight="bold" /> : <Copy size={14} />}
            {copyState === "copied" ? "نُسخ" : "نسخ الرابط"}
          </button>
        </div>
        {copyState === "failed" && (
          <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
            تعذّر النسخ تلقائياً — الرابط محدَّد في الحقل أعلاه، انسخه يدوياً.
          </p>
        )}

        {/* The message that goes with it */}
        <p className={`mt-5 mb-1.5 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نص المشاركة</p>
        <p className={`rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-300" : "border-slate-100 bg-slate-50/60 text-slate-600"}`}>
          {PROFILE_SHARE_TEXT}
        </p>

        {/* Share targets */}
        <p className={`mt-5 mb-2 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مشاركة عبر</p>
        <div className="grid grid-cols-3 gap-2">
          {targets.map((target) => {
            const { Icon, color } = TARGET_ICON[target.id];
            return (
              <a
                key={target.id}
                href={target.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[12px] font-semibold transition-colors ${
                  isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon size={22} weight="fill" color={color || undefined} />
                {target.label}
              </a>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
