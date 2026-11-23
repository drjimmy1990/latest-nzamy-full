/**
 * journalRender.ts — the issue as a print-ready HTML page (also the PDF's
 * source) and the issue e-mail (owner Q192/Q193, batch l13). Server side:
 * it imports the shared e-mail template, so client pages import ./journal.ts
 * instead. Relative imports only, for `node --test`.
 */
import { toArabicDigits } from "../services/hijri.ts";
import { escapeHtml, renderEmailAr, type EmailTemplateInput } from "../email/sendEmail.ts";
import {
  JOURNAL_BADGES,
  cleanSourceUrl,
  dateAr,
  periodLabelAr,
  type JournalViewer,
  type PublicJournalEntry,
} from "./journal.ts";

// ── the issue as a print-ready page (also the PDF's source) ─────────────────

export interface IssueHtmlInput {
  title: string;
  periodMonth: string;
  entries: readonly PublicJournalEntry[];
  viewer: JournalViewer;
  /** The PDF link, when the server can make one. */
  pdfHref?: string | null;
  /** True for the PDF render itself (no "save" hint). */
  forPdf?: boolean;
  /** An admin preview of an issue not yet approved. */
  preview?: boolean;
}

/**
 * A standalone RTL page (A4 print CSS, system fonts, no script, no remote
 * resource): every value is escaped, a link is printed only when it is
 * http(s). The visitor version carries titles and dates only, because it is
 * built from shapeEntryForViewer() output.
 */
export function renderIssueHtml(input: IssueHtmlInput): string {
  const e = escapeHtml;
  const items = input.entries
    .map((it) => {
      const lines: string[] = [];
      lines.push(`<h2>${e(it.title)}</h2>`);
      lines.push(`<p class="meta">تاريخ الخبر: ${e(dateAr(it.publishedOn))}</p>`);
      if (input.viewer === "subscriber") {
        if (it.badge && JOURNAL_BADGES[it.badge]) lines.push(`<p class="badge">${e(JOURNAL_BADGES[it.badge])}</p>`);
        if (it.issuingBody) lines.push(`<p class="meta">الجهة المصدرة: ${e(it.issuingBody)}</p>`);
        if (it.effectiveOn) lines.push(`<p class="meta">تاريخ النفاذ: ${e(dateAr(it.effectiveOn))}</p>`);
        if (it.impactLines && it.impactLines.length) {
          lines.push(`<p class="meta"><strong>الأثر:</strong></p><ul>${it.impactLines.map((l) => `<li>${e(l)}</li>`).join("")}</ul>`);
        }
        const url = cleanSourceUrl(it.sourceUrl);
        if (url) lines.push(`<p class="meta">المصدر: <a href="${e(url)}">${e(url)}</a></p>`);
      }
      return `<article>${lines.join("")}</article>`;
    })
    .join("");

  const notes: string[] = [];
  if (input.preview) notes.push(`<p class="note">معاينة للمسؤول: هذا العدد لم يُعتمد بعد ولا يراه غيرك.</p>`);
  if (input.viewer === "visitor") {
    notes.push(`<p class="note">يرى المشتركون في مكتبة نظامي مع كل خبر شارته وتاريخ نفاذه وأثره.</p>`);
  }
  if (!input.forPdf) {
    notes.push(
      input.pdfHref
        ? `<p class="note screen-only"><a href="${e(input.pdfHref)}">تنزيل العدد بصيغة PDF</a> — أو احفظه من أمر الطباعة في متصفحك.</p>`
        : `<p class="note screen-only">لحفظ العدد بصيغة PDF استخدم أمر الطباعة في متصفحك واختر «حفظ بصيغة PDF».</p>`,
    );
  }

  const body = input.entries.length ? items : `<p>لا توجد أخبار في هذا العدد.</p>`;
  return (
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex">` +
    `<title>${e(input.title)}</title><style>` +
    `@page{size:A4;margin:18mm 16mm}` +
    `body{font-family:Tahoma,"Segoe UI","Noto Naskh Arabic","Noto Sans Arabic",Arial,sans-serif;color:#111;background:#fff;margin:0;padding:24px;line-height:1.8}` +
    `main{max-width:760px;margin:0 auto}` +
    `header{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:18px}` +
    `h1{font-size:24px;margin:0 0 4px}` +
    `.period{color:#333;margin:0}` +
    `article{border-bottom:1px solid #ccc;padding:12px 0;break-inside:avoid}` +
    `h2{font-size:18px;margin:0 0 4px}` +
    `.meta{margin:2px 0;color:#222;font-size:14px}` +
    `.badge{display:inline-block;border:1px solid #111;border-radius:4px;padding:0 8px;margin:4px 0;font-size:13px}` +
    `ul{margin:4px 0 4px 0;padding-right:20px}` +
    `.note{font-size:13px;color:#333}` +
    `a{color:#111}` +
    `@media print{body{padding:0}.screen-only{display:none}}` +
    `</style></head><body><main>` +
    `<header><h1>${e(input.title)}</h1><p class="period">العدد الشهري — ${e(periodLabelAr(input.periodMonth))}</p></header>` +
    notes.join("") +
    body +
    `<footer><p class="note">منصة نظامي — المجلة التشريعية.</p></footer>` +
    `</main></body></html>`
  );
}

