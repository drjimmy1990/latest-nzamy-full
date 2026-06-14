import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the user's auth session on every request.
 * This ensures the JWT token doesn't expire while the user is active.
 *
 * Called from `middleware.ts` at the project root.
 *
 * Usage in middleware.ts:
 * ```ts
 * import { updateSession } from '@/lib/supabase/middleware';
 * export async function middleware(request: NextRequest) {
 *   return await updateSession(request);
 * }
 * ```
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not write any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected route check: if no user and accessing protected routes, redirect to login
  const protectedPrefixes = ['/dashboard', '/settings', '/notifications', '/onboarding'];
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // If user is logged in but hasn't completed onboarding, redirect to onboarding
  // (except if already on onboarding page or API routes)
  // Skip for lawyers/firms/providers — they have their own registration flow
  if (
    user &&
    !request.nextUrl.pathname.startsWith('/onboarding') &&
    !request.nextUrl.pathname.startsWith('/api') &&
    !request.nextUrl.pathname.startsWith('/_next') &&
    isProtectedRoute
  ) {
    const userType = user.user_metadata?.user_type;
    const skipOnboarding = ['lawyer', 'firm', 'provider', 'admin'].includes(userType);
    const onboardingCompleted = user.user_metadata?.onboarding_completed;
    if (!skipOnboarding && onboardingCompleted === false) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
