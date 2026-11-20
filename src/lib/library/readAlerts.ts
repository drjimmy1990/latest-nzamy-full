/**
 * readAlerts.ts — the pure half of the staff e-mail for an account put
 * «قيد المراجعة» by the library monitor (batch l11, O19; owner register 14
 * item 67 / file 19: «تنبيه آلي على القراءة غير الطبيعية»).
 *
 * The flags themselves are raised in Postgres (library_monitor_evaluate,
 * 20261201_30) — for every account, admins and test accounts included — and
 * stay in the in-site bell as before. This file turns a claimed flag into one
 * message. The message carries the flag's reference, the rules, the numbers
 * and the admin link — never the reader's name or e-mail.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { renderEmailAr } from "../email/sendEmail.ts";
import { REVIEW_RULE_AR } from "./monitorSettings.ts";

export interface ClaimedFlag {
  reference: string;
  rule: string;
  rules: string[];
  details: Record<string, unknown>;
  actionTaken: string;
  createdAt: string | null;
  userType: string | null;
}

/** library_review_flags_claim_email's rows → typed flags (odd rows dropped). */
export function parseClaimedFlags(body: unknown): ClaimedFlag[] {
  if (!Array.isArray(body)) return [];
  const out: ClaimedFlag[] = [];
  for (const r of body) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.reference !== "string" || typeof o.rule !== "string") continue;
    out.push({
      reference: o.reference,
      rule: o.rule,
      rules: Array.isArray(o.rules) ? o.rules.filter((x): x is string => typeof x === "string") : [o.rule],
      details: o.details && typeof o.details === "object" && !Array.isArray(o.details) ? (o.details as Record<string, unknown>) : {},
      actionTaken: typeof o.action_taken === "string" ? o.action_taken : "notify",
      createdAt: typeof o.created_at === "string" ? o.created_at : null,
      userType: typeof o.user_type === "string" ? o.user_type : null,
    });
  }
  return out;
}

const ACTION_AR: Readonly<Record<string, string>> = {
  notify: "لم يُتخذ إجراء تلقائي — القراءة مستمرة حتى تقرر.",
  slow: "أُبطئت قراءته للمكتبة تلقائياً.",
  lock: "أُوقفت قراءته للمكتبة تلقائياً.",
};

const ACCOUNT_AR: Readonly<Record<string, string>> = {
  admin: "حساب إدارة",
  lawyer: "محامٍ",
  client: "عميل",
  firm: "مكتب",
  corporate: "منشأة",
};

function num(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

/** The numbers behind each rule, as label / value rows. */
function detailRows(f: ClaimedFlag): Array<[string, string | null]> {
  const d = f.details;
  return [
    ["وثائق متتابعة بسرعة", num(d.sequence_docs)],
    ["جلسات قراءة في وقت واحد", num(d.parallel_sessions)],
    ["طلبات في الساعة", num(d.hour_requests)],
    ["بحث في الساعة", num(d.hour_searches)],
    ["وثائق خلال ٧ أيام", num(d.week_docs)],
    ["وثائق اليوم", num(d.docs_today)],
    ["الحد اليومي", num(d.day_limit)],
  ];
}

/** One staff message for one flag. `adminHref` is the absolute admin link or null. */
export function reviewFlagEmail(f: ClaimedFlag, adminHref: string | null): { subject: string; text: string; html: string } {
  const rulesAr = (f.rules.length ? f.rules : [f.rule]).map((r) => REVIEW_RULE_AR[r] ?? r);
  const subject = `نظامي — حساب قيد المراجعة لنشاط غير معتاد في المكتبة (${f.reference})`;
  const { html, text } = renderEmailAr({
    heading: "حساب قيد المراجعة — نشاط غير معتاد في المكتبة",
    paragraphs: [
      `السبب: ${rulesAr.join("، ")}.`,
      ACTION_AR[f.actionTaken] ?? ACTION_AR.notify,
      "راجع الحساب في لوحة الإدارة: «الأمان والحماية» ← «نشاط المكتبة».",
    ],
    details: [
      ["المرجع", f.reference],
      ["نوع الحساب", f.userType ? ACCOUNT_AR[f.userType] ?? f.userType : null],
      ...detailRows(f),
    ],
    action: adminHref ? { label: "فتح نشاط المكتبة", href: adminHref } : null,
    footer: ["وصلتك هذه الرسالة لأن عنوانك في قائمة تنبيهات حماية المكتبة في لوحة الإدارة."],
  });
  return { subject, text, html };
}
