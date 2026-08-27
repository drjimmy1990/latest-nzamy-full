/**
 * lawyerService.ts
 * ─────────────────────────────────────────────────────────
 * Lawyer browsing service — fetches verified lawyers from the API.
 */

"use client";

import { apiGet } from "@/lib/services/api";
import { toDirectoryLawyers } from "@/lib/services/lawyerDirectory";
import type {
  DirectoryLawyer,
  DirectoryLawyerRow,
} from "@/lib/services/lawyerDirectory";
import type { Lawyer } from "@/app/dashboard/client/find-lawyer/data";

// Re-export the Lawyer type for consumers
export type { Lawyer as LawyerProfile };
export type { DirectoryLawyer };

// ─── API types ────────────────────────────────────────────────────────────────

/**
 * What GET /api/v1/lawyers really answers with: PROFILE rows carrying an
 * embedded `lawyer_profiles`. It was typed `Lawyer[]` here — the mock-directory
 * interface — which made `getLawyers()` a cast rather than a mapping and left
 * every field the card read `undefined` at runtime.
 */
interface LawyerListResponse {
  lawyers: DirectoryLawyerRow[];
  total: number;
}

/**
 * The ACTUAL shape of GET /api/v1/lawyers/[id] — the allow-list projection in
 * src/app/api/v1/lawyers/[id]/route.ts, nothing more.
 *
 * This type exists because the old one was a lie: the detail response was typed
 * as `Lawyer`, the mock-directory interface carrying `rating`, `reviewCount`,
 * `successRate`, `consultationsCount` and `responseTime`. None of those columns
 * exist — there is no ratings table, no reviews table and no case-outcome data
 * anywhere in the schema — so every one of those fields was `undefined` at
 * runtime while the compiler swore they were numbers.
 *
 * Everything below is optional in practice. Measured against production: of the
 * 5 lawyer rows, 4 have zero specialties, `years_experience = 0` and an empty
 * bio. A near-empty profile is the COMMON case, not the edge case — consumers
 * must omit, never render a zero.
 */
export interface PublicLawyerProfile {
  id: string;
  display_name: string | null;
  display_name_en: string | null;
  avatar_url: string | null;
  city: string | null;
  country_code: string | null;
  created_at: string | null;
  lawyer_profiles: {
    user_id: string;
    specialties: string[] | null;
    years_experience: number | null;
    hourly_rate: number | null;
    bio_ar: string | null;
    bio_en: string | null;
    is_accepting_clients: boolean | null;
    /**
     * These two are regulated credential data. The route DELETES both keys
     * server-side unless the lawyer set `show_contact`, so they are genuinely
     * optional — `undefined` means "withheld", and the UI must render no label
     * at all rather than an empty one.
     */
    bar_association?: string | null;
    license_number?: string | null;
  } | null;
}

/**
 * Three outcomes, deliberately distinguished — but only two of them are about
 * the lawyer.
 *
 *   "not-found" — the API answered 404. It uses ONE body for "no such lawyer",
 *                 "not verified" and "not listed" so that nobody can enumerate
 *                 which accounts exist, and this client keeps that collapse
 *                 intact: there is no field here to tell them apart.
 *   "error"     — the request never got an answer, or got a 5xx. A different
 *                 situation with a different remedy (retry), and conflating it
 *                 with 404 would tell a visitor that a real lawyer does not
 *                 exist because a network hiccup.
 */
export type PublicLawyerResult =
  | { status: "ok"; lawyer: PublicLawyerProfile }
  | { status: "not-found" }
  | { status: "error" };

// ─── Filter types ─────────────────────────────────────────────────────────────

/**
 * `sort` used to accept "rating", which the caller then had to translate to
 * "experience" because the route has no such ordering — there is no ratings
 * table to order by. Offering an option that silently becomes a different one
 * is how «الأعلى تقييماً» ended up on screen sorting by years of practice.
 *
 * `city` is likewise gone: the route (src/app/api/v1/lawyers/route.ts) reads
 * `specialty`, `sort`, `available`, `limit` and `offset` and NOTHING else, so
 * `city` was serialised into the query string and discarded by the server
 * while the UI showed a city chip as active. The directory filters by city on
 * the client instead, over rows it actually holds.
 */
