import { getNajizClassifications, MURSHID_SOURCE_DATE } from "@/lib/murshid/murshidStore";
import { murshidError, murshidJson } from "../_cache";

/**
 * GET /api/v1/murshid/najiz-guide — «دليل ناجز»: the six filing steps and the
 * najiz tree (7 courts → 43 classes → 243 types) as plain data, without the
 * PDF's page references or its tables (N06-4 / N06-5; built from the guide by
 * src/lib/murshid/najizClassifications.ts). Never HTML.
 */
export async function GET() {
  try {
    const { steps, courts } = getNajizClassifications();
    return murshidJson({ sourceDate: MURSHID_SOURCE_DATE, steps, courts });
  } catch (err) {
    console.error("[murshid] najiz guide failed", err);
    return murshidError("تعذّر تحميل دليل ناجز", 500);
  }
}
