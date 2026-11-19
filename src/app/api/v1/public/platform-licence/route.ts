import { NextResponse } from "next/server";
import { licenceLineAr, licenceLineEn } from "@/lib/publicSeo/platformRegistry";
import { loadPlatformRegistry } from "@/lib/publicSeo/platformRegistryServer";

/**
 * GET /api/v1/public/platform-licence — the footer's licence line (owner file
 * 20 row 4, batch l9): `{ lineAr, lineEn }`, each null while the admin setting
 * license_number is empty (the footer then prints nothing). Public data only
 * (what /faq prints), the same for every visitor, rebuilt every 5 minutes.
 */
export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  const registry = await loadPlatformRegistry();
  return NextResponse.json(
    { lineAr: licenceLineAr(registry), lineEn: licenceLineEn(registry) },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
