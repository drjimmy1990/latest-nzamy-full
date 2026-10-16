"use client";

/**
 * NoteScope.tsx — owner decision ١٦٩ on the case-file notes tab (lawyer and
 * firm case pages): a note is «خاصة بي» by default, and its author can share
 * it with «فريق القضية» or «كل المكتب». Three pieces, shared so both pages
 * say exactly the same thing:
 *
 *   NoteScopePicker  the three-way choice + «من يرى هذه الملاحظة»
 *   NoteScopeBadge   the scope on each saved note, with the same answer as a tooltip
 *   CaseTeamPanel    who is on the case team, and add/remove for whoever may manage it
 *
 * What each scope reaches is enforced in RLS (20261017_41); the copy here only
 * states it. The team comes from GET /api/v1/cases/[id]/team, which reads the
 * one SQL definition (`public.case_team_user_ids`) — nothing is computed here.
 */

import { useState } from "react";
import { Lock, UsersThree, Buildings, Plus, X, Spinner, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import type { CaseNoteVisibility } from "@/lib/services/caseNotesService";
import type { CaseTeamDto, CaseTeamPerson } from "@/lib/services/caseTeamService";

/** undefined = still loading · null = could not be read (or 20261017_41 not run yet). */
export type CaseTeamState = CaseTeamDto | null | undefined;

const SCOPE_LABEL: Record<CaseNoteVisibility, string> = {
  private: "خاصة بي",
  case_team: "فريق القضية",
  firm: "كل المكتب",
};

function personName(p: CaseTeamPerson): string {
  const name = p.name ?? "عضو بلا اسم معروض";
  return p.isMe ? `${name} (أنت)` : name;
}

/** Why «فريق القضية» cannot be picked right now, or null when it can. */
export function caseTeamUnavailableReason(team: CaseTeamState): string | null {
  if (team === undefined) return "جارٍ تحميل فريق القضية…";
  if (team === null) return "تعذّر تحميل فريق القضية، فلا يمكن المشاركة معه الآن.";
  if (!team.firmId) return "هذه القضية ليست ضمن مكتب، فلا فريق لها.";
  return null;
}

/** «من يرى هذه الملاحظة» — one sentence per scope. */
export function whoCanSee(scope: CaseNoteVisibility, team: CaseTeamState): string {
  if (scope === "private") return "أنت فقط. لا يراها زملاؤك ولا الموكّل.";
  if (scope === "case_team") {
    if (!team || !team.firmId) return "فريق القضية — لا يراها الموكّل ولا بقية المكتب.";
    const names = team.team.map(personName);
    return names.length
      ? `فريق القضية: ${names.join("، ")}. لا يراها الموكّل ولا بقية المكتب.`
      : "فريق القضية (لا أحد فيه بعد سواك). لا يراها الموكّل ولا بقية المكتب.";
  }
  if (team && team.firmId) {
    return `كل أعضاء المكتب النشطين (${team.firmMemberCount.toLocaleString("ar-SA")}). لا يراها الموكّل.`;
  }
  return "أعضاء مكتبك النشطون. لا يراها الموكّل.";
}

export function NoteScopePicker({
  value,
  onChange,
  team,
  disabled,
}: {
  value: CaseNoteVisibility;
  onChange: (next: CaseNoteVisibility) => void;
  team: CaseTeamState;
  disabled?: boolean;
}) {
  const { isDark } = useTheme();
  const teamReason = caseTeamUnavailableReason(team);
  const options: { scope: CaseNoteVisibility; icon: React.ElementType; reason: string | null }[] = [
    { scope: "private", icon: Lock, reason: null },
    { scope: "case_team", icon: UsersThree, reason: teamReason },
    { scope: "firm", icon: Buildings, reason: null },
  ];
  return (
    <div className="flex items-center gap-1 text-[10px]" role="radiogroup" aria-label="من يرى هذه الملاحظة">
      {options.map(({ scope, icon: Icon, reason }) => {
        const blocked = disabled || reason !== null;
        const active = value === scope;
        return (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={blocked}
            title={reason ?? whoCanSee(scope, team)}
            onClick={() => onChange(scope)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              active
                ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Icon size={11} weight={active ? "fill" : "regular"} />
            {SCOPE_LABEL[scope]}
          </button>
        );
      })}
    </div>
  );
}

export function NoteScopeLine({ scope, team }: { scope: CaseNoteVisibility; team: CaseTeamState }) {
  const { isDark } = useTheme();
  return (
    <p className={`mt-2 text-[10px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
      <span className="font-bold">من يرى هذه الملاحظة: </span>
      {whoCanSee(scope, team)}
    </p>
  );
}

export function NoteScopeBadge({ scope, team }: { scope: CaseNoteVisibility; team: CaseTeamState }) {
  const { isDark } = useTheme();
  const tone =
    scope === "firm"
      ? isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-600"
      : scope === "case_team"
        ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
        : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500";
  const Icon = scope === "firm" ? Buildings : scope === "case_team" ? UsersThree : Lock;
  return (
    <span
      title={`من يراها: ${whoCanSee(scope, team)}`}
      className={`flex-shrink-0 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tone}`}
    >
      <Icon size={9} weight="bold" />
      {SCOPE_LABEL[scope]}
    </span>
  );
}

export function CaseTeamPanel({
  team,
  onAdd,
  onRemove,
  onRetry,
  card,
}: {
  team: CaseTeamState;
  onAdd: (userId: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  onRetry: () => void;
  card: string;
}) {
  const { isDark } = useTheme();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const muted = isDark ? "text-zinc-500" : "text-slate-500";
  const strong = isDark ? "text-zinc-200" : "text-slate-700";

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (key === "add") setPick("");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "تعذّر حفظ التغيير على فريق القضية.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <UsersThree size={15} weight="duotone" className="text-royal" />
        <p className={`text-[12px] font-bold ${strong}`}>فريق القضية</p>
      </div>
      <p className={`text-[10px] leading-relaxed mb-3 ${muted}`}>
        هم من يقرؤون ملاحظات «فريق القضية»: المحامي المسؤول ومنشئ القضية ومن يُضاف هنا من أعضاء المكتب النشطين. الموكّل ليس منهم أبداً، ومن يُعلَّق أو يُنهى عضويته في المكتب يخرج من الفريق تلقائياً.
      </p>

      {team === undefined ? (
        <div className={`flex items-center gap-2 text-[11px] ${muted}`}>
          <Spinner size={13} className="animate-spin" /> جارٍ تحميل فريق القضية…
        </div>
      ) : team === null ? (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-red-500 font-semibold">تعذّر تحميل فريق القضية.</span>
          <button onClick={onRetry} className="flex items-center gap-1 font-bold text-royal hover:underline">
            <ArrowClockwise size={12} /> إعادة المحاولة
          </button>
        </div>
      ) : !team.firmId ? (
        <p className={`text-[11px] ${muted}`}>
          هذه القضية ليست ضمن مكتب، فلا فريق لها — ملاحظاتها إما خاصة بك أو لأعضاء مكتبك.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {team.team.map((p) => (
              <li key={p.userId} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                <div className="min-w-0">
                  <p className={`text-[12px] font-semibold truncate ${p.name ? strong : muted}`}>{personName(p)}</p>
                  <p className={`text-[10px] ${muted}`}>
                    {p.viaLabel}{p.roleLabel ? ` · ${p.roleLabel}` : ""}
                  </p>
                </div>
                {p.removable && (
                  <button
                    onClick={() => run(p.userId, () => onRemove(p.userId))}
                    disabled={busy !== null}
                    title="إزالة من فريق القضية"
                    className={`flex-shrink-0 p-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? "text-zinc-500 hover:text-red-400" : "text-slate-400 hover:text-red-500"}`}
                  >
                    {busy === p.userId ? <Spinner size={12} className="animate-spin" /> : <X size={12} weight="bold" />}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {team.canManage ? (
            team.candidates.length > 0 ? (
              <div className="mt-3 flex items-center gap-2">
                <select
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  disabled={busy !== null}
                  aria-label="عضو من المكتب"
                  className={`flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-[11px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  <option value="">اختر عضوًا من المكتب…</option>
                  {team.candidates.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {(c.name ?? "عضو بلا اسم معروض") + (c.roleLabel ? ` — ${c.roleLabel}` : "")}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => run("add", () => onAdd(pick))}
                  disabled={!pick || busy !== null}
                  title={!pick ? "اختر عضوًا أولاً" : "إضافة إلى فريق القضية"}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy === "add" ? <Spinner size={12} className="animate-spin" /> : <Plus size={12} weight="bold" />}
                  إضافة
                </button>
              </div>
            ) : (
              <p className={`mt-3 text-[10px] ${muted}`}>كل أعضاء المكتب النشطين في الفريق بالفعل.</p>
            )
          ) : (
            <p className={`mt-3 text-[10px] ${muted}`}>
              يضيف إلى الفريق المحامي المسؤول أو منشئ القضية أو صاحب المكتب.
            </p>
          )}
        </>
      )}
      {error && <p className="mt-2 text-[11px] font-semibold text-red-500">{error}</p>}
    </div>
  );
}
