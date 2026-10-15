/**
 * governmentRole — validates the role a government account carries.
 * ─────────────────────────────────────────────────────────────────────────
 * The session reads it from `user_metadata.government_role`, which the account
 * holder can write, and passed it through unchecked. The government dashboard
 * then indexed four role maps with it (`ROLE_META[role].iconEl`), so any value
 * outside the app's four keys crashed the page. The database allows more than
 * four: `government_members.role` accepts judge, prosecutor, officer, counsel,
 * clerk and admin (supabase/migrations/20260603_phase1_002_entities.sql).
 *
 * Rules:
 *   - the app's four keys pass through (trimmed, case-insensitive);
 *   - `counsel` is the database's name for the app's `gov_counsel`;
 *   - anything else — clerk, admin, junk, a non-string — is `undefined`, so
 *     every caller's existing default (`?? "gov_counsel"`, the same default
 *     registration uses) applies instead of a lookup miss.
 *
 * Pure module: the only import is `import type`, which Node's type stripping
 * erases, so `node --test` loads it without the "@/" alias.
 */

import type { GovernmentRole } from "@/hooks/useUser";

export const GOVERNMENT_ROLES: readonly GovernmentRole[] = [
  "judge",
  "prosecutor",
  "officer",
  "gov_counsel",
];

/** Database role names that mean one of the app's roles. A Map, not an object
 *  literal, so a key like "constructor" can never resolve to a prototype member. */
const DB_ROLE_ALIASES: ReadonlyMap<string, GovernmentRole> = new Map([
  ["counsel", "gov_counsel"],
]);

/** The app role a raw value names, or `undefined` when it names none of them. */
export function normalizeGovernmentRole(raw: unknown): GovernmentRole | undefined {
  if (typeof raw !== "string") return undefined;
  const key = raw.trim().toLowerCase();
  if ((GOVERNMENT_ROLES as readonly string[]).includes(key)) return key as GovernmentRole;
  return DB_ROLE_ALIASES.get(key);
}

/** The role to render: a recognised role, otherwise the app-wide default. */
export function resolveGovernmentRole(raw: unknown): GovernmentRole {
  return normalizeGovernmentRole(raw) ?? "gov_counsel";
}