// ── the issue e-mail ─────────────────────────────────────────────────────────

/** At most this many titles are listed in the e-mail; the rest are counted. */
export const EMAIL_TITLES_MAX = 25;

export const NEWSLETTER_FOOTER_AR: readonly string[] = [
  "وصلتك هذه الرسالة لأنك فعّلت «النشرة الإخبارية» في إعدادات حسابك على منصة نظامي.",
  "لإيقافها: الإعدادات ← الخصوصية ← النشرة الإخبارية.",
];

export interface IssueEmailInput {
  title: string;
  periodMonth: string;
  /** The visitor view: titles and dates. */
  entries: readonly Pick<PublicJournalEntry, "title" | "publishedOn">[];
  /** Absolute link to the issue page (null without NEXT_PUBLIC_SITE_URL). */
  pageHref: string | null;
  /** Absolute link to the PDF, only when the server can make one. */
  pdfHref: string | null;
}

/** The one message every recipient gets (no per-recipient data inside). */
export function issueEmailMessage(input: IssueEmailInput): { subject: string; html: string; text: string } {
  const listed = input.entries.slice(0, EMAIL_TITLES_MAX);
  const more = input.entries.length - listed.length;
  const paragraphs = [
    `صدر عدد ${periodLabelAr(input.periodMonth)} من مجلة نظامي التشريعية، وفيه ${toArabicDigits(input.entries.length)} من الأخبار التشريعية.`,
    "يرى المشتركون في مكتبة نظامي مع كل خبر شارته وتاريخ نفاذه وأثره عند فتح العدد في المنصة.",
  ];
  if (more > 0) paragraphs.push(`وأخبار أخرى عددها ${toArabicDigits(more)} في العدد نفسه.`);
  if (input.pdfHref && input.pageHref) paragraphs.push(`لقراءة العدد في المتصفح: ${input.pageHref}`);
  const template: EmailTemplateInput = {
    heading: input.title,
    paragraphs,
    details: listed.map((it) => [it.title, dateAr(it.publishedOn)] as const),
    action: input.pdfHref
      ? { label: "تنزيل العدد (PDF)", href: input.pdfHref }
      : input.pageHref
        ? { label: "قراءة العدد", href: input.pageHref }
        : null,
    footer: NEWSLETTER_FOOTER_AR,
  };
  const { html, text } = renderEmailAr(template);
  return { subject: input.title, html, text };
}

/** The e-mail's idempotency key for one recipient (Resend header / SMTP Message-ID seed). */
export function issueEmailKey(issueId: string, userId: string): string {
  return `journal-issue:${issueId}:${userId}`;
}
