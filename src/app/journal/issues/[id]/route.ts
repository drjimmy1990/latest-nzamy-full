import { NextRequest, NextResponse } from "next/server";
import { issuePaths, pdfConfigured } from "@/lib/journal/journal";
import { renderIssueHtml } from "@/lib/journal/journalRender";
import { currentUserId, issueViewFor } from "@/lib/journal/journalServer";

/**
 * GET /journal/issues/[id] — one monthly issue as a print-ready page (owner
 * Q193; batch l13). The link the issue e-mail carries when the server cannot
 * make a PDF, and the PDF's source.
 *
 * Shaped for WHOEVER opens it (Q190 ب): a visitor reads titles and dates, a
 * library subscriber the badge, the effective date and the impact too — so
 * the answer is private and never cached (a subscriber's copy must not be
 * served to a visitor by any cache in between). A draft issue exists only
 * for an admin (preview); the switch off → «قيد التفعيل».
 */
export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

function plainPage(title: string, text: string, status: number) {
  const html =
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title></head><body style="font-family:Tahoma,Arial,sans-serif;padding:32px;line-height:1.8;color:#111;background:#fff">` +
    `<h1 style="font-size:22px">${title}</h1><p>${text}</p><p><a href="/journal">العودة إلى المجلة التشريعية</a></p></body></html>`;
  return new NextResponse(html, { status, headers: HEADERS });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await issueViewFor(id, await currentUserId());
  if (view.kind === "disabled") return plainPage("المجلة التشريعية", "المجلة التشريعية قيد التفعيل.", 404);
  if (view.kind === "not_found" || view.kind === "schema_missing") return plainPage("العدد غير موجود", "لم نجد هذا العدد.", 404);
  if (view.kind === "error") return plainPage("تعذّر عرض العدد", "تعذّر عرض العدد الآن — حاول بعد قليل.", 503);
  const html = renderIssueHtml({
    title: view.issue.title,
    periodMonth: view.issue.period_month,
    entries: view.entries,
    viewer: view.viewer,
    pdfHref: pdfConfigured() ? issuePaths(view.issue.id).pdf : null,
    preview: view.preview,
  });
  return new NextResponse(html, { status: 200, headers: HEADERS });
}
