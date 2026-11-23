import { NextRequest, NextResponse } from "next/server";
import { issuePaths, pdfConfigured } from "@/lib/journal/journal";
import { renderIssueHtml } from "@/lib/journal/journalRender";
import { createHash } from "node:crypto";
import { siteLink } from "@/lib/email/sendEmail";
import { renderIssuePdfCached } from "@/lib/journal/journalPdf";
import { currentUserId, issueViewFor } from "@/lib/journal/journalServer";

/**
 * GET /api/v1/journal/issues/[id]/pdf — the monthly issue as a PDF made on
 * the server (owner Q193 أ; batch l13), through headless Chromium
 * (puppeteer-core + env CHROMIUM_PATH, src/lib/journal/journalPdf.ts).
 *
 * The same view rules as the issue page (issueViewFor): shaped for the
 * requester — a visitor's PDF holds titles and dates only — private, never
 * cached. Without CHROMIUM_PATH (or when the render fails) it sends the
 * reader to the print page, which his browser can save as PDF: an honest
 * fallback, never an error page with nothing to read.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await issueViewFor(id, await currentUserId());
  if (view.kind === "disabled") return NextResponse.json({ error: "المجلة التشريعية قيد التفعيل" }, { status: 404 });
  if (view.kind === "not_found" || view.kind === "schema_missing") return NextResponse.json({ error: "العدد غير موجود" }, { status: 404 });
  if (view.kind === "error") return NextResponse.json({ error: "تعذّر تجهيز العدد الآن" }, { status: 503 });

  const pagePath = issuePaths(view.issue.id).page;
  const pageUrl = siteLink(pagePath) ?? new URL(pagePath, request.url).toString();
  if (!pdfConfigured()) return NextResponse.redirect(pageUrl, 303);

  const html = renderIssueHtml({
    title: view.issue.title,
    periodMonth: view.issue.period_month,
    entries: view.entries,
    viewer: view.viewer,
    forPdf: true,
    preview: view.preview,
  });
  // Busy (another render running), failed or timed out → the print page.
  const key = `${view.issue.id}:${view.viewer}:${createHash("sha256").update(html).digest("hex").slice(0, 16)}`;
  const pdf = await renderIssuePdfCached(key, html);
  if (!pdf) return NextResponse.redirect(pageUrl, 303);

  const name = `nezamy-journal-${view.issue.period_month.slice(0, 7)}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
