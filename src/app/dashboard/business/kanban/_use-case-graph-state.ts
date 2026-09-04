import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import {
  NODE_H,
  NODE_W,
  type GraphEdge,
  type GraphNode,
  type NodeGroup,
  type Point,
} from "./_graph-model";
import { toArabicDigits } from "@/lib/services/arabicCount";

export function useCaseGraphState({
  initialNodes: seedNodes,
  initialEdges: seedEdges,
}: {
  initialNodes?: GraphNode[];
  initialEdges?: GraphEdge[];
}) {
  // THE FALLBACK IS EMPTY. It used to be
  //     seedNodes ?? (isGlobal ? [] : MOCK_NODES)
  // and `isGlobal` was the wrong discriminator: BOTH lawyer mounts of
  // CaseGraphView (dashboard/lawyer/cases/[id]/page.tsx, the inline panel and the
  // fullscreen overlay) pass `isGlobal={false}` with no seed, so every real case a
  // lawyer opened was painted with an invented contractor dispute — see the note
  // in ./_graph-model.ts for what was in it. dashboard/business/cases/[id] mounted
  // it with no props at all and got the same. An unseeded board is now empty for
  // every caller; a caller with real material passes it in `initialNodes`.
  const defaultNodes = seedNodes ?? [];
  const defaultEdges = seedEdges ?? [];
  const [nodes, setNodes] = useState<GraphNode[]>(defaultNodes);
  const [edges, setEdges] = useState<GraphEdge[]>(defaultEdges);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [drawingEdgeFrom, setDrawingEdgeFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point>({x: 0, y: 0});
  const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{nodeId: string; x: number; y: number} | null>(null);
  const [pan, setPan] = useState<Point>({x: 0, y: 0});
  const [isPanning, setIsPanning] = useState(false);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [edgeDropMenu, setEdgeDropMenu] = useState<{x: number; y: number; canvasX: number; canvasY: number} | null>(null);
  const [selectedNodeDetail, setSelectedNodeDetail] = useState<GraphNode | null>(null);
  const [clipboard, setClipboard] = useState<GraphNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  // ── Multi-select ────────────────────────────────────────────────────────────
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const selectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;

  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIds(id ? new Set([id]) : new Set());
  }, []);

  const toggleNodeSelection = useCallback((id: string) => {
    setSelectedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Groups (lock/unlock) ────────────────────────────────────────────────────
  const [groups, setGroups] = useState<NodeGroup[]>([]);

  const createGroup = useCallback(() => {
    if (selectedNodeIds.size < 2) return;
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#C8A762"];
    const gid = `grp_${Date.now()}`;
    const newGroup: NodeGroup = {
      id: gid,
      label: `مجموعة ${groups.length + 1}`,
      color: colors[groups.length % colors.length],
      nodeIds: Array.from(selectedNodeIds),
      locked: true,
    };
    setGroups(prev => [...prev, newGroup]);
    setNodes(prev => prev.map(n => selectedNodeIds.has(n.id) ? { ...n, groupId: gid } : n));
  }, [selectedNodeIds, groups.length]);

  const dissolveGroup = useCallback((gid: string) => {
    setGroups(prev => prev.filter(g => g.id !== gid));
    setNodes(prev => prev.map(n => n.groupId === gid ? { ...n, groupId: undefined } : n));
  }, []);

  const toggleGroupLock = useCallback((gid: string) => {
    setGroups(prev => prev.map(g => g.id === gid ? { ...g, locked: !g.locked } : g));
  }, []);

  // ── Edge context menu ───────────────────────────────────────────────────────
  const [edgeMenu, setEdgeMenu] = useState<{edgeId: string; x: number; y: number} | null>(null);

  const handleEdgeContextMenu = useCallback((edgeId: string, x: number, y: number) => {
    setEdgeMenu({ edgeId, x, y });
  }, []);

  const updateEdgeStyle = useCallback((edgeId: string, updates: Partial<GraphEdge>) => {
    setEdges(prev => prev.map(e => e.id === edgeId ? { ...e, ...updates } : e));
    setEdgeMenu(null);
  }, []);

  // ── Text summary of the board ───────────────────────────────────────────────
  //
  // What this does and does not do. It walks the user's own cards and links and
  // joins them into markdown. That part was always real. Three things around it
  // were not, and are gone:
  //   • the header read «تحليل آلي بواسطة نظامي AI» — no analysis of any kind
  //     runs here, and on a lawyer's case file the body it headed was the invented
  //     contractor dispute from the old MOCK_NODES seed, which this label then
  //     carried out of the browser as a نظامي-AI-branded case summary;
  //   • three literal «التوصيات» bullets ("review the links between the parties
  //     and the documents"…) presented as the conclusions of that analysis;
  //   • a 1200ms setTimeout behind a spinner, which was there to make an
  //     instantaneous string join look like work being done.
  // The result is a plain transcript of what the user typed, and says so.
  const [aiDocument, setAiDocument] = useState<string | null>(null);

  const generateAiDocument = useCallback((targetIds?: Set<string>) => {
    // Scope: use provided IDs, or fall back to the whole graph
    const scopedNodes = targetIds && targetIds.size > 0
      ? nodes.filter(n => targetIds.has(n.id))
      : nodes;
    const isPartial = targetIds && targetIds.size > 0 && scopedNodes.length < nodes.length;

    const sections = scopedNodes.map(n => {
      const relEdges = edges.filter(e => e.from === n.id || e.to === n.id);
      const connections = relEdges
        .map(e => {
          const other = e.from === n.id
            ? nodes.find(nd => nd.id === e.to)
            : nodes.find(nd => nd.id === e.from);
          return `  - ${e.label} ← ${other?.title ?? "غير معروف"}`;
        })
        .join("\n");
      return `## ${n.title}\n${n.desc}${connections ? `\n### الروابط:\n${connections}` : ""}`;
    }).join("\n\n---\n\n");

    const scope = isPartial
      ? `(${toArabicDigits(scopedNodes.length)} بطاقات مختارة من أصل ${toArabicDigits(nodes.length)})`
      : `(اللوحة كاملة — ${toArabicDigits(nodes.length)} بطاقة)`;

    const doc = `# ملخص اللوحة البصرية ${scope}\n\nنسخ نصي لبطاقات اللوحة وروابطها كما كتبتها — ${new Date().toLocaleDateString("ar-SA")}\n\n---\n\n${sections}`;

    setAiDocument(doc);
  }, [nodes, edges]);

  // ── Resizing nodes ──────────────────────────────────────────────────────────
  const [resizingNode, setResizingNode] = useState<{ id: string, dir: string } | null>(null);

  const handleResizeStart = useCallback((nodeId: string, dir: string, e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setResizingNode({ id: nodeId, dir });
  }, []);

  const handleResizeMove = useCallback((e: PointerEvent) => {
    if (!resizingNode) return;
    setNodes(prev => prev.map(n => {
      if (n.id !== resizingNode.id) return n;
      
      let newW = n.w ?? 220;
      let newH = n.h ?? 90;
      let newX = n.pos.x;
      let newY = n.pos.y;
      
      const dx = e.movementX / scale;
      const dy = e.movementY / scale;

      if (resizingNode.dir.includes('e')) newW = Math.max(180, newW + dx);
      if (resizingNode.dir.includes('s')) newH = Math.max(90, newH + dy);
      if (resizingNode.dir.includes('w')) {
        const maybeW = newW - dx;
        if (maybeW >= 180) {
          newW = maybeW;
          newX += dx;
        }
      }
      if (resizingNode.dir.includes('n')) {
        const maybeH = newH - dy;
        if (maybeH >= 90) {
          newH = maybeH;
          newY += dy;
        }
      }

      return { ...n, w: newW, h: newH, pos: { x: newX, y: newY } };
    }));
  }, [resizingNode, scale]);

  const handleResizeEnd = useCallback(() => {
    setResizingNode(null);
  }, []);

  const pointerDownPos = useRef<Point>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Global click: close menus
  useEffect(() => {
    const handleGlobalClick = () => { setContextMenu(null); setNodeMenu(null); setEdgeDropMenu(null); setEdgeMenu(null); };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Ctrl+Scroll → zoom (prevents page scroll)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setScale(prev => Math.min(3, Math.max(0.25, prev + delta)));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Keyboard: Ctrl+C copy, Ctrl+V paste, Delete remove, Ctrl+G group, Escape deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Ctrl+G → create group from selection
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault();
        createGroup();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedNodeIds.size > 0) {
        const firstId = Array.from(selectedNodeIds)[0];
        const node = nodes.find(n => n.id === firstId);
        if (node) setClipboard(node);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && clipboard) {
        const newNode: GraphNode = {
          ...clipboard,
          id: `n_${Date.now()}`,
          pos: { x: clipboard.pos.x + 40, y: clipboard.pos.y + 40 },
          groupId: undefined,
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeIds(new Set([newNode.id]));
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeIds.size > 0) {
        setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
        setEdges(prev => prev.filter(ed => !selectedNodeIds.has(ed.from) && !selectedNodeIds.has(ed.to)));
        setSelectedNodeIds(new Set());
      }
      if (e.key === "Escape") setSelectedNodeIds(new Set());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeIds, clipboard, nodes, createGroup]);

  // THREE SIMULATIONS USED TO LIVE HERE. All three are removed rather than
  // relabelled, because each of them wrote or implied content that no part of this
  // product produces:
  //
  //   generateErpGraph()     «استخراج من قضية (AI)» — a 1500ms spinner that then
  //                          replaced the board with ERP_GENERATED_NODES, a
  //                          fully invented case (a named plaintiff, a
  //                          «تسبيب المحكمة (المتوقع)» card) presented as having
  //                          been extracted from the case the user picked. It read
  //                          nothing. The launcher entry that called it is gone
  //                          from ./CaseGraphOverlays.tsx too.
  //
  //   runAiAnalysis()        a 2000ms setTimeout that spun «جاري التحليل...» and
  //                          then opened the analysis panel. There is no analysis
  //                          engine behind this canvas — no request, no model, no
  //                          rule set — and the panel it opens now says exactly
  //                          that. ./CaseGraphView.tsx opens the panel directly and
  //                          its button is labelled for what it is.
  //
  //   startVoiceRecording()  a Microphone button, `title="تفريغ صوتي"`, that
  //                          pulsed red for 2500ms with no getUserMedia, no
  //                          MediaRecorder and no transcription call, and then
  //                          appended the literal
  //                          «[ملاحظة صوتية]: يرجى مراجعة المادة ٧٧ بشأن الفسخ.»
  //                          to the card — an invented statutory instruction
  //                          written into a lawyer's own case board and attributed
  //                          to their voice. Dictation needs a recorder and a
  //                          transcription service; neither exists, so the control
  //                          is gone instead of being made vaguer.

  const handleCanvasPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('.node-element')) return;
    if ((e.target as Element).closest('button')) return;
    if ((e.target as Element).closest('input')) return;
    if ((e.target as Element).closest('textarea')) return;

    // Click on empty canvas without Ctrl → deselect all
    if (!e.ctrlKey && !e.metaKey) {
      setSelectedNodeIds(new Set());
    }

    setIsPanning(true);
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerDown = (id: string, e: PointerEvent) => {
    if (drawingEdgeFrom) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggedNode(id);
    pointerDownPos.current = { x: e.clientX, y: e.clientY };

    // Multi-select with Ctrl+Click
    if (e.ctrlKey || e.metaKey) {
      toggleNodeSelection(id);
    } else if (!selectedNodeIds.has(id)) {
      // Click without Ctrl on an unselected node → select only this one
      setSelectedNodeIds(new Set([id]));
    }
    // If already in selection, don't change selection (allows group-drag)
  };
  
  const handlePointerMove = (e: PointerEvent) => {
    if (!canvasRef.current) return;

    // Handle resize
    if (resizingNode) {
      handleResizeMove(e);
      return;
    }
    
    if (drawingEdgeFrom) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - pan.x;
      const y = e.clientY - rect.top - pan.y;
      setMousePos({ x, y });
    } else if (draggedNode) {
      const dx = e.movementX / scale;
      const dy = e.movementY / scale;

      // Check if dragged node is in a locked group → move whole group
      const draggedNodeObj = nodes.find(n => n.id === draggedNode);
      const nodeGroupId = draggedNodeObj?.groupId;
      const group = nodeGroupId ? groups.find(g => g.id === nodeGroupId) : null;

      if (group && group.locked) {
        // Move all nodes in this group
        setNodes(prev => prev.map(n => group.nodeIds.includes(n.id) ? { ...n, pos: { x: n.pos.x + dx, y: n.pos.y + dy } } : n));
      } else if (selectedNodeIds.size > 1 && selectedNodeIds.has(draggedNode)) {
        // Move all selected nodes together
        setNodes(prev => prev.map(n => selectedNodeIds.has(n.id) ? { ...n, pos: { x: n.pos.x + dx, y: n.pos.y + dy } } : n));
      } else {
        setNodes(prev => prev.map(n => n.id === draggedNode ? { ...n, pos: { x: n.pos.x + dx, y: n.pos.y + dy } } : n));
      }
    } else if (isPanning) {
      setPan(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    }
  };
  
  const handlePointerUp = (e: PointerEvent) => {
    if (resizingNode) {
      handleResizeEnd();
      return;
    }
    if (drawingEdgeFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setEdgeDropMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        canvasX: e.clientX - rect.left - pan.x,
        canvasY: e.clientY - rect.top - pan.y,
      });
    }
    setDraggedNode(null);
    setDrawingEdgeFrom(null);
    setIsPanning(false);
  };

  const startDrawingEdge = (nodeId: string, e: PointerEvent) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDrawingEdgeFrom(nodeId);
    setMousePos({ x: e.clientX - rect.left - pan.x, y: e.clientY - rect.top - pan.y });
  };

  const handleNodePointerUp = (targetNodeId: string, e: PointerEvent) => {
    if (drawingEdgeFrom && drawingEdgeFrom !== targetNodeId) {
      e.stopPropagation();
      const newEdge: GraphEdge = {
        id: `e_${Date.now()}`,
        from: drawingEdgeFrom,
        to: targetNodeId,
        type: "support",
        label: "صلة جديدة",
      };
      setEdges(prev => [...prev, newEdge]);
      setEdgeDropMenu(null);
    }
    setDrawingEdgeFrom(null);
    setDraggedNode(null);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setNodeMenu(null);
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleNodeContextMenu = (nodeId: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setNodeMenu({ nodeId, x: e.clientX, y: e.clientY });
  };

  const handleNodeTextChange = (id: string, field: "title" | "desc", text: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: text } : n));
  };

  const handleEdgeLabelChange = (edgeId: string, text: string) => {
    setEdges(prev => prev.map(e => e.id === edgeId ? { ...e, label: text } : e));
  };

  /**
   * Frame every card into view: computes the bounding box of all `nodes`
   * (falling back to NODE_W/NODE_H for a card with no explicit size) and sets
   * `pan`/`scale` so the whole box is centred and visible inside the canvas
   * viewport, with a margin.
   *
   * Fixes what the owner's shot 05 caught: a card dragged toward the edge was
   * clipped by the canvas frame with no way back except manual panning or the
   * fullscreen toggle — no fit-to-view existed. `CaseGraphView.tsx` calls this
   * once automatically the first time a board's nodes are ready, and again
   * from a toolbar button the lawyer can press any time.
   */
  const fitToView = useCallback(() => {
    const el = canvasRef.current;
    if (!el || nodes.length === 0) return;
    const MARGIN = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const w = n.w ?? NODE_W;
      const h = n.h ?? NODE_H;
      minX = Math.min(minX, n.pos.x);
      minY = Math.min(minY, n.pos.y);
      maxX = Math.max(maxX, n.pos.x + w);
      maxY = Math.max(maxY, n.pos.y + h);
    });
    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);
    const rect = el.getBoundingClientRect();
    const availW = Math.max(1, rect.width - MARGIN * 2);
    const availH = Math.max(1, rect.height - MARGIN * 2);
    const nextScale = Math.min(1.25, Math.max(0.25, Math.min(availW / boxW, availH / boxH)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setScale(nextScale);
    setPan({
      x: rect.width / 2 - centerX * nextScale,
      y: rect.height / 2 - centerY * nextScale,
    });
  }, [nodes]);

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    drawingEdgeFrom,
    mousePos,
    contextMenu,
    setContextMenu,
    nodeMenu,
    setNodeMenu,
    pan,
    setPan,
    isPanning,
    showAiAnalysis,
    setShowAiAnalysis,
    isFullscreen,
    setIsFullscreen,
    edgeDropMenu,
    setEdgeDropMenu,
    selectedNodeDetail,
    setSelectedNodeDetail,
    // Multi-select
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    toggleNodeSelection,
    // Groups
    groups,
    setGroups,
    createGroup,
    dissolveGroup,
    toggleGroupLock,
    // Edge menu
    edgeMenu,
    setEdgeMenu,
    handleEdgeContextMenu,
    updateEdgeStyle,
    // Text summary of the board
    aiDocument,
    setAiDocument,
    generateAiDocument,
    // Resize
    resizingNode,
    handleResizeStart,
    // Scale
    scale,
    setScale,
    hoveredNodeId,
    setHoveredNodeId,
    canvasRef,
    handleCanvasPointerDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    startDrawingEdge,
    handleNodePointerUp,
    handleContextMenu,
    handleNodeContextMenu,
    handleNodeTextChange,
    handleEdgeLabelChange,
    fitToView,
  };
}
