"use client";

/**
 * «جلسات المكتب» — N13 (batch l12; owner RAW [11]): «جلساتي» and «كل جلسات
 * المكتب», each exportable as the six-column table (Word / PDF / print on the
 * firm's letterhead — src/lib/hearings/hearingsTable.ts).
 *
 * GET /api/v1/firm/hearings?scope=mine|firm reads with the member's own
 * session, so «كل جلسات المكتب» is what the database lets him see («حسب
 * الصلاحية»): a trainee or a secretary sees what is assigned to him, a
 * restricted case's hearings stay with its team. Read-only here: hearings are
 * added and changed from the case file or the lawyer's diary.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, CalendarCheck, CircleNotch, MapPin, User } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import LetterheadExportBar from "@/components/letterhead/LetterheadExportBar";
import type { HearingDto } from "@/lib/services/lawyerHearingsService";
import { HEARINGS_TABLE_TITLE, hearingTableCells, hearingsTableBlocks } from "@/lib/hearings/hearingsTable";

type Scope = "mine" | "firm";
type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; rows: HearingDto[]; truncated: boolean };

const SCOPE_LABEL: Record<Scope, string> = { mine: "جلساتي", firm: "كل جلسات المكتب" };
const CLOSED = new Set(["cancelled", "held", "adjourned"]);

export default function FirmHearingsLive() {
  const { isDark } = useTheme();
  const [scope, setScope] = useState<Scope>("mine");
  const [showPast, setShowPast] = useState(false);
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  const read = useCallback(async (s: Scope) => {
    setLoad({ kind: "loading" });
    try {
      const res = await fetch(`/api/v1/firm/hearings?scope=${s}`, { cache: "no-store" });
      if (!res.ok) { setLoad({ kind: "error" }); return; }
      const body = (await res.json()) as { data?: HearingDto[]; total?: number };
      const rows = Array.isArray(body.data) ? body.data : [];
      setLoad({ kind: "ready", rows, truncated: typeof body.total === "number" && body.total > rows.length });
    } catch {
      setLoad({ kind: "error" });
    }
  }, []);

  useEffect(() => { void read(scope); }, [read, scope]);

  const today = useMemo(() => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10), []);
  const visible = useMemo(() => {
    if (load.kind !== "ready") return [];
    return load.rows.filter((h) => h.status !== "cancelled" && (showPast || (h.date >= today && !CLOSED.has(h.status))));
  }, [load, showPast, today]);

  const tableRows = useMemo(
    () => visible.map((h) => ({ date: h.date, time: h.time ?? null, location: h.location ?? null, type: h.type, caseInfo: h.caseInfo ?? null })),
    [visible],
  );
  const blocks = useMemo(() => hearingsTableBlocks(tableRows, SCOPE_LABEL[scope]), [tableRows, scope]);

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-sm";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={`text-xl font-bold ${strong}`} style={{ fontFamily: "var(--font-brand)" }}>جلسات المكتب</h1>
          <p className={`text-[13px] ${muted}`}>
            جلساتك، أو كل جلسات المكتب التي تسمح لك صلاحيتك برؤيتها. تُضاف الجلسات وتُعدَّل من ملف القضية.
          </p>
        </div>
        <div className={`flex items-center p-1 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-800" : "border-slate-200 bg-slate-50"}`} role="tablist">
          {(["mine", "firm"] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${scope === s ? (isDark ? "bg-zinc-700 text-white" : "bg-white text-slate-800 shadow-sm") : muted}`}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <label className={`flex items-center gap-2 text-[12px] ${muted}`}>
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          إظهار الجلسات المنعقدة والسابقة
        </label>
        {load.kind === "ready" && visible.length > 0 && (
          <div className="min-w-0 flex-1">
            <LetterheadExportBar title={HEARINGS_TABLE_TITLE} blocks={blocks} filename={scope === "firm" ? "firm-hearings" : "my-hearings"} />
          </div>
        )}
      </div>

      <div className={`${card} overflow-x-auto`}>
        {load.kind === "loading" ? (
          <div className={`flex items-center gap-2 p-6 text-[13px] ${muted}`}><CircleNotch size={16} className="animate-spin" /> جارٍ التحميل…</div>
        ) : load.kind === "error" ? (
          <div className="flex items-center gap-3 p-6 text-[13px]">
            <span className="font-semibold text-red-500">تعذّر تحميل الجلسات.</span>
            <button type="button" onClick={() => void read(scope)} className="flex items-center gap-1 font-bold text-royal hover:underline">
              <ArrowClockwise size={13} /> إعادة المحاولة
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className={`flex items-center gap-2 p-6 text-[13px] ${muted}`}>
            <CalendarCheck size={16} /> {showPast ? "لا توجد جلسات." : "لا توجد جلسات قادمة."}
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-[12px]">
            <thead className={isDark ? "bg-white/[0.03]" : "bg-slate-50"}>
              <tr>
                {["التاريخ", "الوقت", "المحكمة", "رقم القضية", "الموكّل", "الدائرة", "الجلسة"].map((h) => (
                  <th key={h} scope="col" className={`p-3 text-right font-bold ${muted}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((h) => {
                const cells = hearingTableCells({ date: h.date, time: h.time ?? null, location: h.location ?? null, type: h.type, caseInfo: h.caseInfo ?? null });
                return (
                  <tr key={h.id} className={isDark ? "border-t border-white/[0.05]" : "border-t border-slate-100"}>
                    {cells.map((c, i) => <td key={i} className={`p-3 ${i === 0 ? `font-semibold ${strong}` : muted}`}>{c}</td>)}
                    <td className={`p-3 ${strong}`}>
                      <span className="block">{h.title}</span>
                      {(h.assigneeName || h.ownerName) && (
                        <span className={`mt-0.5 flex items-center gap-1 text-[11px] ${muted}`}><User size={11} />{h.assigneeName ?? h.ownerName}</span>
                      )}
                      {h.location && h.type !== "client_meet" && (
                        <span className={`mt-0.5 flex items-center gap-1 text-[11px] ${muted}`}><MapPin size={11} />{h.location}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {load.kind === "ready" && load.truncated && (
        <p className={`text-[11px] ${muted}`}>الجلسات أكثر مما تعرضه الصفحة؛ عُرض أقربها فقط.</p>
      )}
    </div>
  );
}
