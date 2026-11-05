"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { asCitations, SourceList, stripCitationMarkers } from "@/components/ai/CitedAnswer";
import { AI_TOOL_PAGES, aiToolLabelAr } from "@/lib/ai/toolLabels";
import { runPageView, runStatusLabelAr } from "@/lib/ai/runPageView";

/**
 * /ai/runs/<id> — one AI run of the signed-in user, in plain reading: the tool,
 * its status, what was charged, and the stored output whatever the tool's shape.
 * The link target of the activity log and the bells.
 *
 * Everything comes from GET /api/v1/ai/runs/<id>, which shows a user only his
 * own row and applies runVisibility.ts. The proxy sends a signed-out visitor to
 * the login page (/ai/runs is in PROTECTED). The date is formatted here, on the
 * client, after the fetch, so it never passes through the nginx-cached SSR.
 */

interface StoredRun {
  id: string;
  tool: string;
  status: string;
  charged_points?: number | null;
  output?: unknown;
  citations?: unknown;
  error_code?: string | null;
  created_at?: string | null;
  refunded_at?: string | null;
}

type Load =
  | { state: "loading" }
  | { state: "not_found" }
  | { state: "error"; message: string }
  | { state: "loaded"; run: StoredRun };

const LOAD_ERROR = "تعذّر تحميل الطلب — حاول مرة أخرى";

async function loadRun(id: string): Promise<Load> {
  try {
    const res = await fetch(`/api/v1/ai/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { run?: StoredRun; error?: string };
    if (res.status === 404) return { state: "not_found" };
    if (!res.ok || !json.run) return { state: "error", message: json.error || LOAD_ERROR };
    return { state: "loaded", run: json.run };
  } catch {
    return { state: "error", message: LOAD_ERROR };
  }
}

export default function AiRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isDark } = useTheme();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const refresh = useCallback(() => {
    void loadRun(id).then(setLoad);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl p-5"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm p-5";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const body = isDark ? "text-zinc-300" : "text-zinc-800";
  const heading = isDark ? "text-[#C8A762]" : "text-[#0B3D2E]";
  const button = `rounded-xl px-4 py-2 text-[13px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-zinc-100 text-zinc-800"}`;

  if (load.state === "loading") {
    return (
      <div className="mx-auto max-w-3xl p-4" aria-busy="true">
        <p className={`text-[13px] ${muted}`}>جارٍ التحميل…</p>
      </div>
    );
  }
  if (load.state === "not_found") {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className={card}>
          <p className={`text-[14px] font-bold ${body}`}>غير موجود</p>
        </div>
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className={`${card} space-y-3`}>
          <p role="alert" className={`text-[13px] ${isDark ? "text-red-400" : "text-red-600"}`}>{load.message}</p>
          <button type="button" onClick={refresh} className={button}>إعادة المحاولة</button>
        </div>
      </div>
    );
  }

  const { run } = load;
  const view = runPageView(run);
  const page = Object.prototype.hasOwnProperty.call(AI_TOOL_PAGES, run.tool) ? AI_TOOL_PAGES[run.tool] : null;
  const cites = view.kind === "output" || view.kind === "held" ? asCitations(run.citations) : [];
  const charged = typeof run.charged_points === "number" ? run.charged_points : 0;
  const created = run.created_at ? new Date(run.created_at) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className={card}>
        <h1 className={`text-[17px] font-black ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>{aiToolLabelAr(run.tool)}</h1>
        <dl className={`mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] ${muted}`}>
          <div className="flex gap-1">
            <dt>الحالة:</dt>
            <dd className="font-bold">{runStatusLabelAr(run.status)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>النقاط المخصومة:</dt>
            <dd className="font-bold">
              {charged.toLocaleString("ar-SA")}
              {run.refunded_at ? " (أُعيدت)" : ""}
            </dd>
          </div>
          {created && !Number.isNaN(created.getTime()) && (
            <div className="flex gap-1">
              <dt>التاريخ:</dt>
              <dd className="font-bold">{created.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</dd>
            </div>
          )}
        </dl>
      </header>

      {view.message && (
        <div className={`${card} space-y-3`}>
          <p
            role={view.kind === "failed" ? "alert" : undefined}
            className={`text-[13px] leading-relaxed ${view.kind === "failed" ? (isDark ? "text-red-400" : "text-red-600") : body}`}
          >
            {view.message}
          </p>
          {view.kind === "running" && (
            <button type="button" onClick={refresh} className={button}>تحديث</button>
          )}
        </div>
      )}

      {view.blocks.length > 0 && (
        <div className={`${card} space-y-4`}>
          {view.blocks.map((b, i) => (
            <section key={i} className="space-y-1.5">
              {b.heading && <h2 className={`text-[13px] font-black ${heading}`}>{b.heading}</h2>}
              {b.paragraphs.map((p, j) => (
                <p key={j} className={`whitespace-pre-wrap text-[13px] leading-relaxed ${body}`}>{stripCitationMarkers(p)}</p>
              ))}
              {b.items.length > 0 && (
                <ul className={`list-disc space-y-1 pr-5 text-[13px] leading-relaxed ${body}`}>
                  {b.items.map((it, j) => (
                    <li key={j} className="whitespace-pre-wrap">{stripCitationMarkers(it)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {cites.length > 0 && (
        <div className={`${card} space-y-2`}>
          <h2 className={`text-[13px] font-black ${heading}`}>المصادر</h2>
          <SourceList cites={cites} isDark={isDark} />
        </div>
      )}

      {page && (
        <Link href={page} className={`inline-block ${button}`}>افتح الأداة</Link>
      )}
    </div>
  );
}
