import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import {
  ERP_GENERATED_EDGES,
  ERP_GENERATED_NODES,
  MOCK_EDGES,
  MOCK_NODES,
  type GraphEdge,
  type GraphNode,
  type NodeGroup,
  type Point,
} from "./_graph-model";

export function useCaseGraphState({
  isGlobal,
  initialNodes: seedNodes,
  initialEdges: seedEdges,
}: {
  isGlobal?: boolean;
  initialNodes?: GraphNode[];
  initialEdges?: GraphEdge[];
}) {
  const defaultNodes = seedNodes ?? (isGlobal ? [] : MOCK_NODES);
  const defaultEdges = seedEdges ?? (isGlobal ? [] : MOCK_EDGES);
  const [nodes, setNodes] = useState<GraphNode[]>(defaultNodes);
  const [edges, setEdges] = useState<GraphEdge[]>(defaultEdges);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [showCaseSelector, setShowCaseSelector] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [isSimulatingErp, setIsSimulatingErp] = useState(false);
  const [drawingEdgeFrom, setDrawingEdgeFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point>({x: 0, y: 0});
  const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{nodeId: string; x: number; y: number} | null>(null);
  const [pan, setPan] = useState<Point>({x: 0, y: 0});
  const [isPanning, setIsPanning] = useState(false);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [isSimulatingAnalysis, setIsSimulatingAnalysis] = useState(false);
  const [recordingNode, setRecordingNode] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareMode, setShareMode] = useState<"live" | "snapshot">("snapshot");
  const [blurNames, setBlurNames] = useState(true);
  const [blurAmounts, setBlurAmounts] = useState(false);
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

  // ── AI Document generation ──────────────────────────────────────────────────
  const [aiDocument, setAiDocument] = useState<string | null>(null);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);

  const generateAiDocument = useCallback((targetIds?: Set<string>) => {
    setIsGeneratingDoc(true);
    setTimeout(() => {
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
        ? `(${scopedNodes.length} بطاقات مختارة من أصل ${nodes.length})`
        : `(الجراف كاملاً — ${nodes.length} بطاقة)`;

      const doc = `# ملخص الجراف البصري ${scope}\n\nتحليل آلي بواسطة نظامي AI — ${new Date().toLocaleDateString("ar-SA")}\n\n---\n\n${sections}\n\n---\n\n## التوصيات\n- مراجعة الروابط بين الأطراف والمستندات\n- التأكد من تغطية جميع الأدلة\n- إعداد المذكرة بناءً على التحليل أعلاه`;

      setAiDocument(doc);
      setIsGeneratingDoc(false);
    }, 1200);
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

  const generateErpGraph = () => {
    if(!isGlobal) return;
    setIsSimulatingErp(true);
    setTimeout(() => {
      setNodes(ERP_GENERATED_NODES);
      setEdges(ERP_GENERATED_EDGES);
      setIsSimulatingErp(false);
      setShowCaseSelector(false);
    }, 1500);
  };

  const runAiAnalysis = () => {
    setIsSimulatingAnalysis(true);
    setTimeout(() => {
      setIsSimulatingAnalysis(false);
      setShowAiAnalysis(true);
    }, 2000);
  };

  const startVoiceRecording = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setRecordingNode(id);
    setTimeout(() => {
      setRecordingNode(null);
      setNodes(prev => prev.map(n => n.id === id ? { ...n, desc: n.desc + (n.desc ? "\n" : "") + "[ملاحظة صوتية]: يرجى مراجعة المادة ٧٧ بشأن الفسخ." } : n));
    }, 2500);
  };

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

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    showCaseSelector,
    setShowCaseSelector,
    selectedCase,
    setSelectedCase,
    isSimulatingErp,
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
    isSimulatingAnalysis,
    recordingNode,
    isFullscreen,
    setIsFullscreen,
    showShare,
    setShowShare,
    shareMode,
    setShareMode,
    blurNames,
    setBlurNames,
    blurAmounts,
    setBlurAmounts,
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
    // AI Document
    aiDocument,
    setAiDocument,
    isGeneratingDoc,
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
    generateErpGraph,
    runAiAnalysis,
    startVoiceRecording,
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
  };
}
