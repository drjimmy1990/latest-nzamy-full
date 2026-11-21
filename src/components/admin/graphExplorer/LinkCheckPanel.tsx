"use client";

import { useEffect, useState } from "react";
import { Warning } from "@phosphor-icons/react";
import {
  LINK_CHECK_REASON_LABELS,
  OWNER_EDGE_STATUS_LABELS,
  parseLinkCheckHistory,
  type LinkCheckRow,
} from "@/lib/library/linkCheck";

/**
 * «فحص الروابط اليومي» in the explorer's status tab (owner file 10 ب34; batch
 * l12): the last checks of GET /api/v1/admin/library-link-check — how many
 * graph nodes carry reader links while their library row is gone, a sample to
 * fix, and where the owner's links stand.
 */
export default function LinkCheckPanel() {
  const [rows, setRows] = useState<LinkCheckRow[] | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/admin/library-link-check", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { ok?: boolean; history?: unknown; schemaMissing?: boolean; migration?: string; error?: string };
        if (!alive) return;
        if (body.schemaMissing) setMissing(body.migration ?? "20261202_30_library_links.sql");
        else if (!r.ok || !body.ok) setError(body.error ?? "تعذّر تحميل فحص الروابط");
        else setRows(parseLinkCheckHistory(body.history));
      })
      .catch(() => alive && setError("تعذّر تحميل فحص الروابط"));
    return () => {
      alive = false;
    };
  }, []);

  const last = rows?.[0];
  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <section>
      <h4 className="text-[11px] font-bold tracking-wide text-zinc-500">فحص الروابط اليومي</h4>
      {missing && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200">
          <Warning size={13} className="mt-0.5 shrink-0" /> يحتاج ملف قاعدة البيانات{" "}
          <code dir="ltr" className="rounded bg-black/30 px-1 font-mono text-[10.5px]">supabase/migrations/{missing}</code>
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      {rows && rows.length === 0 && <p className="mt-2 text-[11px] text-zinc-500">لم يجرِ فحص بعد. يجري مرة كل يوم.</p>}
      {last && (
        <div className="mt-2 space-y-1.5 text-[11.5px] text-zinc-300">
          <p>
            آخر فحص {when(last.checked_at)}:{" "}
            <span className={last.broken > 0 ? "font-bold text-amber-300" : "font-bold text-emerald-300"}>
              {last.broken > 0 ? `${last.broken.toLocaleString("ar-SA")} عنصراً بلا أصل في المكتبة` : "لا روابط مكسورة"}
            </span>
          </p>
          {Object.entries(last.by_reason).map(([k, n]) => (
            <p key={k} className="text-[11px] text-zinc-400">
              {LINK_CHECK_REASON_LABELS[k] ?? k}: {n.toLocaleString("ar-SA")}
            </p>
          ))}
          {last.sample.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              {last.sample.map((s) => (
                <li key={s.node_key} className="text-[10.5px] leading-snug text-zinc-400">
                  <span className="text-zinc-200">{s.title || s.node_key}</span> — {LINK_CHECK_REASON_LABELS[s.reason] ?? s.reason} ({s.links.toLocaleString("ar-SA")} رابطاً)
                  <span dir="ltr" className="block font-mono text-[9.5px] text-zinc-600">{s.node_key}</span>
                </li>
              ))}
            </ul>
          )}
          {Object.keys(last.owner_edges).length > 0 && (
            <div className="pt-1">
              <p className="text-[10.5px] text-zinc-500">روابط ملف المالك:</p>
              {Object.entries(last.owner_edges).map(([k, n]) => (
                <p key={k} className="text-[11px] text-zinc-400">
                  {OWNER_EDGE_STATUS_LABELS[k] ?? k}: {n.toLocaleString("ar-SA")}
                </p>
              ))}
            </div>
          )}
          {rows && rows.length > 1 && (
            <p className="text-[10.5px] text-zinc-600">
              السابق: {rows.slice(1, 6).map((r) => r.broken.toLocaleString("ar-SA")).join(" ← ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
