"use client";

/**
 * NodeInspector.tsx — the explorer's detail column: what the selected node is,
 * whether it has a vector, every link it has on screen read in Arabic from its
 * own side («يعدّل» / «معدّلة بموجب»), with the evidence sentence the link was
 * extracted from, and its full text.
 */

import { useState } from "react";
import {
  ArrowSquareOut, Crosshair, CopySimple, Check, GitFork, X, Info, Lightning, CircleNotch,
} from "@phosphor-icons/react";
import {
  EDGE_TYPE_META,
  NODE_TYPE_META,
  edgePhrase,
  isExplorerEdgeType,
  isRepealedNode,
  type ExplorerEdge,
  type ExplorerEdgeType,
  type ExplorerNode,
  type LabHit,
} from "@/lib/ai/graphExplorerCore";
import type { NodeDetail } from "./explorerApi";

export interface InspectorConnection {
  edge: ExplorerEdge;
  other: ExplorerNode | undefined;
  direction: "out" | "in";
}

interface Props {
  node: ExplorerNode | null;
  detail: NodeDetail | null;
  loading: boolean;
  isCenter: boolean;
  connections: InspectorConnection[];
  labHit: (LabHit & { rank: number }) | null;
  onFocus: (key: string) => void;
  onExpand: (key: string) => void;
  onSelect: (key: string) => void;
  onClose: () => void;
}

const STATUS_AR: Record<string, string> = {
  active: "ساري",
  amended: "معدّل",
  added: "مضاف",
  repealed: "ملغى",
  status_undeclared: "غير مصرّح بالحالة",
};

