import { NextResponse } from "next/server";

/**
 * «المرشد القضائي» data is static files from the owner's package that change
 * only with a deploy, and it is public (the /ai/procedures page is open to
 * guests), so responses may be cached by the browser and any shared cache for
 * an hour and served stale for a day while revalidating.
 */
export const MURSHID_CACHE = "public, max-age=3600, stale-while-revalidate=86400";

export function murshidJson(body: unknown, status = 200, cache = MURSHID_CACHE): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", cache);
  return res;
}

/** A failure must not be cached. */
export function murshidError(message: string, status: number): NextResponse {
  return murshidJson({ error: message }, status, "no-store");
}
