"use client";

/**
 * «سجلّي» — the signed-in user's own AI runs (L11-log, owner file 03 ل11,
 * batch l12). One component, two uses:
 *
 *   <AiHistoryList />                 the full page: filter per tool, pages,
 *                                     delete per run;
 *   <AiHistoryList tool="…" recent /> a tool page's last five (his «في صفحة
 *                                     كل أداة آخر 5 معاملات»), with a link to
 *                                     the full page.
 *
 * Each row: the date, the tool, the question, the start of the answer with the
 * link to the whole run (/ai/runs/<id>), the points charged, «أعد الطرح»
 * (copies the question and opens the tool) and «حذف».
 * Everything comes from GET /api/v1/ai/history — own rows only. Dates are
 * formatted here, after the fetch, never in the cached server render.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowClockwise, ArrowSquareOut, ClockCounterClockwise, Trash } from "@phosphor-icons/react";
import { AI_HISTORY_TOOLS, type AiHistoryItem } from "@/lib/ai/aiHistory";
import { countPhraseAr } from "@/lib/services/arabicCount";

export const AI_HISTORY_PAGE_PATH = "/dashboard/lawyer/ai/history";

const POINTS = { zero: "بلا خصم", one: "نقطة واحدة", two: "نقطتان", few: "نقاط", many: "نقطة" } as const;

function dateAr(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };

export default function AiHistoryList({ isDark, tool, recent = false }: { isDark: boolean; tool?: string; recent?: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>(tool ?? "");
  const [runs, setRuns] = useState<AiHistoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [deleteAvailable, setDeleteAvailable] = useState(true);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (before: string | null) => {
      const q = new URLSearchParams();
      if (filter) q.set("tool", filter);
      if (before) q.set("before", before);
      if (recent) q.set("recent", "1");
      const res = await fetch(`/api/v1/ai/history?${q.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { runs?: AiHistoryItem[]; hasMore?: boolean; deleteAvailable?: boolean; error?: string };
      if (!res.ok || !Array.isArray(json.runs)) throw new Error(json.error || "تعذّر تحميل السجل — حاول مرة أخرى");
      return { runs: json.runs, hasMore: json.hasMore === true, deleteAvailable: json.deleteAvailable !== false };
    },
    [filter, recent],
  );

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    fetchPage(null)
      .then((page) => {
        if (cancelled) return;
        setRuns(page.runs);
        setHasMore(page.hasMore && !recent);
        setDeleteAvailable(page.deleteAvailable);
        setLoad({ state: "ready" });
      })
      .catch((e: Error) => !cancelled && setLoad({ state: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [fetchPage, recent]);

  async function more() {
    const last = runs[runs.length - 1];
    if (!last) return;
    try {
      const page = await fetchPage(last.createdAt);
      setRuns((prev) => [...prev, ...page.runs]);
      setHasMore(page.hasMore);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function remove(run: AiHistoryItem) {
    if (busyId) return;
    if (!window.confirm("حذف هذه المعاملة من سجلّك؟ يُمسح السؤال والجواب نهائياً، ويبقى قيد النقاط في كشف رصيدك.")) return;
    setBusyId(run.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/ai/history?id=${encodeURIComponent(run.id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "تعذّر الحذف — حاول مرة أخرى");
      setRuns((prev) => prev.filter((r) => r.id !== run.id));
      setNotice("حُذفت المعاملة من سجلّك.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function askAgain(run: AiHistoryItem) {
    if (!run.toolHref) return;
    try {
      if (run.question) await navigator.clipboard.writeText(run.question);
    } catch {
      /* the tool still opens; the question is on screen to copy by hand */
    }
    router.push(run.toolHref);
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200/70 shadow-sm";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const body = isDark ? "text-zinc-200" : "text-zinc-800";
  const chip = `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${isDark ? "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`;

  return (
    <div dir="rtl" className="space-y-3">
      {!recent && (
        <label className="flex items-center gap-2">
          <span className={`text-[13px] font-semibold ${muted}`}>الأداة</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-[13px] ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-800"}`}
          >
            <option value="">كل الأدوات</option>
            {AI_HISTORY_TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {notice && (
        <p role="status" className={`text-[12px] font-semibold ${isDark ? "text-amber-300" : "text-amber-800"}`}>
          {notice}
        </p>
      )}

      {load.state === "loading" && <p className={`text-[13px] ${muted}`}>جارٍ التحميل…</p>}
      {load.state === "error" && (
        <p role="alert" className="text-[13px] text-red-600">
          {load.message}
        </p>
      )}
      {load.state === "ready" && runs.length === 0 && (
        <p className={`text-[13px] ${muted}`}>{filter ? "لا معاملات لهذه الأداة في سجلّك." : "لا معاملات في سجلّك بعد."}</p>
      )}

      {runs.map((run) => (
        <article key={run.id} className={`rounded-2xl p-4 ${card}`}>
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`text-[13px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{run.toolLabel}</span>
            <span className={`text-[12px] ${muted}`}>{dateAr(run.createdAt)}</span>
            <span className={`text-[12px] ${muted}`}>
              {run.refunded ? "أُعيدت النقاط" : countPhraseAr(run.points, POINTS)}
            </span>
            {run.status === "failed" && <span className="text-[12px] font-semibold text-red-600">لم تكتمل</span>}
            {run.status === "running" && <span className={`text-[12px] font-semibold ${muted}`}>قيد التنفيذ</span>}
          </header>
          {run.question && (
            <p className={`mt-2 text-[13px] leading-relaxed ${body}`}>
              <span className={`font-semibold ${muted}`}>السؤال: </span>
              {run.question}
            </p>
          )}
          {run.answer && (
            <p className={`mt-1.5 text-[13px] leading-relaxed ${body}`}>
              <span className={`font-semibold ${muted}`}>الجواب: </span>
              {run.answer}
            </p>
          )}
          {!run.question && !run.answer && run.status === "succeeded" && (
            <p className={`mt-2 text-[12px] ${muted}`}>انتهت مدة حفظ نص هذه المعاملة؛ بقي تاريخها ونقاطها.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={run.href} className={chip}>
              <ArrowSquareOut size={13} /> الجواب كاملاً
            </Link>
            {run.toolHref && (
              <button type="button" onClick={() => askAgain(run)} className={chip} title="يُنسخ سؤالك وتُفتح الأداة لتلصقه فيها">
                <ArrowClockwise size={13} /> أعد الطرح
              </button>
            )}
            {deleteAvailable && run.status !== "running" && (
              <button
                type="button"
                onClick={() => remove(run)}
                disabled={busyId === run.id}
                className={`${chip} ${isDark ? "hover:text-red-300" : "hover:text-red-700"} disabled:opacity-50`}
              >
                <Trash size={13} /> {busyId === run.id ? "جارٍ الحذف…" : "حذف"}
              </button>
            )}
          </div>
        </article>
      ))}

      {hasMore && (
        <button type="button" onClick={more} className={chip}>
          عرض المزيد
        </button>
      )}
      {recent && load.state === "ready" && (
        <Link href={AI_HISTORY_PAGE_PATH} className={`inline-flex items-center gap-1 text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}>
          <ClockCounterClockwise size={13} /> سجلّي كاملاً
        </Link>
      )}
    </div>
  );
}
