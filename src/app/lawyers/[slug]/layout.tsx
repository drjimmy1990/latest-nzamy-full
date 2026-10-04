/**
 * /lawyers/[slug] — the server gate and per-profile SEO metadata.
 *
 * ─── The gate (owner Q151, 2026-10-03) ───────────────────────────────────────
 * The directory stays closed during the beta, but a lawyer may share his OWN
 * profile by link and QR, so this page is no longer redirected away
 * (src/app/lawyers/layout.tsx). What makes that safe is this file: the layout
 * renders the page only for a PUBLISHED profile — verified AND
 * marketplace_visible, exactly the public API's gate — and calls `notFound()`
 * (a real 404, `noindex` included) when the id/slug names nothing published.
 * The client page underneath never gets to ask the API about an unpublished
 * profile from a shared link. If the lookup itself FAILS (missing env, a
 * PostgREST error) the page is rendered anyway: its own fetch then shows the
 * «تعذّر التحميل» retry state, which is the honest answer to an outage — a 404
 * would tell the visitor this lawyer does not exist.
 *
 * During the beta a published profile is `noIndex`: it is reachable by the
 * link the lawyer hands out, not something search engines should list while
 * the owner keeps the directory closed for privacy.
 *
 * ─── Why this file exists ─────────────────────────────────────────────────────
 * The only metadata in this subtree was the directory-level export in
 * src/app/lawyers/layout.tsx: one title («تصفح المحامين السعوديين المعتمدين»)
 * and one canonical (`/lawyers`). Metadata merges per-field down the segment
 * chain, so /lawyers/<id-A> and /lawyers/<id-B> both presented as the directory
 * page and both declared the SAME canonical URL — every profile a duplicate of
 * the listing, and of each other. The sibling `page.tsx` is a Client Component
 * and therefore cannot export `generateMetadata`; a Server Component layout can,
 * so the metadata lives here.
 *
 * ─── The part that actually matters: DO NOT LEAK A NAME ───────────────────────
 * GET /api/v1/lawyers/[id] returns ONE 404 body for "no such lawyer", "not
 * verified" and "not listed", deliberately, so that nobody can enumerate which
 * accounts exist or what state they are in. A `<title>` carrying the lawyer's
 * name would defeat that from the other side — the page head would confirm the
 * account exists even while the body renders «غير متاح».
 *
 * So this file resolves through the SAME gate the public API applies, and the
 * gate is enforced TWICE:
 *
 *   1. in the query — `lawyer_profiles!inner(...)` plus the two `.eq()` filters,
 *      exactly as src/app/api/v1/lawyers/[id]/route.ts does;
 *   2. in code — `verification_status === "verified" && marketplace_visible
 *      === true` re-checked on the embedded row before a name is read.
 *
 * (2) is not redundant. `.eq("lawyer_profiles.verification_status", ...)` only
 * excludes the PARENT row because the projection says `!inner`; drop or mistype
 * that hint and PostgREST nulls the embed and still hands back the `profiles`
 * row — display_name included. Since this query is a duplicate of the route's
 * rather than a shared helper, the gate must not depend on getting one
 * PostgREST modifier right. If either check fails, the neutral branch is taken
 * and no name is ever touched.
 *
 * ─── What is NOT projected here, on purpose ───────────────────────────────────
 * `license_number`, `bar_association`, `hourly_rate`, `email`, `phone`. The API
 * route deletes the credential columns unless the lawyer set `show_contact`;
 * there is no such stripping in a layout, and a licence number or an hourly rate
 * inside a `<title>` or an `og:description` would bypass that deletion
 * completely. The description is built from city, specialties, years of
 * experience and the bio — nothing else.
 *
 * ─── Production reality: the fallback IS the normal path ──────────────────────
 * All 5 lawyer rows in production are `verification_status = 'pending'` with
 * `marketplace_visible = false`, so TODAY EVERY profile takes the neutral
 * branch — and, since the gate above, a 404. It is written as the common
 * case: it names nobody, it is `noIndex`, and every path through it —
 * malformed id, missing env, PostgREST error, thrown client — ends in a
 * returned Metadata object rather than a 500.
 *
 * The neutral branch keeps a SELF-canonical (`/lawyers/<slug>`) rather than
 * pointing at `/lawyers`: `noindex` combined with a cross-canonical is
 * contradictory signalling, and the slug is already in the URL the visitor
 * requested, so echoing it back leaks nothing.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { buildMetadata } from "@/lib/seo";
import { createServiceClient } from "@/lib/supabase/server";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
import { classifyProfileParam } from "./_profileParam";

/**
 * The allow-list projection — a strict subset of the route's PUBLIC_COLUMNS.
 * The two gate columns are projected so the check below can be made in code,
 * not just delegated to PostgREST.
 */
