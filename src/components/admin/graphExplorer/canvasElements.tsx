"use client";

/**
 * canvasElements.tsx — the Legal Graph Explorer's custom React Flow pieces:
 *   LegalNodeCard  an index card per node (coloured spine = type)
 *   QueryNode      the retrieval lab's question, drawn as a gold seal
 *   OrbitsNode     faint concentric rings marking hop distance (decoration)
 *   FloatingEdge   a straight link that meets each card at its border, with
 *                  an arrow and an Arabic label pill when highlighted
 */

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Seal } from "@phosphor-icons/react";
import { NODE_TYPE_META, isRepealedNode, type ExplorerNode } from "@/lib/ai/graphExplorerCore";

export const QUERY_COLOR = "#F2E6C4";

export type LegalNodeData = {
  node: ExplorerNode;
  isCenter: boolean;
  isSelected: boolean;
  dimmed: boolean;
  rank?: number;
  enterDelay: number;
};
export type LegalFlowNode = Node<LegalNodeData, "legal">;
export type QueryFlowNode = Node<{ title: string; hits: number }, "query">;
export type OrbitsFlowNode = Node<{ radii: number[] }, "orbits">;
export type LaneFlowNode = Node<{ label: string; phrase: string; count: number; color: string }, "lane">;

/** A column heading in the lanes layout: which link the cards below share with the centre. */
export const LaneLabelNode = memo(function LaneLabelNode({ data }: NodeProps<LaneFlowNode>) {
  return (
    <div dir="rtl" className="gx-enter pointer-events-none flex w-[232px] items-center gap-2 border-b pb-1.5" style={{ borderColor: `${data.color}40` }}>
      <span className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]" style={{ background: data.color }} />
      <span className="font-heading text-[13px] font-black" style={{ color: data.color }}>{data.label}</span>
      <span className="truncate text-[11px] text-zinc-500">{data.phrase}</span>
      <span className="mr-auto font-mono text-[11px] text-zinc-500">{data.count}</span>
    </div>
  );
});

export type FloatingEdgeData = {
  color: string;
  label: string;
  dashed: boolean;
  highlighted: boolean;
  faded: boolean;
  weight: number;
};
export type FloatingFlowEdge = Edge<FloatingEdgeData, "floating">;

function HiddenHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="gx-handle" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="gx-handle" isConnectable={false} />
    </>
  );
}

export const LegalNodeCard = memo(function LegalNodeCard({ data }: NodeProps<LegalFlowNode>) {
  const { node, isCenter, isSelected, dimmed, rank, enterDelay } = data;
  const meta = node.node_type === "query" ? null : NODE_TYPE_META[node.node_type];
  const color = meta?.color ?? QUERY_COLOR;
  const repealed = isRepealedNode(node);

  return (
    <div
      dir="rtl"
      className={[
        "gx-enter relative overflow-hidden rounded-[14px] border text-right backdrop-blur-sm transition-[opacity,box-shadow,transform] duration-200",
        isCenter ? "w-[284px] px-4 pb-3.5 pt-3" : "w-[232px] px-3.5 pb-3 pt-2.5",
        dimmed ? "opacity-25" : "opacity-100",
        isSelected ? "scale-[1.03]" : "hover:-translate-y-0.5",
      ].join(" ")}
      style={{
        animationDelay: `${enterDelay}ms`,
        background: isCenter
          ? "linear-gradient(160deg, rgba(200,167,98,0.16), rgba(16,16,20,0.96) 46%)"
          : "rgba(16,16,20,0.94)",
        borderColor: isSelected || isCenter ? color : `${color}50`,
        boxShadow: isCenter
          ? `0 0 0 1px ${color}40, 0 0 0 6px rgba(200,167,98,0.07), 0 18px 50px -12px rgba(200,167,98,0.35)`
          : isSelected
            ? `0 0 0 3px ${color}33, 0 14px 36px -14px ${color}88`
            : "0 10px 28px -16px rgba(0,0,0,0.9)",
      }}
    >
      <span aria-hidden className="absolute inset-y-2.5 right-0 w-[3px] rounded-l-full" style={{ background: color }} />

      <div className="flex items-center justify-between gap-2 text-[10.5px] leading-none">
        <span className="font-bold tracking-wide" style={{ color }}>
          {isCenter ? `◆ ${meta?.label ?? "السؤال"}` : (meta?.label ?? "السؤال")}
        </span>
        <span className="flex items-center gap-1.5 text-zinc-500">
          {node.degree > 0 && <span className="font-mono">{node.degree}</span>}
          <span
            title={node.has_vector ? "له متجه دلالي" : "بانتظار التضمين الدلالي"}
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={node.has_vector ? { background: "#C8A762" } : { border: "1px solid #52525b" }}
          />
        </span>
      </div>

      <p
        className={`mt-1.5 line-clamp-2 font-heading font-bold leading-snug ${repealed ? "text-zinc-500 line-through decoration-red-400/50" : "text-zinc-100"} ${isCenter ? "text-[15px]" : "text-[13px]"}`}
      >
        {node.title}
      </p>

      {node.snippet && (isCenter || isSelected) && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{node.snippet}</p>
      )}

      {repealed && (
        <span className="absolute left-2 top-2 rounded-full border border-red-400/40 bg-red-500/10 px-1.5 py-[1px] text-[9.5px] font-bold text-red-300">
          ملغاة
        </span>
      )}
      {rank !== undefined && (
        <span className="absolute -left-px -top-px rounded-br-[10px] rounded-tl-[14px] bg-[#C8A762] px-2 py-0.5 font-mono text-[10px] font-black text-black">
          S{rank}
        </span>
      )}
      <HiddenHandles />
    </div>
  );
});

