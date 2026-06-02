"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  BuildingOffice, CheckCircle, WarningCircle, Receipt, 
  DownloadSimple, CreditCard, ClockCounterClockwise, Crown, FileText, Brain
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ──────────────────────────────────────────────────────────
const WALLET_DATA = {
  plan: "باقة نظامي برو (الشركات)",
  planEn: "Nzamy Pro (Business)",
  totalFeatures: 50,
  usedFeatures: 35,
  resetDate: "2026-05-01",
  currency: "SAR",
};

const USAGE_HISTORY = [
  { id: "tx-1", action: "تحليل مخاطر عقد الموردين", type: "AI Analysis", tokens: "مكتمل", date: "2026-04-10 14:30", user: "أحمد المنسي" },
  { id: "tx-2", action: "صياغة لائحة عمل داخلية", type: "Legal Drafting", tokens: "مكتمل", date: "2026-04-09 10:15", user: "سارة محمد" },
  { id: "tx-3", action: "بحث في المبادئ القضائية", type: "Advanced Search", tokens: "مكتمل", date: "2026-04-08 16:45", user: "محمود خليل" },
  { id: "tx-4", action: "مراجعة سياسة الخصوصية", type: "Compliance", tokens: "مكتمل", date: "2026-04-07 09:20", user: "أحمد المنسي" },
];

const BILLING_HISTORY = [
  { id: "inv-101", desc: "تجديد اشتراك نظامي برو", amount: 1999, date: "2026-04-01", status: "paid" },
  { id: "inv-100", desc: "تجديد اشتراك نظامي برو", amount: 1999, date: "2026-03-01", status: "paid" },
];

import { RoleGuard } from "@/components/dashboard/RoleGuard";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

