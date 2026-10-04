/**
 * _profileParam.ts — what the `[slug]` segment of /lawyers/[slug] names.
 * Pure, so _profileParam.test.ts runs it under `node --test`.
 *
 * The segment is either a `profiles.id` UUID (the fallback link, and every
 * link written before Phase 7) or the lawyer's chosen `lawyer_profiles.slug`.
 * GET /api/v1/lawyers/[id] resolves both the same way: a real UUID shape
 * looks up the id, anything else looks up the slug. The page's server gate
 * ([slug]/layout.tsx) must agree with that route exactly, or a published
 * lawyer's slug link would 404 there while the API would have found him —
 * which is what happened before: the gate only accepted a loose 36-character
 * id pattern, so every slug link was treated as «غير متاح».
 *
 * Unlike the route, anything that is neither shape is answered here without
 * touching the database: no stored slug can fail SLUG_RE (the column's CHECK
 * constraint is the same rule), so such a value cannot match a row.
 */

import { SLUG_RE } from "../../../lib/services/lawyerProfileFields.ts";

/** A real UUID shape (8-4-4-4-12 hex) — the same pattern as the API route's UUID_RE. */
export const PROFILE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProfileParam =
  | { kind: "id"; value: string }
  | { kind: "slug"; value: string };

export function classifyProfileParam(raw: string | null | undefined): ProfileParam | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (PROFILE_UUID_RE.test(value)) return { kind: "id", value: value.toLowerCase() };
  if (SLUG_RE.test(value)) return { kind: "slug", value };
  return null;
}
