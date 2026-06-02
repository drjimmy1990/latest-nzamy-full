"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { rowBtnClass, staggerListVariants, staggerItemVariants } from "./WaShared";
import type { WaStep, UserCategory } from "../types";
import { getServicesForSession, type ServiceItem } from "../constants/floatingServices";
import type { UserSession } from "@/hooks/useUser";

interface Props {
  isDark: boolean;
  isRTL: boolean;
  onNavigate: (next: WaStep) => void;
  onSelect?: (key: string, value: string) => void;
  onClose?: () => void;
  onQuickRequest?: (service: ServiceItem) => void;
  userCategory?: UserCategory;
  user?: UserSession;
}

export default function StepServiceSelect({ isDark, isRTL, onNavigate, onSelect, onClose, onQuickRequest, userCategory, user }: Props) {
  const NavArrow = isRTL
    ? <ArrowLeft size={14} className="text-gray-400 shrink-0" />
    : <ArrowRight size={14} className="text-gray-400 shrink-0" />;

  const services = getServicesForSession(userCategory ?? "guest", user);

  const rememberService = (key: string, label: string) => {
    onSelect?.("serviceKey", key);
    onSelect?.("serviceLabel", label);
    if (userCategory) onSelect?.("serviceCategory", userCategory);
  };

  return (
    <motion.div
      variants={staggerListVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-2 relative"
    >
      {services.map((service) => {
        const { key, icon, label, sub, next, href, badge, quickRequest: request } = service;
        const content = (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-[#0B3D2E]/5 dark:bg-emerald-500/10 text-[#0B3D2E] dark:text-emerald-400">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{label}</span>
                {badge && (
                  <span className="shrink-0 rounded-full bg-[#C8A762]/10 px-2 py-0.5 text-[10px] font-black text-[#9A7936] dark:text-[#C8A762]">
                    {badge}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>
            </div>
            {NavArrow}
          </>
        );

        if (href) {
          return (
            <motion.div variants={staggerItemVariants} key={key}>
              <Link
                href={href}
                onClick={() => {
                  rememberService(key, label);
                  onClose?.();
                }}
                className={rowBtnClass(isDark)}
                aria-label={label + " — " + sub}
              >
                {content}
              </Link>
            </motion.div>
          );
        }

        if (request) {
          return (
            <motion.div variants={staggerItemVariants} key={key}>
              <button
                type="button"
                onClick={() => {
                  rememberService(key, label);
                  onQuickRequest?.(service);
                }}
                className={rowBtnClass(isDark)}
                aria-label={label + " — " + sub}
              >
                {content}
              </button>
            </motion.div>
          );
        }

        return (
          <motion.button
            variants={staggerItemVariants}
            key={key}
            onClick={() => {
              rememberService(key, label);
              if (next) onNavigate(next);
            }}
            className={rowBtnClass(isDark)}
            aria-label={label + " — " + sub}
          >
            {content}
          </motion.button>
        );
      })}
      <motion.button
        variants={staggerItemVariants}
        onClick={() => onNavigate("customer-service")}
        className="mt-1 text-[11px] font-medium text-center text-gray-500 hover:text-[#0B3D2E] dark:hover:text-emerald-400 transition-colors underline underline-offset-4"
      >
        دعم العملاء
      </motion.button>
    </motion.div>
  );
}
