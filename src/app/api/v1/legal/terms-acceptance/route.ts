import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { clientIpFrom } from "@/lib/rateLimit";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/termsVersion";
import {
  hashClientIp,
  isMissingTermsTable,
  parseAcceptanceBody,
  shouldRecordSignupFromMetadata,
  truncateUserAgent,
  type TermsAcceptanceContext,
} from "@/lib/legal/termsAcceptance";

/**
 * /api/v1/legal/terms-acceptance — the terms consent record (R7, owner
 * package 2026-11-17, file 11 part «ب»).
 *
 *   GET   → { current, acceptedCurrent }
 *         Whether the signed-in account has accepted CURRENT_TERMS_VERSION.
 *         An email signup made without a session (email confirmation on)
 *         carries `terms_version` in user_metadata; when the account has no
 *         row at all, that acceptance is recorded here as 'signup' and the
 *         answer is true. Before migration 20261122_20 runs the answer is
 *         `acceptedCurrent: true` (fail open: nobody is asked to accept into
 *         a table that is not there).
 *   POST  { version, context: 'signup' | 'relogin' } → { current, acceptedCurrent: true }
 *         Records acceptance of the current version (409 for any other).
 *         The same version twice is a no-op.
 *
 * Writes go through the service role: sessions have SELECT only on
 * public.terms_acceptances. The client address is resolved like the proxy's
 * rate limiter (X-Real-IP first) and stored only as an HMAC-SHA256 keyed with
 * TERMS_IP_HASH_SALT — never the address itself.
 *
 * A frozen account (pending deletion) is refused like every other session
 * write (accountFreezeWrites.test.ts): the proxy sends it to /account-frozen,
 * which the re-accept gate exempts, so it is never asked.
 */

const AR = {
  unauthorized: "يجب تسجيل الدخول للمتابعة.",
  unavailable: "تعذّر حفظ موافقتك الآن. أعد المحاولة بعد قليل.",
  readFailed: "تعذّر التحقق من موافقتك على الشروط الآن.",
} as const;

let warnedNoSalt = false;
function ipHashSalt(): string {
  const salt = process.env.TERMS_IP_HASH_SALT ?? "";
  if (salt === "" && !warnedNoSalt) {
    warnedNoSalt = true;
    console.warn(
      "[legal/terms-acceptance] TERMS_IP_HASH_SALT is not set: client addresses are still hashed, " +
        "but without a secret salt an IPv4 hash can be reversed by brute force. Set it in the server env.",
    );
  }
  return salt;
}

type RecordResult = { ok: true } | { ok: false; missingTable: boolean };

async function recordAcceptance(
  request: NextRequest,
  user: User,
  context: TermsAcceptanceContext,
): Promise<RecordResult> {
  const service = await createServiceClient();
  const { error } = await service.from("terms_acceptances").upsert(
    {
      user_id: user.id,
      terms_version: CURRENT_TERMS_VERSION,
      ip_hash: hashClientIp(clientIpFrom(request), ipHashSalt()),
      user_agent: truncateUserAgent(request.headers.get("user-agent")),
      context,
    },
    { onConflict: "user_id,terms_version", ignoreDuplicates: true },
  );
  if (!error) return { ok: true };
  const missingTable = isMissingTermsTable(error.code);
  if (!missingTable) console.error("[legal/terms-acceptance] insert failed:", error.code, error.message);
  return { ok: false, missingTable };
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireApiUser(supabase, { error: AR.unauthorized });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  // The caller's own rows, through RLS (own-row SELECT policy).
  const { data, error } = await supabase
    .from("terms_acceptances")
    .select("terms_version")
    .eq("user_id", user.id);

  if (error) {
    if (isMissingTermsTable(error.code)) {
      return NextResponse.json({ current: CURRENT_TERMS_VERSION, acceptedCurrent: true, available: false }, noStore);
    }
    console.error("[legal/terms-acceptance] read failed:", error.code, error.message);
    return NextResponse.json({ error: AR.readFailed }, { status: 500, ...noStore });
  }

  const rows = (data ?? []) as Array<{ terms_version: string }>;
  let acceptedCurrent = rows.some((r) => r.terms_version === CURRENT_TERMS_VERSION);

  if (!acceptedCurrent && shouldRecordSignupFromMetadata(user.user_metadata, rows.length)) {
    const recorded = await recordAcceptance(request, user, "signup");
    acceptedCurrent = recorded.ok;
  }

  return NextResponse.json({ current: CURRENT_TERMS_VERSION, acceptedCurrent }, noStore);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireApiUser(supabase, { error: AR.unauthorized });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = await request.json().catch(() => null);
  const parsed = parseAcceptanceBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, current: CURRENT_TERMS_VERSION }, { status: parsed.status, ...noStore });
  }

  const recorded = await recordAcceptance(request, user, parsed.context);
  if (!recorded.ok) {
    return NextResponse.json({ error: AR.unavailable }, { status: 503, ...noStore });
  }
  return NextResponse.json({ current: CURRENT_TERMS_VERSION, acceptedCurrent: true }, noStore);
}
