/**
 * accountAccessServer.ts — the reads behind owner item 9 (batch l8): may THIS
 * account use the library? The rule is ./accountAccess.ts; the authority is
 * public.library_access_for(uuid) (20261128_20).
 *
 *   readLibraryAccountAccess(userId) — the decision for one account. Asks the
 *     SQL function; while it does not exist yet (the code is deployed first)
 *     the same rule runs here on the same reads. Any other failure is CLOSED
 *     for everyone but an admin: a lock that fails open would be no lock.
 *     Never memoised: an admin's switch takes effect on the next request.
 *   libraryAccountGate() — for a route: null when the caller may go on
 *     (a guest — public pages are unchanged — an open account, or a session
 *     that cannot be read, which the route's own checks answer), else the 403
 *     with the owner's message (code library_account_locked).
 *   viewerLibraryAccountLocked() — the same question for a status read: true
 *     only for a signed-in account that is locked.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/library/readQuota";
import { hasActiveLibraryGrant } from "@/lib/libraryAccessServer";
import {
  LIBRARY_ACCESS_SETTING_KEY,
  libraryAccessDecision,
  libraryAccountLockedBody,
  overrideEndFromRow,
  overrideInForce,
  type LibraryAccessDecision,
  type LibraryAccountKey,
} from "@/lib/library/accountAccess";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;
type DbError = { code?: string; message?: string } | null;

const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);
const KEYS: ReadonlySet<string> = new Set(["lawyer", "consultant", "firm", "individual", "business", "provider", "admin"]);

const CLOSED: LibraryAccessDecision = { allowed: false, accountKey: null, via: "type" };

/** The rule on direct reads (before 20261128_20 runs). */
async function decideFromReads(service: ServiceClient, userId: string): Promise<LibraryAccessDecision> {
  const [profile, lawyer, setting, override] = await Promise.all([
    service.from("profiles").select("user_type").eq("id", userId).maybeSingle(),
    service.from("lawyer_profiles").select("practice_kind").eq("user_id", userId).maybeSingle(),
    service.from("platform_settings").select("value").eq("key", LIBRARY_ACCESS_SETTING_KEY).maybeSingle(),
    // "*": the end columns (Q94a, 20261202_50) are read when they exist.
    service.from("library_access_user_overrides").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error) {
    console.error("[library account access] profile read failed:", profile.error.code);
    return CLOSED;
  }
  const userType = (profile.data as { user_type?: unknown } | null)?.user_type;
  // An admin is open whatever else failed.
  if (userType === "admin") return { allowed: true, accountKey: "admin", via: "admin" };
  if (setting.error) {
    console.error("[library account access] setting read failed:", setting.error.code);
    return CLOSED;
  }
  const overrideErr = override.error as DbError;
  if (overrideErr && !MISSING_TABLE.has(overrideErr.code ?? "")) {
    console.error("[library account access] override read failed:", overrideErr.code);
    return CLOSED;
  }
  let allowed = (override.data as { allowed?: unknown } | null)?.allowed;
  // Q94a: an exception past its end is ignored (the type's switch answers).
  if (typeof allowed === "boolean") {
    const end = overrideEndFromRow(override.data);
    const needsGrant = end.endsWithSubscription && !overrideInForce(end, false);
    if (!overrideInForce(end, needsGrant ? await hasActiveLibraryGrant(userId) : false)) allowed = undefined;
  }
  return libraryAccessDecision({
    userType,
    // A failed lawyer_profiles read, or no row: an advocate (the platform's rule).
    practiceKind: lawyer.error ? null : (lawyer.data as { practice_kind?: unknown } | null)?.practice_kind,
    map: (setting.data as { value?: unknown } | null)?.value,
    override: typeof allowed === "boolean" ? allowed : null,
  });
}

/** May this account use the library (owner item 9)? Never throws. */
export async function readLibraryAccountAccess(userId: string): Promise<LibraryAccessDecision> {
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("library_access_for", { p_user: userId });
    if (error) {
      if (MISSING_FUNCTION.has(error.code ?? "")) return await decideFromReads(service, userId);
      console.error("[library account access] library_access_for failed:", error.code);
      return CLOSED;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown; account_key?: unknown; via?: unknown } | null;
    if (!row || typeof row.allowed !== "boolean") return CLOSED;
    const key = typeof row.account_key === "string" && KEYS.has(row.account_key) ? (row.account_key as LibraryAccountKey | "admin") : null;
    const via = row.via === "admin" || row.via === "override" || row.via === "no_profile" ? row.via : "type";
    return { allowed: row.allowed, accountKey: key, via };
  } catch (err) {
    console.error("[library account access] failed:", err instanceof Error ? err.message : "error");
    return CLOSED;
  }
}

/** The 403 a locked account gets from every library entry point. */
export function libraryAccountLockedResponse(): NextResponse {
  return NextResponse.json(libraryAccountLockedBody(), {
    status: 403,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** The signed-in caller's id, or null (a guest, or a session that cannot be read). */
async function sessionUserId(): Promise<string | null> {
  try {
    // A guest carries neither an auth cookie nor a bearer token: answered
    // without a round-trip. A bearer token counts as signed in — createClient()
    // honours `Authorization: Bearer` (the native-app path), so skipping it
    // would let a locked account read the library with a curl and no cookie.
    const jar = await cookies();
    const auth = (await headers()).get("authorization") ?? "";
    const bearer = /^\s*bearer\s+\S/i.test(auth);
    if (!bearer && !hasSupabaseAuthCookie(jar.getAll().map((c) => c.name))) return null;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * For a library route: null = go on; else the locked 403. A guest goes on
 * (the public pages and their reads are unchanged, owner item 9.4).
 */
export async function libraryAccountGate(): Promise<NextResponse | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  const decision = await readLibraryAccountAccess(userId);
  return decision.allowed ? null : libraryAccountLockedResponse();
}

/** For a status read: true only for a signed-in account whose library is locked. */
export async function viewerLibraryAccountLocked(): Promise<boolean> {
  const userId = await sessionUserId();
  if (!userId) return false;
  return !(await readLibraryAccountAccess(userId)).allowed;
}
