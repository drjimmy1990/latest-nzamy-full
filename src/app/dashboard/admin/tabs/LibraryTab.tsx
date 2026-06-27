"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { BookOpen, Plus, Check, X, MagnifyingGlass, Funnel, Eye, PencilSimple, Trash, ArrowUpRight } from "@phosphor-icons/react";

const CATS = ["الكل", "أنظمة عمل", "أنظمة تجارية", "أنظمة جنائية", "مبادئ قضائية", "تشريعات دولية"];
const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  published: { cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label: "منشور" },
  active:    { cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label: "منشور" },
  draft:     { cls: "bg-zinc-500/15 border-zinc-500/30 text-zinc-400",          label: "مسودة" },
  review:    { cls: "bg-amber-500/15 border-amber-500/30 text-amber-400",       label: "مراجعة" },
};
const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";

function getCategoryType(category: string): "law" | "decree" | "principle" | "feqh" {
  if (category === "تعاميم ومراسم") return "decree";
  if (category === "مبادئ قضائية") return "principle";
  if (category === "فقه وشريعة") return "feqh";
  return "law";
}

export default function LibraryTab() {
  const [cat, setCat] = useState("الكل");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.set("search", search);
      if (cat !== "الكل") queryParams.set("category", cat);

      const res = await fetch(`/api/v1/admin/library?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch library entries");
      const data = await res.json();
      setEntries(data.entries || []);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء جلب السجلات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, cat]);

  const handleDelete = async (id: string, category: string) => {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا السجل؟")) return;
    try {
      const res = await fetch("/api/v1/admin/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: getCategoryType(category) }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`خطأ: ${err.error || "فشل في الحذف"}`);
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("حدث خطأ أثناء محاولة الحذف");
    }
  };

  const stats = [
    { label: "إجمالي السجلات", val: entries.length, c: "text-blue-400" },
    { label: "منشور", val: entries.filter((e) => e.status === "published" || e.status === "active").length, c: "text-emerald-400" },
    { label: "تنتظر مراجعة", val: entries.filter((e) => e.status === "review").length, c: "text-amber-400" },
    { label: "مسودة", val: entries.filter((e) => e.status === "draft").length, c: "text-zinc-400" },
  ];

  return (
    <motion.div key="lib" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <BookOpen size={18} className={s.c} weight="duotone" />
            <div>
              <p className="text-[10px] text-zinc-500">{s.label}</p>
              <p className={`text-[20px] font-black ${s.c}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Add */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <MagnifyingGlass size={13} className="text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في المكتبة..."
            className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                cat === c ? "bg-[#C8A762] text-black" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <button className="mr-auto flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2 text-[12px] font-bold text-black hover:bg-amber-400 transition-colors">
          <Plus size={14} /> إضافة سجل جديد
        </button>
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-right">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["السجل", "التصنيف", "المصدر", "الحالة", "المشاهدات", "التاريخ", "إجراءات"].map((h) => (
                <th key={h} className="px-4 py-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const sc = STATUS_CFG[e.status] || {
                cls: "bg-zinc-500/15 border-zinc-500/30 text-zinc-400",
                label: e.status || "نشط",
              };
              return (
                <motion.tr
                  key={e.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-[12px] font-bold text-zinc-200">{e.title}</p>
                      <p className="text-[9px] text-zinc-600">{e.id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-zinc-500">{e.source}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-bold text-zinc-300">
                      {typeof e.views === "number" ? e.views.toLocaleString("ar-SA") : e.views}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] text-zinc-600">{e.date}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {e.status === "review" && (
                        <>
                          <button className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                            <Check size={12} />
                          </button>
                          <button className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors">
                            <X size={12} />
                          </button>
                        </>
                      )}
                      <button className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
                        <Eye size={12} />
                      </button>
                      <button className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
                        <PencilSimple size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id, e.category)}
                        className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors"
                        title="حذف"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="py-12 text-center text-zinc-500">جاري التحميل...</div>}
        {!loading && entries.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-zinc-600">لا توجد نتائج</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
