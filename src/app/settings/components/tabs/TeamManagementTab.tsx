"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  DotsThreeVertical,
  EnvelopeSimple,
  Pause,
  PencilSimple,
  Trash,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";
import { SETTINGS_BACKEND_READY_MESSAGE, getSettingsRolePolicy } from "@/constants/settingsReadiness";
import { useUser } from "@/hooks/useUser";
import { BackendReadyNotice, LocalActionStatus, SectionTitle } from "./_shared";

interface TeamMember {
  name: string;
  role: string;
  roleLabel: string;
  department: string;
  email: string;
  status: "active" | "suspended" | "pending";
  lastActive: string;
  avatar: string;
}

function getMockTeam(userType: string | null): TeamMember[] {
  if (userType === "lawyer") return [
    { name: "سارة القحطاني", role: "legal_assistant", roleLabel: "مساعدة قانونية", department: "مكتب المحامي", email: "sarah.assistant@nezamy.sa", status: "active", lastActive: "منذ ساعة", avatar: "س" },
    { name: "دعوة متدرب", role: "trainee", roleLabel: "متدرب", department: "ملفات محددة", email: "trainee.invite@nezamy.sa", status: "pending", lastActive: "—", avatar: "؟" },
  ];

  if (userType === "firm") return [
    { name: "أ. فهد بن عبدالرحمن النمر", role: "managing_partner", roleLabel: "شريك مدير", department: "الإدارة", email: "f.alnmer@nezamy.sa", status: "active", lastActive: "الآن", avatar: "ف" },
    { name: "أ. نورة بنت سعد العتيبي", role: "partner", roleLabel: "شريك", department: "القضايا التجارية", email: "n.otaibi@nezamy.sa", status: "active", lastActive: "منذ 3 ساعات", avatar: "ن" },
    { name: "أ. عبدالعزيز الحربي", role: "senior_lawyer", roleLabel: "محامي أول", department: "الملكية الفكرية", email: "a.harbi@nezamy.sa", status: "active", lastActive: "أمس", avatar: "ع" },
    { name: "أ. لمى بنت خالد الشمري", role: "lawyer", roleLabel: "محامية", department: "قضايا العمل", email: "l.shamri@nezamy.sa", status: "active", lastActive: "منذ يومين", avatar: "ل" },
    { name: "خالد الدوسري", role: "trainee", roleLabel: "متدرب", department: "القضايا التجارية", email: "k.dosari@nezamy.sa", status: "pending", lastActive: "—", avatar: "خ" },
  ];

  if (userType === "corporate") return [
    { name: "م. سلطان بن فهد القرني", role: "owner", roleLabel: "مدير الشركة", department: "الإدارة العليا", email: "sultan@advancedco.sa", status: "active", lastActive: "الآن", avatar: "س" },
    { name: "أ. هند بنت عبدالله الغامدي", role: "legal_manager", roleLabel: "مديرة الشؤون القانونية", department: "القانوني", email: "hind@advancedco.sa", status: "active", lastActive: "منذ ساعة", avatar: "ه" },
    { name: "أ. فيصل المطيري", role: "hr_manager", roleLabel: "مدير الموارد البشرية", department: "HR", email: "faisal@advancedco.sa", status: "active", lastActive: "منذ 5 ساعات", avatar: "ف" },
    { name: "منيرة العنزي", role: "legal_staff", roleLabel: "أخصائية قانونية", department: "القانوني", email: "munira@advancedco.sa", status: "active", lastActive: "أمس", avatar: "م" },
  ];

  if (userType === "government") return [
    { name: "معالي القاضي عبدالله الشهراني", role: "judge", roleLabel: "قاضي", department: "الدائرة التجارية", email: "a.shahrani@moj.gov.sa", status: "active", lastActive: "الآن", avatar: "ع" },
    { name: "أ. ريم بنت محمد البلوي", role: "prosecutor", roleLabel: "عضو نيابة", department: "نيابة التحقيق", email: "r.balawi@pp.gov.sa", status: "active", lastActive: "أمس", avatar: "ر" },
    { name: "النقيب أحمد الزهراني", role: "officer", roleLabel: "ضابط تحقيق", department: "المباحث", email: "a.zahrani@pss.gov.sa", status: "active", lastActive: "منذ يوم", avatar: "أ" },
  ];

  if (userType === "ngo") return [
    { name: "د. سعاد بنت عبدالله الحربي", role: "board_chair", roleLabel: "رئيسة مجلس الإدارة", department: "الإدارة", email: "suad@huquq.org.sa", status: "active", lastActive: "الآن", avatar: "س" },
    { name: "أ. ماجد الرشيدي", role: "ceo", roleLabel: "المدير التنفيذي", department: "التنفيذي", email: "majed@huquq.org.sa", status: "active", lastActive: "منذ ساعتين", avatar: "م" },
    { name: "أ. عائشة المالكي", role: "legal", roleLabel: "مسؤولة قانونية", department: "القانوني", email: "aisha@huquq.org.sa", status: "active", lastActive: "أمس", avatar: "ع" },
  ];

  return [];
}

