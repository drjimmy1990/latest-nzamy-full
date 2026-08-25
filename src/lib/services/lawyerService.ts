/**
 * lawyerService.ts
 * ─────────────────────────────────────────────────────────
 * Lawyer browsing service — fetches verified lawyers from the API.
 */

"use client";

import { apiGet } from "@/lib/services/api";
import type { Lawyer } from "@/app/dashboard/client/find-lawyer/data";

// Re-export the Lawyer type for consumers
export type { Lawyer as LawyerProfile };

// ─── Raw API row shapes ─────────────────────────────────────────────────────
// /api/v1/lawyers and /api/v1/lawyers/[id] both return raw Supabase join rows
// (snake_case `profiles` columns + a nested `lawyer_profiles` relation) — NOT
// the `Lawyer` shape below. mapRawLawyerRow() below is the one place that
// reconciles the two, so every consumer of this service gets real `Lawyer`
// objects instead of an untransformed DB row wearing the type as a cast.
interface RawLawyerProfile {
  specialties?: string[] | null;
  years_experience?: number | null;
  hourly_rate?: number | null;
  bio_ar?: string | null;
  bio_en?: string | null;
  verification_status?: string | null;
  is_accepting_clients?: boolean | null;
}

interface RawLawyerRow {
  id?: string | null;
  display_name?: string | null;
  display_name_en?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  // Supabase returns the joined row as an object for a to-one relation, but
  // an array in some query shapes — the API route itself defends against
  // both (see LAWYER-6.1 in the route), so this service does too.
  lawyer_profiles?: RawLawyerProfile | RawLawyerProfile[] | null;
}

// Arabic display label per specialty key. The DB only stores the key
// (`lawyer_profiles.specialties: text[]`) — there is no label/rating/review
// column anywhere in the schema, so those fields default to honest
// zero/empty values below rather than fabricated numbers.
const SPECIALTY_LABELS: Record<string, string> = {
  labor: "عمالي",
  commercial: "تجاري",
  "real-estate": "عقاري",
  family: "أسرة",
  criminal: "جنائي",
  ip: "ملكية فكرية",
  civil: "مدني",
  corporate: "شركات",
};

function fallbackAvatarUrl(name: string): string {
  const label = name || "محامٍ";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=0B3D2E&color=C8A762&size=128&bold=true&font-size=0.4`;
}

/** Maps a raw Supabase join row (profiles + lawyer_profiles) to the typed `Lawyer` shape. */
function mapRawLawyerRow(row: unknown): Lawyer {
  const r = (row ?? {}) as RawLawyerRow;
  const lpRaw = r.lawyer_profiles;
  const lp: RawLawyerProfile = (Array.isArray(lpRaw) ? lpRaw[0] : lpRaw) ?? {};

  const name = r.display_name || r.display_name_en || "";
  const specialties = lp.specialties ?? [];
  const specialtyKey = specialties[0] ?? "";
  const rate = lp.hourly_rate ?? 0;

  return {
    id: r.id ?? "",
    name,
    specialty: SPECIALTY_LABELS[specialtyKey] ?? specialtyKey,
    specialtyKey,
    city: r.city ?? "",
    // No reviews/ratings table is wired up yet — honest zeros, never fabricated.
    rating: 0,
    reviewCount: 0,
    experienceYears: lp.years_experience ?? 0,
    available: lp.is_accepting_clients ?? false,
    verified: lp.verification_status === "verified",
    priceMin: rate,
    priceMax: rate,
    expertise: specialties,
    avatar: r.avatar_url || fallbackAvatarUrl(name),
    // No response-time tracking exists yet — empty, not an invented promise.
    responseTime: "",
    successRate: 0,
    consultationsCount: 0,
    bio: lp.bio_ar || lp.bio_en || "",
  };
}

// ─── API types ────────────────────────────────────────────────────────────────

interface LawyerListResponse {
  lawyers: RawLawyerRow[];
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

export interface LawyerFilters {
  specialty?: string;
  city?: string;
  sort?: "rating" | "price" | "experience";
  available?: boolean;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLawyers(
  filters?: LawyerFilters,
): Promise<Lawyer[]> {
  try {
    // API only supports 'price' and 'experience' sort — map 'rating' to 'experience'
    const sortParam = filters?.sort === "rating" ? "experience" : filters?.sort;
    const response = await apiGet<LawyerListResponse>("/api/v1/lawyers", {
      specialty: filters?.specialty,
      city: filters?.city,
      sort: sortParam,
      available: filters?.available,
    });
    return (response.lawyers ?? []).map(mapRawLawyerRow);
  } catch (error) {
    console.warn("[Nzamy] Failed to fetch lawyers:", error);
    return [];
  }
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
