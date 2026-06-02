"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, CrownSimple, Warning } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { BackendReadyNotice, LocalActionStatus, SectionTitle, ToggleRow } from "./_shared";

// ── Plan data per user type ────────────────────────────────────────────
interface PlanData {
  name: string;
  price: string;
  cycle: string;
  renewal: string;
  color: string;
  usage: { label: string; used: number; total: number; unit: string }[];
}

function getPlanData(userType: string | null): PlanData {
  switch (userType) {
    case "individual":
      return {
        name: "عميل نشط", price: "مجاني", cycle: "", renewal: "—",
        color: "from-zinc-700 to-zinc-900",
        usage: [
          { label: "استشارات مجانية", used: 2, total: 3, unit: "استشارة" },
          { label: "متابعة القضايا",  used: 1, total: 2, unit: "قضية" },
        ],
      };
    case "lawyer":
      return {
        name: "محفظة نقاط المحامي", price: "حسب شراء النقاط", cycle: "",
        renewal: "١٥ يونيو ٢٠٢٦", color: "from-[#0B3D2E] to-emerald-600",
        usage: [
          { label: "رصيد النقاط",      used: 740, total: 1000, unit: "نقطة" },
          { label: "خدمات AI متقدمة",  used: 8,   total: 15,   unit: "طلب" },
          { label: "تحليل مستندات",    used: 3,   total: 6,    unit: "ملف" },
        ],
      };
    case "firm":
      return {
        name: "Growth Firm", price: "٣٦,٠٠٠ ر.س", cycle: "سنوياً",
        renewal: "١ يوليو ٢٠٢٦", color: "from-[#0B3D2E] to-emerald-700",
        usage: [
          { label: "المقاعد",         used: 7,  total: 10, unit: "مقعد"  },
          { label: "نقاط الشركة",      used: 6200, total: 10000, unit: "نقطة" },
          { label: "القضايا النشطة",   used: 34, total: 100, unit: "قضية" },
        ],
      };
    case "corporate":
      return {
        name: "Corporate Legal", price: "بموجب عقد", cycle: "سنوياً",
        renewal: "١ أغسطس ٢٠٢٦", color: "from-slate-700 to-slate-900",
        usage: [
          { label: "المستخدمون النشطون", used: 12, total: 25,  unit: "مستخدم" },
          { label: "الأقسام",           used: 4,  total: 10,  unit: "قسم"    },
          { label: "العقود الشهرية",     used: 8,  total: 20,  unit: "عقد"    },
          { label: "تخزين المستندات",   used: 15, total: 100, unit: "جيجا"   },
        ],
      };
    case "micro":
      return {
        name: "درع المنشأة", price: "١,٩٩٩ ر.س", cycle: "سنوياً",
        renewal: "٢٠ يونيو ٢٠٢٦", color: "from-amber-700 to-amber-900",
        usage: [
          { label: "العقود",          used: 2, total: 5,  unit: "عقد"      },
          { label: "الاستشارات",      used: 1, total: 3,  unit: "استشارة"  },
        ],
      };
    case "government":
      return {
        name: "Enterprise حكومي", price: "بموجب عقد", cycle: "سنوياً",
        renewal: "١٤٤٩/٠١/٠١", color: "from-slate-800 to-slate-950",
        usage: [
          { label: "المستخدمون",     used: 28, total: 50, unit: "مستخدم" },
          { label: "القضايا النشطة", used: 67, total: 200, unit: "قضية"  },
        ],
      };
    case "ngo":
      return {
        name: "Impact", price: "٢,٩٩٩ ر.س", cycle: "سنوياً",
        renewal: "١٠ يوليو ٢٠٢٦", color: "from-teal-700 to-teal-900",
        usage: [
          { label: "الأعضاء",       used: 5,  total: 10, unit: "عضو"   },
          { label: "الاستشارات",    used: 3,  total: 8,  unit: "استشارة" },
        ],
      };
    case "provider":
      return {
        name: "مزود خدمة", price: "حسب الخطة", cycle: "",
        renewal: "٢٥ يونيو ٢٠٢٦", color: "from-violet-800 to-violet-950",
        usage: [
          { label: "الطلبات المنجزة", used: 14, total: 30, unit: "طلب"   },
          { label: "التقييمات",       used: 14, total: 30, unit: "تقييم" },
        ],
      };
    default:
      return {
        name: "باقة نشطة", price: "—", cycle: "", renewal: "—",
        color: "from-zinc-700 to-zinc-900", usage: [],
      };
  }
}