const METADATA_COLUMNS =
  "id, display_name, display_name_en, city, " +
  "lawyer_profiles!inner(user_id, slug, specialties, years_experience, bio_ar, bio_en, " +
  "verification_status, marketplace_visible)";

interface GateRow {
  display_name: string | null;
  display_name_en: string | null;
  city: string | null;
  specialties: string[];
  yearsExperience: number;
  bioAr: string;
  bioEn: string;
}

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Keep a description inside the ~160 characters search engines display. */
function truncate(text: string, max = 155): string {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Metadata for a profile that is NOT published (the layout then 404s) or
 * could not be looked up (the page then shows its retry state). Names nobody,
 * states nothing about whether the account exists, and is not indexable.
 */
function unavailableMetadata(slug: string): Metadata {
  return buildMetadata({
    titleAr: "الملف الشخصي غير متاح",
    titleEn: "Profile Not Available",
    descriptionAr: "هذا الملف الشخصي غير متاح للعرض العام على منصة نظامي.",
    descriptionEn: "This profile is not publicly available on Nzamy.",
    path: `/lawyers/${encodeURIComponent(slug)}`,
    noIndex: true,
  });
}

/**
 * What the gate learned. `not-found` collapses "no such lawyer", "not
 * verified" and "not listed" into one answer, exactly as the API route
 * collapses them into one 404 body — nothing about the reason reaches a
 * `<title>` or the 404 page. A published lawyer with no name is still
 * PUBLISHED (the page renders him as «محامٍ موثّق», and the share modal hands
 * out his link on the same two conditions); only his `<title>` is neutral. `error` is kept apart: the
 * question could not be asked, which is not an answer about the lawyer.
 */
type GateResult =
  | { status: "published"; row: GateRow }
  | { status: "not-found" }
  | { status: "error" };

/**
 * Metadata for a PUBLISHED profile whose lawyer has not entered a name. The
 * page renders («محامٍ موثّق»), so it must not say «غير متاح»; it names nobody
 * and is not indexable.
 */
function namelessMetadata(slug: string): Metadata {
  return buildMetadata({
    titleAr: "ملف محامٍ موثّق",
    titleEn: "Verified Lawyer Profile",
    descriptionAr: "ملف مهني لمحامٍ موثّق على منصة نظامي.",
    descriptionEn: "A verified lawyer's profile on Nzamy.",
    path: `/lawyers/${encodeURIComponent(slug)}`,
    noIndex: true,
  });
}

/**
 * Resolve the lawyer through the public gate. Wrapped in React `cache()` so
 * `generateMetadata` and the layout below share ONE query per request.
 */
const resolvePublishedLawyer = cache(async (slug: string): Promise<GateResult> => {
  // Id or slug, decided the way GET /api/v1/lawyers/[id] decides it (see
  // _profileParam.ts). Neither shape → not-found without touching the
  // database, so Postgres' uuid parser is never handed junk.
  const param = classifyProfileParam(slug);
  if (!param) return { status: "not-found" };

  try {
    const supabase = await createServiceClient();

    let query = supabase
      .from("profiles")
      .select(METADATA_COLUMNS)
      .eq("user_type", "lawyer")
      .eq("lawyer_profiles.verification_status", "verified")
      .eq("lawyer_profiles.marketplace_visible", true);
    query = param.kind === "id"
      ? query.eq("id", param.value)
      : query.eq("lawyer_profiles.slug", param.value);

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[lawyers/[slug] gate]", error.message);
      return { status: "error" };
    }
    if (!data) return { status: "not-found" };

    const row = data as unknown as Record<string, unknown>;

    // PostgREST returns an embedded to-one either as an object or as a
    // single-element array depending on how it resolves the relationship.
    const embedded = row.lawyer_profiles;
    const lp = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | Record<string, unknown>
      | undefined;

    // ── The gate, re-asserted in code. See the header comment. ──
    if (!lp) return { status: "not-found" };
    if (lp.verification_status !== "verified") return { status: "not-found" };
    if (lp.marketplace_visible !== true) return { status: "not-found" };
    // A slug link must name THIS row's slug — the embed filter alone is the
    // one PostgREST modifier the header warns about trusting.
    if (param.kind === "slug" && lp.slug !== param.value) return { status: "not-found" };

    // A published lawyer with no usable name is not a TITLE — «" - نظامي |
    // Nzamy"» is worse than a neutral one, and most production rows are
    // near-empty — but he is still published, so the page must not 404 (the
    // share modal's "published" is the same two checks, nothing about names).
    // generateMetadata gives him the neutral, noIndex title instead.
    const displayName = clean(row.display_name);
    const displayNameEn = clean(row.display_name_en);

    const specialties = Array.isArray(lp.specialties)
      ? lp.specialties.map(clean).filter(Boolean)
      : [];
    const years = typeof lp.years_experience === "number" ? lp.years_experience : 0;

    return {
      status: "published",
      row: {
        display_name: displayName || null,
        display_name_en: displayNameEn || null,
        city: clean(row.city) || null,
        specialties,
        // Zero is "not recorded", never a claim — the description omits it.
        yearsExperience: years > 0 ? years : 0,
        bioAr: clean(lp.bio_ar),
        bioEn: clean(lp.bio_en),
      },
    };
  } catch (err) {
    // Missing service-role env, network failure, unparseable response. The
    // normal path must not 500.
    console.error("[lawyers/[slug] gate] crash:", err);
    return { status: "error" };
  }
});

