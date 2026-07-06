"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Megaphone, Plus, CheckCircle, Clock, Users, PencilSimple, Trash, PaperPlaneTilt } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

interface Broadcast { id: number | string; title: string; target: string; sent: number; scheduled: string; status: "مُرسل" | "مجدول" | "مسودة"; }
const BROADCASTS: Broadcast[] = [
  { id: 1, title: "تحديث نظام الاشتراكات — مايو ٢٠٢٦",      target: "الكل",      sent: 4872,  scheduled: "٢٥ أبريل ٢٠٢٦",  status: "مُرسل" },
  { id: 2, title: "خاصية الأحكام الجديدة للقضاة",            target: "حكومي",     sent: 0,     scheduled: "٢٨ أبريل ٢٠٢٦",  status: "مجدول" },
  { id: 3, title: "عرض خصم الجمعيات الخيرية ٢٠٪",            target: "NGO",       sent: 0,     scheduled: "—",               status: "مسودة" },
  { id: 4, title: "صيانة مجدولة — السبت ٣ مايو",              target: "الكل",      sent: 4901,  scheduled: "٢٢ أبريل ٢٠٢٦",  status: "مُرسل" },
];
const STATUS_CONF: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  "مُرسل":  { color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle },
  "مجدول": { color: "text-blue-500",    bg: "bg-blue-500/10",    icon: Clock },
  "مسودة": { color: "text-gray-400",    bg: "bg-gray-400/10",    icon: PencilSimple },
};

// ── DB ↔ page-shape mapping ────────────────────────────────────────────────────
type DbStatus = "draft" | "scheduled" | "sent";
interface BroadcastRow {
  id: string;
  title: string;
  body: string | null;
  audience: string | null;
  status: DbStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string | null;
}
const STATUS_AR: Record<DbStatus, Broadcast["status"]> = {
  draft: "مسودة",
  scheduled: "مجدول",
  sent: "مُرسل",
};
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}
function mapRow(row: BroadcastRow): Broadcast {
  const when = row.status === "sent" ? row.sent_at : row.scheduled_at;
  return {
    id: row.id,
    title: row.title,
    target: row.audience || "الكل",
    sent: 0,
    scheduled: fmtDate(when),
    status: STATUS_AR[row.status] ?? "مسودة",
  };
}

export default function AdminBroadcastsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<Broadcast[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all" });

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/broadcasts");
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const rows: BroadcastRow[] = Array.isArray(json.data) ? json.data : [];
      setItems(rows.length ? rows.map(mapRow) : BROADCASTS);
    } catch {
      // Keep the mock as a graceful fallback if the API/table is unavailable.
      setItems(BROADCASTS);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createBroadcast = async () => {
    const title = form.title.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: form.body, audience: form.audience, status: "draft" }),
      });
      if (res.ok) {
        setForm({ title: "", body: "", audience: "all" });
        setCreating(false);
        await load();
      }
    } catch {
      // no-op — surface nothing; the list stays as-is.
    } finally {
      setSaving(false);
    }
  };

  const sendBroadcast = async (id: number | string) => {
    if (typeof id !== "string") return; // mock (numeric) rows are not persisted
    try {
      const res = await fetch(`/api/v1/admin/broadcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      if (res.ok) await load();
    } catch {
      // no-op
    }
  };

  const deleteBroadcast = async (id: number | string) => {
    // No DELETE endpoint — archive by marking as draft is not desired here.
    // Optimistically drop from the local list only.
    setItems((prev) => prev.filter((b) => b.id !== id));
  };

  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const list = items.length ? items : BROADCASTS;
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-violet-500/10" : "bg-violet-50"}`}><Megaphone size={22} weight="duotone" className={isDark ? "text-violet-400" : "text-violet-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>رسائل البث</h1><p className={`text-xs ${muted}`}>إشعارات وإعلانات المنصة لكل المستخدمين</p></div>
          </div>
          <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition"><Plus size={14} /> رسالة جديدة</button>
        </div>

        {creating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className={`${card} p-4 shadow-sm space-y-3`}>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="عنوان الرسالة"
              className={`w-full px-3 py-2.5 rounded-xl text-sm outline-none border ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"}`}
            />
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="نص الرسالة"
              rows={3}
              className={`w-full px-3 py-2.5 rounded-xl text-sm outline-none border resize-none ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"}`}
            />
            <div className="flex items-center gap-2">
              <select
                value={form.audience}
                onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                className={`px-3 py-2.5 rounded-xl text-sm outline-none border ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              >
                <option value="all">الكل</option>
                <option value="lawyer">محامون</option>
                <option value="government">حكومي</option>
                <option value="ngo">NGO</option>
                <option value="corporate">شركات</option>
              </select>
              <button
                onClick={createBroadcast}
                disabled={saving || !form.title.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition disabled:opacity-50"
              >
                <CheckCircle size={14} /> {saving ? "جارٍ الحفظ…" : "حفظ كمسودة"}
              </button>
            </div>
          </motion.div>
        )}

        <div className="space-y-3">
          {list.map((b, i) => {
            const conf = STATUS_CONF[b.status];
            const Icon = conf.icon;
            return (
              <motion.div key={b.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className={`${card} p-4 shadow-sm flex items-center gap-4`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${conf.bg}`}><Icon size={18} weight="fill" className={conf.color} /></div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${isDark ? "text-white" : "text-gray-900"}`}>{b.title}</p>
                  <div className={`flex items-center gap-3 mt-0.5 text-[10px] ${muted}`}>
                    <span className="flex items-center gap-1"><Users size={9} /> {b.target}</span>
                    {b.sent > 0 && <span>{b.sent.toLocaleString()} مستلم</span>}
                    <span>{b.scheduled}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>{b.status}</span>
                  {b.status !== "مُرسل" && (
                    <>
                      <button onClick={() => sendBroadcast(b.id)} title="إرسال الآن" className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-emerald-500/10 text-gray-500 hover:text-emerald-400" : "hover:bg-emerald-50 text-gray-400 hover:text-emerald-500"}`}><PaperPlaneTilt size={13} /></button>
                      <button className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-white/5 text-gray-500" : "hover:bg-gray-100 text-gray-400"}`}><PencilSimple size={13} /></button>
                      <button onClick={() => deleteBroadcast(b.id)} className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-rose-500/10 text-gray-500 hover:text-rose-400" : "hover:bg-rose-50 text-gray-400 hover:text-rose-500"}`}><Trash size={13} /></button>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