export default function BusinessWalletPage() {
  const { isRTL, isDark } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const usagePercent = (WALLET_DATA.usedFeatures / WALLET_DATA.totalFeatures) * 100;
  const isNearLimit = usagePercent > 85;

  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200";
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const heading = isDark ? "text-white" : "text-gray-900";

  return (
    <RoleGuard allowedRoles={["owner", "finance_manager"]}>
    <SubscriptionGuard featureKey="finance">
    <div className={`min-h-screen ${bg} font-sans`} dir={isRTL ? "rtl" : "ltr"}>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className={`text-2xl font-black mb-1 ${heading}`}>
                  {isRTL ? "باقتنا" : "Our Plan"}
                </h1>
                <p className={`text-sm ${muted}`}>
                  {isRTL ? "إدارة اشتراك الشركة والمزايا المتاحة للفريق" : "Manage company subscription and team features"}
                </p>
              </div>
              <button className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#C8A762] text-[#0B3D2E] text-sm font-bold rounded-xl hover:opacity-90 transition shadow-sm">
                {isRTL ? "ترقية الباقة" : "Upgrade Plan"}
              </button>
            </div>

            {/* Top Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Token Usage Card */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
                className={`lg:col-span-2 rounded-3xl border p-6 ${card} relative overflow-hidden`}
              >
                <div className={`absolute top-0 opacity-10 blur-xl w-64 h-64 rounded-full ${isRTL ? "-left-32" : "-right-32"} ${isNearLimit ? "bg-red-500" : "bg-[#0B3D2E]"}`} />
                
                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center">
                        <Crown size={24} className="text-[#0B3D2E] dark:text-[#C8A762]" weight="fill" />
                      </div>
                      <div>
                        <h3 className={`text-sm font-bold ${heading}`}>{isRTL ? WALLET_DATA.plan : WALLET_DATA.planEn}</h3>
                        <p className={`text-xs text-emerald-500 font-bold`}>{isRTL ? "نشط" : "Active"}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <p className={`text-4xl font-black ${isNearLimit ? "text-red-500" : heading}`}>
                          {WALLET_DATA.totalFeatures - WALLET_DATA.usedFeatures}
                        </p>
                        <p className={`text-xs mt-1 ${muted}`}>{isRTL ? "مراجعة متبقية" : "Reviews Remaining"}</p>
                      </div>
                      <div className="text-end">
                        <p className={`text-sm font-bold ${heading}`}>{WALLET_DATA.totalFeatures}</p>
                        <p className={`text-[10px] ${muted}`}>{isRTL ? "إجمالي الحد" : "Total Limit"}</p>
                      </div>
                    </div>
                    
                    <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: `${usagePercent}%` }} 
                        transition={{ duration: 1, delay: 0.2 }}
                        className={`h-full rounded-full ${isNearLimit ? "bg-red-500" : "bg-[#0B3D2E] dark:bg-[#C8A762]"}`} 
                      />
                    </div>
                  </div>
                  
                  <div className={`mt-6 pt-4 border-t flex items-center justify-between text-xs ${isDark ? "border-gray-800" : "border-gray-100"}`}>
                    <span className={`flex items-center gap-1.5 ${isNearLimit ? "text-red-500 font-bold" : muted}`}>
                      {isNearLimit && <WarningCircle size={14} />}
                      {isRTL ? `لقد تم استهلاك ${Math.round(usagePercent)}% من الحد المسموح` : `You used ${Math.round(usagePercent)}% of your limit`}
                    </span>
                    <span className={muted}>
                      {isRTL ? "تتجدد في: " : "Resets on: "} {WALLET_DATA.resetDate}
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Status Card */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className={`rounded-3xl border p-6 flex flex-col items-center justify-center text-center ${card}`}
              >
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 text-emerald-500">
                  <CheckCircle size={32} weight="fill" />
                </div>
                <h3 className={`text-sm font-bold mb-1 ${muted}`}>{isRTL ? "حالة الاشتراك" : "Subscription Status"}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className={`text-xl font-black ${heading}`}>{isRTL ? "جارية وصالحة" : "Active & Valid"}</span>
                </div>
                <button className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                  isDark ? "border-gray-700 hover:bg-gray-800 text-white" : "border-gray-200 hover:bg-gray-50 text-gray-900"
                }`}>
                  {isRTL ? "إدارة البطاقات" : "Manage Cards"}
                </button>
              </motion.div>
            </div>

            {/* Bottom Section: Splits into Analytics & History */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Token Consumption Log */}
              <div className={`col-span-1 lg:col-span-2 rounded-3xl border ${card} flex flex-col`}>
                <div className={`p-5 flex items-center justify-between border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}>
                  <h3 className={`font-bold flex items-center gap-2 ${heading}`}>
                    <ClockCounterClockwise size={18} className="text-[#0B3D2E] dark:text-[#C8A762]" />
                    {isRTL ? "سجل النشاط والفريق" : "Team Activity Log"}
                  </h3>
                  <button className={`text-xs font-bold transition flex items-center gap-1 ${isDark ? "text-[#C8A762] hover:text-[#e0c488]" : "text-[#0B3D2E] hover:text-[#0a3328]"}`}>
                    {isRTL ? "عرض الكل" : "View All"}
                  </button>
                </div>
                
                <div className="p-2 flex-1 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className={`text-xs uppercase bg-transparent ${muted} ${isRTL ? "text-right" : "text-left"}`}>
                      <tr>
                        <th className="px-4 py-3 font-medium">{isRTL ? "العملية" : "Action"}</th>
                        <th className="px-4 py-3 font-medium">{isRTL ? "المستخدم" : "User"}</th>
                        <th className="px-4 py-3 font-medium">{isRTL ? "التاريخ" : "Date"}</th>
                        <th className="px-4 py-3 font-medium text-end">{isRTL ? "الحالة" : "Status"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {USAGE_HISTORY.map((item, idx) => (
                        <tr key={item.id} className={`border-b last:border-0 transition-colors ${isDark ? "border-gray-800 hover:bg-[#0c0f12]/50" : "border-gray-50 hover:bg-gray-50"}`}>
                          <td className="px-4 py-3" dir={isRTL ? "rtl" : "ltr"}>
                            <p className={`font-bold text-xs ${heading}`}>{item.action}</p>
                            <p className={`text-[10px] ${muted}`}>{item.type}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                              <BuildingOffice size={12} />
                              {item.user}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-xs ${muted}`}>{item.date}</td>
                          <td className={`px-4 py-3 text-xs font-bold text-end text-emerald-500`}>
                            {item.tokens}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Billing & Invoices */}
              <div className={`col-span-1 rounded-3xl border flex flex-col ${card}`}>
                <div className={`p-5 flex items-center gap-2 border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}>
                  <Receipt size={18} className="text-[#0B3D2E] dark:text-[#C8A762]" />
                  <h3 className={`font-bold ${heading}`}>{isRTL ? "فواتير الاشتراكات" : "Subscriptions Invoices"}</h3>
                </div>
                
                <div className="p-5 space-y-4">
                  {BILLING_HISTORY.map((inv) => (
                    <div key={inv.id} className={`flex items-start justify-between p-3 rounded-2xl border ${isDark ? "bg-[#0c0f12] border-gray-800" : "bg-gray-50 border-gray-100"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-600"}`}>
                          <CheckCircle size={14} weight="bold" />
                        </div>
                        <div>
                          <p className={`text-xs font-bold leading-tight ${heading}`}>{inv.desc}</p>
                          <p className={`text-[10px] ${muted} mt-0.5`}>{inv.date} • {inv.id}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs font-black ${heading}`}>{inv.amount} {isRTL ? "ر.س" : "SAR"}</span>
                        <button className={`hover:opacity-70 transition ${muted}`}>
                          <DownloadSimple size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <button className={`w-full mt-2 py-2 flex items-center justify-center gap-1 text-xs font-bold rounded-lg transition ${isDark ? "bg-white/5 hover:bg-white/10 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-900"}`}>
                    <CreditCard size={14} />
                    {isRTL ? "إدارة طرق الدفع" : "Manage Payment Methods"}
                  </button>
                </div>
              </div>

            </div>

          </div>
        </main>
    </div>
    </SubscriptionGuard>
    </RoleGuard>
  );
}
