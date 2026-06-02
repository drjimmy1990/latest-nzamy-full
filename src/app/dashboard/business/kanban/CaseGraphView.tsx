"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Crosshair, Sparkle, Plus, Robot, Record, Lightbulb, Microphone, FileText, LinkSimple, ArrowsOutSimple, Lock, LockOpen, Rows, Export, NotePencil } from "@phosphor-icons/react";
import {
  EDGE_CONFIG,
  TYPE_CONFIG,
  createCurve,
  createTempCurve,
  type GraphEdge,
  type GraphNode,
  type NodeType,
} from "./_graph-model";
import { useCaseGraphState } from "./_use-case-graph-state";
import { SidebarLauncher, AiAnalysisPanel, OverlaysBundle } from "./CaseGraphOverlays";

export default function CaseGraphView({
  isDark,
  isGlobal,
  initialNodes: seedNodes,
  initialEdges: seedEdges,
}: {
  isDark: boolean;
  isGlobal?: boolean;
  initialNodes?: GraphNode[];
  initialEdges?: GraphEdge[];
}) {
  const {
    nodes, setNodes, edges, setEdges, showCaseSelector, setShowCaseSelector, selectedCase, setSelectedCase, isSimulatingErp,
    drawingEdgeFrom, mousePos, contextMenu, setContextMenu, nodeMenu, setNodeMenu, pan, setPan, isPanning,
    showAiAnalysis, setShowAiAnalysis, isSimulatingAnalysis, recordingNode, isFullscreen, setIsFullscreen,
    showShare, setShowShare, shareMode, setShareMode, blurNames, setBlurNames, blurAmounts, setBlurAmounts,
    edgeDropMenu, setEdgeDropMenu, selectedNodeDetail, setSelectedNodeDetail, selectedNodeId, setSelectedNodeId,
    selectedNodeIds, toggleNodeSelection,
    groups, createGroup, dissolveGroup, toggleGroupLock,
    edgeMenu, setEdgeMenu, handleEdgeContextMenu, updateEdgeStyle,
    aiDocument, setAiDocument, isGeneratingDoc, generateAiDocument,
    resizingNode, handleResizeStart,
    hoveredNodeId, setHoveredNodeId, scale, setScale, canvasRef, generateErpGraph, runAiAnalysis, startVoiceRecording,
    handleCanvasPointerDown, handlePointerDown, handlePointerMove, handlePointerUp, startDrawingEdge, handleNodePointerUp,
    handleContextMenu, handleNodeContextMenu, handleNodeTextChange, handleEdgeLabelChange,
  } = useCaseGraphState({ isGlobal, initialNodes: seedNodes, initialEdges: seedEdges });

  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const isWorkspaceEmpty = isGlobal && nodes.length === 0;

  return (
    <div className={`flex h-full w-full relative ${isFullscreen ? "fixed inset-0 z-[120]" : ""}`}>
      {/* ── Sidebar Launcher (Only shown if global & empty) ── */}
      <SidebarLauncher
        isDark={isDark}
        isWorkspaceEmpty={isWorkspaceEmpty}
        showCaseSelector={showCaseSelector}
        setShowCaseSelector={setShowCaseSelector}
        isSimulatingErp={isSimulatingErp}
        selectedCase={selectedCase}
        setSelectedCase={setSelectedCase}
        generateErpGraph={generateErpGraph}
        setNodes={setNodes}
      />

      {/* ── Main Canvas Area ── */}
      <div 
        className={`flex-1 relative overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {isWorkspaceEmpty ? (
          <div className="absolute inset-0 flex items-center justify-center opacity-40">
             <div className="text-center">
               <Crosshair size={64} className={`mx-auto mb-4 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
               <p className={`text-xl font-bold font-brand ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>مساحة العمل فارغة</p>
               <p className={`text-sm mt-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>اختر من القائمة إعداد لوحة جديدة، أو اضغط بالزر الأيمن للبدء حرّاً</p>
             </div>
          </div>
        ) : (
          <>
            {/* Background Dots Pattern */}
            <div 
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `radial-gradient(${isDark ? '#ffffff' : '#0c0f12'} 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
                backgroundPosition: `${pan.x}px ${pan.y}px`
              }}
            />
            
            {/* Top Toolbar */}
            <div className={`absolute top-4 start-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border p-1.5 shadow-sm max-w-[calc(100%-2rem)] ${isDark ? "bg-zinc-900/90 border-white/[0.08]" : "bg-white/90 border-zinc-200"}`}>
              <div className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-2 ${isDark ? "bg-white/[0.04] text-zinc-300" : "bg-zinc-100 text-zinc-700"}`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> مساحة محفوظة
              </div>
              <div className={`w-px mx-1 my-1 self-stretch ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
              <button onClick={runAiAnalysis} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors text-[12px] ${isSimulatingAnalysis ? "bg-zinc-500 text-white cursor-wait" : isDark ? "bg-[#C8A762] text-zinc-900 hover:bg-[#b09355]" : "bg-[#C8A762] text-white hover:bg-[#b09355]"}`} title="تحليل بالذكاء الاصطناعي">
                {isSimulatingAnalysis ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkle size={14} weight="fill" />}
                {isSimulatingAnalysis ? "جاري التحليل..." : "تحليل AI"}
              </button>
              {/* AI Document Export — scoped to selection if any */}
              <button
                onClick={() => generateAiDocument(selectedNodeIds.size > 0 ? selectedNodeIds : undefined)}
                disabled={isGeneratingDoc || nodes.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors text-[12px] border ${isGeneratingDoc ? "opacity-50 cursor-wait" : isDark ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10" : "border-blue-500/40 text-blue-600 hover:bg-blue-50"}`}
                title={selectedNodeIds.size > 0 ? `تصدير ${selectedNodeIds.size} بطاقات مختارة` : "تصدير الجراف كاملاً"}
              >
                {isGeneratingDoc ? <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> : <Export size={13} />}
                {selectedNodeIds.size > 0 ? `تصدير (${selectedNodeIds.size})` : "تصدير مستند"}
              </button>
              <div className={`w-px mx-1 my-1 self-stretch ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
              {/* Multi-select indicator + Group */}
              {selectedNodeIds.size > 0 && (() => {
                const selectedNodesList = nodes.filter(n => selectedNodeIds.has(n.id));
                const allSameGroup = selectedNodesList.every(n => n.groupId && n.groupId === selectedNodesList[0].groupId);
                const currentGroupId = allSameGroup ? selectedNodesList[0].groupId : null;
                return (
                  <>
                    {selectedNodeIds.size > 1 && (
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold ${isDark ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-purple-50 text-purple-600 border border-purple-200"}`}>
                        <Rows size={11} /> {selectedNodeIds.size} محدد
                      </div>
                    )}
                    {currentGroupId ? (
                      <button onClick={() => dissolveGroup(currentGroupId)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20" : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"}`}
                        title="فك التجميع">
                        فك التجميع
                      </button>
                    ) : selectedNodeIds.size > 1 ? (
                      <button onClick={createGroup}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "bg-[#C8A762]/10 text-[#C8A762] border border-[#C8A762]/20 hover:bg-[#C8A762]/20" : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"}`}
                        title="تجميع (Ctrl+G)">
                        <LinkSimple size={11} /> تجميع
                      </button>
                    ) : null}
                  </>
                );
              })()}
              {selectedNodeId && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${isDark ? "bg-white/[0.04] text-zinc-400" : "bg-slate-50 text-slate-500"}`}>
                  <span>Ctrl+C نسخ</span><span className="opacity-40">·</span><span>Del حذف</span>
                </div>
              )}
              <button onClick={() => setShowShare(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${isDark ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-emerald-500/40 text-emerald-600 hover:bg-emerald-50"}`}
                title="مشاركة مع العميل">
                <Record size={13} /> مشاركة
              </button>
              <button onClick={() => setIsFullscreen(f => !f)} className={`p-2 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.08] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"}`} title="ملء الشاشة">
                <Crosshair size={15} />
              </button>
              {Math.abs(scale - 1) > 0.05 && (
                <button onClick={() => setScale(1)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-colors ${isDark ? "bg-white/[0.04] text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:text-zinc-700"}`}
                  title="إعادة التكبير لـ 100٪">
                  {Math.round(scale * 100)}٪
                </button>
              )}
            </div>


          {/* INFINITE PAN + SCALE CONTAINER */}
          <div className="absolute inset-0 w-full h-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}>
            {/* SVG Canvas for Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
              {edges.map(edge => {
                const fromNode = nodes.find(n => n.id === edge.from);
                const toNode = nodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;
                
                const path = createCurve(fromNode.pos, toNode.pos);
                const cnf = EDGE_CONFIG[edge.type] || EDGE_CONFIG.support;
                const edgeColor = edge.color || cnf.color;
                const edgeWidth = edge.width || (isDark ? 1.5 : 2);
                
                return (
                  <g key={edge.id}>
                    {/* Invisible wide hit-area for right-click */}
                    <path 
                      d={path} fill="none" stroke="transparent" strokeWidth="12"
                      style={{ cursor: "context-menu", pointerEvents: "stroke" }}
                      onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); handleEdgeContextMenu(edge.id, ev.clientX, ev.clientY); }}
                    />
                    <path 
                      d={path} 
                      fill="none" 
                      stroke={edgeColor} 
                      strokeWidth={String(edgeWidth)} 
                      className={cnf.dash ? "stroke-dasharray-4" : ""}
                      strokeDasharray={cnf.dash ? "4 4" : "none"}
                      opacity={0.6}
                    />
                  </g>
                );
              })}
              
              {/* Temporary line while drawing */}
              {drawingEdgeFrom && nodes.find(n => n.id === drawingEdgeFrom) && (
                <path 
                  d={createTempCurve(nodes.find(n => n.id === drawingEdgeFrom)!.pos, mousePos)}
                  fill="none"
                  stroke={isDark ? "#ffffff" : "#0c0f12"}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
              )}
            </svg>

            {/* Editable Edge Labels overlay */}
            {edges.map(edge => {
              const fromNode = nodes.find(n => n.id === edge.from);
              const toNode = nodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              
              const midX = (fromNode.pos.x + toNode.pos.x + 200) / 2;
              const midY = (fromNode.pos.y + toNode.pos.y + 80) / 2 - 10;
              const cnf = EDGE_CONFIG[edge.type] || EDGE_CONFIG.support;
              
              return (
                <input
                  key={`label_${edge.id}`}
                  style={{ position: 'absolute', left: midX - 60, top: midY - 10, color: cnf.color }}
                  className={`w-[120px] text-center text-[11px] font-bold bg-transparent outline-none border-b border-transparent hover:border-current focus:border-current ${isDark ? "placeholder-zinc-600" : "placeholder-zinc-400"}`}
                  value={edge.label}
                  onChange={(e) => handleEdgeLabelChange(edge.id, e.target.value)}
                  placeholder="الوصف..."
                />
              );
            })}

            {nodes.map(node => {
              const cnf = TYPE_CONFIG[node.type];
              const Icon = cnf.icon;
              const isCustom = node.type === "custom";
              const nodeGroup = node.groupId ? groups.find(g => g.id === node.groupId) : null;
              const isSelected = selectedNodeIds.has(node.id);
              const isHovered = hoveredNodeId === node.id;

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => { handlePointerDown(node.id, e); }}
                  onPointerUp={(e) => handleNodePointerUp(node.id, e)}
                  onContextMenu={(e) => handleNodeContextMenu(node.id, e)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{
                    position: 'absolute',
                    left: Math.max(0, node.pos.x),
                    top: Math.max(0, node.pos.y),
                    width: node.w ? `${node.w}px` : '220px',
                    height: node.h ? `${node.h}px` : undefined,
                    minHeight: '90px',
                    overflow: 'visible',
                    touchAction: 'none',
                    zIndex: isSelected ? 20 : 10,
                    ...(nodeGroup ? {
                      outline: `2px solid ${nodeGroup.color}50`,
                      outlineOffset: nodeGroup.locked ? '3px' : '0px',
                    } : {}),
                  }}
                  className={`node-element rounded-2xl border cursor-grab active:cursor-grabbing shadow-sm transition-shadow
                    ${ isSelected
                        ? "shadow-xl ring-2 ring-[#C8A762]/80 ring-offset-1"
                        : isHovered ? "shadow-md ring-1 ring-black/5" : ""
                    }
                    ${isDark
                      ? (node.customColor || "bg-zinc-900 border-white/[0.08]")
                      : (node.customColor || "bg-white border-zinc-200")
                    }`}
                >
                  {/* ── Card inner layout ── */}
                  <div className="flex flex-col h-full">

                    {/* Header row: icon + title + group pill */}
                    <div className="flex items-start gap-2 px-3 pt-2.5">
                      {/* Icon */}
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setSelectedNodeDetail(node); }}
                        title="عرض التفاصيل"
                        className={`flex-shrink-0 mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center border transition-all hover:scale-110 cursor-pointer ${cnf.bg}`}
                      >
                        <Icon size={14} weight="duotone" className={cnf.text} />
                      </button>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        {node.meta && <span className="block text-[8px] font-bold text-[#C8A762] mb-0.5 truncate">{node.meta}</span>}
                        <input
                          type="text"
                          value={node.title}
                          onChange={e => handleNodeTextChange(node.id, "title", e.target.value)}
                          onPointerDown={e => e.stopPropagation()}
                          placeholder="عنوان..."
                          className={`w-full font-bold text-[12px] bg-transparent outline-none border-b border-transparent focus:border-[#C8A762]/60 cursor-text placeholder-zinc-400 truncate
                            ${node.customColor ? "text-white" : isDark ? "text-zinc-100" : "text-zinc-800"}`}
                        />
                      </div>

                      {/* Group pill — inside card, top-right */}
                      {nodeGroup && (
                        <div
                          className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ background: nodeGroup.color + '20', color: nodeGroup.color }}
                          title={nodeGroup.locked ? "مجموعة مقفولة — انقر لفك" : "مجموعة — انقر للقفل"}
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); toggleGroupLock(nodeGroup.id); }}
                        >
                          {nodeGroup.locked ? <Lock size={8} /> : <LockOpen size={8} />}
                        </div>
                      )}
                    </div>

                    {/* Desc textarea */}
                    <div className="relative px-3 pt-1.5 pb-2 flex-1 flex flex-col gap-1.5">
                      <textarea
                        value={node.desc}
                        onChange={e => handleNodeTextChange(node.id, "desc", e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                        placeholder="اكتب التفاصيل..."
                        rows={isCustom ? 3 : 2}
                        className={`w-full text-[10px] leading-relaxed bg-transparent outline-none resize-none cursor-text placeholder-zinc-400 flex-1
                          ${node.customColor ? "text-white/80" : isDark ? "text-zinc-400" : "text-zinc-600"}`}
                      />
                      {/* Notes Field (Sticky Note Style) */}
                      {(() => {
                        const hasContent = !!(node.notes && node.notes.length > 0);
                        const isExpanded = hasContent || expandedNoteId === node.id;
                        return (
                          <div className="flex justify-start mt-1 relative">
                            {isExpanded ? (
                              <div
                                className={`flex items-start gap-1.5 p-1.5 rounded-md border shadow-sm w-full transition-all duration-200
                                  ${isDark ? "bg-[#3f3822] border-[#5c4d23]" : "bg-[#fef9c3] border-[#fde047]"}
                                `}
                                onPointerDown={e => e.stopPropagation()}
                              >
                                <div className={`flex-shrink-0 mt-px ${isDark ? "text-[#fde047]" : "text-[#ca8a04]"}`}>
                                  <NotePencil size={13} weight="duotone" />
                                </div>
                                <textarea
                                  autoFocus
                                  value={node.notes || ""}
                                  onChange={e => handleNodeTextChange(node.id, "notes" as any, e.target.value)}
                                  onBlur={() => { if (!node.notes || node.notes.length === 0) setExpandedNoteId(null); }}
                                  placeholder="ملاحظات..."
                                  rows={2}
                                  className={`flex-1 bg-transparent text-[10px] font-medium outline-none resize-none leading-relaxed
                                    ${isDark ? "text-[#fde047] placeholder-[#fde047]/50" : "text-[#854d0e] placeholder-[#a16207]/50"}`}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setExpandedNoteId(node.id); }}
                                onPointerDown={e => e.stopPropagation()}
                                className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all hover:scale-105 active:scale-95
                                  ${isDark ? "bg-[#3f3822] border-[#5c4d23] text-[#fde047] hover:brightness-110" : "bg-[#fef9c3] border-[#fde047] text-[#ca8a04] hover:brightness-95"}
                                `}
                                title="إضافة ملاحظة"
                              >
                                <NotePencil size={13} weight="duotone" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* ── Bottom action bar (only on hover/select) ── */}
                    {(isHovered || isSelected) && (
                      <div className={`flex items-center justify-between px-2.5 pb-2 gap-1`}>
                        {/* Left: color swatches for custom nodes */}
                        {isCustom ? (
                          <div className="flex items-center gap-1">
                            {[
                              { cls: "bg-[#1e3a5f]", full: "bg-[#1e3a5f] text-white border-blue-400/30" },
                              { cls: "bg-[#114b3a]", full: "bg-[#114b3a] text-white border-emerald-400/30" },
                              { cls: "bg-[#5c2424]", full: "bg-[#5c2424] text-white border-red-400/30" },
                              { cls: isDark ? "bg-zinc-800" : "bg-white", full: isDark ? "bg-zinc-800 text-white border-zinc-500/30" : "bg-white text-zinc-900 border-zinc-300" },
                            ].map(({ cls, full }) => (
                              <button
                                key={cls}
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); setNodes(prev => prev.map(n => n.id === node.id ? { ...n, customColor: full } : n)); }}
                                className={`w-3 h-3 rounded-full border-2 ${cls} ${node.customColor?.startsWith(cls.replace('bg-', 'bg-[')) ? 'border-white/80 scale-125' : 'border-transparent'} transition-transform hover:scale-110`}
                                title="تغيير اللون"
                              />
                            ))}
                          </div>
                        ) : <span />}

                        {/* Right: voice (custom only) + resize handle */}
                        <div className="flex items-center gap-1">
                          {isCustom && (
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={e => startVoiceRecording(node.id, e)}
                              className={`p-1 rounded-md transition-colors
                                ${recordingNode === node.id ? "bg-red-500 text-white animate-pulse" : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}
                              title="تفريغ صوتي"
                            >
                              <Microphone size={11} weight={recordingNode === node.id ? "fill" : "bold"} />
                            </button>
                          )}
                          {/* Bottom-Right Resize corner (visible indicator) */}
                          {isSelected && (
                            <div
                              onPointerDown={e => handleResizeStart(node.id, 'se', e)}
                              className={`p-0.5 rounded cursor-se-resize ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-300 hover:text-zinc-500"}`}
                              title="تغيير الحجم"
                            >
                              <ArrowsOutSimple size={10} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Multi-directional Resize Handles (invisible) ── */}
                    {isSelected && (
                      <>
                        <div onPointerDown={e => handleResizeStart(node.id, 'n', e)} className="absolute top-0 left-2 right-2 h-2 cursor-n-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 's', e)} className="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'e', e)} className="absolute top-2 bottom-2 -right-1 w-2 cursor-e-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'w', e)} className="absolute top-2 bottom-2 -left-1 w-2 cursor-w-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'nw', e)} className="absolute top-0 -left-1 w-3 h-3 cursor-nw-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'ne', e)} className="absolute top-0 -right-1 w-3 h-3 cursor-ne-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'sw', e)} className="absolute bottom-0 -left-1 w-3 h-3 cursor-sw-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'se', e)} className="absolute bottom-0 -right-1 w-3 h-3 cursor-se-resize z-20" />
                      </>
                    )}
                  </div>

                  {/* ── Connection handles (on hover/select) ── */}
                  {(isHovered || isSelected) && (<>
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                  </>)}
                </div>
              );
            })}
          </div> {/* End Infinite Pan Container */}

          {/* AI Analysis Result Panel */}
          <AiAnalysisPanel
            isDark={isDark}
            showAiAnalysis={showAiAnalysis}
            setShowAiAnalysis={setShowAiAnalysis}
            nodeCount={nodes.length}
            selectedNodeIds={selectedNodeIds}
            generateAiDocument={generateAiDocument}
          />
          </>
        )}

        {/* Edge Drop Menu — appears when arrow is dropped on empty canvas */}
        {edgeDropMenu && (
          <div
            style={{ position: 'absolute', left: edgeDropMenu.x, top: edgeDropMenu.y }}
            onClick={e => e.stopPropagation()}
            className={`z-50 w-60 rounded-xl border p-1 shadow-2xl ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"}`}
          >
            <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              أضف كارد وربطه تلقائياً
            </p>
            {(Object.keys(TYPE_CONFIG) as NodeType[]).map(t => {
              const conf = TYPE_CONFIG[t];
              const Icon = conf.icon;
              return (
                <button key={t} onClick={() => {
                  const newNodeId = `n_${Date.now()}`;
                  const newNode: GraphNode = {
                    id: newNodeId,
                    type: t,
                    title: conf.label,
                    desc: "اكتب التفاصيل هنا...",
                    pos: { x: edgeDropMenu.canvasX - 110, y: edgeDropMenu.canvasY - 60 },
                    author: { name: "انت", role: "المحامي", color: "bg-blue-600" },
                  };
                  setNodes(prev => [...prev, newNode]);
                  // connect the last edge source to the new node
                  const lastFrom = nodes[nodes.length - 1]?.id;
                  if (lastFrom) {
                    setEdges(prev => [...prev, {
                      id: `e_${Date.now()}`,
                      from: lastFrom,
                      to: newNodeId,
                      type: "support",
                      label: "صلة جديدة",
                    }]);
                  }
                  setEdgeDropMenu(null);
                }}
                  className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2.5 transition-colors ${isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-100"}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${conf.bg}`}>
                    <Icon size={12} weight="duotone" className={conf.text} />
                  </div>
                  {conf.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Canvas Right-Click Menu */}
        {contextMenu && (
          <div
            style={{ position: 'absolute', left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
            className={`z-50 w-56 rounded-xl border p-1 shadow-2xl ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"}`}
          >
            <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>إضافة عقدة جديدة</p>
            {(Object.keys(TYPE_CONFIG) as NodeType[]).map(t => {
              const conf = TYPE_CONFIG[t];
              const Icon = conf.icon;
              return (
                <button key={t} onClick={() => {
                  const newNode: GraphNode = {
                    id: `n_${Date.now()}`,
                    type: t,
                    title: t === "custom" ? "" : conf.label,
                    desc: "اكتب التفاصيل هنا...",
                    pos: { x: contextMenu.x - pan.x - 110, y: contextMenu.y - pan.y - 60 },
                    author: { name: "انت", role: "المحامي", color: "bg-blue-600" },
                  };
                  setNodes(prev => [...prev, newNode]);
                  setContextMenu(null);
                }} className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2.5 transition-colors ${isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-100"}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${conf.bg}`}>
                    <Icon size={12} weight="duotone" className={conf.text} />
                  </div>
                  {conf.label}
                </button>
              );
            })}
            <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
            <button onClick={() => { setPan({x:0, y:0}); setContextMenu(null); }} className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${isDark ? "text-zinc-500 hover:bg-zinc-700" : "text-zinc-500 hover:bg-zinc-100"}`}>
              <Crosshair size={13} /> إعادة تعيين المنظور
            </button>
          </div>
        )}

        {/* Node Right-Click Menu (Obsidian-style) */}
        {nodeMenu && (() => {
          const nd = nodes.find(n => n.id === nodeMenu.nodeId);
          if (!nd) return null;
          return (
            <div
              style={{ position: 'fixed', left: nodeMenu.x, top: nodeMenu.y, zIndex: 9999 }}
              onClick={e => e.stopPropagation()}
              className={`w-64 rounded-xl border p-1 shadow-2xl ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"}`}
            >
              {/* Node type toggle */}
              <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>نوع العقدة</p>
              <div className="flex flex-wrap gap-1 px-2 pb-2">
                {(Object.keys(TYPE_CONFIG) as NodeType[]).map(t => {
                  const conf = TYPE_CONFIG[t];
                  const Icon = conf.icon;
                  return (
                    <button key={t} onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, type: t} : n)); }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${nd.type === t ? conf.bg + " " + conf.text : isDark ? "border-zinc-700 text-zinc-500 hover:border-zinc-500" : "border-zinc-100 text-zinc-400 hover:border-zinc-300"}`}>
                      <Icon size={10} />{conf.label}
                    </button>
                  );
                })}
              </div>
              <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
              {/* Colors */}
              <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لون الخلفية</p>
              <div className="flex gap-1.5 px-3 pb-2">
                {[
                  { label: "افتراضي", val: undefined, cls: isDark ? "bg-zinc-900 border-zinc-600" : "bg-white border-zinc-200" },
                  { label: "أزرق",   val: "bg-[#1e3a5f] text-white border-blue-400/30",    cls: "bg-[#1e3a5f]" },
                  { label: "أخضر",   val: "bg-[#114b3a] text-white border-emerald-400/30", cls: "bg-[#114b3a]" },
                  { label: "أحمر",   val: "bg-[#5c2424] text-white border-red-400/30",     cls: "bg-[#5c2424]" },
                  { label: "ذهبي",   val: "bg-[#3d2f00] text-white border-[#C8A762]/30",  cls: "bg-[#3d2f00]" },
                ].map(c => (
                  <button key={c.label} title={c.label} onClick={() => setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, customColor: c.val} : n))}
                    className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${c.cls} ${nd.customColor === c.val ? "border-white shadow-md scale-110" : "border-transparent"}`} />
                ))}
              </div>
              <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
              {/* Actions */}
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, title: "# " + n.title} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="font-black text-sm text-[#C8A762]">H</span> تحويل لعنوان رئيسي
              </button>
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, title: "## " + n.title} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="font-bold text-sm opacity-60 text-[#C8A762]">H2</span> عنوان فرعي
              </button>
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, desc: "**" + n.desc + "**"} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="font-black text-sm">B</span> تغليظ النص
              </button>
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, desc: "*" + n.desc + "*"} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="italic text-sm">I</span> مائل
              </button>
              <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
              <button onClick={() => { setNodes(prev => prev.filter(n => n.id !== nodeMenu.nodeId)); setEdges(prev => prev.filter(e => e.from !== nodeMenu.nodeId && e.to !== nodeMenu.nodeId)); setNodeMenu(null); }}
                className="w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 text-red-500 hover:bg-red-500/10 transition-colors">
                <span>🗑</span> حذف العقدة
              </button>
            </div>
          );
        })()}

        {/* Share Modal */}
        {showShare && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShare(false)}>
            <div onClick={e => e.stopPropagation()} className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-100"}`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-royal/10 flex items-center justify-center">
                  <Record size={18} weight="duotone" className="text-royal" />
                </div>
                <div>
                  <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>مشاركة الجراف</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>اختر وضع المشاركة والصلاحيات</p>
                </div>
              </div>
              {/* Share mode */}
              <div className="flex gap-2 mb-4">
                {(["snapshot", "live"] as const).map(m => (
                  <button key={m} onClick={() => setShareMode(m)}
                    className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold border transition-all ${
                      shareMode === m ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"
                    }`}>
                    {m === "snapshot" ? "📸 لحظة ثابتة" : "⚡ مباشر (Live)"}
                  </button>
                ))}
              </div>
              {/* Blur options */}
              <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>طمس المعلومات الحساسة:</p>
              <div className="space-y-2 mb-5">
                {[
                  { label: "أسماء الأشخاص والشركات",   val: blurNames,   set: setBlurNames },
                  { label: "القيم المالية والأرقام",    val: blurAmounts, set: setBlurAmounts },
                ].map(opt => (
                  <label key={opt.label} className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => opt.set(v => !v)}
                      className={`w-10 h-5 rounded-full transition-all relative ${opt.val ? "bg-royal" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${opt.val ? "left-5" : "left-0.5"}`} />
                    </div>
                    <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{opt.label}</span>
                  </label>
                ))}
              </div>
              {/* Warning */}
              <div className={`rounded-xl p-3 mb-4 text-[11px] ${isDark ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                ⚠ تأكد من عدم مشاركة معلومات سرية. المنصة غير مسؤولة عن المحتوى المشارك.
              </div>

              {/* Permissions Options (Only for Live Mode) */}
              {shareMode === "live" && (
                <>
                  <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>صلاحيات المشارك:</p>
                  <div className="space-y-2 mb-5">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`w-4 h-4 rounded-full border-4 flex items-center justify-center transition-all border-royal`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                      </div>
                      <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>القراءة والعرض فقط (افتراضي)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`w-4 h-4 rounded-full border border-slate-300 transition-all ${isDark ? "border-zinc-600" : ""}`} />
                      <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>السماح بالتعليقات وإضافة الملاحظات</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`w-4 h-4 rounded-full border border-slate-300 transition-all ${isDark ? "border-zinc-600" : ""}`} />
                      <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>السماح بالتعديل المحدود (الإضافة فقط)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`w-4 h-4 rounded-full border border-slate-300 transition-all ${isDark ? "border-zinc-600" : ""}`} />
                      <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>صلاحية كاملة (الإضافة، التعديل، والحذف)</span>
                    </label>
                  </div>
                </>
              )}

              {/* Link */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-4 ${isDark ? "border-white/[0.08] bg-zinc-800" : "border-slate-200 bg-slate-50"}`}>
                <span className={`flex-1 text-[11px] font-mono truncate ${isDark ? "text-zinc-400" : "text-slate-500"}`}>https://nzamy.app/graph/share/abc123...</span>
                <button className="text-[10px] font-bold text-royal hover:underline">نسخ</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowShare(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>إلغاء</button>
                <button className="flex-[2] py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328]">إنشاء رابط المشاركة</button>
              </div>
            </div>
          </div>
        )}
        {/* Node Detail Modal */}
        <OverlaysBundle
          isDark={isDark}
          selectedNodeDetail={selectedNodeDetail}
          setSelectedNodeDetail={setSelectedNodeDetail}
          edgeMenu={edgeMenu}
          setEdgeMenu={setEdgeMenu}
          edges={edges}
          setEdges={setEdges}
          updateEdgeStyle={updateEdgeStyle}
          groups={groups}
          toggleGroupLock={toggleGroupLock}
          dissolveGroup={dissolveGroup}
          aiDocument={aiDocument}
          setAiDocument={setAiDocument}
          isGeneratingDoc={isGeneratingDoc}
        />
      </div>
    </div>
  );
}
