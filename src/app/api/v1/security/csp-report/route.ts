import { CSP_REPORT_MAX_BYTES, parseCspReports, ViolationDeduper, violationKey } from "@/lib/security/cspReport";

/**
 * POST /api/v1/security/csp-report — where the browser sends the report-only
 * Content-Security-Policy's violations (owner file 15 row 43; batch l9). The
 * policy itself stays report-only (owner register 24 / 71): this endpoint only
 * collects the evidence for «a week of clean reports».
 *
 * No sign-in (browsers send these on their own), always 204, never an error
 * page. A body over 16 KB is dropped unread. Each distinct violation is logged
 * once per 10 minutes per server process as one `[csp-report] {…}` line, with
 * URLs reduced to origin + path and ids/tokens masked (src/lib/security/
 * cspReport.ts). The proxy's general write limit (120 a minute per address)
 * applies to it like every POST under /api/v1.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deduper = new ViolationDeduper();
const NO_CONTENT = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > CSP_REPORT_MAX_BYTES) return NO_CONTENT();
    const raw = await request.text();
    for (const v of parseCspReports(raw)) {
      if (deduper.shouldLog(violationKey(v))) console.warn(`[csp-report] ${JSON.stringify(v)}`);
    }
  } catch {
    // a broken report is not worth an error
  }
  return NO_CONTENT();
}
