/**
 * Turn one order into a Markdown brief the admin can read — or paste into an
 * AI assistant — instead of reading raw JSON off the screen.
 *
 * Never includes metadata.internalNotes: that field exists precisely because
 * some notes are not for anyone outside the team, and pasting this document
 * into a third-party assistant is one of its intended uses.
 *
 * ALL ARABIC, INCLUDING THE VALUES.
 * This file used to wrap Arabic headings («## وصف الطلب», «## المرفقات»)
 * around an English core: the intake object was walked generically and each
 * row printed under its raw storage key, so the admin fulfilment panel showed
 * «**contractDesc:** …» and «**complexity:** simple» for an order whose own
 * client page said «وصف العقد» and «مستوى التفصيل: عقد بسيط». Same order, two
 * languages, and the Arabic one was the one nobody on the team could see.
 *
 * The fix is not a second dictionary here — that is how the two drift apart
 * again. The rows, the labels, the values and the suppressions all come from
 * ./intakeValues.ts, the exact module the client page renders, so the admin
 * brief and the client's receipt are the same content in two layouts. This
 * file now only decides Markdown shape.
 *
 * Arabic is right for BOTH of this output's uses, and the AI-paste one is not
 * an argument for keeping English keys: the brief is a human document first
 * (the admin reads it in the queue, copies it, downloads it as .md), and an
 * assistant handed «مستوى التفصيل: عقد بسيط» is better briefed than one handed
 * «complexity: simple», not worse — the Arabic carries the wizard's own
 * meaning where the storage id carries only a machine label.
 */

import { buildSummaryRows, type SummaryField, type SummaryValue } from "./intakeValues.ts";

/**
 * Render one already-resolved value into Markdown lines.
 *
 * Everything interesting — which rows survive, what each is called, what each
 * value says — happened in buildSummaryRows() before this is reached. By here
 * every string is final Arabic.
 */
function renderSummaryValue(value: SummaryValue, depth: number): string[] {
  const pad = "  ".repeat(depth);

  if (value.kind === "text") return [`${pad}${value.text}`];

  if (value.kind === "list") {
    // A list of plain values stays on one line, comma-joined — the same shape
    // this file has always given `targets`, `selectedClauses` and friends. A
    // list holding anything structured falls back to one block per item.
    const texts = value.items.flatMap((item) => (item.kind === "text" ? [item.text] : []));
    if (texts.length === value.items.length) return [`${pad}${texts.join("، ")}`];
    return value.items.flatMap((item) => renderSummaryValue(item, depth));
  }

  return value.fields.flatMap((field) => renderField(field, depth));
}

/**
 * Render one labelled row: `- **الوصف:** …`, or the label alone with its
 * value indented under it when the value does not fit on one line.
 *
 * A nested object is never inlined even when it holds exactly one field.
 * Inlining it produced a stray double bullet — «- **الطرف الأول:** - **الاسم
 * الكامل:** محمد» — which was a pre-existing wart in the old walk, invisible
 * to it because it had no idea whether the line it was about to inline was a
 * value or another row. The typed tree says so outright.
 */
function renderField(field: SummaryField, depth: number): string[] {
  const pad = "  ".repeat(depth);
  const rendered = renderSummaryValue(field.value, depth + 1);

  if (field.value.kind !== "fields" && rendered.length === 1 && !rendered[0].includes("\n")) {
    return [`${pad}- **${field.label}:** ${rendered[0].trim()}`];
  }
  return [`${pad}- **${field.label}:**`, ...rendered];
}

export function buildOrderPrompt(order: {
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}): string {
  const md = order.metadata ?? {};
  const intake = (md.intake as Record<string, unknown> | undefined) ?? {};
  const attachments = Array.isArray(md.attachments) ? md.attachments : [];

  // buildSummaryRows() applies HIDDEN_INTAKE_KEYS, so `attachments`,
  // `schemaVersion` and `service` no longer reach the brief. Nothing is lost:
  // the files are listed under «## المرفقات» below from metadata.attachments,
  // schemaVersion is bookkeeping, and the service name is already the heading
  // — createServiceOrder() writes metadata.serviceTitleAr in the same literal
  // that writes metadata.intake (serviceOrders.ts), so an order that has an
  // intake to print always has that title too.
  //
  // A field with no Arabic label still prints, under its raw key: labelFor()
  // falls back rather than dropping the row. That fallback is the right one
  // HERE specifically — this document is what the team works the order from,
  // and a silently missing answer would have someone fulfil a request without
  // seeing something the client typed. An ugly row is a bug report; an absent
  // row is a mistake nobody notices. It also keeps this brief and the client's
  // receipt identical in coverage, which is the property that makes a
  // divergence like the one above visible the next time.
  const intakeLines = buildSummaryRows(intake).flatMap((row) => renderField(row, 0));

  const lines: string[] = [
    `# ${md.serviceTitleAr ?? "طلب خدمة"} — ${order.title}`,
    "",
    "## وصف الطلب",
    order.description || "—",
    "",
    "## بيانات العميل المُدخلة",
    // An em dash rather than a heading with nothing under it, on the same rule
    // as the description line above.
    ...(intakeLines.length > 0 ? intakeLines : ["—"]),
  ];

  if (attachments.length > 0) {
    lines.push("", "## المرفقات");
    for (const a of attachments as Array<{ name?: string; size?: number }>) {
      const kb = a.size ? ` (${Math.max(1, Math.round(a.size / 1024))} كيلوبايت)` : "";
      lines.push(`- ${a.name ?? "مرفق"}${kb}`);
    }
  }

  lines.push(
    "",
    "---",
    "*هذه البيانات كما أدخلها العميل. الصياغة النهائية مسؤولية الفريق.*",
  );
  return lines.join("\n");
}
