import { NextResponse } from "next/server";
import { CLIENT_SERVICE_CATALOG } from "@/constants/clientServiceCatalog";
import {
  mergeAdminPricingCatalogRows,
  type AdminPricingCatalogRow,
} from "@/lib/pricingRepository";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fallback() {
  return NextResponse.json({
    source: "admin-seed",
    catalog: CLIENT_SERVICE_CATALOG,
  });
}

export async function GET() {
  if (!supabaseUrl || !serviceRoleKey) return fallback();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/admin_pricing_catalog?select=*&audience=eq.individual&enabled=eq.true&order=category_id.asc,service_id.asc`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) return fallback();

  const rows = (await response.json()) as AdminPricingCatalogRow[];
  return NextResponse.json({
    source: "backend",
    catalog: mergeAdminPricingCatalogRows(rows),
  });
}