export default function NodeInspector({ node, detail, loading, isCenter, connections, labHit, onFocus, onExpand, onSelect, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [fullText, setFullText] = useState(false);

  if (!node || node.node_type === "query") {
    return (
      <div className="flex h-full flex-col gap-4 p-5 text-[12.5px] leading-relaxed text-zinc-400">
        <div className="flex items-center gap-2 text-zinc-200">
          <Info size={16} weight="duotone" className="text-[#C8A762]" />
          <span className="font-heading text-[14px] font-bold">طريقة الاستخدام</span>
        </div>
        <ul className="space-y-2.5">
          <li><b className="text-zinc-200">نقرة</b> على بطاقة تعرض تفاصيلها وروابطها هنا.</li>
          <li><b className="text-zinc-200">نقرتان</b> تجعلان البطاقة مركز الاستكشاف.</li>
          <li><b className="text-zinc-200">توسيع</b> يضيف جوار البطاقة دون مغادرة المركز الحالي.</li>
          <li>اضغط <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]">/</kbd> للبحث، و<kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]">Esc</kbd> لإلغاء التحديد.</li>
          <li>اضغط على أنواع الروابط أسفل الخريطة لإخفائها أو إظهارها.</li>
        </ul>
        <div className="mt-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[11.5px]">
          النقطة الذهبية على البطاقة تعني أن للنص متجهاً دلالياً؛ النقطة المفرغة تعني أنه ينتظر التضمين ويُبحث فيه نصياً وعبر الروابط فقط.
        </div>
      </div>
    );
  }

  const meta = NODE_TYPE_META[node.node_type];
  const status = detail?.item_status ?? node.item_status ?? detail?.doc_status ?? node.doc_status ?? null;
  const repealed = isRepealedNode(detail ?? node);
  const hasVector = detail ? detail.embeddings.some((e) => e.is_default) : node.has_vector;
  const url = detail?.url ?? node.url ?? "";

  const grouped = new Map<string, InspectorConnection[]>();
  for (const c of connections) {
    const k = `${c.edge.edge_type}|${c.direction}`;
    grouped.set(k, [...(grouped.get(k) ?? []), c]);
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(node!.node_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard refused: nothing to do */
    }
  }

  const text = detail?.display_text ?? node.snippet ?? "";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative border-b border-zinc-800/80 p-5 pb-4">
        <span aria-hidden className="absolute inset-y-4 right-0 w-[3px] rounded-l-full" style={{ background: meta.color }} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold">
            <span className="rounded-full px-2 py-0.5" style={{ color: meta.color, background: `${meta.color}1a` }}>{meta.label}</span>
            {status && (
              <span className={`rounded-full px-2 py-0.5 ${repealed ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                {STATUS_AR[status] ?? status}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 ${hasVector ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-zinc-800 text-zinc-400"}`}>
              {hasVector ? "متجه دلالي ✓" : detail && !detail.is_embeddable ? "بلا متجه (نصي فقط)" : "بانتظار التضمين"}
            </span>
            {isCenter && <span className="rounded-full bg-[#C8A762] px-2 py-0.5 text-black">المركز</span>}
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <X size={14} />
          </button>
        </div>

        <h2 className={`mt-2.5 font-heading text-[17px] font-black leading-snug ${repealed ? "text-zinc-400 line-through decoration-red-400/50" : "text-white"}`}>
          {node.title}
        </h2>

        <button
          onClick={copyKey}
          className="mt-1.5 flex max-w-full items-center gap-1.5 truncate font-mono text-[10.5px] text-zinc-500 hover:text-zinc-300"
          title="نسخ المعرّف"
          dir="ltr"
        >
          {copied ? <Check size={11} className="text-emerald-400" /> : <CopySimple size={11} />}
          <span className="truncate">{node.node_key}</span>
        </button>

        {labHit && (
          <div className="mt-3 rounded-xl border border-[#C8A762]/30 bg-[#C8A762]/[0.06] p-2.5 text-[11.5px] text-zinc-300">
            <div className="flex items-center gap-2 font-bold text-[#C8A762]">
              <Lightning size={13} weight="fill" /> الترتيب S{labHit.rank} · الدرجة {labHit.score.toFixed(4)}
            </div>
            {labHit.via_edge_type && isExplorerEdgeType(labHit.via_edge_type) ? (
              <p className="mt-1 text-zinc-400">
                جاء عبر رابط «{EDGE_TYPE_META[labHit.via_edge_type].label}» من: <span className="text-zinc-200">{labHit.via_from_title}</span>
              </p>
            ) : (
              <p className="mt-1 text-zinc-400">نتيجة مباشرة من البحث النصي/الدلالي.</p>
            )}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2">
          {!isCenter && (
            <button onClick={() => onFocus(node.node_key)} className="flex items-center gap-1.5 rounded-lg bg-[#C8A762] px-3 py-1.5 text-[11.5px] font-black text-black hover:bg-[#d4b87a]">
              <Crosshair size={13} weight="bold" /> اجعلها المركز
            </button>
          )}
          <button onClick={() => onExpand(node.node_key)} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-[11.5px] font-bold text-zinc-200 hover:border-[#C8A762]/60">
            <GitFork size={13} /> توسيع الجوار
          </button>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-[11.5px] font-bold text-zinc-200 hover:border-[#C8A762]/60">
              <ArrowSquareOut size={13} /> فتح في المكتبة
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {detail?.edge_counts && Object.keys(detail.edge_counts).length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-bold tracking-wide text-zinc-500">كل روابطها في الجراف</h3>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(detail.edge_counts) as Array<[ExplorerEdgeType, { out: number; in: number }]>).map(([t, c]) => (
                <span key={t} className="rounded-md border px-2 py-0.5 text-[10.5px]" style={{ borderColor: `${EDGE_TYPE_META[t]?.color ?? "#71717a"}55`, color: EDGE_TYPE_META[t]?.color ?? "#a1a1aa" }}>
                  {EDGE_TYPE_META[t]?.label ?? t} · {c.out + c.in}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[11px] font-bold tracking-wide text-zinc-500">الروابط الظاهرة على الخريطة ({connections.length})</h3>
          {connections.length === 0 ? (
            <p className="text-[12px] text-zinc-500">لا روابط ظاهرة. جرّب «توسيع الجوار».</p>
          ) : (
            <div className="space-y-3">
              {[...grouped.entries()].map(([k, list]) => {
                const [type, direction] = k.split("|") as [string, "out" | "in"];
                const color = isExplorerEdgeType(type) ? EDGE_TYPE_META[type].color : "#C8A762";
                const phrase = isExplorerEdgeType(type) ? edgePhrase(type, direction) : "مطابقة للسؤال";
                return (
                  <div key={k}>
                    <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color }}>
                      <span className="inline-block h-[2px] w-4 rounded" style={{ background: color }} />
                      {phrase} <span className="font-normal text-zinc-500">({list.length})</span>
                    </div>
                    <ul className="space-y-1">
                      {list.slice(0, 40).map(({ edge, other }) => (
                        <li key={`${edge.source}|${edge.target}|${edge.edge_type}`}>
                          <button
                            onClick={() => other && onSelect(other.node_key)}
                            className="w-full rounded-lg px-2 py-1.5 text-right text-[12px] text-zinc-300 hover:bg-zinc-800/70"
                          >
                            <span className="line-clamp-1">{other?.title ?? "—"}</span>
                            {edge.evidence && (
                              <span className="mt-0.5 line-clamp-2 block text-[10.5px] italic leading-relaxed text-zinc-500">«{edge.evidence}»</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-bold tracking-wide text-zinc-500">النص{detail ? ` (${detail.text_length.toLocaleString("en-US")} حرفاً)` : ""}</h3>
            {loading && <CircleNotch size={13} className="animate-spin text-zinc-500" />}
          </div>
          {detail?.contextual_header && (
            <p className="mb-2 rounded-lg bg-zinc-900/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-zinc-500">{detail.contextual_header}</p>
          )}
          <div className={`whitespace-pre-wrap text-[12.5px] leading-[1.9] text-zinc-300 ${fullText ? "" : "max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"}`}>
            {text || (loading ? "جارٍ التحميل…" : "—")}
          </div>
          {text.length > 600 && (
            <button onClick={() => setFullText((v) => !v)} className="mt-2 text-[11.5px] font-bold text-[#C8A762] hover:underline">
              {fullText ? "إخفاء" : "عرض النص كاملاً"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
