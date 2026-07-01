import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'غير مصرح — يرجى تسجيل الدخول' },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  const userType = profile?.user_type ?? '';
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
