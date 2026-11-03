/**
 * clientPricingServer.ts — the ONE server read of admin_pricing_catalog for
 * the client-service catalogue (S6-T3). GET /api/client-pricing serves it to
 * the browser; POST /api/v1/service-requests prices the stored estimate with
 * it (S6-T5). SERVER ONLY: it reads SUPABASE_SERVICE_ROLE_KEY (never import
 * it from a client component).
 *
 * The query reads BOTH audiences: the business variant row
 * (`contract-review-business`, audience 'corporate', migration 20261103_20)
 * travels inside the catalogue and resolveClientService applies it.
 *
 * Disabled rows (coordinator ruling on the S6-T3 stop, 2026-11-03): a row with
 * `enabled = false` is fetched ONLY when an admin hid it on purpose
 * (`metadata.adminHidden = true`, written by the admin toggle together with
 * enabled = false; see adminHiddenPatch in pricingRepository.ts). The 15
 * legacy `enabled = false` rows of the 20260518 seed carry no such flag, so
 * they stay unread and their code entries keep winning, exactly as before —
 * no customer-visible change. A fetched hidden row reaches the merge as
 * `enabled: false`, and the catalogue helpers drop it.
 * The `or` filter with a JSON-path operand was checked live on
 * postgrest/postgrest:v12.2.3 + postgres:16.
 *
 * Relative `.ts` imports only (node --test).
 */
import { CLIENT_SERVICE_CATALOG, type ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import {
  mergeAdminPricingCatalogRows,
  type AdminPricingCatalogRow,
  type PricingCatalogSource,
} from "../pricingRepository.ts";

export const CLIENT_PRICING_REST_QUERY =
  "select=*&audience=in.(individual,corporate)&or=(enabled.eq.true,metadata->>adminHidden.eq.true)&order=category_id.asc,service_id.asc";

function codeCatalog(): { catalog: ClientServiceCatalogItem[]; source: PricingCatalogSource } {
  return { catalog: CLIENT_SERVICE_CATALOG, source: "admin-seed" };
}

/**
 * The client-service catalogue: admin_pricing_catalog merged over the code
 * catalogue. Missing env, a non-ok response, a non-array body or a throw →
 * the code catalogue (source "admin-seed").
 */
export async function loadClientPricingCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<{ catalog: ClientServiceCatalogItem[]; source: PricingCatalogSource }> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return codeCatalog();

  try {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/admin_pricing_catalog?${CLIENT_PRICING_REST_QUERY}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return codeCatalog();
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return codeCatalog();
    return { catalog: mergeAdminPricingCatalogRows(rows as AdminPricingCatalogRow[]), source: "backend" };
  } catch {
    return codeCatalog();
  }
}
