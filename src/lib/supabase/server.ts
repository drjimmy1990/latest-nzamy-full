import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Reads/writes cookies via Next.js `cookies()`.
 *
 * Usage in Server Component:
 * ```tsx
 * const supabase = await createClient();
 * const { data: { user } } = await supabase.auth.getUser();
 * ```
 *
 * Usage in API Route:
 * ```ts
 * export async function GET() {
 *   const supabase = await createClient();
 *   const { data } = await supabase.from('profiles').select();
 *   return Response.json(data);
 * }
 * ```
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    },
  );
}

/**
 * Creates a Supabase admin client using the service role key.
 * This bypasses RLS and should ONLY be used in trusted server contexts
 * (e.g., n8n webhooks, admin API routes, server-side automation).
 *
 * ⚠️ NEVER expose this client to the browser!
 */
export async function createServiceClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignored in Server Components
          }
        },
      },
    },
  );
}
