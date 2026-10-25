"use client";

/**
 * OfficeActivityTab — «نشاط المكتب وفريق العمل», tab 2 of
 * /dashboard/lawyer/activity (N3.7; owner §٤٥ axes 1 and 4: every movement a
 * team member adds, filterable per member). Firm members only — the page
 * shows the tab when /api/v1/lawyer/activity/office answers `member: true`.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowClockwise, UsersThree } from "@phosphor-icons/react";
import { getOfficeActivity, LEDGER_EVENT, type OfficeActivityItem } from "@/lib/services/ledgerService";

const WHEN_AR = new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

export default function OfficeActivityTab({ isDark }: { isDark: boolean }) {
  const [actor, setActor] = useState("");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<OfficeActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    setState("loading");
    getOfficeActivity({ actor: actor || null })
      .then((p) => { setItems(p.items); setMembers(p.members); setCursor(p.nextCursor); setState("ready"); })
      .catch(() => setState("error"));
  }, [actor]);

  useEffect(() => {
    load();
    window.addEventListener(LEDGER_EVENT, load);
    return () => window.removeEventListener(LEDGER_EVENT, load);
  }, [load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const p = await getOfficeActivity({ actor: actor || null, before: cursor });
      setItems((prev) => [...prev, ...p.items]);
      setCursor(p.nextCursor);
    } catch {
      setState("error");
    } finally {
      setLoadingMore(false);
    }
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white";

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 text-[11px] font-semibold">
          <span className={muted}>عضو الفريق</span>
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${isDark ? "bg-zinc-950 border-white/10 text-zinc-200" : "bg-white border-slate-200 text-slate-700"}`}
          >
            <option value="">كل الفريق</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <p className={`text-[11px] ${muted}`}>ما يضيفه أعضاء مكتبك النشطون من جلسات ومهام ومهل وقيود صادر ووارد.</p>
      </div>

      {state === "loading" ? (
        <p className={`text-[12px] ${muted}`} aria-live="polite">جارٍ تحميل نشاط المكتب…</p>
      ) : state === "error" ? (
        <div role="alert" className={`flex items-center justify-between rounded-xl border px-3 py-3 text-[12px] ${isDark ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <span>تعذّر تحميل نشاط المكتب.</span>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold underline"><ArrowClockwise size={12} aria-hidden="true" /> إعادة المحاولة</button>
        </div>
      ) : items.length === 0 ? (
        <div className={`${card} px-4 py-10 text-center`}>
          <UsersThree size={28} className={`mx-auto mb-2 ${muted}`} aria-hidden="true" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>لا نشاط مسجَّل للمكتب {actor ? "لهذا العضو" : "بعد"}</p>
        </div>
      ) : (
        <ul className={`${card} divide-y ${isDark ? "divide-white/[0.06]" : "divide-slate-100"}`}>
          {items.map((it) => (
            <li key={it.id} className="px-4 py-3">
              <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{it.title}</p>
              <p className={`mt-0.5 text-[11px] ${muted}`}>
                {it.actorName ?? "عضو في المكتب"} · {WHEN_AR.format(Date.parse(it.createdAt))}
                {it.caseRequestId && (
                  <>
                    {" · "}
                    <Link href={`/dashboard/lawyer/cases/${encodeURIComponent(it.caseRequestId)}`} className="underline">القضية</Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {cursor && state === "ready" && (
        <button type="button" onClick={more} disabled={loadingMore} className={`w-full rounded-xl border py-2 text-[12px] font-bold ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-600"}`}>
          {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد"}
        </button>
      )}
    </div>
  );
}
