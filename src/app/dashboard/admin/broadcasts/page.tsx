"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Megaphone, Plus, CheckCircle, Clock, Users, PencilSimple, Trash, PaperPlaneTilt, Warning, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { listFailed, listFromApi, listOk, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";

interface Broadcast {
  id: number | string;
  title: string;
  target: string;
  /**
   * `null` — not `0` — for every row, because nothing on the server counts
   * recipients. `broadcasts` has no delivered/recipient column and no delivery
   * table is read here, so the honest value is "unknown". It was `0`, which the
   * card then hid behind `sent > 0`; a hidden zero is harmless until someone
   * reads the field, and then it says a broadcast reached nobody.
   */
  sent: number | null;
  scheduled: string;
  status: "مُرسل" | "مجدول" | "مسودة";
}

/* ── No mock fallback ────────────────────────────────────────────────────────
 *
 * A four-row `BROADCASTS` constant used to be substituted whenever the fetch
 * failed OR the table came back empty — «تحديث نظام الاشتراكات — مايو ٢٠٢٦ …
 * ٤٬٨٧٢ مستلم». An admin looking at this screen after a failed read was shown
 * four announcements that were never sent, two of them reporting thousands of
 * recipients. GET /api/v1/admin/broadcasts now answers a failed query with 500
 * + {error} rather than an empty 200, so "nothing sent yet" and "could not
 * read" are finally two different answers and this page gives both.
 */
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
    sent: null,
    scheduled: fmtDate(when),
    status: STATUS_AR[row.status] ?? "مسودة",
  };
}

export default function AdminBroadcastsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [read, setRead] = useState<ListRead<Broadcast> | null>(null);
  // Starts `true` so the first paint cannot claim there are no broadcasts
  // before the request has even left.
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all" });
  // One line for whatever the last write attempt did wrong. Every mutation on
  // this screen used to fail in total silence (`catch { /* no-op */ }`), which
  // on a "send an announcement to every user" button means an admin walks away
  // believing it went out.
  const [actionErr, setActionErr] = useState("");

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/broadcasts");
      if (!res.ok) {
        setRead(listFailed<Broadcast>());
        return;
      }
      const json = await res.json();
      const base = listFromApi<BroadcastRow>(json);
      setRead(base.ok ? listOk(base.items.map(mapRow), base.total) : listFailed<Broadcast>());
    } catch {
      setRead(listFailed<Broadcast>());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createBroadcast = async () => {
    const title = form.title.trim();
    if (!title || saving) return;
    setSaving(true);
    setActionErr("");
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
      } else {
        // A failed save used to close nothing and say nothing, so the draft
        // stayed on screen looking unsaved-but-fine and the admin had no way to
        // tell it from a slow network.
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionErr(body.error ?? "تعذّر حفظ المسودة.");
      }
    } catch {
      setActionErr("تعذّر الاتصال بالخادم — لم تُحفظ المسودة.");
    } finally {
      setSaving(false);
    }
  };

  const sendBroadcast = async (id: number | string) => {
    if (typeof id !== "string") return; // only persisted rows have a uuid
    setActionErr("");
    try {
      const res = await fetch(`/api/v1/admin/broadcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      if (res.ok) await load();
      else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionErr(body.error ?? "تعذّر إرسال الرسالة — لم يتغيّر شيء.");
      }
    } catch {
      setActionErr("تعذّر الاتصال بالخادم — لم تُرسل الرسالة.");
    }
  };

  const deleteBroadcast = (id: number | string) => {
    // There is no DELETE route for broadcasts (src/app/api/v1/admin/broadcasts/
    // [id]/route.ts exposes PATCH only). This used to drop the row from local
    // state, so the broadcast visibly disappeared, the admin read that as
    // deleted, and it was back on the next reload — a deletion that never
    // happened, reported as one that did. Saying so is the only honest thing
    // this button can do until the route exists.
    void id;
    setActionErr("الحذف غير متاح حالياً — لا توجد واجهة حذف على الخادم.");
  };

  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const state = listViewState(loading, read);
  const list = itemsOf(read);
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

        {actionErr && (
          <div className={`${card} p-3 flex items-center gap-2 text-xs font-bold ${isDark ? "text-rose-400 border-rose-500/20" : "text-rose-600 border-rose-200"}`}>
            <Warning size={14} weight="fill" className="shrink-0" /> {actionErr}
          </div>
        )}

        {state === "loading" && (
          <div className={`${card} p-8 text-center text-sm ${muted}`}>جارٍ تحميل الرسائل…</div>
        )}

        {state === "unreadable" && (
          <div className={`${card} p-8 text-center`}>
            <Warning size={20} weight="fill" className="mx-auto mb-2 text-amber-500" />
            <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>تعذّرت قراءة الرسائل</p>
            <p className={`text-xs mt-1 ${muted}`}>
              هذه ليست قائمة فارغة — لم نتمكن من القراءة، فلا يمكن الاستنتاج من هنا أنه لم تُرسل أي رسالة.
            </p>
            <button type="button" onClick={() => { void load(); }}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white font-bold text-xs hover:bg-violet-700 transition">
              <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
            </button>
          </div>
        )}

        {state === "empty" && (
          <div className={`${card} p-8 text-center text-sm ${muted}`}>لا توجد رسائل بث بعد.</div>
        )}

        <div className="space-y-3">
          {state === "ready" && list.map((b, i) => {
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
                    {/* Rendered only when a real count exists. Nothing produces
                        one today, so this never draws — which is the point:
                        «٠ مستلم» under a sent broadcast is a claim, not a
                        blank. */}
                    {b.sent !== null && b.sent > 0 && <span>{b.sent.toLocaleString("ar-SA")} مستلم</span>}
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
