import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import {
  generateInvitationCode,
  isValidInvitationCodeFormat,
  normalizeInvitationCode,
  validateExpiresAt,
  validateMaxUses,
} from "@/lib/services/libraryInvitationRules";
import {
  LIBRARY_INVITATION_SELECT,
  libraryInvitationDbErrorResponse,
  toLibraryInvitationDto,
  type LibraryInvitationRow,
} from "../../library/invitations/_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/library-invitations — every `library.invitations` code,
 * newest first. Admin only.
 */
export async function GET() {
  const auth = await assertRole(["admin"]);
  if (!auth.ok) return auth.response;

  const admin = await createServiceClient();
  const { data, error } = await admin
    .schema("library")
    .from("invitations")
    .select(LIBRARY_INVITATION_SELECT)
    .order("created_at", { ascending: false })
    .returns<LibraryInvitationRow[]>();

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
 * POST /api/v1/admin/library-invitations — create a code. Admin only.
 * Body: { code?: string, maxUses: number (1..1000), expiresAt?: ISO string }
 */
export async function POST(request: NextRequest) {
  const auth = await assertRole(["admin"]);
  if (!auth.ok) return auth.response;

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

  const admin = await createServiceClient();
  const attempts = codeProvided ? 1 : MAX_GENERATE_ATTEMPTS;

  let created: LibraryInvitationRow | null = null;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, error } = await admin
      .schema("library")
      .from("invitations")
      .insert({
        code,
        max_uses: maxUsesResult.value,
        expires_at: expiresAtResult.value,
        created_by: auth.user.id,
      })
      .select(LIBRARY_INVITATION_SELECT)
      .single<LibraryInvitationRow>();

    if (!error) {
      created = data;
      break;
    }
    lastError = error;
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

  return NextResponse.json({ data: toLibraryInvitationDto(created) }, { status: 201 });
}
