"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Info, ShieldCheck, SpinnerGap, UsersFour } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { toStaffRole, type StaffRole } from "@/lib/auth/staffRoles";
import {
  STAFF_ROLES_IN_ORDER,
  STAFF_ROLE_LABELS_AR,
  STAFF_ROLE_SUMMARY_AR,
  isSameAccount,
} from "@/lib/auth/staffManagement";
import { apiErrorText } from "@/lib/services/apiErrorText";

/**
 * Nezamy's team and each member's staff role (owner answer ٢١٠, Task 3.4).
 *
 * Every member is an admin account (profiles.user_type = 'admin'). Their role
 * — super_admin «مشرف رئيسي», operations «عمليات» or auditor «مراجع» — decides
 * which admin-console actions they may take (src/lib/auth/staffRoles.ts; the
 * server enforces it in requireStaff). A super admin sets roles here; everyone
 * else sees them read-only. Nobody changes their own role, and the last super
 * admin cannot be demoted: the API refuses both and this page shows its reason.
 *
 * Invitations stay in the admin dashboard's «فريق نظامي» tab (TeamTab).
 */

interface TeamMember {
  id: string;
  name: string | null;
  email: string | null;
  staffRole: StaffRole | null;
}

/**
 * What the API could say about roles:
 *   ready   — read; the selector and the labels apply.
 *   missing — public.platform_staff does not exist yet: every admin keeps full
 *             access until 20261019_30 runs (staffRolesReady false).
 *   error   — the roles could not be read now (staffRolesError). requireStaff
 *             fails closed to auditor meanwhile, so nothing here may claim
 *             full access, and no role can be changed.
 */
type RolesState = "ready" | "missing" | "error";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; team: TeamMember[]; rolesState: RolesState };

