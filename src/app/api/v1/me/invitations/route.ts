import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { BUSINESS_ROLE_LABEL, type BusinessRole } from "@/lib/auth/businessMembershipAccess";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import type { FirmRole } from "@/types/firmBackendReady";
import { INVITATION_TABLE, type InvitationKind } from "./_answer";

/**
 * GET /api/v1/me/invitations — the invitations waiting for THIS caller's
 * answer, and nothing else. Review 2026-09-21 A5 / F03.
 *
 * 200 `{ data: PendingInvitation[], total }`
 *     `PendingInvitation = { id, kind, entityId, entityName, role, roleLabel,
 *      invitedAt }` — newest first.
 * 500 a read failed. NEVER `{ data: [] }` on a failure: «we could not read
 *     it» rendered as «you have no invitations» is exactly the inversion
 *     src/lib/services/listRead.ts exists to end, and here it would hide a
 *     pending consent decision.
 *
 * ── WHICH CLIENT READS WHAT ────────────────────────────────────────────────
 * The invitation rows come from the caller's own RLS-scoped client, through
 * the own-row SELECT arm of 20260921_03's matrix
 * (`user_id = auth.uid()` — the first disjunct of
 * `"<x>_members: own row, co-member, owner or admin can read"`). So the list
 * is scoped by the database, not by the `.eq("user_id", user.id)` below,
 * which is there to make that explicit and to keep the query planner honest.
 *
 * The ENTITY NAMES are the one thing an invitee cannot read for themselves:
 * `business_profiles` / `firm_profiles` RLS admits the owner, an ACTIVE
 * member and an admin (20260921_03) — and an invitee is none of those, which
 * is the whole point. Without a name the banner would have to say «شركة ما
 * تدعوك», which is not a consent decision anybody can make. So one service
 * client, created only AFTER the RLS-scoped read, asked for ONE display
 * column keyed to exactly the entity ids that read returned — the same
 * sanctioned pattern, and the same three rules, as
 * `/api/v1/business/members` (see that route's header).
 *
 * `entityName: null` means «we could not read it», never «unnamed»: the name
 * lookup failing is not a reason to throw away an invitation the caller is
 * entitled to answer.
 *
 * ── WHY `kind` IS A STRING AND NOT FOUR ────────────────────────────────────
 * `government_members` and `ngo_members` carry the same `invited` status and
 * got the same accept arm in 20260922_02, but nothing in the product writes
 * an invitation to either (there is no government/NGO roster route), so
 * listing them here would be listing a state that cannot occur. When such a
 * route appears, add the kind here and in `_answer.ts`'s table map.
 */

interface MemberInvitationRow {
  id: string;
  user_id: string;
  role: string;
  status: string;
  invited_at: string | null;
  created_at: string;
}

export interface PendingInvitationDto {
  id: string;
  kind: InvitationKind;
  entityId: string;
  entityName: string | null;
  role: string;
  roleLabel: string;
  invitedAt: string;
}

const AR = {
  loadFailed: "تعذّرت قراءة دعوات الانضمام الخاصة بك.",
} as const;

/** The per-kind shape: the FK column, the names table and its one name column. */
const KIND_SHAPE: Record<
  InvitationKind,
  { fk: string; profilesTable: string; nameColumn: string; label: (role: string) => string }
> = {
  business: {
    fk: "business_id",
    profilesTable: "business_profiles",
    nameColumn: "company_name_ar",
    label: (role) => BUSINESS_ROLE_LABEL[role as BusinessRole] ?? role,
  },
  firm: {
    fk: "firm_id",
    profilesTable: "firm_profiles",
    nameColumn: "name_ar",
    label: (role) => FIRM_ROLE_LABEL[role as FirmRole] ?? role,
  },
};

export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const kinds = Object.keys(KIND_SHAPE) as InvitationKind[];

    const reads = await Promise.all(
      kinds.map((kind) =>
        supabase
          .from(INVITATION_TABLE[kind])
          .select(`id, user_id, role, status, invited_at, created_at, ${KIND_SHAPE[kind].fk}`)
          .eq("user_id", user.id)
          .eq("status", "invited"),
      ),
    );

    // One failed read means the answer is unknown, not empty.
    for (let i = 0; i < reads.length; i += 1) {
      const { error } = reads[i];
      if (error) {
        console.error(
          `[me/invitations GET] ${INVITATION_TABLE[kinds[i]]} read failed:`,
          error.message,
          error.code,
        );
        return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
      }
    }

    const pending: { kind: InvitationKind; row: MemberInvitationRow; entityId: string }[] = [];
    kinds.forEach((kind, i) => {
      const fk = KIND_SHAPE[kind].fk;
      for (const raw of (reads[i].data ?? []) as unknown as Record<string, unknown>[]) {
        const entityId = raw[fk];
        if (typeof entityId !== "string" || !entityId) continue;
        pending.push({ kind, row: raw as unknown as MemberInvitationRow, entityId });
      }
    });

    // Names — one service client, created only now, after the RLS-scoped read
    // above has already decided which invitations exist. See the header.
    const nameById = new Map<string, string | null>();
    if (pending.length > 0) {
      const service = await createServiceClient();
      await Promise.all(
        kinds.map(async (kind) => {
          const ids = [
            ...new Set(pending.filter((p) => p.kind === kind).map((p) => p.entityId)),
          ];
          if (ids.length === 0) return;
          const shape = KIND_SHAPE[kind];
          const { data, error } = await service
            .from(shape.profilesTable)
            .select(`id, ${shape.nameColumn}`)
            .in("id", ids);
          if (error) {
            // Non-fatal: the invitations WERE read, and `entityName: null`
            // already means «we could not read this» in this DTO.
            console.error(
              `[me/invitations GET] ${shape.profilesTable} name lookup failed:`,
              error.message,
              error.code,
            );
            return;
          }
          for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
            const id = row.id;
            const name = row[shape.nameColumn];
            if (typeof id === "string") {
              nameById.set(`${kind}:${id}`, typeof name === "string" && name.trim() ? name : null);
            }
          }
        }),
      );
    }

    const data: PendingInvitationDto[] = pending
      .map(({ kind, row, entityId }) => ({
        id: row.id,
        kind,
        entityId,
        entityName: nameById.get(`${kind}:${entityId}`) ?? null,
        role: row.role,
        roleLabel: KIND_SHAPE[kind].label(row.role),
        invitedAt: row.invited_at ?? row.created_at,
      }))
      .sort((a, b) => (a.invitedAt < b.invitedAt ? 1 : a.invitedAt > b.invitedAt ? -1 : 0));

    return NextResponse.json({ data, total: data.length });
  } catch (err) {
    console.error("[me/invitations GET] Unexpected error:", err);
    return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
  }
}
