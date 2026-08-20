/**
 * Turn one order into a Markdown brief the admin can read — or paste into an
 * AI assistant — instead of reading raw JSON off the screen.
 *
 * Never includes metadata.internalNotes: that field exists precisely because
 * some notes are not for anyone outside the team, and pasting this document
 * into a third-party assistant is one of its intended uses.
 */
function renderValue(v: unknown, depth: number): string[] {
  const pad = "  ".repeat(depth);
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) {
    if (v.length === 0) return [];
    if (v.every((x) => typeof x !== "object")) return [`${pad}${v.join("، ")}`];
    return v.flatMap((x) => renderValue(x, depth));
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, val]) => {
      const rendered = renderValue(val, depth + 1);
      if (rendered.length === 0) return [];
      if (rendered.length === 1 && !rendered[0].includes("\n")) {
        return [`${pad}- **${k}:** ${rendered[0].trim()}`];
      }
      return [`${pad}- **${k}:**`, ...rendered];
    });
  }
  return [`${pad}${String(v)}`];
}

export function buildOrderPrompt(order: {
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}): string {
  const md = order.metadata ?? {};
  const intake = (md.intake as Record<string, unknown> | undefined) ?? {};
  const attachments = Array.isArray(md.attachments) ? md.attachments : [];

  const lines: string[] = [
    `# ${md.serviceTitleAr ?? "طلب خدمة"} — ${order.title}`,
    "",
    "## وصف الطلب",
    order.description || "—",
    "",
    "## بيانات العميل المُدخلة",
    ...renderValue(intake, 0),
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