export default function AdminTeamPage() {
  const { isDark } = useTheme();
  const { staffRole, userId } = useUser();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/teams");
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setLoad({ state: "error", message: apiErrorText(res.status, body, "تعذّر تحميل أعضاء الفريق") });
        return;
      }
      const team: TeamMember[] = (Array.isArray(body?.team) ? body.team : [])
        .filter((m: { id?: unknown }) => typeof m.id === "string" && m.id !== "")
        .map((m: { id: string; name?: unknown; email?: unknown; staffRole?: unknown }) => ({
          id: m.id,
          name: typeof m.name === "string" ? m.name : null,
          email: typeof m.email === "string" ? m.email : null,
          staffRole: toStaffRole(m.staffRole),
        }));
      const rolesState: RolesState =
        body?.staffRolesError === true ? "error" : body?.staffRolesReady === true ? "ready" : "missing";
      setLoad({ state: "ok", team, rolesState });
    } catch {
      setLoad({ state: "error", message: "تعذّر الاتصال بالخادم" });
    }
  }, []);

  useEffect(() => {
    void fetchTeam();
  }, [fetchTeam]);

  const changeRole = async (member: TeamMember, next: StaffRole) => {
    if (next === member.staffRole) return;
    setSavingId(member.id);
    setRowError(null);
    try {
      const res = await fetch("/api/v1/admin/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, staffRole: next }),
      });
      if (!res.ok) {
        // The API's own reason: «لا يمكن إزالة آخر مشرف رئيسي»، «لا يمكنك تغيير دورك»…
        const body = await res.json().catch(() => null);
        setRowError({ id: member.id, text: apiErrorText(res.status, body, "تعذّر تغيير الدور — لم يتغيّر شيء") });
        return;
      }
      await fetchTeam();
    } catch {
      setRowError({ id: member.id, text: "تعذّر الاتصال بالخادم — لم يتغيّر شيء" });
    } finally {
      setSavingId(null);
    }
  };

  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const strong = isDark ? "text-white" : "text-gray-900";
  // Only a super admin sets roles; the server refuses anyone else anyway.
  const canManage = staffRole === "super_admin";

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-3xl mx-auto pb-32" dir="rtl">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-xl ${isDark ? "bg-indigo-900/20 text-indigo-400" : "bg-indigo-100 text-indigo-700"}`}>
            <UsersFour size={24} weight="duotone" />
          </div>
          <h1 className={`text-3xl font-black ${strong}`}>فريق نظامي والمشرفون</h1>
        </div>
        <p className={`text-sm ${muted}`}>
          لكل عضو في الفريق دور يحدد ما يستطيع تنفيذه من لوحة الإدارة.
          {canManage ? " بصفتك مشرفاً رئيسياً تستطيع تغيير أدوار الأعضاء من هنا." : " يغيّر الأدوارَ المشرفون الرئيسيون فقط."}
        </p>
      </div>

      {/* The three roles, as src/lib/auth/staffRoles.ts grants them */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 md:p-6 space-y-3`}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
          <h2 className={`font-black text-sm ${strong}`}>الأدوار الثلاثة</h2>
        </div>
        <ul className="space-y-2">
          {STAFF_ROLES_IN_ORDER.map((role) => (
            <li key={role} className={`text-sm leading-relaxed ${muted}`}>
              <span className={`font-bold ${strong}`}>{STAFF_ROLE_LABELS_AR[role]}:</span> {STAFF_ROLE_SUMMARY_AR[role]}
            </li>
          ))}
        </ul>
        <p className={`text-xs leading-relaxed ${muted}`}>
          كل الأدوار حسابات «مدير» تطّلع على بيانات المنصة؛ الدور يحدد ما يستطيع العضو تغييره من لوحة الإدارة. العضو الذي لم يُعيَّن له
          دور يُعامَل «مراجعاً».
        </p>
      </motion.div>

      {load.state === "ok" && load.rolesState === "missing" && (
        <div className={`rounded-2xl border p-4 flex items-start gap-2 ${isDark ? "border-amber-500/25 bg-amber-500/[0.07]" : "border-amber-200 bg-amber-50"}`}>
          <Info size={16} weight="fill" className={`mt-0.5 flex-shrink-0 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
          <p className={`text-sm leading-relaxed ${isDark ? "text-amber-100/80" : "text-amber-900/80"}`}>
            أدوار الفريق تعمل بعد تطبيق تحديث قاعدة البيانات. حتى ذلك الحين يملك كل حساب «مدير» صلاحية كاملة،
            ولا يمكن تغيير الأدوار.
          </p>
        </div>
      )}

      {load.state === "ok" && load.rolesState === "error" && (
        <div className={`rounded-2xl border p-4 flex items-start gap-2 ${isDark ? "border-red-500/25 bg-red-500/[0.07]" : "border-red-200 bg-red-50"}`}>
          <Info size={16} weight="fill" className={`mt-0.5 flex-shrink-0 ${isDark ? "text-red-400" : "text-red-600"}`} />
          <p className={`text-sm leading-relaxed ${isDark ? "text-red-100/80" : "text-red-900/80"}`}>
            تعذّر قراءة أدوار الفريق الآن — أعد تحميل الصفحة بعد قليل. لا يمكن تغيير الأدوار حتى تُقرأ.
          </p>
        </div>
      )}

      <div className={`${card} p-5 md:p-6 space-y-4`}>
        <h2 className={`font-black text-sm ${strong}`}>الأعضاء</h2>

        {load.state === "loading" && (
          <div className={`py-8 flex justify-center ${muted}`}>
            <SpinnerGap size={20} className="animate-spin" />
          </div>
        )}

        {load.state === "error" && <p className="text-sm text-red-500">{load.message}</p>}

        {load.state === "ok" && load.team.length === 0 && (
          <p className={`text-sm ${muted}`}>لا يوجد أعضاء في الفريق.</p>
        )}

        {load.state === "ok" &&
          load.team.map((member) => {
            const isSelf = !!userId && isSameAccount(member.id, userId);
            const effective: StaffRole = member.staffRole ?? "auditor";
            const editable = canManage && load.rolesState === "ready" && !isSelf;
            return (
              <div
                key={member.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-3 ${isDark ? "border-white/10" : "border-gray-100"}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${strong}`}>
                    {member.name?.trim() || member.email || member.id}
                    {isSelf && <span className={`ms-2 text-xs font-semibold ${muted}`}>(أنت)</span>}
                  </p>
                  {member.email && <p className={`text-xs truncate ${muted}`}>{member.email}</p>}
                  {rowError?.id === member.id && <p className="mt-1 text-xs text-red-500">{rowError.text}</p>}
                </div>

                {load.rolesState === "missing" ? (
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                    صلاحية كاملة حتى تطبيق التحديث
                  </span>
                ) : load.rolesState === "error" ? (
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                    الدور غير معروف الآن
                  </span>
                ) : editable ? (
                  <div className="flex items-center gap-2">
                    {savingId === member.id && <SpinnerGap size={14} className={`animate-spin ${muted}`} />}
                    <select
                      aria-label={`دور ${member.name?.trim() || member.email || ""}`}
                      value={effective}
                      disabled={savingId !== null}
                      onChange={(e) => {
                        const next = toStaffRole(e.target.value);
                        if (next) void changeRole(member, next);
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0c0f12] border-white/10 text-gray-300" : "bg-white border-gray-200 text-gray-800"}`}
                    >
                      {STAFF_ROLES_IN_ORDER.map((role) => (
                        <option key={role} value={role}>
                          {STAFF_ROLE_LABELS_AR[role]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                    {STAFF_ROLE_LABELS_AR[effective]}
                    {member.staffRole === null && " (لم يُعيَّن دور)"}
                    {canManage && isSelf && " · لا يمكنك تغيير دورك"}
                  </span>
                )}
              </div>
            );
          })}
      </div>

      <div className={`${card} p-5 md:p-6 space-y-3`}>
        <h2 className={`font-black text-sm ${strong}`}>دعوة عضو جديد</h2>
        <p className={`text-sm leading-relaxed ${muted}`}>
          الدعوة وتعليق الوسم من تبويب «فريق نظامي» داخل لوحة الإدارة، ويُختار دور العضو عند دعوته.
        </p>
        <Link href="/dashboard/admin" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328]">
          <UsersFour size={16} weight="bold" />
          فتح لوحة الإدارة
        </Link>
      </div>
    </div>
  );
}
