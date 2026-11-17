/**
 * P1-37 — «ملخّص القضية» on the lawyer's own letterhead (print / PDF / Word,
 * through LetterheadExportBar). Built ONLY from what the case page has
 * actually read from the server: the case row's header fields, its hearings
 * (GET /api/v1/lawyer/hearings?caseId) and its open deadlines. No notes, no
 * attachments, no amounts. A list that failed to read is said to have failed,
 * never printed as empty.
 *
 * Pure, relative imports only (node --test loads it directly).
 */
import type { DocBlock } from "../../../../lib/docx/ooxml.ts";

export interface CaseSummaryInput {
  title: string;
  typeLabel: string;
  referenceNo: string;
  clientName: string | null;
  court: string | null;
  assignee: string | null;
  filedDate: string | null;
  stage: string | null;
  description: string | null;
  /** null = the read failed; [] = none. Already worded, one line each. */
  hearings: string[] | null;
  deadlines: string[] | null;
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t && t !== "—" ? t : null;
};

export function caseSummaryBlocks(c: CaseSummaryInput): DocBlock[] {
  const facts = [
    ["نوع الطلب", c.typeLabel],
    ["رقم المرجع", c.referenceNo],
    ["الموكّل", c.clientName],
    ["المحكمة", c.court],
    ["المحامي المكلّف", c.assignee],
    ["تاريخ التقديم", c.filedDate],
    ["المرحلة", c.stage],
  ]
    .map(([k, v]) => [k, clean(v)] as const)
    .filter((kv): kv is readonly [string, string] => kv[1] !== null)
    .map(([k, v]) => `${k}: ${v}`);

  const blocks: DocBlock[] = [{ kind: "title", text: `ملخّص القضية — ${clean(c.title) ?? "بدون عنوان"}` }];
  if (facts.length) blocks.push({ kind: "list", items: facts, ordered: false });

  const description = clean(c.description);
  if (description) {
    blocks.push({ kind: "heading", text: "موضوع القضية" });
    for (const line of description.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean)) blocks.push({ kind: "para", text: line });
  }

  const section = (heading: string, lines: string[] | null, none: string) => {
    blocks.push({ kind: "heading", text: heading });
    if (lines === null) blocks.push({ kind: "para", text: "تعذّرت قراءة هذا القسم وقت الطباعة." });
    else if (lines.length === 0) blocks.push({ kind: "para", text: none });
    else blocks.push({ kind: "list", items: lines, ordered: false });
  };
  section("الجلسات", c.hearings, "لا جلسات مسجّلة لهذه القضية.");
  section("المهل المفتوحة", c.deadlines, "لا مهل مفتوحة.");
  return blocks;
}
