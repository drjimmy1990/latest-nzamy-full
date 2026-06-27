"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { UsersThree, Briefcase, ChartBar, Eye, MagnifyingGlass, Buildings, Scales, Star } from "@phosphor-icons/react";

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";
const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  excellent: { cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label: "ممتاز" },
  good:      { cls: "bg-blue-500/15 border-blue-500/30 text-blue-400",          label: "جيد" },
  average:   { cls: "bg-amber-500/15 border-amber-500/30 text-amber-400",       label: "متوسط" },
  warning:   { cls: "bg-red-500/15 border-red-500/30 text-red-400",             label: "تحذير" },
};

export default function ERPTab() {
  const [search, setSearch] = useState("");
  const [firms, setFirms] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ totalMRR: 0, totalLawyers: 0, totalCases: 0, totalFirms: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/erp");
      if (!res.ok) throw new Error("Failed to fetch ERP data");
      const data = await res.json();
      setFirms(data.firms || []);
      setSummary(data.summary || { totalMRR: 0, totalLawyers: 0, totalCases: 0, totalFirms: 0 });
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء جلب سجلات الـ ERP");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = firms.filter((f) => f.name.includes(search) || f.city.includes(search));

  return (
    <motion.div key="erp" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "مكاتب المحاماة", val: summary.totalFirms, c: "text-blue-400", icon: Buildings },
          { label: "إجمالي المحامين", val: summary.totalLawyers, c: "text-purple-400", icon: Scales },
          { label: "القضايا النشطة", val: summary.totalCases, c: "text-emerald-400", icon: Briefcase },
          { label: "إيراد المكاتب", val: `${summary.totalMRR.toLocaleString("ar-SA")} ر.س`, c: "text-[#C8A762]", icon: ChartBar },
        ].map((s, i) => (
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <s.icon size={18} className={s.c} weight="duotone" />
            <div>
              <p className="text-[10px] text-zinc-500">{s.label}</p>
              <p className={`text-[18px] font-black ${s.c}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 max-w-sm">
          <MagnifyingGlass size={13} className="text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو المدينة..."
            className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"
          />
        </div>
      </div>

      {/* Firms Grid */}
      <div className="grid grid-cols-1 gap-3">
        {filtered.map((f, i) => {
          const sc = STATUS_CFG[f.status] || {
            cls: "bg-zinc-500/15 border-zinc-500/30 text-zinc-400",
            label: f.status || "نشط",
          };
          const ratio = f.lawyers > 0 ? Math.round(f.activeCases / f.lawyers) : f.activeCases;
          const ratioPct = f.lawyers > 0 ? Math.min((f.activeCases / f.lawyers / 15) * 100, 100) : 0;
          return (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`${card} p-5 hover:border-white/[0.12] transition-all`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Info */}
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
                    <Buildings size={22} className="text-[#C8A762]" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[14px] font-black text-white">{f.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      <span>{f.city}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Star size={11} weight="fill" className="text-amber-400" />
                        {f.rating}
                      </span>
                      <span>•</span>
                      <span
                        className={`font-bold ${
                          f.plan === "Enterprise" || f.plan === "المؤسسات"
                            ? "text-amber-400"
                            : f.plan === "Pro" || f.plan === "المحترف"
                            ? "text-emerald-400"
                            : "text-blue-400"
                        }`}
                      >
                        {f.plan}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-[18px] font-black text-purple-400">{f.lawyers}</p>
                    <p className="text-[9px] text-zinc-600">محامي</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[18px] font-black text-emerald-400">{f.activeCases}</p>
                    <p className="text-[9px] text-zinc-600">قضية</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[18px] font-black text-[#C8A762]">{f.mrr.toLocaleString("ar-SA")}</p>
                    <p className="text-[9px] text-zinc-600">ر.س/شهر</p>
                  </div>
                  <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-4 py-2 text-[11px] font-bold text-zinc-400 hover:text-white hover:border-white/[0.15] transition-all">
                    <Eye size={13} /> عرض ERP
                  </button>
                </div>
              </div>

              {/* Progress bar: cases load */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-zinc-600">نسبة الحمل التشغيلي</span>
                  <span className="text-[10px] text-zinc-500">
                    {ratio} قضية/محامي
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/[0.05]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${ratioPct}%` }}
                    transition={{ delay: i * 0.08, duration: 0.7 }}
                    className={`h-full rounded-full ${ratio > 10 ? "bg-red-500" : ratio > 7 ? "bg-amber-500" : "bg-emerald-500"}`}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      {loading && <div className="py-12 text-center text-zinc-500">جاري التحميل...</div>}
      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-zinc-600">لا توجد نتائج</p>
        </div>
      )}
    </motion.div>
  );
}

