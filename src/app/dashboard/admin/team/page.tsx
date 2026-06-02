"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle,
  Envelope,
  Key,
  MagnifyingGlass,
  Plus,
  Prohibit,
  ShieldCheck,
  UsersFour,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import type { AdminTeamAccessLevel, AdminTeamMember } from "@/types/adminBackendReady";

const ACCESS_PERMISSIONS: Record<AdminTeamAccessLevel, string[]> = {
  "Super Admin": ["كل الصلاحيات", "التسعير", "المستخدمون", "المحتوى", "الأمان", "التدقيق"],
  "Legal Reviewer": ["مراجعة القوانين", "اعتماد المقالات", "مراجعة المخرجات القانونية"],
  "Content Editor": ["المدونة", "المكتبة القانونية", "SEO", "الميديا"],
  "Community Moderator": ["بلاغات المجتمع", "إخفاء محتوى", "تصعيد قانوني"],
  "Support Agent": ["تذاكر الدعم", "مراجعة المستخدم", "قراءة السجل"],
};

const INITIAL_TEAM: AdminTeamMember[] = [
  {
    id: "M001",
    name: "محمد عبدالعزيز",
    email: "mohammed@nzamy.com",
    role: "المدير التقني",
    accessLevel: "Super Admin",
    permissions: ACCESS_PERMISSIONS["Super Admin"],
    status: "active",
    lastActive: "الآن",
  },
  {
    id: "M002",
    name: "فهد العتيبي",
    email: "fahad@nzamy.com",
    role: "مراجع قانوني",
    accessLevel: "Legal Reviewer",
    permissions: ACCESS_PERMISSIONS["Legal Reviewer"],
    status: "active",
    lastActive: "منذ 5 دقائق",
  },
  {
    id: "M003",
    name: "خالد السالم",
    email: "khaled@nzamy.com",
    role: "مدير المحتوى",
    accessLevel: "Content Editor",
    permissions: ACCESS_PERMISSIONS["Content Editor"],
    status: "active",
    lastActive: "منذ ساعتين",
  },
  {
    id: "M004",
    name: "نورة القحطاني",
    email: "noura@nzamy.com",
    role: "مشرفة المجتمع",
    accessLevel: "Community Moderator",
    permissions: ACCESS_PERMISSIONS["Community Moderator"],
    status: "pending",
    lastActive: "لم تفعل الحساب",
  },
];

const EMPTY_MEMBER: AdminTeamMember = {
  id: "",
  name: "",
  email: "",
  role: "مشرف منصة",
  accessLevel: "Support Agent",
  permissions: ACCESS_PERMISSIONS["Support Agent"],
  status: "pending",
  lastActive: "دعوة جديدة",
};

