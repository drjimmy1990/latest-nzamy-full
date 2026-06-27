"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { UsersThree, Headset, ChartBar, BookOpen, Storefront, Shield, Clock } from "@phosphor-icons/react";

const DEPT_ICON: Record<string, React.ElementType> = {
  "الإدارة": Shield,
  "المحتوى": BookOpen,
  "الدعم": Headset,
  "المبيعات": ChartBar,
  "العمليات": Storefront,
};

const DEPT_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  "الإدارة": { color: "text-[#C8A762]", bg: "bg-[#C8A762]/10", border: "border-[#C8A762]/20" },
  "المحتوى": { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  "الدعم": { color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  "المبيعات": { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  "العمليات": { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
};

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";

export default function TeamTab() {
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("مسؤول");
  const [inviteDept, setInviteDept] = useState("الإدارة");
  const [inviting, setInviting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/teams");
      if (!res.ok) throw new Error("Failed to fetch team data");
      const data = await res.json();
      setTeam(data.team || []);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء جلب أعضاء الفريق");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/v1/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
          department: inviteDept,
        }),
      });
      if (res.ok) {
        setInviteName("");
        setInviteEmail("");
        setShowInviteForm(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(`خطأ: ${err.error || "فشل إرسال الدعوة"}`);
      }
    } catch (err) {
      console.error("Invite error:", err);
      alert("حدث خطأ أثناء محاولة إرسال الدعوة");
    } finally {
      setInviting(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    const actionLabel = newStatus === "active" ? "تنشيط" : "تعليق";
    if (!confirm(`هل أنت متأكد من ${actionLabel} عضو الفريق هذا؟`)) return;
    try {
      const res = await fetch("/api/v1/admin/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`خطأ: ${err.error || "فشل التحديث"}`);
      }
    } catch (err) {
      console.error("Toggle status error:", err);
      alert("حدث خطأ أثناء تحديث حالة العضو");
    }
  };

  const stats = [
    { label: "أعضاء الفريق", val: team.length, c: "text-blue-400" },
    { label: "الأقسام", val: new Set(team.map((t) => t.department)).size, c: "text-purple-400" },
    { label: "تذاكر مفتوحة", val: "١٢", c: "text-amber-400" },
    { label: "SLA الالتزام", val: "٩٤%", c: "text-emerald-400" },
  ];

  const getKpiText = (m: any) => {
    if (m.status === "invited") return "بانتظار قبول الدعوة";
    if (m.status === "suspended") return "تم تعليق الحساب";
    return m.email || "حساب نشط";
  };

  return (
    <motion.div key="team" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <UsersThree size={18} className={s.c} weight="duotone" />
            <div>
              <p className="text-[10px] text-zinc-500">{s.label}</p>
              <p className={`text-[20px] font-black ${s.c}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Invite member inline form/modal */}
      {showInviteForm && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 border border-amber-500/20`}>
          <h3 className="text-[13px] font-bold text-white mb-4">دعوة عضو فريق جديد</h3>
          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">الاسم</label>
              <input
                required
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="الاسم الثلاثي"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-[12px] text-zinc-200 outline-none focus:border-[#C8A762]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">البريد الإلكتروني</label>
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@nzamy.com"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-[12px] text-zinc-200 outline-none focus:border-[#C8A762]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">الدور الوظيفي</label>
              <input
                required
                type="text"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                placeholder="مثال: مشرف المحتوى"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-[12px] text-zinc-200 outline-none focus:border-[#C8A762]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">القسم</label>
              <select
                value={inviteDept}
                onChange={(e) => setInviteDept(e.target.value)}
                className="w-full bg-zinc-900 border border-[#white]/[0.08] rounded-xl px-3 py-2 text-[12px] text-zinc-200 outline-none focus:border-[#C8A762]"
              >
                {Object.keys(DEPT_ICON).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowInviteForm(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] text-[11px] font-bold text-zinc-400 hover:text-white transition-all"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="px-4 py-2 rounded-xl bg-[#C8A762] text-[11px] font-bold text-black hover:bg-amber-400 transition-all disabled:opacity-50"
              >
                {inviting ? "جاري الإرسال..." : "إرسال الدعوة"}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Team Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {team.map((m, i) => {
          const DeptIcon = DEPT_ICON[m.department] || UsersThree;
          const style = DEPT_STYLE[m.department] || DEPT_STYLE["الإدارة"];
          const kpiText = getKpiText(m);
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`${card} border ${style.border} p-5 hover:border-opacity-60 transition-all`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${style.bg} border ${style.border}`}>
                  <DeptIcon size={22} className={style.color} weight="duotone" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-black text-white">{m.name}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                          m.status === "active"
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                            : m.status === "suspended"
                            ? "bg-red-500/15 border-red-500/30 text-red-400"
                            : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                        }`}>
                          {m.status === "active" ? "نشط" : m.status === "suspended" ? "معلق" : "مدعو"}
                        </span>
                      </div>
                      <p className={`text-[11px] font-semibold ${style.color}`}>{m.role}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[9px] font-bold bg-white/[0.04] text-zinc-500 px-2 py-1 rounded-lg">
                        {m.department}
                      </span>
                      {m.status !== "invited" && (
                        <button
                          onClick={() => toggleStatus(m.id, m.status)}
                          className={`text-[9px] font-bold underline cursor-pointer ${
                            m.status === "active" ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"
                          }`}
                        >
                          {m.status === "active" ? "تعليق" : "تنشيط"}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">{m.description || "لا يوجد وصف"}</p>

                  {/* KPI */}
                  <div className={`rounded-xl ${style.bg} border ${style.border} px-3 py-2 mb-3`}>
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className={style.color} />
                      <p className={`text-[10px] font-bold ${style.color}`}>{kpiText}</p>
                    </div>
                  </div>

                  {/* Dashboard Tabs */}
                  {m.dashboardTabs && m.dashboardTabs.length > 0 && (
                    <div>
                      <p className="text-[9px] text-zinc-600 mb-1.5">يمكنه الوصول لتبويبات:</p>
                      <div className="flex flex-wrap gap-1">
                        {m.dashboardTabs.map((tab: string) => (
                          <span
                            key={tab}
                            className="text-[9px] font-semibold bg-white/[0.04] text-zinc-400 px-2 py-0.5 rounded-md"
                          >
                            {tab}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Add member button */}
      <button
        onClick={() => setShowInviteForm(true)}
        className={`${card} w-full p-4 flex items-center justify-center gap-2 text-[12px] font-bold text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12] transition-all border-dashed`}
      >
        <UsersThree size={16} /> إضافة عضو فريق جديد
      </button>
      {loading && <div className="py-12 text-center text-zinc-500">جاري التحميل...</div>}
    </motion.div>
  );
}

