"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { ChatTeardrop, Check, X, MagnifyingGlass, Flag, UsersThree } from "@phosphor-icons/react";

const TYPE_LABELS: Record<string, string> = {
  lawyer: "محامي",
  firm: "شركة محاماة",
  notary: "مكتب توثيق",
  arbitrator: "محكم",
  bailiff: "منفذ أحكام",
};

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";
const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  pending:  { cls: "bg-amber-500/15 border-amber-500/30 text-amber-400",       label: "قيد الانتظار" },
  verified: { cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label: "مقبول" },
  rejected: { cls: "bg-red-500/15 border-red-500/30 text-red-400",             label: "مرفوض" },
};

export default function CommunityTab() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.set("search", search);
      if (filter !== "all") queryParams.set("status", filter);

      const res = await fetch(`/api/v1/admin/verifications?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch verifications");
      const data = await res.json();
      setVerifications(data.verifications || []);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء جلب طلبات التحقق");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, filter]);

  const handleAction = async (userId: string, action: "approve" | "reject") => {
    const actionLabel = action === "approve" ? "قبول" : "رفض";
    if (!confirm(`هل أنت متأكد من ${actionLabel} هذا الطلب؟`)) return;
    try {
      const res = await fetch(`/api/v1/admin/verifications/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`خطأ: ${err.error || "فشل الإجراء"}`);
      }
    } catch (err) {
      console.error("Action error:", err);
      alert("حدث خطأ أثناء تنفيذ الإجراء");
    }
  };

  const stats = [
    { label: "إجمالي طلبات التحقق", val: verifications.length, c: "text-blue-400" },
    { label: "قيد الانتظار", val: verifications.filter((v) => v.status === "pending").length, c: "text-amber-400" },
    { label: "مقبولة", val: verifications.filter((v) => v.status === "verified").length, c: "text-emerald-400" },
    { label: "مرفوضة", val: verifications.filter((v) => v.status === "rejected").length, c: "text-red-400" },
  ];

  return (
    <motion.div key="comm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <ChatTeardrop size={18} className={s.c} weight="duotone" />
            <div>
              <p className="text-[10px] text-zinc-500">{s.label}</p>
              <p className={`text-[20px] font-black ${s.c}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <MagnifyingGlass size={13} className="text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو المعرف..."
            className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"
          />
        </div>
        {[
          ["all", "الكل"],
          ["pending", "قيد الانتظار"],
          ["verified", "مقبول"],
          ["rejected", "مرفوض"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              filter === v ? "bg-[#C8A762] text-black" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-right">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {[
                "معرف التحقق",
                "الاسم",
                "نوع المستخدم",
                "الترخيص",
                "تقييم الذكاء الاصطناعي",
                "التاريخ",
                "المستندات",
                "الحالة",
                "إجراءات",
              ].map((h) => (
                <th key={h} className="px-4 py-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {verifications.map((e, i) => {
              const sc = STATUS_CFG[e.status] || {
                cls: "bg-zinc-500/15 border-zinc-500/30 text-zinc-400",
                label: e.status || "غير معروف",
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
                      <p className="text-[12px] font-bold text-zinc-200">{e.id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-[11px] text-zinc-300">{e.name}</p>
                      {e.email && <p className="text-[9px] text-zinc-600">{e.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[e.type] || e.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-zinc-500">{e.license_number || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-bold text-zinc-300">{e.aiScore}%</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] text-zinc-600">{e.date}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {e.docs && Array.isArray(e.docs) ? (
                        e.docs.map((doc: string, idx: number) => (
                          <span key={idx} className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                            {doc}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-zinc-600">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {e.status === "pending" && (
                        <>
                          <button
                            title="اعتماد"
                            onClick={() => handleAction(e.user_id, "approve")}
                            className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            title="رفض"
                            onClick={() => handleAction(e.user_id, "reject")}
                            className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="py-12 text-center text-zinc-500">جاري التحميل...</div>}
        {!loading && verifications.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-zinc-600">لا توجد سجلات تحقق</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