const STATUS_STYLE: Record<TeamMember["status"], { label: string; color: string }> = {
  active: { label: "نشط", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20" },
  suspended: { label: "معلّق", color: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20" },
  pending: { label: "في الانتظار", color: "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800" },
};

const SCOPE_LABELS: Record<string, string> = {
  personal: "شخصي",
  entity: "الكيان كله",
  department: "قسم/إدارة",
  case: "ملف/قضية",
};

export function TeamManagementTab() {
  const user = useUser();
  const policy = getSettingsRolePolicy(user);
  const baseTeam = getMockTeam(user.userType);
  const [pendingInvites, setPendingInvites] = useState<TeamMember[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(true);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: policy.inviteRoles[0]?.value ?? "",
    department: "",
  });

  useEffect(() => {
    setPendingInvites([]);
    setLocalMessage(null);
    setForm((current) => ({ ...current, role: policy.inviteRoles[0]?.value ?? "" }));
  }, [policy.roleLabel, policy.inviteRoles]);

  const team = [...pendingInvites, ...baseTeam];
  const usedSeats = (policy.seatPolicy?.used ?? baseTeam.length) + pendingInvites.length;
  const seatsFull = policy.seatPolicy ? usedSeats >= policy.seatPolicy.included : false;
  const inviteDisabled = !policy.canInviteTeam || seatsFull;
  const teamLabel = user.userType === "lawyer"
    ? "مساعدو المحامي"
    : user.userType === "firm"
      ? "فريق المكتب"
      : user.userType === "government"
        ? "فريق الجهة"
        : user.userType === "ngo"
          ? "فريق الجمعية/الوقف"
          : "فريق الكيان";

  const handleInvite = () => {
    const selectedRole = policy.inviteRoles.find((role) => role.value === form.role) ?? policy.inviteRoles[0];

    if (!policy.canInviteTeam) {
      setLocalMessage("هذا الدور لا يملك صلاحية دعوة فريق من صفحة الإعدادات.");
      return;
    }

    if (seatsFull) {
      setLocalMessage(policy.seatPolicy?.overLimitMessage ?? "لا توجد مقاعد متاحة حالياً.");
      return;
    }

    if (!form.email.trim() || !selectedRole) {
      setLocalMessage("أدخل البريد واختر الدور قبل إنشاء الدعوة المحلية.");
      return;
    }

    setPendingInvites((current) => [
      {
        name: form.name.trim() || "دعوة مرسلة",
        role: selectedRole.value,
        roleLabel: selectedRole.label,
        department: form.department.trim() || SCOPE_LABELS[selectedRole.scope],
        email: form.email.trim(),
        status: "pending",
        lastActive: "رابط محلي",
        avatar: "؟",
      },
      ...current,
    ]);
    setLocalMessage(`تم إنشاء دعوة محلية إلى ${form.email.trim()} - الرابط وهمي وجاهز للربط بالبريد/الجوال لاحقاً.`);
    setForm((current) => ({ ...current, name: "", email: "", phone: "", department: "" }));
  };

  const handleMemberAction = (action: string, member: TeamMember) => {
    setLocalMessage(`${action} لـ ${member.name}: إجراء محلي فقط وينتظر RBAC/API لاحقاً.`);
    setMenuOpen(null);
  };

  return (
    <div className="space-y-6">
      <BackendReadyNotice>{SETTINGS_BACKEND_READY_MESSAGE}</BackendReadyNotice>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-dark-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <SectionTitle>{teamLabel} ({team.length})</SectionTitle>
            <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">
              الدعوات هنا مختصرة. الإدارة التفصيلية تبقى في صفحة الفريق، وكل دعوة الآن Pending ومحلية.
            </p>
          </div>
          {policy.seatPolicy && (
            <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600 dark:bg-white/[0.04] dark:text-zinc-300">
              {policy.seatPolicy.label}: {usedSeats} / {policy.seatPolicy.included} {policy.seatPolicy.unit}
            </div>
          )}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full ${seatsFull ? "bg-amber-500" : "bg-royal"}`}
            style={{
              width: policy.seatPolicy ? `${Math.min(100, Math.round((usedSeats / policy.seatPolicy.included) * 100))}%` : "0%",
            }}
          />
        </div>
      </div>

      <AnimatePresence>
        {inviteOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-royal/20 bg-white p-5 dark:border-[#C8A762]/20 dark:bg-dark-card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UsersThree size={18} className="text-royal dark:text-[#C8A762]" />
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">دعوة عضو جديد</p>
                </div>
                <button
                  onClick={() => setInviteOpen(false)}
                  className="text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  إخفاء
                </button>
              </div>

              {seatsFull && (
                <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  {policy.seatPolicy?.overLimitMessage}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="الاسم"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-royal/30 dark:border-white/[0.08] dark:bg-dark-bg dark:text-zinc-200"
                />
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="البريد الإلكتروني"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-royal/30 dark:border-white/[0.08] dark:bg-dark-bg dark:text-zinc-200"
                />
                <input
                  value={form.department}
                  onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                  placeholder="القسم/النطاق"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-royal/30 dark:border-white/[0.08] dark:bg-dark-bg dark:text-zinc-200"
                />
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-royal/30 dark:border-white/[0.08] dark:bg-dark-bg dark:text-zinc-200"
                >
                  <option value="">اختر الدور</option>
                  {policy.inviteRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {SCOPE_LABELS[role.scope]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
                <motion.button
                  whileTap={inviteDisabled ? undefined : { scale: 0.97 }}
                  onClick={handleInvite}
                  disabled={inviteDisabled}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)] transition-colors hover:bg-royal/90 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none dark:disabled:bg-zinc-700"
                >
                  <EnvelopeSimple size={16} />
                  إنشاء دعوة محلية
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!inviteOpen && policy.canInviteTeam && (
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-royal/20 px-4 py-2 text-sm font-semibold text-royal transition-colors hover:bg-royal/5 dark:border-[#C8A762]/20 dark:text-[#C8A762]"
        >
          <UserPlus size={16} />
          فتح نموذج الدعوة
        </button>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.06] dark:bg-dark-card">
        {team.map((member) => {
          const status = STATUS_STYLE[member.status];
          return (
            <div key={member.email} className="relative flex items-center gap-4 border-b border-gray-100 px-5 py-4 transition-colors last:border-0 hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.02]">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                member.status === "active"
                  ? "bg-gradient-to-br from-[#0B3D2E] to-emerald-700 text-white"
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
              }`}>
                {member.avatar}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">{member.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.color}`}>{status.label}</span>
                </div>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {member.roleLabel} - {member.department}
                </p>
              </div>

              <div className="hidden items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 sm:flex">
                <Clock size={12} />
                {member.lastActive}
              </div>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen(menuOpen === member.email ? null : member.email)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                  <DotsThreeVertical size={18} weight="bold" />
                </button>

                <AnimatePresence>
                  {menuOpen === member.email && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="absolute end-0 top-full z-10 mt-1 w-44 rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-dark-card"
                    >
                      <button
                        onClick={() => handleMemberAction("تغيير الدور", member)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.04]"
                      >
                        <PencilSimple size={14} /> تغيير الدور
                      </button>
                      <button
                        onClick={() => handleMemberAction("تعليق الحساب", member)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-amber-600 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10"
                      >
                        <Pause size={14} /> تعليق الحساب
                      </button>
                      <button
                        onClick={() => handleMemberAction("حذف العضو", member)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        <Trash size={14} /> حذف العضو
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