// ── Component ─────────────────────────────────────────────────────────
export function SubscriptionTab() {
  const { userType } = useUser();
  const plan = getPlanData(userType);
  const [autoRenew, setAutoRenew] = useState(true);
  const [localAction, setLocalAction] = useState<string | null>(null);

  const invoices = [
    { date: "١ مايو ٢٠٢٦",    amount: plan.price === "مجاني" ? "٠ ر.س" : plan.price, status: "مدفوع" },
    { date: "١ أبريل ٢٠٢٦",   amount: plan.price === "مجاني" ? "٠ ر.س" : plan.price, status: "مدفوع" },
    { date: "١ مارس ٢٠٢٦",    amount: plan.price === "مجاني" ? "٠ ر.س" : plan.price, status: "مدفوع" },
  ];

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      {/* Plan card */}
      <div className={`bg-gradient-to-br ${plan.color} rounded-2xl p-6 text-white relative overflow-hidden`}>
        <div className="absolute -end-8 -top-8 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -start-4 -bottom-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <CrownSimple size={18} weight="fill" className="text-[#C8A762]" />
            <p className="text-xs font-semibold text-white/60 uppercase tracking-widest">خطتك الحالية</p>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-0.5">{plan.name}</h2>
          <p className="text-white/70 text-sm">
            {plan.price}{plan.cycle ? ` / ${plan.cycle}` : ""} · يتجدد {plan.renewal}
          </p>
          <div className="flex gap-3 mt-5 flex-wrap">
            <button
              onClick={() => setLocalAction("ترقية الخطة جاهزة للربط بالباك إند/Billing API لاحقاً.")}
              className="px-5 py-2 bg-white text-zinc-900 rounded-xl text-sm font-bold hover:bg-white/90 transition-colors shadow"
            >
              ترقية الخطة
            </button>
            <button
              onClick={() => setLocalAction("إدارة الباقة محلية فقط الآن؛ لا يوجد تغيير فعلي في الاشتراك أو النقاط.")}
              className="px-5 py-2 bg-white/15 text-white rounded-xl text-sm font-semibold hover:bg-white/20 transition-colors border border-white/10"
            >
              إدارة الباقة
            </button>
          </div>
        </div>
      </div>
      <LocalActionStatus show={Boolean(localAction)} message={localAction ?? undefined} />

      {/* Auto-renewal */}
      <div>
        <SectionTitle>إعدادات التجديد</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] px-6 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
          <ToggleRow
            label="التجديد التلقائي"
            description={
              autoRenew
                ? `سيتجدد تلقائياً في ${plan.renewal} بمبلغ ${plan.price}`
                : "لن يتجدد الاشتراك — ستفقد الوصول بعد تاريخ الانتهاء"
            }
            checked={autoRenew}
            onChange={() => {
              setAutoRenew(!autoRenew);
              setLocalAction("تغيير التجديد التلقائي محلي فقط؛ الفوترة الحقيقية تنتظر Billing API.");
            }}
          />
        </div>
        {!autoRenew && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800"
          >
            <Warning size={16} weight="fill" className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ستنتهي صلاحية حسابك في {plan.renewal} — يمكنك إعادة التفعيل في أي وقت
            </p>
          </motion.div>
        )}
      </div>

      {/* Usage meters */}
      {plan.usage.length > 0 && (
        <div>
          <SectionTitle>استخدامك هذا الشهر</SectionTitle>
          <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-6 space-y-5 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
            {plan.usage.map((item) => {
              const pct = Math.round((item.used / item.total) * 100);
              const bar = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-royal";
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.label}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                      {item.used} / {item.total} {item.unit}
                    </p>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      className={`h-full rounded-full ${bar}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Billing history */}
      <div>
        <SectionTitle>آخر الفواتير</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04] shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
          {invoices.map((bill) => (
            <div key={bill.date} className="flex items-center justify-between px-5 py-3.5">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{bill.date}</p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{bill.amount}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-medium">
                  {bill.status}
                </span>
                <button
                  onClick={() => setLocalAction("تحميل الفاتورة يعرض حالة واجهة فقط؛ ملف PDF الحقيقي ينتظر Billing API.")}
                  className="w-7 h-7 rounded-lg border border-gray-200 dark:border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:border-gray-300 transition-colors"
                >
                  <Download size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
