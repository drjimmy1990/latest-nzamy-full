/**
 * The four company flags the server stores (business_profiles.metadata.features),
 * edited and saved in the console's «إدارة الشركات» tab (PATCH
 * /api/v1/admin/corporates). Everything else on /dashboard/admin/business is
 * this browser's localStorage only.
 *
 * Only `import type`: `node --test` loads this file (serverFlags.test.ts).
 */
import type { CompanyFeatures } from "@/hooks/useAdminSettings";

export const SERVER_COMPANY_FLAGS = ["hasSecondment", "hasLitigation", "hasMarketplace", "hasGovernance"] as const;
export type ServerCompanyFlag = (typeof SERVER_COMPANY_FLAGS)[number];

export function isServerCompanyFlag(key: string): key is ServerCompanyFlag {
  return (SERVER_COMPANY_FLAGS as readonly string[]).includes(key);
}

/**
 * The profile the editor shows: its own profile (stored locally, or the
 * defaults), with the server's four flags over it.
 *
 * A stored local profile used to win outright, so once an admin had edited a
 * company here, a later change to those flags in «إدارة الشركات» never showed
 * on this page (N19, fix plan 2026-10-16). A flag the server does not carry as
 * a boolean leaves the profile's value alone.
 */
export function withServerFlags(
  profile: CompanyFeatures,
  server: Partial<Record<ServerCompanyFlag, unknown>> | undefined,
): CompanyFeatures {
  const out = { ...profile };
  for (const key of SERVER_COMPANY_FLAGS) {
    const value = server?.[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}