/**
 * Build the Arabic description from columns that actually exist. The bio is
 * preferred when the lawyer wrote one; otherwise the real facts are joined, and
 * an empty profile falls back to a sentence that states only what the gate
 * already guarantees. Nothing here is invented and nothing zero-valued is shown.
 */
function describeAr(row: GateRow, name: string): string {
  if (row.bioAr) return truncate(row.bioAr);
  if (row.bioEn) return truncate(row.bioEn);

  const facts: string[] = [];
  if (row.specialties.length) facts.push(`متخصص في ${row.specialties.join("، ")}`);
  if (row.city) facts.push(`يمارس في ${row.city}`);
  if (row.yearsExperience > 0) facts.push(`${row.yearsExperience} سنوات من الخبرة`);

  if (facts.length) return truncate(`${name} — ${facts.join(" · ")}.`);
  return truncate(`الملف الشخصي للمحامي ${name} على منصة نظامي.`);
}

/**
 * The English description is only built when there is English content to build
 * it from. An Arabic-only profile returns `undefined` so `buildMetadata` emits
 * the Arabic description alone, rather than a transliteration nobody wrote.
 */
function describeEn(row: GateRow): string | undefined {
  if (row.bioEn) return truncate(row.bioEn);

  const nameEn = row.display_name_en;
  if (!nameEn) return undefined;

  const facts: string[] = [];
  if (row.city) facts.push(`based in ${row.city}`);
  if (row.yearsExperience > 0) facts.push(`${row.yearsExperience} years of experience`);

  if (facts.length) return truncate(`${nameEn} — ${facts.join(" · ")}.`);
  return truncate(`${nameEn} — verified lawyer profile on Nzamy.`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  // `params` is a Promise in this Next version — every route in this repo
  // awaits it. The folder is `[slug]` but the value is a `profiles.id` UUID;
  // see the note at the top of page.tsx.
  const { slug } = await params;

  const gate = await resolvePublishedLawyer(slug);
  if (gate.status !== "published") return unavailableMetadata(slug);
  const row = gate.row;

  // A published profile with no name gets a neutral title, never an empty one —
  // an empty title is the one output this file must never produce.
  const nameAr = row.display_name ?? row.display_name_en ?? "";
  const nameEn = row.display_name_en;
  if (!nameAr) return namelessMetadata(slug);

  // «محامٍ معتمد» is backed by `verification_status = 'verified'`, which is the
  // platform having checked the licence — the same claim the gate above
  // enforces. It is not a rating, a rank or an outcome.
  const titleAr = `${nameAr} — محامٍ معتمد`;
  const titleEn =
    nameEn && nameEn !== nameAr ? `${nameEn} — Certified Lawyer` : undefined;

  const keywords = Array.from(
    new Set(
      [nameAr, nameEn ?? "", ...row.specialties, row.city ?? ""].filter(Boolean),
    ),
  );

  return buildMetadata({
    titleAr,
    titleEn,
    descriptionAr: describeAr(row, nameAr),
    descriptionEn: describeEn(row),
    // The canonical this whole file exists for: the profile's own URL, not the
    // directory's.
    path: `/lawyers/${encodeURIComponent(slug)}`,
    keywords,
    // Link-only while the directory is closed (owner, Q151) — see the header.
    noIndex: BETA_MONOPOLY_MODE,
  });
}

export default async function LawyerProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Outside any try/catch: notFound() works by throwing.
  const gate = await resolvePublishedLawyer(slug);
  if (gate.status === "not-found") notFound();
  // "published" renders the page; "error" renders it too, so the client
  // page's own fetch can show the retry state instead of a false 404.
  return <>{children}</>;
}
