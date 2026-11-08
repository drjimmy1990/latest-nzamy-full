import { getSector } from "@/lib/murshid/murshidStore";
import { murshidError, murshidJson } from "../../_cache";

/**
 * GET /api/v1/murshid/sectors/[n] — one sector's procedure cards (public
 * projection: https-only links, no test records, no statute quotes). `n` is
 * the sector number; anything but a plain integer that names a sector is 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  if (!/^\d{1,2}$/.test(n)) return murshidError("القطاع غير موجود", 404);
  try {
    const sector = getSector(Number(n));
    if (!sector) return murshidError("القطاع غير موجود", 404);
    return murshidJson({ sector });
  } catch (err) {
    console.error("[murshid] sector failed", err);
    return murshidError("تعذّر تحميل القطاع", 500);
  }
}