export interface LawyerFilters {
  specialty?: string;
  sort?: "price" | "experience";
  available?: boolean;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * The public directory, MAPPED — see src/lib/services/lawyerDirectory.ts for
 * why the view model has no rating, review count, success rate, consultation
 * count or response time.
 *
 * THROWS on a failed request instead of returning `[]`.
 *
 * The old body caught everything and handed back an empty array, which
 * collapsed two different facts into one screen: "no lawyer has published a
 * public profile" and "we could not reach the server". The directory's empty
 * state names the first of those, so on any network hiccup the page told the
 * client something about the profession that it had not actually checked. The
 * page has always had a `.catch()` and a `fetchError` state; this is what makes
 * that branch reachable.
 */
export async function getLawyers(
  filters?: LawyerFilters,
): Promise<DirectoryLawyer[]> {
  const response = await apiGet<LawyerListResponse>("/api/v1/lawyers", {
    specialty: filters?.specialty,
    sort: filters?.sort,
    available: filters?.available,
  });
  return toDirectoryLawyers(response?.lawyers);
}

/**
 * PostgREST returns an embedded to-one relationship either as an object or as a
 * single-element array depending on how it resolves the relationship — the
 * route normalises it for its own consent check but forwards the row as-is, so
 * normalise again here rather than assuming.
 */
function normalizeEmbedded(row: Record<string, unknown>): PublicLawyerProfile {
  const embedded = row.lawyer_profiles;
  const lp = Array.isArray(embedded) ? embedded[0] : embedded;
  return { ...row, lawyer_profiles: lp ?? null } as PublicLawyerProfile;
}

/**
 * Fetch one lawyer's PUBLIC profile, distinguishing "not published" from
 * "could not ask".
 *
 * This does its own `fetch` instead of going through `apiGet` for one reason:
 * `apiGet` throws a bare `Error` carrying the response *body* and discards the
 * status code, so a caller cannot tell 404 from 500. The public profile page
 * has to — a 404 is a final answer and a 500 deserves a retry button.
 */
export async function getPublicLawyerProfile(
  id: string,
): Promise<PublicLawyerResult> {
  try {
    const response = await fetch(`/api/v1/lawyers/${encodeURIComponent(id)}`, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      cache: "no-store",
    });

    if (response.status === 404) return { status: "not-found" };

    if (!response.ok) {
      console.warn(`[Nzamy] Lawyer ${id} returned HTTP ${response.status}`);
      return { status: "error" };
    }

    const body = (await response.json()) as { data?: Record<string, unknown> };
    // A 200 with no row is not something this route does, but treating a body
    // we cannot read as "no such lawyer" would be a lie about the lawyer; it is
    // a failure on our side.
    if (!body?.data) return { status: "error" };

    return { status: "ok", lawyer: normalizeEmbedded(body.data) };
  } catch (error) {
    // Network failure, offline, aborted, unparseable JSON.
    console.warn(`[Nzamy] Failed to fetch lawyer ${id}:`, error);
    return { status: "error" };
  }
}

/**
 * Legacy shape adapter, kept for the consultation intake
 * (src/app/dashboard/client/consultation/new/page.tsx:129) which stores the
 * result in a `LawyerProfile` state and renders `selectedLawyer.name`.
 *
 * It used to hand back the raw API row cast to `Lawyer`. Since the API has
 * never returned a `name` key, that screen rendered «حجز استشارة مع undefined»
 * and submitted `lawyerName: undefined` for every real lawyer id. The mapping
 * below is what fixes that.
 *
 * ⚠️ The `Lawyer` interface has five fields with NO BACKEND ANYWHERE — `rating`,
 * `reviewCount`, `successRate`, `consultationsCount`, `responseTime`. They are
 * zeroed/blanked here because the interface demands them, NOT because the value
 * is known. Do not render them off this object: a zero win-rate or a zero
 * rating displayed next to a named, licensed advocate is a fabricated
 * professional claim in exactly the way an invented one is. Today's only
 * consumer reads `id`, `name` and `specialty`; keep it that way.
 */
export async function getLawyerById(id: string): Promise<Lawyer | null> {
  const result = await getPublicLawyerProfile(id);
  if (result.status !== "ok") return null;

  const p = result.lawyer;
  const lp = p.lawyer_profiles;
  const specialties = lp?.specialties ?? [];

  return {
    id: p.id,
    name: p.display_name ?? p.display_name_en ?? "",
    specialty: specialties[0] ?? "",
    specialtyKey: "",
    city: p.city ?? "",
    experienceYears: lp?.years_experience ?? 0,
    // The route only ever returns verified + marketplace_visible rows, so this
    // one IS a real claim rather than a placeholder.
    available: lp?.is_accepting_clients ?? false,
    verified: true,
    priceMin: lp?.hourly_rate ?? 0,
    priceMax: lp?.hourly_rate ?? 0,
    expertise: specialties,
    avatar: p.avatar_url ?? "",
    bio: lp?.bio_ar ?? lp?.bio_en ?? "",
    // ── No backend. See the warning above. ──
    rating: 0,
    reviewCount: 0,
    successRate: 0,
    consultationsCount: 0,
    responseTime: "",
  };
}
