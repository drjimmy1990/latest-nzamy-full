"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Highlighter, Eraser, Trash, X, NotePencil, 
  ArrowsOutCardinal, Palette, Check
} from "@phosphor-icons/react";
import { createPortal } from "react-dom";

// --- Types ---
interface Stroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  opacity: number;
}

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: "yellow" | "blue" | "pink" | "green";
}

// --- Constants ---
const HIGHLIGHT_COLORS = [
  { hex: "#fef08a", name: "أصفر" },
  { hex: "#bbf7d0", name: "أخضر" },
  { hex: "#fbcfe8", name: "وردي" },
  { hex: "#bfdbfe", name: "أزرق" },
];

export function ResearchWorkspace({ isDark, pageId, isRTL = true }: { isDark: boolean; pageId: string; isRTL?: boolean }) {
  // --- States: Highlighter ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isErasingMode, setIsErasingMode] = useState(false);
  const [color, setColor] = useState("#fef08a");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  // --- States: Single Sticky Note ---
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePos, setNotePos]   = useState({ x: 100, y: 100 });
  const [isLoaded, setIsLoaded] = useState(false);

  // --- Load Data ---
  useEffect(() => {
    const savedStrokes = localStorage.getItem(`highlighter_strokes_${pageId}`);
    if (savedStrokes) {
      try { setStrokes(JSON.parse(savedStrokes)); } catch (e) {}
    }
    const savedNoteText = localStorage.getItem(`sticky_note_text_${pageId}`);
    if (savedNoteText) setNoteText(savedNoteText);
    
    const savedNotePos = localStorage.getItem(`sticky_note_pos_${pageId}`);
    if (savedNotePos) {
      try { setNotePos(JSON.parse(savedNotePos)); } catch (e) {}
    }
    
    const savedNoteShow = localStorage.getItem(`sticky_note_show_${pageId}`);
    if (savedNoteShow === "true") setShowNote(true);

    setIsLoaded(true);
  }, [pageId]);

  // --- Save Data ---
  useEffect(() => {
    if (isLoaded) {
      if (strokes.length > 0 || currentStroke === null) {
        localStorage.setItem(`highlighter_strokes_${pageId}`, JSON.stringify(strokes));
      }
      localStorage.setItem(`sticky_note_text_${pageId}`, noteText);
      localStorage.setItem(`sticky_note_pos_${pageId}`, JSON.stringify(notePos));
      localStorage.setItem(`sticky_note_show_${pageId}`, showNote ? "true" : "false");
    }
  }, [strokes, currentStroke, noteText, notePos, showNote, isLoaded, pageId]);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 24; // Thicker highlighter

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    allStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      
      // Fix Transparency: Use RGBA
      const hex = stroke.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      
      // Opacity: lighter in dark mode, more solid in light mode
      const alpha = isDark ? 0.25 : 0.4;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      
      // Blend mode
      ctx.globalCompositeOperation = isDark ? "screen" : "multiply";
      ctx.stroke();
    });
  }, [strokes, currentStroke, isDark]);

  // --- Canvas Logic ---
  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = document.documentElement.scrollWidth;
      canvas.height = document.documentElement.scrollHeight;
      drawAll();
    };
    setTimeout(updateCanvasSize, 500);
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [drawAll]);

  useEffect(() => { drawAll(); }, [drawAll]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    let x, y;
    if ('touches' in e) {
      x = e.touches[0].pageX;
      y = e.touches[0].pageY;
    } else {
      x = (e as React.MouseEvent).pageX;
      y = (e as React.MouseEvent).pageY;
    }
    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingMode && !isErasingMode) return;
    const { x, y } = getCoordinates(e);
    if (isErasingMode) {
      eraseAt(x, y);
    } else {
      setCurrentStroke({ id: Date.now().toString(), points: [{ x, y }], color: color, opacity: isDark ? 0.3 : 0.5 });
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingMode && !isErasingMode) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    if (isErasingMode) {
      eraseAt(x, y);
    } else if (currentStroke) {
      setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x, y }] } : null);
    }
  };

  const stopDrawing = () => {
    if (currentStroke) {
      setStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
  };

  const eraseAt = (x: number, y: number) => {
    const eraserRadius = 30;
    setStrokes(prev => prev.filter(stroke => !stroke.points.some(p => Math.abs(p.x - x) < eraserRadius && Math.abs(p.y - y) < eraserRadius)));
  };

  // --- Escape Key to Exit Tools ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawingMode(false);
        setIsErasingMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Notes Logic ---
  const toggleNote = () => {
    const willShow = !showNote;
    setShowNote(willShow);
    if (willShow && notePos.x === 100 && notePos.y === 100) {
      // Center on first open
      setNotePos({ x: window.innerWidth / 2 - 120, y: window.innerHeight / 2 - 120 });
    }
    setIsDrawingMode(false);
    setIsErasingMode(false);
  };

  if (!isLoaded) return null;

  const floatingLayers = typeof document !== "undefined" ? createPortal(
    <>
      {/* 1. Canvas Layer */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        // mixBlendMode here helps blending the whole canvas with the page below
        className={`absolute top-0 left-0 w-full z-30 ${isDrawingMode || isErasingMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          cursor: isErasingMode 
            ? `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256"><path fill="%23ef4444" d="M226.83,74.83l-45.66-45.66a19.86,19.86,0,0,0-28.28,0L34.25,147.81a19.86,19.86,0,0,0,0,28.28l45.66,45.66a19.86,19.86,0,0,0,28.28,0L226.83,103.11A19.86,19.86,0,0,0,226.83,74.83Z"/></svg>') 0 24, cell` 
            : isDrawingMode 
            ? `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256"><path fill="${encodeURIComponent(color)}" d="M227.31,73.31l-44.62-44.62a16,16,0,0,0-22.62,0L31.7,157.06a8,8,0,0,0-2.09,3.71l-14.4,57.6a8,8,0,0,0,9.66,9.66l57.6-14.4a8,8,0,0,0,3.71-2.09L214.54,82.2A16,16,0,0,0,227.31,73.31Z"/></svg>') 0 24, crosshair` 
            : 'default',
          mixBlendMode: isDark ? "screen" : "multiply", 
        }}
      />

      {/* 2. Floating Sticky Note (Single) */}
      <AnimatePresence>
        {showNote && (
          <motion.div
            drag
            dragMomentum={false}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onDragEnd={(e, info) => {
              setNotePos({ x: notePos.x + info.offset.x, y: notePos.y + info.offset.y });
            }}
            className={`fixed top-0 left-0 z-50 w-64 flex flex-col rounded-2xl border-2 shadow-2xl backdrop-blur-xl overflow-hidden ${isDark ? "bg-blue-900/90 border-blue-500/50 text-blue-100" : "bg-blue-50 border-blue-200 text-blue-900 shadow-blue-500/20"}`}
            style={{ x: notePos.x, y: notePos.y }}
            dir={isRTL ? "rtl" : "ltr"}
          >
            {/* Note Header Handle */}
            <div className="flex items-center justify-between p-2.5 border-b border-black/10 dark:border-white/10 cursor-move hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-1.5 opacity-60">
                <ArrowsOutCardinal size={16} />
                <span className="text-[10px] font-bold">{isRTL ? "ملاحظتك الشخصية" : "Personal note"}</span>
              </div>
              <button onClick={() => setShowNote(false)} className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/20 transition">
                <X size={14} weight="bold" />
              </button>
            </div>
            {/* Note Textarea */}
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder={isRTL ? "دوّن أفكارك هنا بحرية..." : "Write your notes here..."}
              className={`w-full min-h-[160px] p-4 text-[13px] font-medium leading-relaxed bg-transparent resize-none focus:outline-none placeholder-black/40 dark:placeholder-white/40`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  ) : null;

  return (
    <>
      {floatingLayers}

      {/* 3. The Premium Research Dock (Flows inside the sidebar) */}
      <div className="mt-3 w-full relative z-50" dir={isRTL ? "rtl" : "ltr"}>
        <div className={`flex flex-col gap-2 p-3 rounded-2xl shadow-sm border ${isDark ? "bg-zinc-900 border-white/10" : "bg-white border-slate-200"}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{isRTL ? "أدوات البحث" : "Research tools"}</p>
          
          <div className="flex items-center justify-between gap-1.5 mt-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
            {/* Sticky Note Toggle */}
            <button
              onClick={toggleNote}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all ${showNote ? (isDark ? "bg-blue-600/30 text-blue-400 ring-1 ring-blue-500/50" : "bg-blue-100 text-blue-700 ring-1 ring-blue-400") : (isDark ? "text-zinc-400 hover:bg-white/10 hover:text-zinc-200" : "text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-800")}`}
              title={isRTL ? "ملاحظة حرة" : "Free note"}
            >
              <NotePencil size={20} weight={showNote ? "fill" : "duotone"} />
              <span className="text-[9px] font-bold">{isRTL ? "ملاحظة" : "Note"}</span>
            </button>

            {/* Highlighter Toggle */}
            <button
              onClick={() => {
                const newState = !isDrawingMode;
                setIsDrawingMode(newState);
                if (newState) setIsErasingMode(false);
              }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all ${isDrawingMode ? (isDark ? "bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/50" : "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400") : (isDark ? "text-zinc-400 hover:bg-white/10 hover:text-zinc-200" : "text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-800")}`}
              title={isRTL ? "تظليل" : "Highlight"}
            >
              <Highlighter size={20} weight={isDrawingMode ? "fill" : "duotone"} />
              <span className="text-[9px] font-bold">{isRTL ? "تظليل" : "Highlight"}</span>
            </button>

            {/* Eraser Toggle */}
            <button
              onClick={() => {
                const newState = !isErasingMode;
                setIsErasingMode(newState);
                if (newState) setIsDrawingMode(false);
              }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all ${isErasingMode ? (isDark ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/50" : "bg-red-100 text-red-700 ring-1 ring-red-400") : (isDark ? "text-zinc-400 hover:bg-white/10 hover:text-zinc-200" : "text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-800")}`}
              title={isRTL ? "ممحاة" : "Eraser"}
            >
              <Eraser size={20} weight={isErasingMode ? "fill" : "duotone"} />
              <span className="text-[9px] font-bold">{isRTL ? "ممحاة" : "Eraser"}</span>
            </button>
          </div>

          {/* Color Palette (Expands below when drawing) */}
          <AnimatePresence>
            {isDrawingMode && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-center gap-3 pt-2 mt-1 border-t border-black/5 dark:border-white/5">
                  {HIGHLIGHT_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setColor(c.hex)}
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${color === c.hex ? 'scale-125 shadow-sm ring-2 ring-offset-2 ring-zinc-400 dark:ring-offset-zinc-900' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c.hex }}
                    >
                      {color === c.hex && <Check size={10} weight="bold" className="text-black/60" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trash All */}
          <AnimatePresence>
            {strokes.length > 0 && (
              <motion.button
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: "auto", opacity: 1, marginTop: 8 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                onClick={() => {
                  setStrokes([]);
                  localStorage.removeItem(`highlighter_strokes_${pageId}`);
                  // Force immediate visual clear
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const ctx = canvas.getContext("2d");
                    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                  }
                }}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${isDark ? "bg-red-900/10 text-red-500 hover:bg-red-900/30" : "bg-red-50 text-red-500 hover:bg-red-100"}`}
              >
                <Trash size={14} weight="duotone" />
                {isRTL ? "مسح كل التظليلات" : "Clear all highlights"}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
