import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Reads/writes cookies via Next.js `cookies()`, and supports
 * native mobile `Authorization: Bearer <token>` requests via Next.js `headers()`.
 */
export async function createClient() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    // Ignored outside request contexts
  }

  let authHeader: string | null = null;
  let bearerToken: string | null = null;

  try {
    const headerStore = await headers();
    authHeader = headerStore.get('authorization');
    if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
      const token = authHeader.trim().slice(7).trim();
      if (token.length > 0) {
        bearerToken = token;
      }
    }
  } catch {
    // headers() may throw outside request contexts
  }

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore ? cookieStore.getAll() : [];
        },
        setAll(cookiesToSet) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore!.set(name, value, options),
            );
          } catch {
            // Ignored in Server Components
          }
        },
      },
      ...(authHeader && bearerToken
        ? {
            global: {
              headers: {
                Authorization: authHeader,
              },
            },
          }
        : {}),
    },
  );

  if (bearerToken) {
    const originalGetUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = (jwt?: string) => {
      return originalGetUser(jwt || bearerToken!);
    };
  }

  return client;
}

/**
 * Creates a Supabase admin client using the service role key.
 * This bypasses RLS completely and should ONLY be used in trusted server contexts.
 * Bypasses cookie store headers to act as actual superuser.
 *
 * ⚠️ NEVER expose this client to the browser!
 */
export async function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
