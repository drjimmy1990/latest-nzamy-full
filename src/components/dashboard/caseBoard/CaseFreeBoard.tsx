"use client";

/**
 * CaseFreeBoard — «لوحة»: the free board of one case (owner ١٨٩ (ب), batch
 * l13), a tab beside the case map on the lawyer and firm case files. The map
 * stays exactly as it was; this is a second, simpler surface.
 *
 * What a person can do: add a card, write its title and text, drag it, pick
 * its colour, connect two cards with a line (drag from a dot on a card's edge
 * to another card), select a card or a line and delete it. Everything is
 * saved to the case (public.case_free_boards via /api/v1/lawyer/case-board)
 * and read back by everyone who works on the case — no one else.
 *
 * Nothing here is generated: no AI, no suggested cards, no sample board. A
 * case with no board opens on an honest empty state.
 *
 * Built on @xyflow/react — the canvas library the office map already uses
 * (OfficeGraphView). The case map itself is hand-drawn with no library; its
 * autosave controller (caseGraphAutosave.ts: debounce, retries, conflict
 * stop) is reused here as is.
 *
 * SAVE RULES: nothing is saved until the saved board was read; a failed read
 * shows a retry and no board (an empty board must never be saved over a real
 * one). A colleague's newer save stops the autosave and asks which copy to
 * keep. Leaving the tab sends what is still unsaved.
 */

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  ConnectionMode,
  Handle,
  Position,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowClockwise, CircleNotch, NotePencil, Plus, TrashSimple, Warning } from "@phosphor-icons/react";
import {
  FREE_BOARD_COLORS,
  FREE_BOARD_COLOR_LABELS,
  FREE_BOARD_LIMITS,
  FREE_BOARD_PALETTE,
  newFreeBoardId,
  type FreeBoardColor,
  type FreeBoardPayload,
  type FreeLink,
} from "@/lib/services/caseFreeBoard";
import { FreeBoardReadError, getFreeBoard, saveFreeBoard } from "@/lib/services/caseFreeBoardService";
import { GraphAutosave, canonicalJson, type AutosaveStatus } from "@/lib/services/caseGraphAutosave";
import { toArabicDigits } from "@/lib/services/arabicCount";

type CardData = { title: string; text: string; color: FreeBoardColor };
type CardNode = Node<CardData, "card">;

interface BoardActions {
  isDark: boolean;
  focusId: string | null;
  update(id: string, patch: Partial<CardData>): void;
  remove(id: string): void;
}
const BoardActionsContext = createContext<BoardActions | null>(null);

const HANDLE_STYLE: React.CSSProperties = { width: 10, height: 10, borderRadius: 999, border: "2px solid #fff" };

/** Which side of each card a line leaves from / arrives at: the facing sides. */
function facingHandles(a: { x: number; y: number }, b: { x: number; y: number }): { source: string; target: string } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? { source: "r", target: "l" } : { source: "l", target: "r" };
  return dy > 0 ? { source: "b", target: "t" } : { source: "t", target: "b" };
}

