"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { WhatsappLogo } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import WhatsAppWidget from "./floating/WhatsAppWidget";
import type { UserCategory } from "./floating/types";
import { useUser } from "@/hooks/useUser";

// ─── Auto-detect category from logged-in user session ───────────────────────

function useAutoCategory(): { category: UserCategory; isLoggedIn: boolean } {
  const session = useUser();
  const [mounted, setMounted] = useState(false);

  // ── Anti-hydration: لا تقرأ session حتى بعد mount على الـ client
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !session.isLoggedIn || !session.userType) {
    return { category: null, isLoggedIn: mounted ? session.isLoggedIn : false };
  }

  const typeMap: Record<string, UserCategory> = {
    lawyer:     "lawyer",
    firm:       "firm",
    individual: "individual",
    client:     "individual", // "client" is the userType string for individuals
    corporate:  "corporate",
    micro:      "micro",
    provider:   "provider",
    admin:      "admin",
    government: "government",
    ngo:        "ngo",
  };

  const category = typeMap[session.userType] ?? null;
  return { category, isLoggedIn: session.isLoggedIn };
}

// ─── Magnetic Button ────────────────────────────────────────────────────────

function MagneticFAB({
  onClick,
  isActive,
  className,
  activeClassName,
  children,
  label,
  pulse,
  tooltip,
}: {
  onClick: () => void;
  isActive: boolean;
  className: string;
  activeClassName: string;
  children: React.ReactNode;
  label: string;
  pulse?: boolean;
  tooltip?: string;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-8, 8], [3, -3]);
  const rotateY = useTransform(x, [-8, 8], [-3, 3]);

  const handleMouse = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.2);
    y.set((e.clientY - cy) * 0.2);
  };
  const resetMouse = () => { x.set(0); y.set(0); };

  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative" suppressHydrationWarning>
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && tooltip && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold shadow-lg border border-white/10 pointer-events-none z-10"
          >
            {tooltip}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pulse ring */}
      {pulse && !isActive && (
        <motion.span
          className="absolute inset-0 rounded-full bg-[#25D366]"
          animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
        />
      )}

      <motion.button
        style={{ x, y, rotateX, rotateY }}
        whileTap={{ scale: 0.92 }}
        onMouseMove={handleMouse}
        onMouseLeave={() => { resetMouse(); setShowTooltip(false); }}
        onMouseEnter={() => setShowTooltip(true)}
        onClick={onClick}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors
          ${isActive ? activeClassName : className}`}
        aria-label={label}
      >
        {children}
      </motion.button>
    </div>
  );
}

// ─── Floating Buttons (Single Button: WhatsApp / نظامي) ─────────────────────
// UX DECISION: Removed magnetic physics to guarantee 100% click reliability on all devices.

export default function FloatingButtons() {
  const { lang } = useTheme();
  const isRTL = lang === "ar";
  const { category: autoCategory, isLoggedIn } = useAutoCategory();
  const rootRef = useRef<HTMLDivElement>(null);

  const [isPrimaryInstance, setIsPrimaryInstance] = useState(true);
  const [waOpen, setWaOpen] = useState(false);
  const [userCategory, setUserCategory] = useState<UserCategory>(null);
  const effectiveUserCategory = userCategory ?? autoCategory;

  const openWa = useCallback(() => setWaOpen(true), []);
  const closeWa = useCallback(() => setWaOpen(false), []);

  useEffect(() => {
    const refreshPrimaryInstance = () => {
      const roots = Array.from(document.querySelectorAll('[data-nzamy-floating-root="true"]'));
      setIsPrimaryInstance(roots[0] === rootRef.current);
    };

    refreshPrimaryInstance();
    const observer = new MutationObserver(refreshPrimaryInstance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  // WA button: left side (RTL) to avoid sidebar overlap, right side (LTR)
  const waBtnSide   = isRTL ? "left-6" : "right-6";
  const waPanelSide = isRTL ? "left-6" : "right-6";
  const panelBottom = "bottom-24 md:bottom-20";
  const buttonTooltip = isRTL
    ? (isLoggedIn ? "مساعد نظامي حسب دورك" : "اطلب خدمة قانونية")
    : (isLoggedIn ? "Role-aware Nzamy assistant" : "Request Legal Service");

  return (
    <div ref={rootRef} data-nzamy-floating-root="true" className={isPrimaryInstance ? undefined : "hidden"}>
      {/* WhatsApp Panel */}
      <WhatsAppWidget
        open={waOpen} onClose={closeWa}
        bottomPos={panelBottom} panelSide={waPanelSide}
        onUserTypeSelected={setUserCategory}
        isLoggedIn={isLoggedIn}
        userCategory={effectiveUserCategory}
      />

      {/* Single Floating Button — WhatsApp */}
      <div className={`fixed bottom-20 md:bottom-6 ${waBtnSide} z-[9999]`}>
        <div className="relative group">
          {/* Tooltip */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white text-[11px] font-bold shadow-lg border border-white/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
            {buttonTooltip}
          </div>

          {/* Pulse ring */}
          {!waOpen && (
            <motion.span
              className="absolute inset-0 rounded-full bg-[#25D366] pointer-events-none"
              animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
            />
          )}

          <button
            onClick={() => {
              waOpen ? closeWa() : openWa();
            }}
            className={`relative w-14 h-14 rounded-full shadow-[0_8px_20px_rgba(37,211,102,0.3)] flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95
              ${waOpen
                ? "bg-[#25D366] dark:bg-[#1fad55] ring-2 ring-white ring-offset-2"
                : "bg-[#25D366] hover:bg-[#1ebe5d] dark:bg-[#1fad55] dark:hover:bg-[#1a9e4d]"
              }`}
            aria-label={buttonTooltip}
          >
            <WhatsappLogo size={28} weight="fill" className="text-white drop-shadow-md" />
          </button>
        </div>
      </div>
    </div>
  );
}
