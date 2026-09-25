import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { libraryGate } from "@/lib/library-gate";
import { getLibraryStatus } from "@/lib/access-control";
import {
  countLibraryTables,
  statsCacheControl,
  type LibraryCountClient,
  type LibraryStats,
} from "@/lib/library/libraryStats";

/**
 * GET /api/library/stats → { data: { laws, articles, principles, decrees } }
 *
 * Real row counts of whichever database this deployment points at (the cloud
 * project today, the self-hosted instance after cutover), for the public
 * counters in SocialProof, CommunityHighlights, LegalLibraryBanner, /about,
 * /ai and /login. Display rules and labels live in src/lib/library/libraryStats.ts.
 *
 * CLIENT. A cookie-less anon client, so the counts are what RLS lets a guest
 * see. The cookie-bound createClient() in src/lib/supabase/server.ts cannot be
 * used here: cookies() is rejected inside unstable_cache, and a signed-in
 * admin's session would otherwise fill the SHARED cache with counts other
 * visitors cannot see.
 *
 * CACHE. ~24h server-side (unstable_cache), keyed on the Supabase host so the
 * cutover can never serve the previous database's counts. A failed count
 * throws, and unstable_cache does not store a throw — the next request
 * retries instead of pinning an error (or a 0) for a day.
 */

const REVALIDATE_SECONDS = 24 * 60 * 60;

function supabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || "unset";
  } catch {
    return "unset";
  }
}

const readStats = (host: string): Promise<LibraryStats> =>
  unstable_cache(
    async () => {
      const client = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      return countLibraryTables(client as unknown as LibraryCountClient);
    },
    ["library-stats-v1", host],
    { revalidate: REVALIDATE_SECONDS, tags: ["library-stats"] },
  )();

export async function GET() {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const stats = await readStats(supabaseHost());
    // libraryGate() already made the one decision that matters for access:
    // a closed library sends every non-admin a 503 before this line ever
    // runs, so reaching here while closed means the caller is an admin. A
    // second, cheap status read tells us which case we are in, so the
    // Cache-Control on this SAME 200 body can differ: normally it is safe in
    // a shared cache for every visitor, but while closed it must never sit
    // in one — a CDN or nginx layer would otherwise replay these counts to
    // the very next (non-admin) guest. See statsCacheControl in
    // src/lib/library/libraryStats.ts.
    const { closed } = await getLibraryStatus();
    return NextResponse.json(
      { data: stats },
      { headers: { "Cache-Control": statsCacheControl(closed) } },
    );
  } catch (err) {
    console.error("[Library Stats API] count failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "تعذّر جلب إحصاءات المكتبة حالياً" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
