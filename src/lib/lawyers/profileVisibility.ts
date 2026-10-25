/**
 * Profile section switches (N3.8, migration 20261025_50): «الخدمات»,
 * «المؤهلات العلمية» and «المحاكم» on the public lawyer profile.
 *
 * The switches are read in their OWN query, never inside the profile's wider
 * select — the founder_badge rule (./founderBadge.ts): before the user runs
 * 20261025_50 the columns are absent, and naming them next to other columns
 * would fail the whole profile with 42703. Here an error or a throw reads as
 * "every section shown", which is also the columns' default.
 *
 * What this does NOT govern: the licence and bar association (they follow
 * show_contact) and reviews (clients' words; never hideable).
 *
 * Pure (no imports), so profileVisibility.test.ts runs it under `node --test`.
 */

export interface ProfileVisibility {
  services: boolean;
  education: boolean;
  courts: boolean;
}

export const ALL_SECTIONS_SHOWN: ProfileVisibility = { services: true, education: true, courts: true };

export const PROFILE_VISIBILITY_COLUMNS = "show_services, show_education, show_courts";

interface VisibilityRead {
  data: unknown;
  error: { code?: string; message: string } | null;
}

let logged = false;

function logOnce(tag: string, detail: unknown): void {
  if (logged) return;
  logged = true;
  console.warn(`[${tag}] profile section switches unreadable, showing every section:`, detail);
}

export async function profileVisibilityFrom(query: PromiseLike<VisibilityRead>, tag: string): Promise<ProfileVisibility> {
  try {
    const { data, error } = await query;
    if (error) {
      logOnce(tag, `${error.code ?? ""} ${error.message}`.trim());
      return { ...ALL_SECTIONS_SHOWN };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      services: row.show_services !== false,
      education: row.show_education !== false,
      courts: row.show_courts !== false,
    };
  } catch (err) {
    logOnce(tag, err);
    return { ...ALL_SECTIONS_SHOWN };
  }
}

/**
 * Applies the switches to the GET /api/v1/lawyers/[id] row in place. A hidden
 * section becomes an empty list — not `null`, which on that route means "the
 * read failed" — and its raw column is removed from the embedded
 * `lawyer_profiles` object too, so the value never reaches the browser.
 * `hiddenSections` is sent only when something is hidden.
 */
export function applyProfileVisibility(
  row: Record<string, unknown>,
  lp: Record<string, unknown> | undefined,
  v: ProfileVisibility,
): void {
  const hidden: string[] = [];
  if (!v.services) {
    row.services = [];
    hidden.push("services");
  }
  if (!v.education) {
    row.education = [];
    if (lp) delete lp.education;
    hidden.push("education");
  }
  if (!v.courts) {
    row.courts = [];
    if (lp) delete lp.courts;
    hidden.push("courts");
  }
  if (hidden.length > 0) row.hiddenSections = hidden;
}
