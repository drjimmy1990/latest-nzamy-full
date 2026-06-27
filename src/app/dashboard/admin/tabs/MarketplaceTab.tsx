"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Storefront, Check, X, Eye, MagnifyingGlass, Money, Warning, User, Buildings, Scales } from "@phosphor-icons/react";

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";
const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  pending:   { cls: "bg-amber-500/15 border-amber-500/30 text-amber-400",   label: "انتظار" },
  active:    { cls: "bg-blue-500/15 border-blue-500/30 text-blue-400",      label: "جارٍ" },
  completed: { cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label: "مكتمل" },
  dispute:   { cls: "bg-red-500/15 border-red-500/30 text-red-400",         label: "نزاع" },
  disputed:  { cls: "bg-red-500/15 border-red-500/30 text-red-400",         label: "نزاع" },
};

const ROLE_ICON: Record<string, React.ElementType> = {
  "فرد": User,
  "شركة": Buildings,
  "محامي": Scales,
  "شركة محاماة": Buildings,
  "منشأة": Buildings,
  individual: User,
  lawyer: Scales,
  firm: Buildings,
  company: Buildings,
};

const TYPE_LABELS: Record<string, string> = {
  individual: "فرد",
  lawyer: "محامي",
  firm: "شركة محاماة",
  company: "شركة",
};

export default function MarketplaceTab() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/marketplace");
      if (!res.ok) throw new Error("Failed to fetch marketplace data");
      const data = await res.json();
      setRequests(data.requests || []);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء جلب طلبات السوق");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = requests.filter((r) => {
    const matchesFilter = filter === "all" || r.status === filter || (filter === "dispute" && r.status === "disputed");
    const matchesSearch =
      r.client.includes(search) ||
      r.service.includes(search) ||
      r.id.includes(search) ||
      (r.provider && r.provider.includes(search));
    return matchesFilter && matchesSearch;
  });

  const totalCommission = requests
    .filter((r) => r.status === "completed" || r.status === "active")
    .reduce((s, r) => s + Number(r.commission || 0), 0);
  const pending = requests.filter((r) => r.status === "pending").length;
  const disputes = requests.filter((r) => r.status === "dispute" || r.status === "disputed").length;

  return (
    <motion.div key="mkt" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "عمولات الشهر", val: `${totalCommission.toLocaleString("ar-SA")} ر.س`, c: "text-emerald-400", icon: Money },
          { label: "طلبات معلّقة", val: pending, c: "text-amber-400", icon: Warning },
          { label: "إجمالي الطلبات", val: requests.length, c: "text-blue-400", icon: Storefront },
          { label: "نزاعات مفتوحة", val: disputes, c: "text-red-400", icon: Warning },
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

      {/* Filters */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <MagnifyingGlass size={13} className="text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب، العميل، الخدمة..."
            className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"
          />
        </div>
        {[
          ["all", "الكل"],
          ["pending", "انتظار"],
          ["active", "جارٍ"],
          ["completed", "مكتمل"],
          ["dispute", "نزاع"],
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
              {["الطلب", "العميل", "الخدمة", "المزود", "القيمة", "العمولة", "الحالة", "تاريخ", "إجراءات"].map((h) => (
                <th key={h} className="px-3 py-3 text-[10px] font-bold text-zinc-600 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const sc = STATUS_CFG[r.status] || {
                cls: "bg-zinc-500/15 border-zinc-500/30 text-zinc-400",
                label: r.status || "نشط",
              };
              const Icon = ROLE_ICON[r.clientType] || User;
              return (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-3 py-3">
                    <p className="text-[10px] font-mono text-zinc-500">{r.id}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-zinc-500" />
                      <div>
                        <p className="text-[11px] text-zinc-200">{r.client}</p>
                        <p className="text-[9px] text-zinc-600">{TYPE_LABELS[r.clientType] || r.clientType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[11px] text-zinc-300 max-w-[160px] truncate">{r.service}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[11px] text-zinc-400">{r.provider || "—"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[12px] font-bold text-white">
                      {r.amount !== null && r.amount !== undefined ? (
                        <>
                          {r.amount.toLocaleString("ar-SA")} <span className="text-[9px] text-zinc-600">ر.س</span>
                        </>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[12px] font-bold text-emerald-400">
                      {r.commission !== null && r.commission !== undefined ? (
                        <>
                          {r.commission.toLocaleString("ar-SA")} <span className="text-[9px] text-zinc-600">ر.س</span>
                        </>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[10px] text-zinc-600">{r.date}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {r.status === "pending" && (
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
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="py-12 text-center text-zinc-500">جاري التحميل...</div>}
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-zinc-600">لا توجد نتائج</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

