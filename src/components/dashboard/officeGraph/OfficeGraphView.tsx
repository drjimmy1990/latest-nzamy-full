"use client";

/**
 * OfficeGraphView — «خريطة قضايا المكتب» (N3.11), mounted at
 * /dashboard/lawyer/graph and /dashboard/firm/graph.
 *
 * Read-only: a map of the caller's cases, clients and opponents exactly as
 * GET /api/v1/lawyer/office-graph returns them through RLS, laid out with the
 * same seeded force layout as the case canvas («ترتيب تلقائي», N3.10). A
 * party on several cases is one node; «تشابه اسم» marks a name that is a
 * client in one file and the other side in another — a hint to check, not a
 * conflict finding. Nothing here writes anything.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleNotch, MagnifyingGlass, Minus, Plus, Warning, TreeStructure, ArrowSquareOut } from "@phosphor-icons/react";
import { forceLayout } from "@/app/dashboard/business/kanban/_graph-layout";
import { getOfficeGraph, type OfficeGraphRead } from "@/lib/services/officeGraphService";
import type { OfficeNode, OfficeNodeKind } from "@/lib/services/officeGraph";
import { normalizePartyName } from "@/lib/services/caseParties";
import { toArabicDigits } from "@/lib/services/arabicCount";

const NODE_W = 170;
const NODE_H = 44;

const KIND_AR: Record<OfficeNodeKind, string> = { case: "قضية", client: "موكّل", opponent: "طرف آخر" };

function kindColors(kind: OfficeNodeKind, isDark: boolean) {
  if (kind === "case") return isDark ? { fill: "#0f2a20", stroke: "#10b981", text: "#a7f3d0" } : { fill: "#ecfdf5", stroke: "#059669", text: "#065f46" };
  if (kind === "client") return isDark ? { fill: "#0c2233", stroke: "#38bdf8", text: "#bae6fd" } : { fill: "#f0f9ff", stroke: "#0284c7", text: "#075985" };
  return isDark ? { fill: "#2a1218", stroke: "#fb7185", text: "#fecdd3" } : { fill: "#fff1f2", stroke: "#e11d48", text: "#9f1239" };
}

const clip = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function OfficeGraphView({ base, isDark }: { base: "lawyer" | "firm"; isDark: boolean }) {
  const [read, setRead] = useState<OfficeGraphRead | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<Record<OfficeNodeKind, boolean>>({ case: true, client: true, opponent: true });
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getOfficeGraph()
      .then((r) => { if (!cancelled) { setRead(r); setState("ready"); } })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, []);

  const graph = read?.graph;

  // Seeded layout: start from rings (cases inside, parties outside) so the
  // force pass converges in fewer iterations, then the same layout the case
  // canvas uses. Same data → same picture.
  const positions = useMemo(() => {
    if (!graph) return new Map<string, { x: number; y: number }>();
    const cases = graph.nodes.filter((n) => n.kind === "case");
    const others = graph.nodes.filter((n) => n.kind !== "case");
    const ring = (list: OfficeNode[], r: number) =>
      list.map((n, i) => ({
        id: n.id,
        w: NODE_W,
        h: NODE_H,
        pos: { x: Math.cos((2 * Math.PI * i) / Math.max(1, list.length)) * r, y: Math.sin((2 * Math.PI * i) / Math.max(1, list.length)) * r },
      }));
    const seeds = [...ring(cases, 200 + cases.length * 12), ...ring(others, 420 + others.length * 14)];
    const n = seeds.length;
    return forceLayout(seeds, graph.edges.filter((e) => e.relation !== "same_name"), { iterations: n > 250 ? 80 : n > 100 ? 160 : 300 });
  }, [graph]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of graph?.edges ?? []) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [graph]);

  const q = normalizePartyName(query);
  const visible = (n: OfficeNode) => shown[n.kind];
  const matches = (n: OfficeNode) => !q || normalizePartyName(n.label).includes(q);
  const focus = selected ? new Set([selected, ...(neighbours.get(selected) ?? [])]) : null;

  const muted = isDark ? "text-zinc-500" : "text-slate-500";
  const card = `rounded-2xl border ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`;

  if (state === "loading") {
    return <p className={`flex items-center gap-2 p-6 text-sm ${muted}`}><CircleNotch size={16} className="animate-spin" /> جارٍ قراءة قضايا المكتب وموكّليه...</p>;
  }
  if (state === "error" || !graph || !read) {
    return (
      <div className={`${card} flex items-center gap-2 p-6 text-sm ${isDark ? "text-red-400" : "text-red-700"}`}>
        <Warning size={16} /> تعذّرت قراءة خريطة القضايا. أعد تحميل الصفحة.
      </div>
    );
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H);
  }
  const PAD = 40;
  const width = Number.isFinite(maxX) ? maxX - minX + PAD * 2 : 400;
  const height = Number.isFinite(maxY) ? maxY - minY + PAD * 2 : 300;
  const ox = Number.isFinite(minX) ? PAD - minX : 0;
  const oy = Number.isFinite(minY) ? PAD - minY : 0;

  const sel = selected ? nodeById.get(selected) ?? null : null;
  const hrefOf = (n: OfficeNode): string | null => {
    if (n.kind === "case" && n.refId) return `/dashboard/${base}/cases/${encodeURIComponent(n.refId)}`;
    if (n.kind === "client" && n.refId) return `/dashboard/${base}/clients/${encodeURIComponent(n.refId)}`;
    return null;
  };
  const caseTitle = (id: string) => nodeById.get(`case:${id}`)?.label ?? id;
  const counts = {
    case: graph.nodes.filter((n) => n.kind === "case").length,
    client: graph.nodes.filter((n) => n.kind === "client").length,
    opponent: graph.nodes.filter((n) => n.kind === "opponent").length,
  };

  return (
    <div className="space-y-4">
      {(read.truncated.cases || read.truncated.clients) && (
        <p className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          الخريطة تعرض أحدث {toArabicDigits(read.caps.cases)} قضية و{toArabicDigits(read.caps.clients)} موكّلاً فقط؛ ما بعدها غير مرسوم.
        </p>
      )}

      <div className={`${card} flex flex-wrap items-center gap-3 p-3`}>
        <label className={`flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border px-3 py-1.5 ${isDark ? "border-white/10 bg-zinc-800" : "border-slate-200 bg-slate-50"}`}>
          <MagnifyingGlass size={14} className={muted} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 120))}
            placeholder="ابحث باسم قضية أو موكّل أو طرف..."
            aria-label="بحث في الخريطة"
            className={`w-full bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder-zinc-500" : "text-slate-700 placeholder-slate-400"}`}
          />
        </label>
        {(Object.keys(KIND_AR) as OfficeNodeKind[]).map((k) => {
          const c = kindColors(k, isDark);
          return (
            <label key={k} className={`flex cursor-pointer items-center gap-1.5 text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
              <input type="checkbox" checked={shown[k]} onChange={() => setShown((s) => ({ ...s, [k]: !s[k] }))} className="h-3.5 w-3.5" />
              <span className="inline-block h-2.5 w-2.5 rounded-sm border" style={{ background: c.fill, borderColor: c.stroke }} />
              {KIND_AR[k]} ({toArabicDigits(counts[k])})
            </label>
          );
        })}
        <div className="ms-auto flex items-center gap-1">
          <button type="button" onClick={() => setScale((s) => Math.max(0.3, s - 0.15))} aria-label="تصغير"
            className={`rounded-lg p-1.5 ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}><Minus size={14} /></button>
          <span className={`w-10 text-center text-[11px] ${muted}`}>{toArabicDigits(Math.round(scale * 100))}٪</span>
          <button type="button" onClick={() => setScale((s) => Math.min(2, s + 0.15))} aria-label="تكبير"
            className={`rounded-lg p-1.5 ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}><Plus size={14} /></button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className={`${card} relative h-[620px] overflow-auto`}>
          {graph.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <TreeStructure size={36} className={isDark ? "text-zinc-700" : "text-slate-300"} />
              <p className={`text-sm ${muted}`}>لا قضايا ولا موكّلين في سجلاتك بعد.</p>
            </div>
          ) : (
            <svg
              width={width * scale}
              height={height * scale}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="خريطة القضايا والموكّلين والأطراف"
              onClick={() => setSelected(null)}
            >
              {graph.edges.map((e, i) => {
                const a = positions.get(e.from);
                const b = positions.get(e.to);
                const na = nodeById.get(e.from);
                const nb = nodeById.get(e.to);
                if (!a || !b || !na || !nb || !visible(na) || !visible(nb)) return null;
                const lit = !focus || (focus.has(e.from) && focus.has(e.to));
                const stroke = e.relation === "same_name" ? "#f59e0b" : e.relation === "opponent" ? (isDark ? "#fb7185" : "#e11d48") : (isDark ? "#71717a" : "#94a3b8");
                return (
                  <line
                    key={i}
                    x1={a.x + ox + NODE_W / 2} y1={a.y + oy + NODE_H / 2}
                    x2={b.x + ox + NODE_W / 2} y2={b.y + oy + NODE_H / 2}
                    stroke={stroke}
                    strokeWidth={e.relation === "same_name" ? 2 : 1.4}
                    strokeDasharray={e.relation === "same_name" ? "6 4" : e.relation === "opponent" ? "3 3" : undefined}
                    opacity={lit ? 0.85 : 0.12}
                  />
                );
              })}
              {graph.nodes.map((n) => {
                const p = positions.get(n.id);
                if (!p || !visible(n)) return null;
                const c = kindColors(n.kind, isDark);
                const lit = (!focus || focus.has(n.id)) && matches(n);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x + ox}, ${p.y + oy})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${KIND_AR[n.kind]}: ${n.label}${n.nameClash ? " — تشابه اسم" : ""}`}
                    onClick={(ev) => { ev.stopPropagation(); setSelected(n.id === selected ? null : n.id); }}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelected(n.id === selected ? null : n.id); } }}
                    style={{ cursor: "pointer", opacity: lit ? 1 : 0.2 }}
                  >
                    <rect
                      width={NODE_W} height={NODE_H} rx={12}
                      fill={c.fill}
                      stroke={n.nameClash ? "#f59e0b" : c.stroke}
                      strokeWidth={n.id === selected ? 3 : n.nameClash ? 2.5 : 1.2}
                    />
                    <text x={NODE_W / 2} y={18} textAnchor="middle" fontSize={12} fontWeight={700} fill={c.text}>
                      {clip(n.label)}
                    </text>
                    <text x={NODE_W / 2} y={34} textAnchor="middle" fontSize={10} fill={c.text} opacity={0.75}>
                      {KIND_AR[n.kind]}
                      {n.kind !== "case" && n.caseCount > 0 ? ` · ${toArabicDigits(n.caseCount)} قضية` : ""}
                      {n.nameClash ? " · ⚠ تشابه اسم" : ""}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <aside className="space-y-4">
          {sel && (
            <div className={`${card} p-4`}>
              <p className={`text-[11px] ${muted}`}>{KIND_AR[sel.kind]}</p>
              <p className={`mt-0.5 text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{sel.label}</p>
              <p className={`mt-1 text-[11px] ${muted}`}>
                مرتبط بـ {toArabicDigits(neighbours.get(sel.id)?.size ?? 0)} عنصر على الخريطة
              </p>
              {hrefOf(sel) && (
                <Link href={hrefOf(sel)!} className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-[#C8A762] hover:underline">
                  <ArrowSquareOut size={13} /> {sel.kind === "case" ? "فتح ملف القضية" : "فتح ملف الموكّل"}
                </Link>
              )}
            </div>
          )}

          <div className={`${card} p-4`}>
            <p className={`flex items-center gap-1.5 text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
              <Warning size={14} className="text-amber-500" /> تشابه أسماء ({toArabicDigits(graph.clashes.length)})
            </p>
            <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
              اسم مسجّل موكّلاً في ملف وطرفاً آخر في ملف (أو الملف نفسه)، بعد توحيد الإملاء. تنبيه للتحقق، لا حكم بوجود تعارض، ويقتصر على ما في سجلاتك.
              {base === "firm" && (
                <> للفحص التفصيلي: <Link href="/dashboard/firm/compliance/conflict" className="font-bold text-[#C8A762] hover:underline">فحص تعارض المصالح</Link>.</>
              )}
            </p>
            {graph.clashes.length === 0 ? (
              <p className={`mt-3 text-[12px] ${muted}`}>لا تشابه أسماء في سجلاتك.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {graph.clashes.map((c) => (
                  <li key={c.name} className={`rounded-xl border p-2.5 text-[12px] ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
                    <p className={`font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>«{c.name}» — تحقّق</p>
                    {c.clientIn.length > 0 && (
                      <p className={isDark ? "text-zinc-300" : "text-slate-700"}>موكّل في: {c.clientIn.map(caseTitle).join("، ")}</p>
                    )}
                    {c.clientIn.length === 0 && c.clientCardIds.length > 0 && (
                      <p className={isDark ? "text-zinc-300" : "text-slate-700"}>له بطاقة موكّل في سجلاتك</p>
                    )}
                    <p className={isDark ? "text-zinc-300" : "text-slate-700"}>طرف آخر في: {c.opponentIn.map(caseTitle).join("، ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className={`text-[11px] leading-relaxed ${muted}`}>
            الخريطة للقراءة فقط وتُبنى من قضاياك وقضايا مكتبك التي تملك صلاحية قراءتها. الخصوم يظهرون فقط حين يسجّلهم ملف القضية.
          </p>
        </aside>
      </div>
    </div>
  );
}
