/**
 * _team.ts — the row → DTO mapping for /api/v1/cases/[id]/team (owner
 * decision ١٦٩, migration 20261017_41).
 *
 * WHO IS ON THE TEAM is decided in SQL, once: `public.case_team_user_ids`
 * returns the case's lead (`assigned_to`), its filer (`requester_user_id`) and
 * the `case_team_members` rows, each only while an active member of the case's
 * firm — never the client. This file does not recompute that; it only labels
 * what the function returned and lists who could still be added.
 *
 * No `@/` value import, so `node --test` can load it (see `_team.test.ts`).
 */

export type CaseTeamVia = "lead" | "filer" | "member";

export interface CaseTeamPerson {
  userId: string;
  name: string | null;
  role: string | null;
  roleLabel: string | null;
  via: CaseTeamVia;
  /** Plain-language reason this person is on the team. */
  viaLabel: string;
  /** Only an explicitly added member can be taken off; the lead and filer are on the team by the case itself. */
  removable: boolean;
  isMe: boolean;
}

export interface CaseTeamCandidate {
  userId: string;
  name: string | null;
  role: string | null;
  roleLabel: string | null;
}

export interface CaseTeamDto {
  /** null: the case belongs to no firm, so it has no team (the «فريق القضية» scope is not offered). */
  firmId: string | null;
  canManage: boolean;
  team: CaseTeamPerson[];
  /** Active firm members not on the team yet — sent only to someone who may add them. */
  candidates: CaseTeamCandidate[];
  /** Active members of the case's firm: who a «كل المكتب» note reaches. */
  firmMemberCount: number;
}

export const VIA_LABEL: Record<CaseTeamVia, string> = {
  lead: "المحامي المسؤول عن القضية",
  filer: "منشئ القضية",
  member: "أُضيف إلى فريق القضية",
};

export function toVia(value: unknown): CaseTeamVia {
  return value === "lead" || value === "filer" ? value : "member";
}

export interface BuildCaseTeamInput {
  firmId: string;
  callerId: string;
  canManage: boolean;
  teamRows: Array<{ user_id: string; via: string }>;
  memberRows: Array<{ user_id: string; role: string | null }>;
  names: Map<string, string>;
  roleLabel: (role: string) => string | undefined;
}

const VIA_ORDER: Record<CaseTeamVia, number> = { lead: 0, filer: 1, member: 2 };

export function buildCaseTeamDto(input: BuildCaseTeamInput): CaseTeamDto {
  const roleOf = new Map(input.memberRows.map((m) => [m.user_id, m.role]));
  const label = (role: string | null | undefined) => (role ? input.roleLabel(role) ?? null : null);

  const team: CaseTeamPerson[] = input.teamRows
    .map((row) => {
      const via = toVia(row.via);
      const role = roleOf.get(row.user_id) ?? null;
      return {
        userId: row.user_id,
        name: input.names.get(row.user_id) ?? null,
        role,
        roleLabel: label(role),
        via,
        viaLabel: VIA_LABEL[via],
        removable: input.canManage && via === "member",
        isMe: row.user_id === input.callerId,
      };
    })
    .sort((a, b) => VIA_ORDER[a.via] - VIA_ORDER[b.via]);

  const onTeam = new Set(team.map((p) => p.userId));
  const candidates: CaseTeamCandidate[] = input.canManage
    ? input.memberRows
        .filter((m) => !onTeam.has(m.user_id))
        .map((m) => ({
          userId: m.user_id,
          name: input.names.get(m.user_id) ?? null,
          role: m.role,
          roleLabel: label(m.role),
        }))
    : [];

  return {
    firmId: input.firmId,
    canManage: input.canManage,
    team,
    candidates,
    firmMemberCount: new Set(input.memberRows.map((m) => m.user_id)).size,
  };
}

/** The answer for a case with no firm: no team, nothing to add. */
export function noTeamDto(): CaseTeamDto {
  return { firmId: null, canManage: false, team: [], candidates: [], firmMemberCount: 0 };
}

/**
 * PostgREST/Postgres codes meaning "20261017_41 has not run here yet": the
 * function or table is unknown. The route answers 503 with screen copy then,
 * and the case page simply does not offer «فريق القضية».
 */
export function isTeamFeatureMissing(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";
}
