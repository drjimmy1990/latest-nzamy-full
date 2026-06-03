'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in Client Components.
 * This client automatically handles cookie-based session management.
 *
 * Usage:
 * ```tsx
 * const supabase = createClient();
 * const { data } = await supabase.from('profiles').select();
 * ```
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
