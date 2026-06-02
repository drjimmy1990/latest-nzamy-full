"use client";

import type { ElementType } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Article,
  BookOpen,
  Browser,
  ChartLineUp,
  CheckCircle,
  Compass,
  Database,
  Globe,
  GraduationCap,
  ShieldCheck,
  Storefront,
  WarningCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { ADMIN_BACKEND_READINESS } from "@/constants/adminBackendReadiness";
import {
  PLATFORM_OWNER_SURFACES,
  type PlatformSurfaceArea,
  type PlatformSurfaceStatus,
} from "@/constants/platformOwnerCatalog";
import type { AdminReadinessStatus } from "@/types/adminBackendReady";

const AREA_ICON: Record<PlatformSurfaceArea, ElementType> = {
  marketing: Globe,
  "legal-library": BookOpen,
  content: Article,
  learning: GraduationCap,
  media: Browser,
  community: Compass,
  marketplace: Storefront,
  pricing: ChartLineUp,
  trust: ShieldCheck,
  seo: Database,
};

const STATUS_LABEL: Record<PlatformSurfaceStatus, string> = {
  live: "موجود فعلياً",
  beta: "Beta",
  mock: "Mock موثق",
  "backend-ready": "Backend-ready",
};

const STATUS_CLASS: Record<PlatformSurfaceStatus, string> = {
  live: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  beta: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  mock: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  "backend-ready": "border-blue-500/25 bg-blue-500/10 text-blue-300",
};

const READINESS_LABEL: Record<AdminReadinessStatus, string> = {
  "UI Working": "UI Working",
  "Backend-ready": "Backend-ready",
  "Missing UI": "Missing UI",
  Risk: "Risk",
};

const READINESS_CLASS: Record<AdminReadinessStatus, string> = {
  "UI Working": "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  "Backend-ready": "border-blue-500/25 bg-blue-500/10 text-blue-300",
  "Missing UI": "border-rose-500/25 bg-rose-500/10 text-rose-300",
  Risk: "border-amber-500/25 bg-amber-500/10 text-amber-300",
};

export default function AdminPlatformPage() {
  const { isDark } = useTheme();
  const publicRoutesCount = new Set(PLATFORM_OWNER_SURFACES.flatMap((surface) => surface.publicRoutes)).size;
  const adminRoutesCount = new Set(PLATFORM_OWNER_SURFACES.flatMap((surface) => surface.adminRoutes)).size;
  const backendReadyCount = PLATFORM_OWNER_SURFACES.filter((surface) => surface.status === "backend-ready").length;
  const mockCount = PLATFORM_OWNER_SURFACES.filter((surface) => surface.status === "mock").length;

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-[1600px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/25 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              <Globe size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>
              مركز تحكم المنصة
            </h1>
          </motion.div>
          <p className={`text-sm leading-relaxed max-w-3xl ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            فحص owner-level للصفحات العامة، المحتوى، المكتبة القانونية، المدونة، الميديا، الأكاديمية، الفهرسة، وما يقابلها في لوحة الأدمن.
          </p>
        </div>
        <Link
          href="/sitemap.xml"
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition ${
            isDark ? "border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <Database size={16} />
          مراجعة sitemap
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "أسطح المنصة", value: PLATFORM_OWNER_SURFACES.length, icon: Globe },
          { label: "Routes عامة", value: publicRoutesCount, icon: Compass },
          { label: "Routes أدمن", value: adminRoutesCount, icon: ShieldCheck },
          { label: "Backend-ready / Mock", value: `${backendReadyCount}/${mockCount}`, icon: WarningCircle },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className={`p-5 rounded-2xl border ${isDark ? "bg-white/[0.02] border-white/5" : "bg-white border-gray-100 shadow-sm"}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{stat.label}</p>
                <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                <stat.icon size={22} weight="duotone" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
        <div className={`px-5 py-4 border-b ${isDark ? "border-white/10" : "border-gray-100"}`}>
          <h2 className={`text-base font-black ${isDark ? "text-white" : "text-gray-900"}`}>مصفوفة تناغم المنصة</h2>
          <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
            كل صف يوضح هل السطح موجود، أين يظهر للزائر، وأين يتحكم فيه الأدمن أو يراجعه.
          </p>
        </div>
        <div className="divide-y divide-white/5">
          {PLATFORM_OWNER_SURFACES.map((surface, index) => {
            const Icon = AREA_ICON[surface.area];
            return (
              <motion.div
                key={surface.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`p-5 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_1fr] gap-5 ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl flex-shrink-0 ${isDark ? "bg-white/[0.04] text-[#C8A762]" : "bg-gray-100 text-[#0B3D2E]"}`}>
                    <Icon size={20} weight="duotone" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>{surface.title}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${STATUS_CLASS[surface.status]}`}>
                        {STATUS_LABEL[surface.status]}
                      </span>
                    </div>
                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>{surface.betaNotes}</p>
                    <p className={`text-[11px] mt-2 font-mono ${isDark ? "text-gray-500" : "text-gray-400"}`}>{surface.sourceOfTruth}</p>
                  </div>
                </div>

                <div>
                  <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>الظهور العام</p>
                  <div className="flex flex-wrap gap-2">
                    {surface.publicRoutes.map((route) => (
                      <Link key={route} href={route} className={`text-[11px] px-2 py-1 rounded-lg border font-mono ${isDark ? "border-white/10 text-gray-300 hover:bg-white/[0.04]" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                        {route}
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>تحكم/مراجعة الأدمن</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {surface.adminRoutes.map((route) => (
                      <Link key={route} href={route} className={`text-[11px] px-2 py-1 rounded-lg border font-mono ${isDark ? "border-[#C8A762]/20 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#0B3D2E]/20 text-[#0B3D2E] hover:bg-[#0B3D2E]/5"}`}>
                        {route}
                      </Link>
                    ))}
                  </div>
                  <div className={`flex items-start gap-2 text-xs leading-relaxed p-3 rounded-xl border ${isDark ? "border-blue-500/20 bg-blue-500/5 text-blue-200" : "border-blue-100 bg-blue-50 text-blue-700"}`}>
                    <CheckCircle size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
                    <span>{surface.backendBoundary}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
        <div className={`px-5 py-4 border-b ${isDark ? "border-white/10" : "border-gray-100"}`}>
          <h2 className={`text-base font-black ${isDark ? "text-white" : "text-gray-900"}`}>جاهزية الأدمن للباك إند</h2>
          <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
            هذا التصنيف يفصل بين عمل الواجهة الآن وبين ما ينتظر API أو قاعدة بيانات لاحقاً.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-white/5">
          {ADMIN_BACKEND_READINESS.map((surface, index) => (
            <motion.div
              key={surface.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`p-5 ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50"}`}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <Link href={surface.route} className={`font-black hover:underline ${isDark ? "text-white" : "text-gray-900"}`}>
                  {surface.title}
                </Link>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${READINESS_CLASS[surface.status]}`}>
                  {READINESS_LABEL[surface.status]}
                </span>
              </div>
              <p className={`text-xs leading-relaxed mb-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{surface.note}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] px-2 py-1 rounded-lg border font-mono ${isDark ? "border-white/10 text-gray-300" : "border-gray-200 text-gray-700"}`}>
                  {surface.route}
                </span>
                <span className={`text-[11px] px-2 py-1 rounded-lg border font-mono ${isDark ? "border-blue-500/20 text-blue-200" : "border-blue-100 text-blue-700"}`}>
                  {surface.contract}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
