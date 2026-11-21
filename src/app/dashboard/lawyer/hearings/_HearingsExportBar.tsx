"use client";

/**
 * P1-37 — the diary leaves the platform two ways, both white-label:
 *
 * 1. «تنزيل كل جلساتي (.ics)»: every hearing on this screen (not the cancelled
 *    ones) plus the lawyer's OPEN deadlines (GET /api/v1/lawyer/deadlines,
 *    read on the click) in one calendar file, Asia/Riyadh, Arabic titles.
 *    What goes into an event is calendarFeed.ts's rule: title, day, hour,
 *    court location, «القضية: …» — never notes or client names.
 * 2. The printout: the list on screen (the filters the lawyer chose) on his
 *    own letterhead, through LetterheadExportBar (print / PDF / Word) — the
 *    same bar the AI documents use, shown to lawyers and firms only. N13
 *    (batch l12): one six-column table — التاريخ، الوقت، المحكمة، رقم القضية،
 *    الموكّل، الدائرة (src/lib/hearings/hearingsTable.ts).
 *
 * Built in the browser from rows already read; nothing is stored.
 */
import { useState } from "react";
import { CircleNotch, DownloadSimple } from "@phosphor-icons/react";
import LetterheadExportBar from "@/components/letterhead/LetterheadExportBar";
import type { DocBlock } from "@/lib/docx/ooxml";
import { buildCalendarFeed, CALENDAR_FEED_FILENAME, type FeedDeadline, type FeedHearing } from "@/lib/calendar/calendarFeed";
import { downloadIcsFile } from "@/lib/calendar/downloadIcs";
import { HEARINGS_TABLE_TITLE, hearingsTableBlocks, type HearingsTableRow } from "@/lib/hearings/hearingsTable";

interface Props {
  isDark: boolean;
  /** Every hearing read (the feed is the whole diary, not the filtered view). */
  hearings: FeedHearing[];
  /** The list as filtered on screen, one row per hearing (N13 table). */
  tableRows: HearingsTableRow[];
  /** False while the read is in flight or failed: nothing to export yet. */
  ready: boolean;
  /** The server holds more hearings than the page read: the file says so. */
  hearingsTruncated: boolean;
}

interface DeadlineWire {
  id?: unknown;
  title?: unknown;
  dueDate?: unknown;
  status?: unknown;
  caseTitle?: unknown;
}

const DEADLINES_LIMIT = 500;

async function readOpenDeadlines(): Promise<{ rows: FeedDeadline[]; truncated: boolean } | null> {
  try {
    const res = await fetch(`/api/v1/lawyer/deadlines?status=open&limit=${DEADLINES_LIMIT}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { data?: DeadlineWire[]; total?: unknown } | null;
    if (!Array.isArray(body?.data)) return null;
    const rows = body.data.flatMap((d) =>
      typeof d.id === "string" && typeof d.title === "string" && typeof d.dueDate === "string"
        ? [{ id: d.id, title: d.title, dueDate: d.dueDate, status: typeof d.status === "string" ? d.status : "open", caseTitle: typeof d.caseTitle === "string" ? d.caseTitle : null }]
        : [],
    );
    return { rows, truncated: typeof body.total === "number" && body.total > body.data.length };
  } catch {
    return null;
  }
}

export function hearingsPrintBlocks(rows: HearingsTableRow[]): DocBlock[] {
  return hearingsTableBlocks(rows);
}

export default function HearingsExportBar({ isDark, hearings, tableRows, ready, hearingsTruncated }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function downloadAll() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const deadlines = await readOpenDeadlines();
    const { ics, count } = buildCalendarFeed(hearings, deadlines?.rows ?? []);
    if (count === 0) {
      setNote(deadlines === null ? "لا مواعيد لتنزيلها، وتعذّرت قراءة المهل." : "لا مواعيد ولا مهل مفتوحة لتنزيلها.");
    } else {
      downloadIcsFile(ics, CALENDAR_FEED_FILENAME);
      // Honest about a partial file: a failed or capped read is said, never hidden.
      const gaps = [
        deadlines === null ? "تعذّرت قراءة المهل فلم تُضمَّن" : deadlines.truncated ? "المهل أكثر مما قُرئ فضُمّن أقربها فقط" : "",
        hearingsTruncated ? "الجلسات أكثر مما تعرضه الصفحة فضُمّن ما قُرئ منها فقط" : "",
      ].filter(Boolean);
      setNote(gaps.length ? `نُزّل الملف — ${gaps.join("، و")}.` : null);
    }
    setBusy(false);
  }

  const blocks = hearingsPrintBlocks(tableRows);
  const button = `flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold disabled:opacity-50 ${isDark ? "border-white/[0.07] text-zinc-300" : "border-zinc-200 text-zinc-600"}`;

  return (
    <div className="flex flex-col gap-2" dir="rtl">
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={() => void downloadAll()}
          disabled={!ready || busy}
          className={button}
          title="ملف تقويم واحد فيه جلساتك ومهلك المفتوحة بتوقيت الرياض، لتقويم Apple وOutlook وGoogle، ومع كل جلسة اسم الموكّل وملاحظاتك."
        >
          {busy ? <CircleNotch size={14} className="animate-spin" /> : <DownloadSimple size={14} />} تنزيل كل جلساتي (.ics)
        </button>
        {ready && blocks.length > 1 && (
          <div className="min-w-0 flex-1">
            <LetterheadExportBar title={HEARINGS_TABLE_TITLE} blocks={blocks} filename="hearings" />
          </div>
        )}
      </div>
      {note && <p role="status" className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{note}</p>}
    </div>
  );
}
