"use client";

import {
  MapPin, Clock, CurrencyDollar, SealCheck, CheckCircle,
  ArrowRight, ArrowUp, Briefcase, X, Users,
} from "@phosphor-icons/react";
import Link from "next/link";
import { CATEGORIES, URGENCY, STATUS_CFG } from "../_data";
import type { ServiceRequest } from "../_types";

export function RequestCard({
  req, canOffer, isDark, showMyActions = false,
}: {
  req: ServiceRequest; canOffer: boolean; isDark: boolean; showMyActions?: boolean;
}) {
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const cat  = CATEGORIES.find(c => c.id === req.category)!;
  const CatIcon = cat?.icon ?? Briefcase;
  const urg  = URGENCY[req.urgency];
  const UrgIcon = urg.icon;
  const stat = STATUS_CFG[req.status];
  const StatIcon = stat.icon;

  return (
    <article className={`${card} p-5 hover:border-[#0B3D2E]/40 transition-all group`}>
      {/* Top row */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl font-bold ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <CatIcon size={12} />{cat?.label}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl font-bold ${stat.bg} ${stat.color}`}>
            <StatIcon size={11} weight="fill" />{stat.label}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-xl font-bold ${urg.bg} ${urg.color}`}>
            <UrgIcon size={11} weight="fill" />{urg.label}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${isDark ? "bg-[#C8A762]/10 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-100"}`}>
          <CurrencyDollar size={14} className="text-[#C8A762]" weight="fill" />
          <span className="text-xs font-black text-[#C8A762]">
            {req.budgetMin.toLocaleString()} – {req.budgetMax.toLocaleString()} ر.س
          </span>
          <span className={`text-xs ${muted}`}>(مقترح)</span>
        </div>
      </div>

      <Link href={`/marketplace/${req.id}`}
        className={`block text-base font-bold leading-snug mb-2 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition ${isDark ? "text-gray-100" : "text-gray-800"}`}>
        {req.title}
      </Link>
      <p className={`text-sm leading-relaxed mb-3 line-clamp-2 ${muted}`}>{req.description}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {req.tags.map((t, i) => (
          <span key={i} className={`text-xs px-2 py-0.5 rounded-md ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{t}</span>
        ))}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-dashed ${isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={`flex items-center gap-1 ${muted}`}><MapPin size={12} weight="fill" />{req.city}</span>
          <span className={muted}>·</span>
          <span className={`flex items-center gap-1 ${muted}`}>
            {req.isVerified && <SealCheck size={12} className="text-[#C8A762]" weight="fill" />}{req.postedBy}
          </span>
          <span className={muted}>·</span>
          <span className={`flex items-center gap-1 ${muted}`}><Clock size={12} />{req.postedAt}</span>
          <span className={muted}>·</span>
          <span className={muted}>{req.views} مشاهدة</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${req.offersCount > 0 ? "text-emerald-500" : muted}`}>{req.offersCount} عرض</span>
          {showMyActions ? (
            <div className="flex gap-2">
              <Link href={`/marketplace/${req.id}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                عرض التفاصيل <ArrowRight size={12} className="rotate-180" />
              </Link>
              {req.status === "open" && (
                <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition">
                  <X size={12} /> إلغاء
                </button>
              )}
            </div>
          ) : canOffer && req.status === "open" ? (
            <Link href={`/marketplace/${req.id}`}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition">
              <ArrowUp size={13} /> قدِّم عرضاً
            </Link>
          ) : (
            <Link href={`/marketplace/${req.id}`}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              عرض التفاصيل <ArrowRight size={13} className="rotate-180" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
