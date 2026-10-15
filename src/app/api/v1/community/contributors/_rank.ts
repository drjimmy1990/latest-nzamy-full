/**
 * Pure ranking for GET /api/v1/community/contributors — no I/O, so
 * `node --test` can import it.
 *
 * The «أكثر المجيبين» widget on /community printed a hardcoded list
 * (communityData.ts TOP_CONTRIBUTORS: three invented lawyers with
 * 127/89/74 «تقييم»). This ranks real authors by the number of their active
 * answers, and keeps only lawyers whose profile is public — verified AND
 * listed in the directory (`marketplace_visible`), the same consent gate the
 * lawyer directory applies. No rating is shown: nothing backs one.
 */

export interface ContributorGate {
  /** `lawyer_profiles.slug`, when the lawyer chose one. */
  slug: string | null;
}

export interface Contributor {
  name: string;
  slug: string | null;
  answers: number;
}

/** answers rows (`author_id` only) → answer count per author, most first. */
export function tallyAuthors(rows: { author_id?: unknown }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = typeof row.author_id === "string" ? row.author_id : "";
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  // Ties broken by id so the order is stable between requests.
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/**
 * Keep, in tally order, only the authors that passed the public-profile gate
 * AND have a display name — an author without a name is left out, never shown
 * under an invented one.
 */
export function rankContributors(
  tally: [string, number][],
  gate: Map<string, ContributorGate>,
  names: Map<string, string>,
  limit: number,
): Contributor[] {
  const out: Contributor[] = [];
  for (const [id, answers] of tally) {
    if (out.length >= limit) break;
    const g = gate.get(id);
    const name = (names.get(id) ?? "").trim();
    if (!g || !name) continue;
    out.push({ name, slug: g.slug && g.slug.length > 0 ? g.slug : null, answers });
  }
  return out;
}
