import { getNationalChannels, MURSHID_SOURCE_DATE } from "@/lib/murshid/murshidStore";
import { murshidError, murshidJson } from "../_cache";

/** GET /api/v1/murshid/channels — «القنوات الوطنية» (15 unified national channels). Public. */
export async function GET() {
  try {
    return murshidJson({ sourceDate: MURSHID_SOURCE_DATE, channels: getNationalChannels() });
  } catch (err) {
    console.error("[murshid] channels failed", err);
    return murshidError("تعذّر تحميل القنوات الوطنية", 500);
  }
}
