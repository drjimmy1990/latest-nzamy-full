"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Buildings, ToggleRight, ToggleLeft, MagnifyingGlass, CheckCircle, Warning } from "@phosphor-icons/react";

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";

interface CompanyFeatures {
  hasSecondment: boolean;
  hasLitigation: boolean;
  hasMarketplace: boolean;
  hasGovernance: boolean;
}

interface Company {
  id: string;
  name: string;
  plan: string;
  mrr: number;
  features: CompanyFeatures;
}

export default function CorporateTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/admin/corporates");
      if (!res.ok) {
        throw new Error("Failed to fetch companies");
      }
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء تحميل بيانات الشركات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const toggleFeature = async (companyId: string, feature: keyof CompanyFeatures) => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    const currentVal = company.features[feature];
    const newFeatures = {
      [feature]: !currentVal
    };

    // Optimistically update local state
    setCompanies(prev =>
      prev.map(c =>
        c.id === companyId
          ? {
              ...c,
              features: {
                ...c.features,
                ...newFeatures
              }
            }
          : c
      )
    );

    try {
      const res = await fetch("/api/v1/admin/corporates", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: companyId,
          features: newFeatures
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update features");
      }
    } catch (err) {
      console.error(err);
      // Revert on error
      setCompanies(prev =>
        prev.map(c =>
          c.id === companyId
            ? {
                ...c,
                features: {
                  ...c.features,
                  [feature]: currentVal
                }
              }
            : c
        )
      );
    }
  };

  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <motion.div key="corp" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "الشركات التجارية", val: companies.length, c: "text-blue-400" },
          { label: "إجمالي الإيراد", val: `${companies.reduce((a,b)=>a+b.mrr,0)} ر.س`, c: "text-emerald-400" },
        ].map((s,i)=>(
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <div className={`h-10 w-10 flex items-center justify-center rounded-xl bg-white/[0.04] ${s.c}`}>
              <Buildings size={20} weight="duotone" />
            </div>
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
          <MagnifyingGlass size={13} className="text-zinc-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم أو المعرف..." className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"/>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4">
        {loading && <div className="py-12 text-center text-zinc-500">جاري التحميل...</div>}
        {error && <div className="py-12 text-center text-red-400">{error}</div>}
        {!loading && !error && filtered.map((c, i) => {
          const compFeatures = c.features;
          if (!compFeatures) return null;
          
          return (
            <motion.div key={c.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
              className={`${card} p-5`}>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#C8A762]/10 border border-[#C8A762]/20">
                    <Buildings size={20} className="text-[#C8A762]" weight="duotone" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-black text-white">{c.name}</p>
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">{c.plan}</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">{c.id} • {c.mrr} ر.س/شهر</p>
                  </div>
                </div>
              </div>
              
              <div>
                <p className="text-[12px] font-bold text-zinc-300 mb-3">الصلاحيات والخصائص المتاحة (Feature Flags)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { key: "hasSecondment", label: "نظام الانتداب والمحامين الخارجين", icon: compFeatures.hasSecondment ? CheckCircle : Warning, active: compFeatures.hasSecondment },
                    { key: "hasLitigation", label: "نظام الترافع والقضايا", icon: compFeatures.hasLitigation ? CheckCircle : Warning, active: compFeatures.hasLitigation },
                    { key: "hasMarketplace", label: "الوصول لسوق المهنيين", icon: compFeatures.hasMarketplace ? CheckCircle : Warning, active: compFeatures.hasMarketplace },
                    { key: "hasGovernance", label: "الحوكمة والامتثال 360", icon: compFeatures.hasGovernance ? CheckCircle : Warning, active: compFeatures.hasGovernance },
                  ].map((flag) => (
                    <div key={flag.key} className="flex items-center justify-between p-3 rounded-xl border border-white/[0.05] bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <flag.icon size={16} weight="fill" className={flag.active ? "text-emerald-400" : "text-zinc-600"} />
                        <span className="text-[12px] text-zinc-300">{flag.label}</span>
                      </div>
                      <button onClick={() => toggleFeature(c.id, flag.key as keyof CompanyFeatures)} className="transition-all">
                        {flag.active ? (
                          <ToggleRight size={28} className="text-emerald-400" weight="fill" />
                        ) : (
                          <ToggleLeft size={28} className="text-zinc-600" weight="regular" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
        {!loading && !error && filtered.length === 0 && (
          <div className="py-12 text-center text-zinc-500">لا توجد شركات مطابقة للبحث</div>
        )}
      </div>
    </motion.div>
  );
}
