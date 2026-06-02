"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Highlighter, Eraser, Trash, X } from "@phosphor-icons/react";

interface Stroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
}

export function CanvasHighlighter({ isDark, pageId }: { isDark: boolean; pageId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isErasingMode, setIsErasingMode] = useState(false);
  const [color, setColor] = useState("#fef08a"); // Default yellow
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  // Load strokes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`highlighter_strokes_${pageId}`);
    if (saved) {
      try {
        setStrokes(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load strokes", e);
      }
    }
  }, [pageId]);

  // Save strokes to localStorage whenever they change
  useEffect(() => {
    if (strokes.length > 0 || currentStroke === null) { // Only save if not currently drawing
      localStorage.setItem(`highlighter_strokes_${pageId}`, JSON.stringify(strokes));
    }
  }, [strokes, currentStroke, pageId]);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // globalCompositeOperation for highlighter effect
    ctx.globalCompositeOperation = "multiply";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 18;

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    allStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      // Parse color to add alpha for highlighter effect
      ctx.strokeStyle = stroke.color;
      // In dark mode, multiply might not work well with bright yellow. We might need source-over with opacity.
      if (isDark) {
        ctx.globalCompositeOperation = "source-over";
        // Convert hex to rgba
        const hex = stroke.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
      } else {
        ctx.globalCompositeOperation = "multiply";
      }
      ctx.stroke();
    });
  }, [strokes, currentStroke, isDark]);

  // Canvas resizing
  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = document.documentElement.scrollWidth;
      canvas.height = document.documentElement.scrollHeight;
      drawAll();
    };

    // Initial size
    setTimeout(updateCanvasSize, 500); // give time for DOM to render

    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [drawAll]);

  useEffect(() => {
    drawAll();
  }, [drawAll]);

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
      setCurrentStroke({
        id: Date.now().toString(),
        points: [{ x, y }],
        color: color
      });
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingMode && !isErasingMode) return;
    e.preventDefault(); // Prevent scrolling while drawing
    
    const { x, y } = getCoordinates(e);

    if (isErasingMode) {
      eraseAt(x, y);
    } else if (currentStroke) {
      setCurrentStroke(prev => {
        if (!prev) return null;
        return {
          ...prev,
          points: [...prev.points, { x, y }]
        };
      });
    }
  };

  const stopDrawing = () => {
    if (currentStroke) {
      setStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
  };

  const eraseAt = (x: number, y: number) => {
    // Simple hit detection: if a point is within 20px, delete the stroke
    const eraserRadius = 20;
    setStrokes(prev => prev.filter(stroke => {
      return !stroke.points.some(p => 
        Math.abs(p.x - x) < eraserRadius && Math.abs(p.y - y) < eraserRadius
      );
    }));
  };

  const clearAll = () => {
    if (confirm("هل أنت متأكد من مسح جميع التظليلات؟")) {
      setStrokes([]);
      localStorage.removeItem(`highlighter_strokes_${pageId}`);
    }
  };

  return (
    <>
      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className={`absolute top-0 left-0 w-full z-30 ${isDrawingMode || isErasingMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          cursor: isErasingMode ? 'cell' : isDrawingMode ? 'crosshair' : 'default',
        }}
      />

      {/* Toolbar */}
      <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 p-2 rounded-2xl shadow-xl border ${isDark ? "bg-zinc-900 border-white/10" : "bg-white border-slate-200"}`}>
        
        {/* Colors */}
        <AnimatePresence>
          {isDrawingMode && !isErasingMode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex items-center gap-2 px-2 border-l border-zinc-200 dark:border-zinc-800"
            >
              {[
                { hex: "#fef08a", name: "Yellow" },
                { hex: "#bbf7d0", name: "Green" },
                { hex: "#fbcfe8", name: "Pink" },
                { hex: "#bfdbfe", name: "Blue" },
              ].map(c => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  className={`w-5 h-5 rounded-full transition-transform ${color === c.hex ? 'scale-125 ring-2 ring-offset-2 ring-zinc-400 dark:ring-offset-zinc-900' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => {
            setIsDrawingMode(!isDrawingMode);
            if (!isDrawingMode) setIsErasingMode(false);
          }}
          className={`p-2.5 rounded-xl transition-all ${isDrawingMode ? "bg-[#0B3D2E] text-[#C8A762]" : isDark ? "hover:bg-white/5 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
          title="تظليل حر"
        >
          <Highlighter size={18} weight={isDrawingMode ? "fill" : "duotone"} />
        </button>

        <button
          onClick={() => {
            setIsErasingMode(!isErasingMode);
            if (!isErasingMode) setIsDrawingMode(false);
          }}
          className={`p-2.5 rounded-xl transition-all ${isErasingMode ? "bg-red-500 text-white" : isDark ? "hover:bg-white/5 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
          title="ممحاة"
        >
          <Eraser size={18} weight={isErasingMode ? "fill" : "duotone"} />
        </button>

        {strokes.length > 0 && (
          <button
            onClick={clearAll}
            className={`p-2.5 rounded-xl transition-all ${isDark ? "hover:bg-red-900/20 text-red-400" : "hover:bg-red-50 text-red-500"}`}
            title="مسح الكل"
          >
            <Trash size={18} />
          </button>
        )}
      </div>
    </>
  );
}
