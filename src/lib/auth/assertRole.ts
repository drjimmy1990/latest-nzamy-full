import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAuthUnavailable, authUnavailableResponse } from '@/lib/auth/apiAuth';
import { freezeStateFromUser, ACCOUNT_FROZEN_AR } from '@/lib/auth/accountFreeze';
import { isSuspendedUser, ACCOUNT_SUSPENDED_AR, ACCOUNT_SUSPENDED_CODE } from '@/lib/auth/accountSuspension';
import { staffMfaGate } from '@/lib/auth/staffMfaServer';
import type { SupabaseClient, User } from '@supabase/supabase-js';

type Ok = { ok: true; user: User; userType: string; supabase: SupabaseClient };
type Err = { ok: false; response: NextResponse };

/**
 * Verifies the caller is authenticated AND (if `allowed` is given) that their
 * `profiles.user_type` is in `allowed`. `'admin'` is always permitted.
 *
 * Returns the cookie-scoped, RLS-enforced Supabase client so callers can reuse
 * it instead of re-creating one. This is defense-in-depth on top of RLS — it is
 * NOT a substitute for RLS. Do not swap the returned client for a service-role
 * client on these read paths.
 *
 * Extracted from the inline pattern in src/app/api/v1/admin/credits/route.ts.
 */
export async function assertRole(allowed?: string[]): Promise<Ok | Err> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // A transport failure is not a signed-out caller: answering 401 here is what
  // made an egress/TLS fault read as a session fault (UAT-LIVE-SESSION-001).
  if (isAuthUnavailable(user, authError)) {
    return { ok: false, response: authUnavailableResponse() };
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'غير مصرح — يرجى تسجيل الدخول' },
        { status: 401 },
      ),
    };
  }

  // D6 (owner ٢٩٨): a frozen account (a pending deletion) is refused here, the
  // one gate most API routes share. It reads app_metadata from the user just
  // returned (no query); /api/v1/me/account-deletion does not use assertRole.
  if (freezeStateFromUser(user).frozen) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ACCOUNT_FROZEN_AR, code: 'account_frozen' },
        { status: 403 },
      ),
    };
  }

  // TODO 3.5: an account suspended by the administration (GoTrue ban or the
  // app_metadata copy, both on the user just returned; no query).
  if (isSuspendedUser(user)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ACCOUNT_SUSPENDED_AR, code: ACCOUNT_SUSPENDED_CODE },
        { status: 403 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  const userType = profile?.user_type ?? '';

  // Owner item 18 (batch l7): `'admin'` passes every role list below, so an
  // admin whose session fails the two-step rule (enrolled but aal1, or not
  // enrolled while ADMIN_MFA_ENFORCE=required) is refused here, on every
  // route this gate guards (src/lib/auth/staffMfa.ts).
  if (userType === 'admin') {
    const mfa = await staffMfaGate(supabase, user);
    if (!mfa.ok) {
      return {
        ok: false,
        response: NextResponse.json({ error: mfa.error, code: mfa.code }, { status: 403 }),
      };
    }
  }

  if (
    allowed &&
    allowed.length > 0 &&
    userType !== 'admin' &&
    !allowed.includes(userType)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'غير مصرح — صلاحيات غير كافية' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, userType, supabase };
}