export const QueryNode = memo(function QueryNode({ data }: NodeProps<QueryFlowNode>) {
  return (
    <div dir="rtl" className="gx-enter relative flex h-[176px] w-[176px] items-center justify-center rounded-full text-center">
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 40%, rgba(242,230,196,0.18), rgba(16,16,20,0.96) 68%)",
          boxShadow: "0 0 0 1px rgba(200,167,98,0.55), 0 0 0 9px rgba(200,167,98,0.07), 0 0 60px -10px rgba(200,167,98,0.5)",
        }}
      />
      <span aria-hidden className="absolute inset-[9px] rounded-full border border-dashed border-[#C8A762]/35" />
      <div className="relative px-6">
        <Seal size={18} weight="duotone" className="mx-auto text-[#C8A762]" />
        <p className="mt-1 text-[9.5px] font-bold tracking-[0.18em] text-[#C8A762]">السؤال · {data.hits} نتيجة</p>
        <p className="mt-1 line-clamp-3 font-heading text-[12.5px] font-bold leading-snug text-zinc-100">{data.title}</p>
      </div>
      <HiddenHandles />
    </div>
  );
});

export const OrbitsNode = memo(function OrbitsNode({ data }: NodeProps<OrbitsFlowNode>) {
  const outer = Math.max(...data.radii, 1);
  const size = outer * 2 + 40;
  const c = size / 2;
  return (
    <svg width={size} height={size} className="pointer-events-none overflow-visible" aria-hidden>
      <defs>
        <radialGradient id="gx-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C8A762" stopOpacity="0.10" />
          <stop offset="60%" stopColor="#C8A762" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#C8A762" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={outer + 20} fill="url(#gx-core)" />
      {data.radii.map((r, i) => (
        <g key={r}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#C8A762" strokeOpacity={0.16 - i * 0.04} strokeWidth={1} strokeDasharray="2 7" />
          <text x={c} y={c - r - 8} textAnchor="middle" fill="#C8A762" fillOpacity={0.4} fontSize={11} fontFamily="var(--font-body)">
            {i === 0 ? "الحلقة الأولى" : "الحلقة الثانية"}
          </text>
        </g>
      ))}
    </svg>
  );
});

/** Where the line from `node`'s centre toward `other`'s centre crosses `node`'s border. */
function borderPoint(node: InternalNode, other: InternalNode): { x: number; y: number } {
  const w = (node.measured.width ?? 232) / 2;
  const h = (node.measured.height ?? 80) / 2;
  const cx = node.internals.positionAbsolute.x + w;
  const cy = node.internals.positionAbsolute.y + h;
  const ox = other.internals.positionAbsolute.x + (other.measured.width ?? 232) / 2;
  const oy = other.internals.positionAbsolute.y + (other.measured.height ?? 80) / 2;
  const xx1 = (ox - cx) / (2 * w) - (oy - cy) / (2 * h);
  const yy1 = (ox - cx) / (2 * w) + (oy - cy) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return { x: w * (xx3 + yy3) + cx, y: h * (-xx3 + yy3) + cy };
}

export function FloatingEdge({ id, source, target, markerEnd, data }: EdgeProps<FloatingFlowEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;

  const a = borderPoint(s, t);
  const b = borderPoint(t, s);
  const [path, labelX, labelY] = getStraightPath({ sourceX: a.x, sourceY: a.y, targetX: b.x, targetY: b.y });
  const width = data.highlighted ? 2.4 : Math.min(1.8, 0.9 + data.weight * 0.35);
  const opacity = data.faded ? 0.08 : data.highlighted ? 1 : 0.42;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={data.highlighted ? "gx-edge-flow" : undefined}
        style={{
          stroke: data.color,
          strokeWidth: width,
          strokeOpacity: opacity,
          strokeDasharray: data.highlighted ? undefined : data.dashed ? "5 6" : undefined,
          transition: "stroke-opacity 180ms, stroke-width 180ms",
        }}
      />
      {data.highlighted && data.label && (
        <EdgeLabelRenderer>
          <div
            dir="rtl"
            className="nodrag nopan pointer-events-none absolute rounded-full border bg-[#0b0b0e]/95 px-2 py-0.5 text-[10.5px] font-bold shadow-lg"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: data.color,
              borderColor: `${data.color}66`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LAB_MATCH_COLOR = "#C8A762";
