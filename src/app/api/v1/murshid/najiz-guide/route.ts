import { getNajizGuide, MURSHID_SOURCE_DATE } from "@/lib/murshid/murshidStore";
import { murshidError, murshidJson } from "../_cache";

/**
 * GET /api/v1/murshid/najiz-guide — «دليل ناجز» as plain blocks (headings,
 * paragraphs, list items, callouts, tables of strings). Never HTML; see
 * src/lib/murshid/guideBlocks.ts for which part of the file is served.
 */
export async function GET() {
  try {
    return murshidJson({ sourceDate: MURSHID_SOURCE_DATE, blocks: getNajizGuide() });
  } catch (err) {
    console.error("[murshid] najiz guide failed", err);
    return murshidError("تعذّر تحميل دليل ناجز", 500);
  }
}