const CardNodeView = memo(function CardNodeView({ id, data, selected }: NodeProps<CardNode>) {
  const actions = useContext(BoardActionsContext);
  const titleRef = useRef<HTMLInputElement>(null);
  const focusId = actions?.focusId;
  useEffect(() => {
    if (focusId === id) titleRef.current?.focus();
  }, [focusId, id]);
  if (!actions) return null;
  const { isDark } = actions;
  const pal = FREE_BOARD_PALETTE[data.color] ?? FREE_BOARD_PALETTE.amber;
  const handleStyle = { ...HANDLE_STYLE, background: pal.edge, borderColor: isDark ? "#18181b" : "#fff" };
  return (
    <div
      dir="rtl"
      className={`w-[230px] rounded-xl border shadow-sm transition-shadow ${selected ? "shadow-lg" : ""}`}
      style={{
        background: isDark ? pal.dark : pal.light,
        borderColor: selected ? pal.edge : isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.12)",
        borderTop: `4px solid ${pal.edge}`,
        outline: selected ? `2px solid ${pal.edge}` : "none",
        outlineOffset: 1,
      }}
    >
      {(["t", "r", "b", "l"] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side === "t" ? Position.Top : side === "r" ? Position.Right : side === "b" ? Position.Bottom : Position.Left}
          style={handleStyle}
          title="اسحب من هنا إلى بطاقة أخرى لربطهما بخط"
        />
      ))}
      <div className="p-2.5 space-y-1.5">
        <input
          ref={titleRef}
          dir="auto"
          value={data.title}
          maxLength={FREE_BOARD_LIMITS.title}
          onChange={(e) => actions.update(id, { title: e.target.value })}
          placeholder="عنوان البطاقة"
          aria-label="عنوان البطاقة"
          className={`nodrag w-full bg-transparent text-[13px] font-bold outline-none placeholder:font-normal ${isDark ? "text-zinc-100 placeholder:text-zinc-500" : "text-slate-800 placeholder:text-slate-400"}`}
        />
        <textarea
          dir="auto"
          value={data.text}
          maxLength={FREE_BOARD_LIMITS.text}
          onChange={(e) => actions.update(id, { text: e.target.value })}
          placeholder="اكتب هنا…"
          aria-label="نص البطاقة"
          rows={3}
          className={`nodrag nowheel w-full resize-none bg-transparent text-[12px] leading-relaxed outline-none ${isDark ? "text-zinc-300 placeholder:text-zinc-500" : "text-slate-600 placeholder:text-slate-400"}`}
        />
        {selected && (
          <div className="nodrag flex items-center justify-between gap-2 pt-1.5 border-t" style={{ borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)" }}>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="لون البطاقة">
              {FREE_BOARD_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={data.color === c}
                  aria-label={FREE_BOARD_COLOR_LABELS[c]}
                  title={FREE_BOARD_COLOR_LABELS[c]}
                  onClick={() => actions.update(id, { color: c })}
                  className="w-4 h-4 rounded-full"
                  style={{
                    background: FREE_BOARD_PALETTE[c].edge,
                    boxShadow: data.color === c ? `0 0 0 2px ${isDark ? "#18181b" : "#fff"}, 0 0 0 4px ${FREE_BOARD_PALETTE[c].edge}` : "none",
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => actions.remove(id)}
              className={`p-1 rounded-lg ${isDark ? "text-zinc-400 hover:text-rose-400 hover:bg-white/[0.06]" : "text-slate-500 hover:text-rose-600 hover:bg-slate-100"}`}
              aria-label="حذف البطاقة"
              title="حذف البطاقة"
            >
              <TrashSimple size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

const nodeTypes = { card: CardNodeView };

function toNodes(board: FreeBoardPayload): CardNode[] {
  return board.cards.map((c) => ({
    id: c.id,
    type: "card",
    position: { x: c.x, y: c.y },
    data: { title: c.title, text: c.text, color: c.color },
  }));
}

function toPayload(nodes: CardNode[], links: FreeLink[]): FreeBoardPayload {
  const ids = new Set(nodes.map((n) => n.id));
  return {
    cards: nodes.map((n) => ({
      id: n.id,
      title: n.data.title,
      text: n.data.text,
      color: n.data.color,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
    })),
    links: links.filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to),
  };
}

const STATUS_TEXT: Partial<Record<AutosaveStatus, string>> = {
  pending: "تعديلات لم تُحفظ بعد…",
  saving: "جارٍ الحفظ…",
  saved: "حُفظت اللوحة",
  retrying: "تعذّر الحفظ — نعيد المحاولة تلقائيًا",
};

export default function CaseFreeBoard({ caseId, isDark }: { caseId: string; isDark: boolean }) {
  return (
    <ReactFlowProvider>
      <FreeBoardCanvas key={caseId} caseId={caseId} isDark={isDark} />
    </ReactFlowProvider>
  );
}

function FreeBoardCanvas({ caseId, isDark }: { caseId: string; isDark: boolean }) {
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [readError, setReadError] = useState("");
  const [readTry, setReadTry] = useState(0);
  const [nodes, setNodes] = useState<CardNode[]>([]);
  const [links, setLinks] = useState<FreeLink[]>([]);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const autosave = useRef<GraphAutosave<FreeBoardPayload> | null>(null);
  /** the board as last loaded or handed to the autosave — a change is anything else */
  const lastCanon = useRef<string>("");

  const resetTo = useCallback((board: FreeBoardPayload) => {
    setNodes(toNodes(board));
    setLinks(board.links);
    setSelectedLink(null);
    lastCanon.current = canonicalJson(toPayload(toNodes(board), board.links));
  }, []);

  // ── the read (again on «إعادة المحاولة») ────────────────────────────────
  useEffect(() => {
    let alive = true;
    getFreeBoard(caseId)
      .then((board) => {
        if (!alive) return;
        resetTo(board ?? { cards: [], links: [] });
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setReadError(err instanceof FreeBoardReadError && err.status === 404
          ? "لا تملك الوصول إلى لوحة هذه القضية."
          : "تعذّرت قراءة اللوحة المحفوظة. لن يُحفظ شيء حتى تُقرأ.");
        setPhase("error");
      });
    return () => { alive = false; };
  }, [caseId, readTry, resetTo]);

  // ── the autosave: created only once the read succeeded ──────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const ctl = new GraphAutosave<FreeBoardPayload>({
      send: (payload) => saveFreeBoard(caseId, payload),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      onStatus: (s, m) => { setStatus(s); setStatusMsg(m ?? ""); },
    });
    autosave.current = ctl;
    const onHide = () => { if (document.visibilityState === "hidden") void ctl.send(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      autosave.current = null;
      void ctl.dispose();
    };
  }, [phase, caseId]);

  // ── every real change goes to the autosave (not while a card is moving) ──
  useEffect(() => {
    if (phase !== "ready" || !autosave.current) return;
    if (nodes.some((n) => n.dragging)) return;
    const payload = toPayload(nodes, links);
    const canon = canonicalJson(payload);
    if (canon === lastCanon.current) return;
    lastCanon.current = canon;
    autosave.current.change(payload);
  }, [nodes, links, phase]);

  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
    if (removed.length) setLinks((ls) => ls.filter((l) => !removed.includes(l.from) && !removed.includes(l.to)));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) {
      if (c.type === "select") setSelectedLink((cur) => (c.selected ? c.id : cur === c.id ? null : cur));
      if (c.type === "remove") {
        setLinks((ls) => ls.filter((l) => l.id !== c.id));
        setSelectedLink((cur) => (cur === c.id ? null : cur));
      }
    }
  }, []);

  const onConnect = useCallback((c: Connection) => {
    const { source, target } = c;
    if (!source || !target || source === target) return;
    setLinks((ls) => {
      if (ls.length >= FREE_BOARD_LIMITS.links) return ls;
      if (ls.some((l) => (l.from === source && l.to === target) || (l.from === target && l.to === source))) return ls;
      return [...ls, { id: newFreeBoardId("l"), from: source, to: target }];
    });
  }, []);

  const addCard = useCallback(() => {
    if (nodes.length >= FREE_BOARD_LIMITS.cards) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    const centre = rect
      ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    const step = (nodes.length % 6) * 24;
    const card: CardNode = {
      id: newFreeBoardId("c"),
      type: "card",
      position: { x: Math.round(centre.x - 115 + step), y: Math.round(centre.y - 60 + step) },
      data: { title: "", text: "", color: "amber" },
      selected: true,
    };
    setNodes((ns) => (ns.length >= FREE_BOARD_LIMITS.cards
      ? ns
      : [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), card]));
    setFocusId(card.id);
  }, [rf, nodes.length]);

  const actions = useMemo<BoardActions>(() => ({
    isDark,
    focusId,
    update: (id, patch) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    remove: (id) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setLinks((ls) => ls.filter((l) => l.from !== id && l.to !== id));
    },
  }), [isDark, focusId]);

  const edges = useMemo<Edge[]>(() => {
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    return links
      .filter((l) => pos.has(l.from) && pos.has(l.to))
      .map((l) => {
        const h = facingHandles(pos.get(l.from)!, pos.get(l.to)!);
        const sel = selectedLink === l.id;
        return {
          id: l.id,
          source: l.from,
          target: l.to,
          sourceHandle: h.source,
          targetHandle: h.target,
          selected: sel,
          style: { stroke: sel ? "#C8A762" : isDark ? "#71717a" : "#94a3b8", strokeWidth: sel ? 3 : 2 },
        };
      });
  }, [links, nodes, selectedLink, isDark]);

  const keepMine = useCallback(async () => {
    try {
      await getFreeBoard(caseId); // the saved version becomes this page's base…
      autosave.current?.resume(); // …and this board is saved over it
    } catch {
      setStatusMsg("تعذّرت قراءة اللوحة المحفوظة — حاول مرة أخرى.");
    }
  }, [caseId]);

  const takeSaved = useCallback(async () => {
    try {
      const board = await getFreeBoard(caseId);
      autosave.current?.discard();
      resetTo(board ?? { cards: [], links: [] });
    } catch {
      setStatusMsg("تعذّرت قراءة اللوحة المحفوظة — حاول مرة أخرى.");
    }
  }, [caseId, resetTo]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";

  if (phase === "loading") {
    return (
      <div className={`h-full flex items-center justify-center gap-2 text-sm ${muted}`}>
        <CircleNotch size={16} className="animate-spin" /> جارٍ تحميل اللوحة…
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Warning size={28} className="text-amber-500" />
        <p className={`text-sm ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{readError}</p>
        <button
          type="button"
          onClick={() => { setPhase("loading"); setReadTry((n) => n + 1); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-royal text-white"
        >
          <ArrowClockwise size={13} /> إعادة المحاولة
        </button>
      </div>
    );
  }

  const full = nodes.length >= FREE_BOARD_LIMITS.cards;
  return (
    <div className="h-full flex flex-col">
      <div className={`px-3 py-2 border-b flex flex-wrap items-center gap-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        <button
          type="button"
          onClick={addCard}
          disabled={full}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-royal text-white disabled:opacity-50"
          title={full ? `اللوحة تتسع لـ ${toArabicDigits(FREE_BOARD_LIMITS.cards)} بطاقة على الأكثر` : "إضافة بطاقة"}
        >
          <Plus size={13} weight="bold" /> بطاقة جديدة
        </button>
        {selectedLink && (
          <button
            type="button"
            onClick={() => { setLinks((ls) => ls.filter((l) => l.id !== selectedLink)); setSelectedLink(null); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold border ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.06]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <TrashSimple size={13} /> حذف الخط
          </button>
        )}
        <span className={`text-[11px] ${muted}`}>
          {toArabicDigits(nodes.length)} بطاقة · {toArabicDigits(links.length)} خط
        </span>
        <span className={`mr-auto text-[11px] ${status === "retrying" ? "text-amber-500" : muted}`} aria-live="polite">
          {STATUS_TEXT[status] ?? ""}
        </span>
      </div>

      {status === "conflict" && (
        <div className={`px-3 py-2 text-[12px] flex flex-wrap items-center gap-2 ${isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800"}`} role="alert">
          <Warning size={14} />
          <span>تغيّرت اللوحة المحفوظة من زميل أو من نافذة أخرى. توقّف الحفظ حتى تختار:</span>
          <button type="button" onClick={() => void takeSaved()} className="underline font-bold">اعرض المحفوظة</button>
          <button type="button" onClick={() => void keepMine()} className="underline font-bold">احفظ نسختي فوقها</button>
          {statusMsg && <span className="opacity-80">{statusMsg}</span>}
        </div>
      )}
      {status === "error" && (
        <div className={`px-3 py-2 text-[12px] flex flex-wrap items-center gap-2 ${isDark ? "bg-rose-500/10 text-rose-300" : "bg-rose-50 text-rose-700"}`} role="alert">
          <Warning size={14} />
          <span>لم تُحفظ آخر التعديلات{statusMsg ? `: ${statusMsg}` : "."}</span>
          <button type="button" onClick={() => autosave.current?.resume()} className="underline font-bold">أعد المحاولة</button>
        </div>
      )}

      <div ref={wrapRef} dir="ltr" className="relative flex-1 min-h-0">
        <BoardActionsContext.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={() => setSelectedLink(null)}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={["Delete", "Backspace"]}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            zoomOnDoubleClick={false}
            fitView={nodes.length > 0}
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            colorMode={isDark ? "dark" : "light"}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isDark ? "#3f3f46" : "#cbd5e1"} />
            <Controls position="top-left" showInteractive={false} />
          </ReactFlow>
        </BoardActionsContext.Provider>

        {nodes.length === 0 && (
          <div dir="rtl" className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
            <div className={`max-w-sm text-center rounded-2xl border p-5 pointer-events-auto ${isDark ? "bg-zinc-900/90 border-white/[0.08]" : "bg-white/95 border-slate-200"}`}>
              <NotePencil size={26} weight="duotone" className="mx-auto text-royal" />
              <p className={`mt-2 text-sm font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>اللوحة فارغة</p>
              <p className={`mt-1 text-[12px] leading-relaxed ${muted}`}>
                مساحة حرة لهذه القضية: أضف بطاقات واكتب فيها ما تشاء، ثم اسحبها ولوّنها، واربط بين بطاقتين بسحب خط من النقطة على حافة إحداهما إلى الأخرى. تُحفظ اللوحة تلقائيًا، ولا يراها إلا من يعمل على القضية.
              </p>
              <button
                type="button"
                onClick={addCard}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-royal text-white"
              >
                <Plus size={13} weight="bold" /> أضف أول بطاقة
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
