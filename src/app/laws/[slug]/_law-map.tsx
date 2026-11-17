"use client";

/**
 * _law-map.tsx — «خريطة التشابك التشريعي» (owner TODO N06-40..43): the current
 * law in the middle, the laws it is linked with around it, from the graph
 * (GET …/citations?map=1 → library_reader_law_links, 20261126_10).
 *
 * Loaded ONLY when the panel opens: _law-map-button.tsx imports this module
 * with next/dynamic (ssr: false), so @xyflow/react and its CSS stay out of the
 * reader's first bundle. The canvas runs LTR (xyflow's own geometry); every
 * label is RTL. Titles, statuses and link counts only.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { apiSlug } from "@/utils/apiSlug";
import { statusPill } from "./_cite-status";

interface LawLink {
  slug: string;
  title: string;
  status: string | null;
  out: number;
  in: number;
  types: string[];
}
type Answer = { available: false } | { available: true; links: LawLink[]; truncated: boolean };

interface LawNodeData extends Record<string, unknown> {
  title: string;
  status: string | null;
  center: boolean;
  isDark: boolean;
  out: number;
  in: number;
}

function LawNode({ data }: NodeProps<Node<LawNodeData>>) {
  const pill = statusPill(data.status);
  const cls = data.center
    ? data.isDark ? "bg-[#0B3D2E] border-[#C8A762]/60 text-white" : "bg-[#0B3D2E] border-[#C8A762] text-white"
    : data.isDark ? "bg-zinc-900 border-white/[0.12] text-zinc-200 hover:border-[#C8A762]/60" : "bg-white border-slate-300 text-zinc-800 hover:border-amber-400";
  return (
    <div dir="rtl" className={`w-[190px] rounded-xl border px-3 py-2 text-[11px] shadow-sm cursor-pointer ${cls}`}>
      <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
      <div className="flex items-start gap-1.5">
        <span aria-hidden title={pill.labelAr}>{pill.emoji}</span>
        <span className="font-bold leading-snug line-clamp-3">{data.title}</span>
      </div>
      {!data.center && (
        <p className={`mt-1 text-[10px] ${data.isDark ? "text-zinc-400" : "text-slate-500"}`}>
          {data.out > 0 && `يُحيل إليه ${data.out}`}
          {data.out > 0 && data.in > 0 && " · "}
          {data.in > 0 && `يُحيل إلينا ${data.in}`}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!opacity-0" isConnectable={false} />
    </div>
  );
}

const nodeTypes = { law: LawNode };

export default function LawMap({ slug, lawTitle, lawStatus, isDark }: { slug: string; lawTitle: string; lawStatus: string | null; isDark: boolean }) {
  const [state, setState] = useState<{ status: "loading" | "done" | "failed"; data?: Answer }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/library/laws/${apiSlug(slug)}/citations?map=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Answer) => { if (!cancelled) setState({ status: "done", data }); })
      .catch(() => { if (!cancelled) setState({ status: "failed" }); });
    return () => { cancelled = true; };
  }, [slug]);

  const links = state.data && state.data.available ? state.data.links : [];
  const { nodes, edges } = useMemo(() => {
    const nodes: Node<LawNodeData>[] = [
      { id: slug, type: "law", position: { x: 0, y: 0 }, data: { title: lawTitle, status: lawStatus, center: true, isDark, out: 0, in: 0 }, draggable: false },
    ];
    const edges: Edge[] = [];
    const n = links.length;
    const radius = Math.max(260, n * 34);
    links.forEach((l, i) => {
      const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      nodes.push({
        id: l.slug,
        type: "law",
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { title: l.title, status: l.status, center: false, isDark, out: l.out, in: l.in },
      });
      const stroke = isDark ? "#C8A762" : "#0B3D2E";
      if (l.out > 0) {
        edges.push({ id: `o-${l.slug}`, source: slug, target: l.slug, label: String(l.out), markerEnd: { type: MarkerType.ArrowClosed, color: stroke }, style: { stroke, strokeWidth: Math.min(1 + l.out / 3, 4) } });
      }
      if (l.in > 0) {
        edges.push({ id: `i-${l.slug}`, source: l.slug, target: slug, label: String(l.in), markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8", strokeWidth: Math.min(1 + l.in / 3, 4), strokeDasharray: "4 3" } });
      }
    });
    return { nodes, edges };
  }, [links, slug, lawTitle, lawStatus, isDark]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  if (state.status === "loading") return <p className={`p-6 text-center text-[12px] ${muted}`}>جارٍ رسم الخريطة…</p>;
  if (state.status === "failed") return <p className={`p-6 text-center text-[12px] ${muted}`}>تعذّر تحميل خريطة التشابك الآن.</p>;
  if (state.data && !state.data.available) return <p className={`p-6 text-center text-[12px] ${muted}`}>خريطة التشابك غير متاحة بعد.</p>;
  if (links.length === 0) return <p className={`p-6 text-center text-[12px] ${muted}`}>لا توجد أنظمة مرتبطة بهذا النظام في شبكة الإحالات بعد.</p>;

  return (
    <div className="space-y-2">
      <div dir="ltr" className="h-[60vh] min-h-[320px] rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesConnectable={false}
          nodesDraggable
          edgesFocusable={false}
          minZoom={0.2}
          maxZoom={1.8}
          colorMode={isDark ? "dark" : "light"}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => {
            if (n.id !== slug) window.location.assign(`/laws/${encodeURIComponent(n.id)}`);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={isDark ? "#27272a" : "#e2e8f0"} />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>
      <p className={`text-[10px] ${muted}`}>
        الخط المتصل: مواد هذا النظام تُحيل إلى النظام الآخر · المتقطع: مواده تُحيل إلى هذا النظام · الرقم: عدد الإحالات.
        {state.data?.available && state.data.truncated && " تُعرض أكثر الأنظمة ارتباطاً فقط."}
      </p>
      <ul className="sr-only">
        {links.map((l) => (
          <li key={l.slug}><Link href={`/laws/${encodeURIComponent(l.slug)}`}>{l.title}</Link></li>
        ))}
      </ul>
    </div>
  );
}
