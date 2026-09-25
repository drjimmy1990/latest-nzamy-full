"use client";
import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { BookOpen, Plus, Check, X, MagnifyingGlass, Funnel, Eye, PencilSimple, Trash, ArrowUpRight, Lock, LockOpen } from "@phosphor-icons/react";

// Must match the CATEGORY_MAP keys in src/app/api/v1/admin/library/route.ts.
const CATS = [
  "الكل",
  "الأنظمة الإجرائية",
  "أنظمة تجارية",
  "أنظمة جنائية",
  "الأنظمة المدنية",
  "أنظمة العمل",
  "مبادئ قضائية",
  "تعاميم ومراسم",
  "فقه وشريعة",
];
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

const PAGE_SIZE = 50;

export default function LibraryTab() {
  const [cat, setCat] = useState("الكل");
  // `searchInput` is what the box shows; `search` is what is fetched, set
  // 350ms after the last keystroke. A principles substring search scans every
  // text (~2s on self-hosted), so fetching per keystroke would stack them.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [freeItems, setFreeItems] = useState<Record<string, string[]>>({
    laws: [],
    decrees: [],
    principles: [],
    feqh: [],
  });
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const typeToKey: Record<string, string> = {
    law: "laws",
    decree: "decrees",
    principle: "principles",
    feqh: "feqh",
  };

  const isItemFree = (id: string, category: string): boolean => {
    const type = getCategoryType(category);
    const key = typeToKey[type];
    return (freeItems[key] || []).includes(String(id));
  };

  // Only the newest request may write state: a slow earlier search (a
  // principles scan takes ~2s) must not overwrite a newer page or query.
  const requestSeq = useRef(0);

  const fetchData = async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.set("search", search);
      if (cat !== "الكل") queryParams.set("category", cat);
      queryParams.set("page", String(page));
      queryParams.set("limit", String(PAGE_SIZE));

      const res = await fetch(`/api/v1/admin/library?${queryParams.toString()}`);
      // The API's own `error` is Arabic; anything else (an HTML error page, a
      // network failure) gets the Arabic fallback below, never a raw English
      // message.
      const data = await res.json().catch(() => null);
      if (seq !== requestSeq.current) return;
      if (!res.ok || !data) {
        throw new Error(
          data && typeof data.error === "string" && data.error ? data.error : "تعذّر جلب سجلات المكتبة. أعد المحاولة.",
        );
      }
      // {data, total, pages} — LIB-15: `total` is the real count:"exact" sum,
      // not this page's length, so "إجمالي السجلات" below stays honest once a
      // table has more than one page of rows. `pages` (not
      // ceil(total/PAGE_SIZE)) is what Prev/Next below page against: in
      // "الكل" mode the four tables are windowed independently by the same
      // page, so how far Next can go is bounded by the LARGEST table, not by
      // the sum of all four (see query-params.ts:computeTotalPages).
      setEntries(data.data || []);
      setTotal(typeof data.total === "number" ? data.total : (data.data || []).length);
      setTotalPages(typeof data.pages === "number" && data.pages > 0 ? data.pages : 1);
      setFreeItems(data.freeItems || { laws: [], decrees: [], principles: [], feqh: [] });
      setError(null);
    } catch (err: any) {
      if (seq !== requestSeq.current) return;
      console.error(err);
      // Clear the previous page's rows: showing them under the new page
      // number would present stale data as the answer.
      setEntries([]);
      setError(err instanceof Error && /[\u0600-\u06FF]/.test(err.message) ? err.message : "تعذّر جلب سجلات المكتبة. أعد المحاولة.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, cat, page]);

  // A new search or category invalidates the current page (page 3 of an
  // unfiltered list may not exist once filtered), so each also resets page to
  // 1 in the SAME update — React batches them into one re-render, so the
  // effect above fires once per real change. The search is debounced: the
  // box updates on every keystroke, the fetch 350ms after the last one.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) return;
    const timer = setTimeout(() => { setSearch(trimmed); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search]);
  const updateCat = (value: string) => { setCat(value); setPage(1); };

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

  const handleToggleFree = async (id: string, category: string) => {
    const type = getCategoryType(category);
    const currentlyFree = isItemFree(id, category);
    setTogglingId(id);
    try {
      const res = await fetch("/api/v1/admin/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type, free: !currentlyFree }),
      });
      if (res.ok) {
        const data = await res.json();
        setFreeItems(data.freeItems || freeItems);
      } else {
        const err = await res.json();
        alert(`خطأ: ${err.error || "فشل في تحديث حالة الوصول"}`);
      }
    } catch (err) {
      console.error("Toggle free error:", err);
      alert("حدث خطأ أثناء تحديث حالة الوصول");
    } finally {
      setTogglingId(null);
    }
  };

  // "إجمالي السجلات" reads the server's count:"exact" total (LIB-15), not
  // entries.length — entries is now one page of PAGE_SIZE rows, and the true
  // total across laws/decrees/principles/feqh_books can be in the tens of
  // thousands. The other three KPIs below are unavoidably page-scoped: status
  // is not aggregated server-side across four tables in one query, so they
  // describe only the rows currently on screen.
  const stats = [
    { label: "إجمالي السجلات", val: error ? "—" : total.toLocaleString("ar-SA"), c: "text-blue-400" },
    { label: "منشور (بالصفحة الحالية)", val: entries.filter((e) => e.status === "published" || e.status === "active").length, c: "text-emerald-400" },
    { label: "تنتظر مراجعة (بالصفحة الحالية)", val: entries.filter((e) => e.status === "review").length, c: "text-amber-400" },
    { label: "مسودة (بالصفحة الحالية)", val: entries.filter((e) => e.status === "draft").length, c: "text-zinc-400" },
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="بحث في المكتبة..."
            className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => updateCat(c)}
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
        {/* overflow-hidden on the card keeps its rounded corners; the table
            needs its own x-scroller or 8-9 columns are simply cut off on a
            phone with no way to reach them. */}
        <div className="overflow-x-auto">
          <table className="w-full text-right">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["السجل", "التصنيف", "المصدر", "الحالة", "الوصول", "المشاهدات", "التاريخ", "إجراءات"].map((h) => (
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
                    <button
                      onClick={() => handleToggleFree(e.id, e.category)}
                      disabled={togglingId === e.id}
                      className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
                        isItemFree(e.id, e.category)
                          ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      } ${togglingId === e.id ? "opacity-50 cursor-wait" : ""}`}
                      title={isItemFree(e.id, e.category) ? "مجاني — انقر للتقييد" : "مقيّد — انقر لجعله مجاني"}
                    >
                      {isItemFree(e.id, e.category) ? <LockOpen size={14} weight="bold" /> : <Lock size={14} weight="bold" />}
                    </button>
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
        </div>
        {loading && <div className="py-12 text-center text-zinc-500">جاري التحميل...</div>}
        {!loading && error && (
          <div role="alert" className="py-12 px-4 flex flex-col items-center gap-3 text-center">
            <p className="text-[13px] font-semibold text-red-400">{error}</p>
            <button
              onClick={() => fetchData()}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.04] text-zinc-300 hover:text-white transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-zinc-600">لا توجد نتائج</p>
          </div>
        )}
        {/* LIB-15: the API now returns one page (PAGE_SIZE rows) of the true
            total instead of silently capping at PostgREST's 1000-row max, so
            the tab needs a way to reach every row instead of just the first
            window. */}
        {!loading && !error && total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-zinc-500">
              {`صفحة ${page} من ${totalPages} — ${total.toLocaleString("ar-SA")} سجل إجمالاً`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.04] text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                السابق
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.04] text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
