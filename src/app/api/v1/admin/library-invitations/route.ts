import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/library/optionalColumn";
import {
  generateInvitationCode,
  isValidInvitationCodeFormat,
  normalizeInvitationCode,
  validateExpiresAt,
  validateGrantDays,
  validateMaxUses,
} from "@/lib/services/libraryInvitationRules";
import {
  LIBRARY_INVITATION_SELECT,
  LIBRARY_INVITATION_SELECT_V2,
  libraryInvitationDbErrorResponse,
  toLibraryInvitationDto,
  type LibraryInvitationRow,
} from "../../library/invitations/_shared";

export const dynamic = "force-dynamic";

const GRANT_DAYS_MIGRATION_MISSING_AR = "شغّل ملف الترحيل 20261103_11 أولاً";

/**
 * GET /api/v1/admin/library-invitations — every `library.invitations` code,
 * newest first, with its days (grant_days, else 30) and seats (max_uses).
 * Admin only. Before 20261103_11 the list is read without grant_days (every
 * code then shows 30 days, which is what it gives).
 */
export async function GET() {
  const auth = await assertRole(["admin"]);
  if (!auth.ok) return auth.response;

  const admin = await createServiceClient();
  const list = (select: string) =>
    admin
      .schema("library")
      .from("invitations")
      .select(select)
      .order("created_at", { ascending: false })
      .returns<LibraryInvitationRow[]>();
  let { data, error } = await list(LIBRARY_INVITATION_SELECT_V2);
  if (isMissingColumnError(error, "grant_days")) ({ data, error } = await list(LIBRARY_INVITATION_SELECT));

  if (error) {
    console.error("[admin/library-invitations] GET failed:", error.message, error.code);
    const mapped = libraryInvitationDbErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  const rows = (data ?? []).map(toLibraryInvitationDto);
  return NextResponse.json({ data: rows, total: rows.length });
}

/** Auto-generated-code collisions are vanishingly rare but not impossible —
 *  retry with a fresh code rather than surface a 409 for a code the admin
 *  never chose. An admin-supplied code that collides IS a real 409. */
const MAX_GENERATE_ATTEMPTS = 5;

/**
 * POST /api/v1/admin/library-invitations — create a code.
 * Body: { code?: string, maxUses: number (1..1000 — the seats),
 *         expiresAt?: ISO string, grantDays?: number (1..3660, owner q378) }
 *
 * grant_days goes into the insert only when the admin gave a length, so a
 * code without one is created the same way before and after 20261103_11; a
 * length sent before that file runs is refused with 503 and its name.
 *
 * Owner ٢١٠: a code grants library access, so issuing one needs a staff role
 * with entitlements.grant, and each one is audited.
 */
export async function POST(request: NextRequest) {
  const gate = await requireStaff("entitlements.grant");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const codeProvided = typeof body.code === "string" && body.code.trim().length > 0;
  let code: string;
  if (codeProvided) {
    code = normalizeInvitationCode(body.code as string);
    if (!isValidInvitationCodeFormat(code)) {
      return NextResponse.json(
        { error: "صيغة كود الدعوة غير صالحة — ٤ إلى ٣٢ حرفاً/رقماً إنجليزياً بلا رموز أو مسافات" },
        { status: 400 },
      );
    }
  } else if (body.code !== undefined && body.code !== null && typeof body.code !== "string") {
    return NextResponse.json({ error: "كود الدعوة غير صالح" }, { status: 400 });
  } else {
    code = generateInvitationCode();
  }

  const maxUsesResult = validateMaxUses(body.maxUses);
  if (!maxUsesResult.ok) {
    return NextResponse.json({ error: maxUsesResult.error }, { status: 400 });
  }

  const expiresAtResult = validateExpiresAt(body.expiresAt);
  if (!expiresAtResult.ok) {
    return NextResponse.json({ error: expiresAtResult.error }, { status: 400 });
  }

  const grantDaysResult = validateGrantDays(body.grantDays);
  if (!grantDaysResult.ok) {
    return NextResponse.json({ error: grantDaysResult.error }, { status: 400 });
  }
  const grantDays = grantDaysResult.value;

  const admin = await createServiceClient();
  const attempts = codeProvided ? 1 : MAX_GENERATE_ATTEMPTS;

  let created: LibraryInvitationRow | null = null;
  let lastError: { code?: string; message?: string } | null = null;
  // Before 20261103_11 a code WITHOUT a length is still created: the insert
  // returns the columns every database has (one failed statement saves nothing).
  let select = LIBRARY_INVITATION_SELECT_V2;

  for (let attempt = 0; attempt < attempts; ) {
    const { data, error } = await admin
      .schema("library")
      .from("invitations")
      .insert({
        code,
        max_uses: maxUsesResult.value,
        expires_at: expiresAtResult.value,
        created_by: gate.userId,
        // The deploy-order rule: the new column is sent only when it has a value.
        ...(grantDays !== null ? { grant_days: grantDays } : {}),
      })
      .select(select)
      .single<LibraryInvitationRow>();

    if (!error) {
      created = data;
      break;
    }
    if (isMissingColumnError(error, "grant_days")) {
      if (grantDays !== null) {
        return NextResponse.json({ error: GRANT_DAYS_MIGRATION_MISSING_AR }, { status: 503 });
      }
      if (select !== LIBRARY_INVITATION_SELECT) {
        select = LIBRARY_INVITATION_SELECT; // same attempt, without the column
        continue;
      }
    }
    lastError = error;
    attempt++;
    if (error.code === "23505" && !codeProvided) {
      code = generateInvitationCode();
      continue;
    }
    break;
  }

  if (!created) {
    console.error("[admin/library-invitations] POST failed:", lastError?.message, lastError?.code);
    const mapped = libraryInvitationDbErrorResponse(lastError);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  await logAdminAction({
    actorId: gate.userId,
    action: "library_invitation_created",
    targetType: "library_invitation",
    targetId: created.id,
    after: { code, max_uses: maxUsesResult.value, expires_at: expiresAtResult.value, grant_days: grantDays },
  });

  return NextResponse.json({ data: toLibraryInvitationDto(created) }, { status: 201 });
}
