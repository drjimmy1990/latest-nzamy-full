/**
 * «المحامي المؤسس» (owner ٢١٨ / ٢٢٥) — the tolerant read of
 * `lawyer_profiles.founder_badge`, added by 20261021_50.
 *
 * Each caller builds its own explicit query — `.from("lawyer_profiles")
 * .select("founder_badge")…maybeSingle()`, never `select("*")` and never
 * inside a wider select — and hands it here. Until the user runs that
 * migration the column is absent, so naming it next to other columns would
 * fail the whole read with 42703 (deploy-order rule). Here any error, 42703
 * included, and any throw read as "no badge", logged once per server process.
 *
 * Pure (no imports), so founderBadge.test.ts runs it under `node --test`.
 */

interface FounderBadgeRead {
  data: unknown;
  error: { code?: string; message: string } | null;
}

let logged = false;

function logOnce(tag: string, detail: unknown): void {
  if (logged) return;
  logged = true;
  console.warn(`[${tag}] founder_badge unreadable, showing no badge:`, detail);
}

export async function founderBadgeFrom(query: PromiseLike<FounderBadgeRead>, tag: string): Promise<boolean> {
  try {
    const { data, error } = await query;
    if (error) {
      logOnce(tag, `${error.code ?? ""} ${error.message}`.trim());
      return false;
    }
    return (data as { founder_badge?: unknown } | null)?.founder_badge === true;
  } catch (err) {
    logOnce(tag, err);
    return false;
  }
}