export default function AdminTeamPage() {
  const { isDark } = useTheme();
  const [team, setTeam] = useState(INITIAL_TEAM);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<AdminTeamMember | null>(null);
  const [toast, setToast] = useState("RBAC جاهز كواجهة وعقد AdminTeamMember. لا يتم إنشاء حساب خادمي الآن.");

  const filteredTeam = team.filter((member) =>
    [member.name, member.email, member.role, member.accessLevel].some((value) => value.toLowerCase().includes(search.toLowerCase())),
  );

  const stats = useMemo(() => {
    return {
      total: team.length,
      admins: team.filter((member) => member.accessLevel === "Super Admin").length,
      reviewers: team.filter((member) => member.accessLevel === "Legal Reviewer").length,
      moderators: team.filter((member) => member.accessLevel === "Community Moderator").length,
    };
  }, [team]);

  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function openNewMember() {
    setDraft({ ...EMPTY_MEMBER, id: `M${String(team.length + 1).padStart(3, "0")}` });
  }

  function saveDraft() {
    if (!draft?.name.trim() || !draft.email.includes("@")) {
      setToast("العضو يحتاج اسم وبريد صحيح قبل تجهيزه للربط.");
      return;
    }
    const normalized = { ...draft, permissions: ACCESS_PERMISSIONS[draft.accessLevel] };
    setTeam((current) => {
      const exists = current.some((member) => member.id === normalized.id);
      return exists ? current.map((member) => (member.id === normalized.id ? normalized : member)) : [normalized, ...current];
    });
    setDraft(null);
    setToast(`تم تجهيز ${normalized.name} محلياً. الدعوة والصلاحيات تنتظر Auth/RBAC API.`);
  }

  function changeAccess(memberId: string, accessLevel: AdminTeamAccessLevel) {
    setTeam((current) =>
      current.map((member) =>
        member.id === memberId ? { ...member, accessLevel, permissions: ACCESS_PERMISSIONS[accessLevel] } : member,
      ),
    );
    setToast("تم تغيير مستوى الصلاحية في الواجهة فقط. التنفيذ الخادمي ينتظر RBAC backend.");
  }

  function toggleStatus(memberId: string) {
    setTeam((current) =>
      current.map((member) =>
        member.id === memberId ? { ...member, status: member.status === "suspended" ? "active" : "suspended" } : member,
      ),
    );
    setToast("تم تغيير حالة العضو محلياً. التعليق الحقيقي للحساب يحتاج API لاحقاً.");
  }

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1600px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-indigo-900/20 text-indigo-400" : "bg-indigo-100 text-indigo-700"}`}>
              <UsersFour size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>فريق نظامي والمشرفون</h1>
          </div>
          <p className={`text-sm ${muted}`}>إدارة صلاحيات الأدمن الداخلية كواجهة Backend-ready بدون إنشاء حسابات فعلية.</p>
        </div>
        <button onClick={openNewMember} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328]">
          <Plus size={16} weight="bold" />
          إضافة عضو
        </button>
      </div>

      <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الفريق", value: stats.total, icon: UsersFour },
          { label: "Super Admin", value: stats.admins, icon: ShieldCheck },
          { label: "مراجعون قانونيون", value: stats.reviewers, icon: CheckCircle },
          { label: "مشرفو المجتمع", value: stats.moderators, icon: Key },
        ].map((stat) => (
          <div key={stat.label} className={`${card} p-5 flex items-center justify-between`}>
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{stat.label}</p>
              <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{stat.value}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white/5 text-[#C8A762]" : "bg-gray-100 text-[#0B3D2E]"}`}>
              <stat.icon size={22} weight="duotone" />
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>تجهيز عضو فريق</h2>
            <span className="text-[11px] px-2 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 font-bold">Backend-ready</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="الاسم"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="البريد"><input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="المسمى"><input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="مستوى الصلاحية">
              <select value={draft.accessLevel} onChange={(event) => setDraft({ ...draft, accessLevel: event.target.value as AdminTeamAccessLevel, permissions: ACCESS_PERMISSIONS[event.target.value as AdminTeamAccessLevel] })} className={inputClass(isDark)}>
                {(Object.keys(ACCESS_PERMISSIONS) as AdminTeamAccessLevel[]).map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>إلغاء</button>
            <button onClick={saveDraft} className="px-4 py-2 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white">حفظ محلي</button>
          </div>
        </motion.div>
      )}

      <div className={`${card} p-2 flex items-center gap-2`}>
        <MagnifyingGlass size={16} className={muted} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم، البريد، الدور أو مستوى الصلاحية..." className={`w-full bg-transparent outline-none py-2 text-sm ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTeam.map((member, index) => (
            <motion.div key={member.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`${card} p-5 space-y-4`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black ${isDark ? "bg-white/10 text-white" : "bg-gray-100 text-gray-800"}`}>{member.name.charAt(0)}</div>
                  <div>
                    <h3 className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{member.name}</h3>
                    <p className={`text-xs ${muted}`}>{member.role}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${member.status === "active" ? "bg-emerald-500/10 text-emerald-500" : member.status === "pending" ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-rose-500"}`}>
                  {member.status === "active" ? "نشط" : member.status === "pending" ? "قيد التفعيل" : "موقوف"}
                </span>
              </div>

              <div className={`space-y-2 text-xs border-t pt-4 ${isDark ? "border-white/10" : "border-gray-100"}`}>
                <div className="flex items-center justify-between gap-2"><span className={muted}>البريد</span><span className={`font-mono truncate ${isDark ? "text-gray-300" : "text-gray-700"}`}>{member.email}</span></div>
                <div className="flex items-center justify-between gap-2"><span className={muted}>آخر نشاط</span><span className={isDark ? "text-gray-300" : "text-gray-700"}>{member.lastActive}</span></div>
                <Field label="مستوى الصلاحية">
                  <select value={member.accessLevel} onChange={(event) => changeAccess(member.id, event.target.value as AdminTeamAccessLevel)} className={inputClass(isDark)}>
                    {(Object.keys(ACCESS_PERMISSIONS) as AdminTeamAccessLevel[]).map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-1">
                {member.permissions.map((permission) => (
                  <span key={permission} className={`text-[10px] px-2 py-1 rounded-full ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{permission}</span>
                ))}
              </div>

              <div className="flex justify-between gap-2">
                <button onClick={() => setToast(`تم تجهيز دعوة بريدية إلى ${member.email}. الإرسال الفعلي ينتظر خدمة البريد.`)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                  <Envelope size={14} />
                  دعوة
                </button>
                <button onClick={() => toggleStatus(member.id)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                  <Prohibit size={14} />
                  تعليق/تفعيل
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <div className={`${card} p-5 h-fit`}>
          <div className="flex items-center gap-2 mb-4">
            <Key size={18} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
            <h2 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>مصفوفة RBAC</h2>
          </div>
          <div className="space-y-3">
            {(Object.entries(ACCESS_PERMISSIONS) as [AdminTeamAccessLevel, string[]][]).map(([level, permissions]) => (
              <div key={level} className={`p-3 rounded-xl border ${isDark ? "border-white/10 bg-white/[0.02]" : "border-gray-100 bg-gray-50"}`}>
                <p className={`text-sm font-black mb-2 ${level === "Super Admin" ? "text-rose-500" : isDark ? "text-white" : "text-gray-900"}`}>{level}</p>
                <div className="flex flex-wrap gap-1">
                  {permissions.map((permission) => <span key={permission} className={`text-[10px] px-2 py-1 rounded-full ${isDark ? "bg-white/5 text-gray-300" : "bg-white text-gray-600"}`}>{permission}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-bold text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function inputClass(isDark: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none ${
    isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"
  }`;
}
