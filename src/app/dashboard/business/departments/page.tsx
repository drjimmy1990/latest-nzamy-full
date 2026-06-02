"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import {
  Buildings,
  Plus,
  Users,
  ChatsCircle,
  CurrencyCircleDollar,
  Sparkle,
  DotsThreeVertical,
  MagnifyingGlass,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  TrendUp,
  Warning,
  UserPlus,
  CaretLeft,
} from "@phosphor-icons/react";

import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Department {
  id: string;
  nameAr: string;
  nameEn: string;
  rep: string | null;
  repEmail: string | null;
  requestsMonth: number;
  costMonth: number;
  services: string[];
  aiAlert?: string | null;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_DEPTS: Department[] = [
  {
    id: "hr",
    nameAr: "الموارد البشرية",
    nameEn: "Human Resources",
    rep: "سلمى الأحمدي",
    repEmail: "salma@company.com",
    requestsMonth: 8,
    costMonth: 14250,
    services: ["استشارات", "توثيق"],
    aiAlert: "إدارة الموارد البشرية تستهلك 8+ استشارات/شهر — هل تريد تعيين مستشار دائم؟",
  },
  {
    id: "legal",
    nameAr: "الشؤون القانونية",
    nameEn: "Legal Affairs",
    rep: "نواف المطيري",
    repEmail: "nawaf@company.com",
    requestsMonth: 5,
    costMonth: 3820,
    services: ["قضايا", "عقود", "تحكيم"],
    aiAlert: null,
  },
  {
    id: "procurement",
    nameAr: "المشتريات",
    nameEn: "Procurement",
    rep: "ريم الشهري",
    repEmail: "reem@company.com",
    requestsMonth: 3,
    costMonth: 840,
    services: ["عقود", "استشارات"],
    aiAlert: null,
  },
  {
    id: "compliance",
    nameAr: "الامتثال",
    nameEn: "Compliance",
    rep: null,
    repEmail: null,
    requestsMonth: 0,
    costMonth: 0,
    services: [],
    aiAlert: null,
  },
];

const SERVICE_COLORS: Record<string, string> = {
  استشارات: "bg-royal/10 text-royal",
  توثيق: "bg-gold/10 text-gold",
  قضايا: "bg-red-500/10 text-red-600",
  عقود: "bg-emerald-500/10 text-emerald-600",
  تحكيم: "bg-purple-500/10 text-purple-600",
};

// ─── Add Department Modal ─────────────────────────────────────────────────────

function AddDeptModal({
  isOpen,
  onClose,
  isRTL,
  isDark,
}: {
  isOpen: boolean;
  onClose: () => void;
  isRTL: boolean;
  isDark: boolean;
}) {
  const [name, setName] = useState("");
  const [rep, setRep] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    setDone(true);
    setTimeout(() => { onClose(); setName(""); setRep(""); setDone(false); }, 1800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${
              isDark ? "border-white/10 bg-[#161b22]" : "border-slate-200 bg-white"
            }`}
          >
            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <Check size={32} weight="bold" className="text-emerald-500" />
                </div>
                <p className="font-semibold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>
                  {isRTL ? "تم إضافة الإدارة!" : "Department added!"}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-base font-bold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>
                    {isRTL ? "إضافة إدارة جديدة" : "Add New Department"}
                  </h3>
                  <button
                    onClick={onClose}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      isDark ? "hover:bg-white/10" : "hover:bg-slate-100"
                    }`}
                  >
                    <X size={16} style={{ color: isDark ? "#9ca3af" : "#6b7280" }} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold" style={{ color: isDark ? "#9ca3af" : "#374151" }}>
                      {isRTL ? "اسم الإدارة" : "Department Name"}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isRTL ? "مثال: الموارد البشرية" : "e.g. Human Resources"}
                      className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all ${
                        isDark
                          ? "border-white/10 bg-white/5 text-gray-200 placeholder:text-gray-600 focus:border-[#C8A762]/40"
                          : "border-slate-200 bg-slate-50 placeholder:text-slate-400 focus:border-[#0B3D2E]/30"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold" style={{ color: isDark ? "#9ca3af" : "#374151" }}>
                      {isRTL ? "ممثل الإدارة (اختياري)" : "Department Representative (optional)"}
                    </label>
                    <input
                      type="text"
                      value={rep}
                      onChange={(e) => setRep(e.target.value)}
                      placeholder={isRTL ? "البريد الإلكتروني أو الاسم" : "Email or name"}
                      className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all ${
                        isDark
                          ? "border-white/10 bg-white/5 text-gray-200 placeholder:text-gray-600 focus:border-[#C8A762]/40"
                          : "border-slate-200 bg-slate-50 placeholder:text-slate-400 focus:border-[#0B3D2E]/30"
                      }`}
                    />
                  </div>
                  <p className="text-[11px]" style={{ color: isDark ? "#6b7280" : "#9ca3af" }}>
                    {isRTL
                      ? "* الممثل يستطيع طلب الخدمات فقط — إدارة الحساب تبقى مع صاحب الحساب"
                      : "* Representative can request services only — account management stays with the account owner"}
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={!name.trim()}
                  className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition-all ${
                    name.trim()
                      ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328]"
                      : isDark
                        ? "bg-white/5 text-gray-600 cursor-not-allowed"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {isRTL ? "إضافة الإدارة" : "Add Department"}
                </motion.button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

import { RoleGuard } from "@/components/dashboard/RoleGuard";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

export default function DepartmentsPage() {
  const { isRTL, isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const filtered = MOCK_DEPTS.filter((d) => {
    const term = search.toLowerCase();
    return (
      d.nameAr.includes(search) ||
      d.nameEn.toLowerCase().includes(term) ||
      (d.rep || "").includes(search)
    );
  });

  const totalRequests = MOCK_DEPTS.reduce((s, d) => s + d.requestsMonth, 0);
  const totalCost = MOCK_DEPTS.reduce((s, d) => s + d.costMonth, 0);
  const aiAlerts = MOCK_DEPTS.filter((d) => d.aiAlert);

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <RoleGuard blockedRoles={["employee"]}>
    <SubscriptionGuard featureKey="departments">
    <div dir={isRTL ? "rtl" : "ltr"}>
      <main className="max-w-5xl mx-auto w-full px-4 py-8">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs" style={{ color: isDark ? "#6b7280" : "#9ca3af" }}>
          <span>{isRTL ? "لوحة التحكم" : "Dashboard"}</span>
          <Arrow size={10} />
          <span style={{ color: isDark ? "#e5e7eb" : "#111" }}>{isRTL ? "إدارة الأقسام" : "Departments"}</span>
        </div>

        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>
              {isRTL ? "إدارة الأقسام" : "Department Management"}
            </h1>
            <p className="mt-1 text-sm" style={{ color: isDark ? "#9ca3af" : "#6b7280" }}>
              {isRTL
                ? "أنشئ أقساماً وعيّن ممثلين لكل قسم — الميزانية مشتركة مع تقارير مفصّلة"
                : "Create departments and assign representatives — shared budget with detailed reports"}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a3328] transition-colors"
          >
            <Plus size={17} weight="bold" />
            {isRTL ? "إضافة إدارة" : "Add Department"}
          </motion.button>
        </div>

        {/* Stats row */}
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { labelAr: "إجمالي الإدارات", labelEn: "Total Depts", value: MOCK_DEPTS.length, icon: Buildings, color: "text-royal" },
            { labelAr: "الطلبات / شهر", labelEn: "Requests / mo", value: totalRequests, icon: ChatsCircle, color: "text-emerald-500" },
            { labelAr: "التكلفة / شهر", labelEn: "Cost / mo", value: `${totalCost.toLocaleString()} ر.س`, icon: CurrencyCircleDollar, color: "text-gold" },
            { labelAr: "اقتراحات AI", labelEn: "AI Insights", value: aiAlerts.length, icon: Sparkle, color: "text-[#C8A762]" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.labelEn}
                className={`rounded-2xl border p-4 ${isDark ? "border-white/10 bg-[#161b22]" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={17} weight="duotone" className={stat.color} />
                  <span className="text-[11px] font-medium" style={{ color: isDark ? "#9ca3af" : "#6b7280" }}>
                    {isRTL ? stat.labelAr : stat.labelEn}
                  </span>
                </div>
                <p className="text-xl font-bold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* AI Alerts */}
        {aiAlerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {aiAlerts.map((d) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 ${
                  isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"
                }`}
              >
                <Sparkle size={18} weight="duotone" className="shrink-0 mt-0.5 text-[#C8A762]" />
                <p className="flex-1 text-xs leading-relaxed" style={{ color: isDark ? "#d1d5db" : "#374151" }}>
                  {d.aiAlert}
                </p>
                <button className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  isDark ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25" : "bg-amber-200 text-amber-800 hover:bg-amber-300"
                }`}>
                  {isRTL ? "عيّن مستشاراً" : "Assign Advisor"}
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className={`mb-5 flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
          isDark ? "border-white/10 bg-[#161b22]" : "border-slate-200 bg-white"
        }`}>
          <MagnifyingGlass size={16} style={{ color: isDark ? "#6b7280" : "#9ca3af" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRTL ? "بحث في الإدارات..." : "Search departments..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            style={{ color: isDark ? "#e5e7eb" : "#111" }}
          />
        </div>

        {/* Department cards */}
        <div className="space-y-3">
          {filtered.map((dept, i) => (
            <motion.div
              key={dept.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`group relative rounded-2xl border p-5 transition-all hover:shadow-md ${
                isDark
                  ? "bg-zinc-900/80 border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:border-white/[0.12]"
                  : "bg-white border-zinc-200/70 hover:border-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,1)]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* Left: dept info — clicking navigates to detail */}
                <Link href={`/dashboard/business/departments/${dept.id}`} className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isDark ? "bg-white/10" : "bg-slate-100"
                  }`}>
                    <Buildings size={20} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>
                      {isRTL ? dept.nameAr : dept.nameEn}
                    </h3>
                    {dept.rep ? (
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: isDark ? "#9ca3af" : "#6b7280" }}>
                        <Users size={11} />
                        <span>{dept.rep}</span>
                      </div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-500">
                        <Warning size={11} />
                        <span>{isRTL ? "لا يوجد ممثل — الطلبات تروح لصاحب الحساب" : "No rep — requests go to account owner"}</span>
                      </div>
                    )}
                  </div>
                </Link>

                {/* Right: stats + actions */}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-lg font-bold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>{dept.requestsMonth}</p>
                    <p className="text-[10px]" style={{ color: isDark ? "#6b7280" : "#9ca3af" }}>
                      {isRTL ? "طلب / شهر" : "req / mo"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>
                      {dept.costMonth > 0 ? dept.costMonth.toLocaleString() : "—"}
                    </p>
                    <p className="text-[10px]" style={{ color: isDark ? "#6b7280" : "#9ca3af" }}>ر.س</p>
                  </div>

                  {/* View detail CTA */}
                  <Link
                    href={`/dashboard/business/departments/${dept.id}`}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all opacity-0 group-hover:opacity-100 ${
                      isDark
                        ? "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-[#0B3D2E]/5 hover:border-[#0B3D2E]/20 hover:text-[#0B3D2E]"
                    }`}
                    title={isRTL ? "عرض التفاصيل" : "View Details"}
                  >
                    <CaretLeft size={15} weight="bold" />
                  </Link>

                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen(menuOpen === dept.id ? null : dept.id)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        isDark ? "hover:bg-white/10" : "hover:bg-slate-100"
                      }`}
                    >
                      <DotsThreeVertical size={18} style={{ color: isDark ? "#9ca3af" : "#6b7280" }} />
                    </button>
                    <AnimatePresence>
                      {menuOpen === dept.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          className={`absolute end-0 top-10 z-20 w-40 rounded-xl border p-1 shadow-xl ${
                            isDark ? "border-white/10 bg-[#1e2530]" : "border-slate-200 bg-white"
                          }`}
                        >
                          {[
                            { labelAr: "عرض التفاصيل", labelEn: "View Details", href: `/dashboard/business/departments/${dept.id}` },
                            { labelAr: "تعيين ممثل", labelEn: "Assign Rep", href: "#" },
                            { labelAr: "التقارير", labelEn: "Reports", href: "#" },
                          ].map((item) => (
                            <a
                              key={item.labelEn}
                              href={item.href}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                isDark ? "text-gray-300 hover:bg-white/10" : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {isRTL ? item.labelAr : item.labelEn}
                            </a>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Services tags */}
              {dept.services.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {dept.services.map((s) => (
                    <span
                      key={s}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${SERVICE_COLORS[s] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Trend indicator */}
              {dept.requestsMonth >= 5 && (
                <div className="mt-3 flex items-center gap-1 text-[10px] text-emerald-500">
                  <TrendUp size={11} weight="bold" />
                  <span>{isRTL ? "نشاط مرتفع هذا الشهر" : "High activity this month"}</span>
                </div>
              )}

              {/* Add Rep CTA for depts without rep */}
              {!dept.rep && (
                <button className={`mt-3 flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  isDark ? "text-[#C8A762] hover:text-[#e2c27c]" : "text-[#0B3D2E] hover:text-[#0B3D2E]/70"
                }`}>
                  <UserPlus size={13} />
                  {isRTL ? "تعيين ممثل للإدارة" : "Assign department representative"}
                </button>
              )}

              {/* Hover: full-row link hint */}
              <Link
                href={`/dashboard/business/departments/${dept.id}`}
                className={`absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ring-1 ${
                  isDark ? "ring-white/[0.07]" : "ring-[#0B3D2E]/10"
                }`}
                aria-hidden="true"
              />
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <Buildings size={40} weight="duotone" className="mx-auto mb-3 opacity-30" />
              <p className="text-sm" style={{ color: isDark ? "#6b7280" : "#9ca3af" }}>
                {isRTL ? "لا توجد إدارات مطابقة" : "No departments found"}
              </p>
            </div>
          )}
        </div>

        {/* Info note */}
        <div className={`mt-8 rounded-2xl border p-4 ${isDark ? "border-white/8 bg-white/3" : "border-slate-100 bg-slate-50"}`}>
          <p className="text-xs leading-relaxed" style={{ color: isDark ? "#6b7280" : "#9ca3af" }}>
            {isRTL
              ? "💡 الخدمات مشتركة لجميع الإدارات من باقة الشركة. الممثل يستطيع طلب الخدمات فقط — لا يستطيع إدارة الحساب أو عرض بيانات الشركة. صاحب الحساب فقط يضيف الأقسام والممثلين."
              : "💡 Budget is shared across all departments from the company plan. Representatives can only request services — they cannot manage the account or view company data. Only the account owner can add departments and representatives."}
          </p>
        </div>
      </main>

      <AddDeptModal isOpen={addOpen} onClose={() => setAddOpen(false)} isRTL={isRTL} isDark={isDark} />
    </div>
    </SubscriptionGuard>
    </RoleGuard>
  );
}
