import { getSectorIndex, MURSHID_SOURCE_DATE } from "@/lib/murshid/murshidStore";
import { murshidError, murshidJson } from "../_cache";

/**
 * GET /api/v1/murshid/sectors — «إجراءات التظلم حسب القطاع»: the 32 sectors
 * with their card counts (no cards). Public; see src/lib/murshid/murshidStore.ts.
 */
export async function GET() {
  try {
    return murshidJson({ sourceDate: MURSHID_SOURCE_DATE, sectors: getSectorIndex() });
  } catch (err) {
    console.error("[murshid] sectors index failed", err);
    return murshidError("تعذّر تحميل القطاعات", 500);
  }
}
