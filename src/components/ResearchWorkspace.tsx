"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Highlighter, Eraser, Trash, X, NotePencil, 
  ArrowsOutCardinal, Check,
  Microphone, Play, Pause, Stop,
  Bookmark, Gear
} from "@phosphor-icons/react";
import { createPortal } from "react-dom";

interface Stroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  opacity: number;
  w?: number;
  h?: number;
  isRelative?: boolean;
  blockId?: string;
}

const HIGHLIGHT_COLORS = [
  { hex: "#fef08a", name: "أصفر" },
  { hex: "#bbf7d0", name: "أخضر" },
  { hex: "#fbcfe8", name: "وردي" },
  { hex: "#bfdbfe", name: "أزرق" },
];

const MAX_REC = 60;

export function ResearchWorkspace({ isDark, pageId, isRTL = true }: { isDark: boolean; pageId: string; isRTL?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isErasingMode, setIsErasingMode] = useState(false);
  const [color, setColor] = useState("#fef08a");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePos, setNotePos] = useState({ x: 100, y: 100 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1 | 2>(1);
  const [recSecs, setRecSecs] = useState(0);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const s = localStorage.getItem(`highlighter_strokes_${pageId}`);
    if (s) { try { setStrokes(JSON.parse(s)); } catch(e){} }
    const t = localStorage.getItem(`sticky_note_text_${pageId}`);
    if (t) setNoteText(t);
    const p = localStorage.getItem(`sticky_note_pos_${pageId}`);
    if (p) { try { setNotePos(JSON.parse(p)); } catch(e){} }
    const sh = localStorage.getItem(`sticky_note_show_${pageId}`);
    if (sh === "true") setShowNote(true);
    const a = localStorage.getItem(`sticky_note_audio_${pageId}`);
    if (a) setAudioDataUrl(a);
    setIsLoaded(true);
  }, [pageId]);

  useEffect(() => {
    if (!isLoaded) return;
    if (strokes.length > 0 || currentStroke === null) localStorage.setItem(`highlighter_strokes_${pageId}`, JSON.stringify(strokes));
    localStorage.setItem(`sticky_note_text_${pageId}`, noteText);
    localStorage.setItem(`sticky_note_pos_${pageId}`, JSON.stringify(notePos));
    localStorage.setItem(`sticky_note_show_${pageId}`, showNote ? "true" : "false");
  }, [strokes, currentStroke, noteText, notePos, showNote, isLoaded, pageId]);

  useEffect(() => {
    if (!isLoaded) return;
    if (audioDataUrl) localStorage.setItem(`sticky_note_audio_${pageId}`, audioDataUrl);
    else localStorage.removeItem(`sticky_note_audio_${pageId}`);
  }, [audioDataUrl, isLoaded, pageId]);

  useEffect(() => {
    if (!isLoaded) return;
    const clampPos = () => {
      setNotePos(prev => {
        const noteW = 288;
        const noteH = 280;
        const maxX = Math.max(16, window.innerWidth - noteW - 16);
        const maxY = Math.max(16, window.innerHeight - noteH - 16);
        const newX = Math.min(Math.max(16, prev.x), maxX);
        const newY = Math.min(Math.max(16, prev.y), maxY);
        if (newX !== prev.x || newY !== prev.y) {
          return { x: newX, y: newY };
        }
        return prev;
      });
    };
    clampPos();
    window.addEventListener("resize", clampPos);
    return () => window.removeEventListener("resize", clampPos);
  }, [isLoaded]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => setAudioDataUrl(reader.result as string);
        reader.readAsDataURL(blob);
        if (timerRef.current) clearInterval(timerRef.current);
        setRecSecs(0); setIsRecording(false);
      };
      rec.start(); setIsRecording(true); setRecSecs(0);
      timerRef.current = setInterval(() => {
        setRecSecs(prev => {
          if (prev + 1 >= MAX_REC) { stopRecording(); return MAX_REC; }
          return prev + 1;
        });
      }, 1000);
    } catch { alert(isRTL ? "تعذّر الوصول للميكروفون" : "Cannot access microphone"); }
  };

  const stopRecording = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") mediaRecRef.current.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
  };

  const togglePlayback = () => {
    if (!audioDataUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioDataUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    audioRef.current.playbackRate = playbackRate;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const toggleSpeed = () => {
    const nr = playbackRate === 1 ? 2 : 1;
    setPlaybackRate(nr as 1 | 2);
    if (audioRef.current) audioRef.current.playbackRate = nr;
  };

  const deleteAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setAudioDataUrl(null); setIsPlaying(false); setPlaybackRate(1);
  };

  const fmtSec = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const isMouseDownRef = useRef(false);

  const getHighlighterCursor = useCallback((cColor: string) => {
    const strokeColor = encodeURIComponent(cColor);
    const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M0 2 L6 0 L8 6 L2 8 Z' fill='${strokeColor}'/%3E%3Cpath d='M6 6 L18 18 L22 14 L10 2 Z'/%3E%3C/svg%3E`;
    return `url("data:image/svg+xml;utf8,${svg}") 0 0, crosshair`;
  }, []);

  const getContainerRect = useCallback(() => {
    if (typeof document === "undefined") return null;
    const container = document.querySelector(".nzamy-reader-container");
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height
    };
  }, []);

  const getBlockElementAt = useCallback((x: number, y: number) => {
    if (typeof document === "undefined") return null;
    const clientX = x - window.scrollX;
    const clientY = y - window.scrollY;
    const blocks = document.querySelectorAll(".nzamy-reader-block");
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i] as HTMLElement;
      if (!block.id) continue;
      const rect = block.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return block;
      }
    }
    return null;
  }, []);

  const scalePoint = useCallback((p: { x: number; y: number }, isRelative?: boolean, origW?: number, origH?: number, blockId?: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !origW || !origH) return p;

    if (blockId) {
      const block = document.getElementById(blockId);
      if (block) {
        const rect = block.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const scaledX = p.x * (rect.width / origW) + rect.left + window.scrollX;
          const scaledY = p.y * (rect.height / origH) + rect.top + window.scrollY;
          return { x: scaledX, y: scaledY };
        }
      }
    }
    
    if (isRelative) {
      const container = getContainerRect();
      if (container) {
        const scaledRelX = p.x * (container.width / origW);
        const scaledRelY = p.y * (container.height / origH);
        return {
          x: scaledRelX + container.left,
          y: scaledRelY + container.top
        };
      }
    }

    const currentW = canvas.width;
    const currentH = canvas.height;
    return {
      x: p.x * (currentW / origW),
      y: p.y * (currentH / origH)
    };
  }, [getContainerRect]);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 24;
    const all = currentStroke ? [...strokes, currentStroke] : strokes;
    all.forEach(s => {
      if (s.points.length < 2) return;
      ctx.beginPath();
      const p0 = scalePoint(s.points[0], s.isRelative, s.w, s.h, s.blockId);
      ctx.moveTo(p0.x, p0.y);
      for (let i=1; i<s.points.length; i++) {
        const pi = scalePoint(s.points[i], s.isRelative, s.w, s.h, s.blockId);
        ctx.lineTo(pi.x, pi.y);
      }
      const hex = s.color.replace("#",""); const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
      ctx.strokeStyle = `rgba(${r},${g},${b},${isDark?0.3:0.55})`;
      ctx.globalCompositeOperation = "source-over"; ctx.stroke();
    });
  }, [strokes, currentStroke, isDark, scalePoint]);

  useEffect(() => {
    const upd = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = document.documentElement.scrollWidth;
      c.height = document.documentElement.scrollHeight;
      drawAll();
    };
    upd();
    const timer = setTimeout(upd, 500);
    window.addEventListener("resize", upd);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        upd();
      });
      if (document.body) {
        resizeObserver.observe(document.body);
      }
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", upd);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [drawAll]);

  useEffect(() => { drawAll(); }, [drawAll]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ("touches" in e) return { x: e.touches[0].pageX, y: e.touches[0].pageY };
    return { x: (e as React.MouseEvent).pageX, y: (e as React.MouseEvent).pageY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingMode && !isErasingMode) return;
    isMouseDownRef.current = true;
    const { x, y } = getCoords(e);
    if (isErasingMode) {
      eraseAt(x, y);
    } else {
      const block = getBlockElementAt(x, y);
      if (block) {
        const rect = block.getBoundingClientRect();
        const relX = x - (rect.left + window.scrollX);
        const relY = y - (rect.top + window.scrollY);
        setCurrentStroke({
          id: Date.now().toString(),
          points: [{ x: relX, y: relY }],
          color,
          opacity: isDark ? 0.3 : 0.5,
          w: rect.width,
          h: rect.height,
          isRelative: true,
          blockId: block.id
        });
      } else {
        const container = getContainerRect();
        if (container) {
          const relX = x - container.left;
          const relY = y - container.top;
          setCurrentStroke({
            id: Date.now().toString(),
            points: [{ x: relX, y: relY }],
            color,
            opacity: isDark ? 0.3 : 0.5,
            w: container.width,
            h: container.height,
            isRelative: true
          });
        } else {
          const canvas = canvasRef.current;
          const w = canvas ? canvas.width : document.documentElement.scrollWidth;
          const h = canvas ? canvas.height : document.documentElement.scrollHeight;
          setCurrentStroke({
            id: Date.now().toString(),
            points: [{ x, y }],
            color,
            opacity: isDark ? 0.3 : 0.5,
            w,
            h,
            isRelative: false
          });
        }
      }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingMode && !isErasingMode) return;
    e.preventDefault();
    if (!isMouseDownRef.current) return;
    const { x, y } = getCoords(e);
    if (isErasingMode) {
      eraseAt(x, y);
    } else if (currentStroke) {
      if (currentStroke.blockId) {
        const block = document.getElementById(currentStroke.blockId);
        if (block) {
          const rect = block.getBoundingClientRect();
          const relX = x - (rect.left + window.scrollX);
          const relY = y - (rect.top + window.scrollY);
          setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x: relX, y: relY }] } : null);
        }
      } else if (currentStroke.isRelative) {
        const container = getContainerRect();
        if (container) {
          const relX = x - container.left;
          const relY = y - container.top;
          setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x: relX, y: relY }] } : null);
        }
      } else {
        setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x, y }] } : null);
      }
    }
  };

  const stopDrawing = () => {
    isMouseDownRef.current = false;
    if (currentStroke) {
      setStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
  };

  const eraseAt = (x: number, y: number) => {
    const r = 30;
    const container = getContainerRect();
    setStrokes(prev => prev.filter(s => {
      return !s.points.some(p => {
        let px = p.x;
        let py = p.y;
        if (s.blockId) {
          const block = document.getElementById(s.blockId);
          if (block) {
            const rect = block.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              px = p.x * (rect.width / (s.w || 1)) + rect.left + window.scrollX;
              py = p.y * (rect.height / (s.h || 1)) + rect.top + window.scrollY;
            }
          }
        } else if (s.isRelative && container) {
          px = p.x * (container.width / (s.w || 1)) + container.left;
          py = p.y * (container.height / (s.h || 1)) + container.top;
        } else if (!s.isRelative) {
          const canvas = canvasRef.current;
          if (canvas && s.w && s.h) {
            px = p.x * (canvas.width / s.w);
            py = p.y * (canvas.height / s.h);
          }
        }
        return Math.abs(px - x) < r && Math.abs(py - y) < r;
      });
    }));
  };

  const drawingStateRef = useRef({
    isDrawingMode,
    isErasingMode,
    color,
    isDark,
    currentStroke,
    strokes
  });

  useEffect(() => {
    drawingStateRef.current = {
      isDrawingMode,
      isErasingMode,
      color,
      isDark,
      currentStroke,
      strokes
    };
  }, [isDrawingMode, isErasingMode, color, isDark, currentStroke, strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      const state = drawingStateRef.current;
      if (!state.isDrawingMode && !state.isErasingMode) return;
      isMouseDownRef.current = true;
      const { x, y } = getCoords(e);
      if (state.isErasingMode) {
        eraseAt(x, y);
      } else {
        const block = getBlockElementAt(x, y);
        if (block) {
          const rect = block.getBoundingClientRect();
          const relX = x - (rect.left + window.scrollX);
          const relY = y - (rect.top + window.scrollY);
          setCurrentStroke({
            id: Date.now().toString(),
            points: [{ x: relX, y: relY }],
            color: state.color,
            opacity: state.isDark ? 0.3 : 0.5,
            w: rect.width,
            h: rect.height,
            isRelative: true,
            blockId: block.id
          });
        } else {
          const container = getContainerRect();
          if (container) {
            const relX = x - container.left;
            const relY = y - container.top;
            setCurrentStroke({
              id: Date.now().toString(),
              points: [{ x: relX, y: relY }],
              color: state.color,
              opacity: state.isDark ? 0.3 : 0.5,
              w: container.width,
              h: container.height,
              isRelative: true
            });
          } else {
            const w = canvas ? canvas.width : document.documentElement.scrollWidth;
            const h = canvas ? canvas.height : document.documentElement.scrollHeight;
            setCurrentStroke({
              id: Date.now().toString(),
              points: [{ x, y }],
              color: state.color,
              opacity: state.isDark ? 0.3 : 0.5,
              w,
              h,
              isRelative: false
            });
          }
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const state = drawingStateRef.current;
      if (!state.isDrawingMode && !state.isErasingMode) return;
      if (e.cancelable) e.preventDefault();
      if (!isMouseDownRef.current) return;
      const { x, y } = getCoords(e);
      if (state.isErasingMode) {
        eraseAt(x, y);
      } else {
        setCurrentStroke(prev => {
          if (!prev) return null;
          if (prev.blockId) {
            const block = document.getElementById(prev.blockId);
            if (block) {
              const rect = block.getBoundingClientRect();
              const relX = x - (rect.left + window.scrollX);
              const relY = y - (rect.top + window.scrollY);
              return { ...prev, points: [...prev.points, { x: relX, y: relY }] };
            }
          } else if (prev.isRelative) {
            const container = getContainerRect();
            if (container) {
              const relX = x - container.left;
              const relY = y - container.top;
              return { ...prev, points: [...prev.points, { x: relX, y: relY }] };
            }
          }
          return { ...prev, points: [...prev.points, { x, y }] };
        });
      }
    };

    const handleTouchEnd = () => {
      isMouseDownRef.current = false;
      setCurrentStroke(current => {
        if (current) {
          setStrokes(prev => [...prev, current]);
        }
        return null;
      });
    };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [getContainerRect, getBlockElementAt]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==="Escape") { setIsDrawingMode(false); setIsErasingMode(false); } };
    window.addEventListener("keydown",h); return () => window.removeEventListener("keydown",h);
  }, []);

  const toggleNote = () => {
    const w = !showNote; setShowNote(w);
    if (w) {
      setIsDrawingMode(false);
      setIsErasingMode(false);
      if (notePos.x===100 && notePos.y===100) setNotePos({x:window.innerWidth/2-140,y:window.innerHeight/2-140});
    }
  };

  if (!isLoaded) return null;

  const floatingLayers = typeof document !== "undefined" ? createPortal(
    <>
      <canvas ref={canvasRef}
        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseOut={stopDrawing}
        className={`absolute top-0 left-0 ${isDrawingMode||isErasingMode?'z-30 pointer-events-auto':'z-10 pointer-events-none'}`}
        style={{
          width: canvasRef.current ? `${canvasRef.current.width}px` : '100%',
          height: canvasRef.current ? `${canvasRef.current.height}px` : '100%',
          cursor: isErasingMode ? `url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23ef4444%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m7%2021-4.3-4.3c-1-1-1-2.5%200-3.4l9.6-9.6c1-1%202.5-1%203.4%200l5.6%205.6c1%201%201%202.5%200%203.4L13%2021%22%2F%3E%3Cpath%20d%3D%22M22%2021H7%22%2F%3E%3Cpath%20d%3D%22m5%2011%209%209%22%2F%3E%3C%2Fsvg%3E') 4 20, cell`
            : isDrawingMode ? getHighlighterCursor(color) : 'default',
          mixBlendMode: isDark ? "screen" : "multiply"
        }}
      />

      <AnimatePresence>
        {showNote && (
          <motion.div drag dragMomentum={false}
            initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.8,opacity:0}}
            onDragEnd={(e,info)=>setNotePos({x:notePos.x+info.offset.x,y:notePos.y+info.offset.y})}
            onMouseDown={(e)=>e.stopPropagation()}
            onTouchStart={(e)=>e.stopPropagation()}
            className={`fixed top-0 left-0 z-50 w-72 flex flex-col rounded-2xl border-2 shadow-2xl backdrop-blur-xl overflow-hidden ${isDark?"bg-blue-900/90 border-blue-500/50 text-blue-100":"bg-blue-50 border-blue-200 text-blue-900 shadow-blue-500/20"}`}
            style={{x:notePos.x,y:notePos.y}} dir={isRTL?"rtl":"ltr"}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-2.5 border-b border-black/10 dark:border-white/10 cursor-move hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-1.5 opacity-60">
                <ArrowsOutCardinal size={16}/>
                <span className="text-[10px] font-bold">{isRTL?"ملاحظتك الشخصية":"Personal note"}</span>
              </div>
              <button onClick={()=>setShowNote(false)} className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/20 transition"><X size={14} weight="bold"/></button>
            </div>

            {/* Textarea */}
            <textarea value={noteText} onChange={e=>setNoteText(e.target.value)}
              placeholder={isRTL?"دوّن أفكارك هنا بحرية...":"Write your notes here..."}
              className="w-full min-h-[140px] p-4 text-[13px] font-medium leading-relaxed bg-transparent resize-none focus:outline-none placeholder-black/40 dark:placeholder-white/40"
            />

            {/* Voice Bar */}
            <div className="border-t border-black/10 dark:border-white/10 p-2 flex flex-col gap-2">
              {/* Player (after recording) */}
              <AnimatePresence>
                {audioDataUrl && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-xl ${isDark?"bg-white/10":"bg-blue-100"}`}
                  >
                    <button onClick={togglePlayback}
                      className={`p-1.5 rounded-full ${isDark?"bg-blue-500/30 hover:bg-blue-500/50":"bg-blue-200 hover:bg-blue-300"} transition`}>
                      {isPlaying?<Pause size={14} weight="fill"/>:<Play size={14} weight="fill"/>}
                    </button>
                    <div className="flex-1 flex items-center gap-px overflow-hidden">
                      {Array.from({length:24}).map((_,i)=>(
                        <div key={i} className={`rounded-full ${isDark?"bg-blue-400/60":"bg-blue-400"}`}
                          style={{width:2,height:`${8+Math.sin(i*0.7)*5}px`}}/>
                      ))}
                    </div>
                    <button onClick={toggleSpeed}
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition ${playbackRate===2?(isDark?"bg-yellow-500/30 text-yellow-300":"bg-yellow-200 text-yellow-800"):(isDark?"bg-white/10 text-blue-300":"bg-blue-200 text-blue-700")}`}>
                      {playbackRate===2?"2x":"1x"}
                    </button>
                    <button onClick={deleteAudio}
                      className={`p-1 rounded-lg transition ${isDark?"hover:bg-red-500/20 text-red-400":"hover:bg-red-100 text-red-500"}`}>
                      <Trash size={13}/>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mic Row (before recording) */}
              {!audioDataUrl && (
                <div className="flex items-center gap-2">
                  <button onClick={isRecording?stopRecording:startRecording}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${isRecording?(isDark?"bg-red-500/30 text-red-300 animate-pulse":"bg-red-100 text-red-700 animate-pulse"):(isDark?"bg-white/10 text-blue-200 hover:bg-white/20":"bg-blue-200 text-blue-800 hover:bg-blue-300")}`}>
                    {isRecording?<Stop size={13} weight="fill"/>:<Microphone size={13} weight="fill"/>}
                    {isRecording?`${fmtSec(recSecs)} — إيقاف`:(isRTL?"تسجيل صوتي":"Record")}
                  </button>
                  {isRecording && (
                    <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
                      {Array.from({length:16}).map((_,i)=>(
                        <motion.div key={i} className={`rounded-full ${isDark?"bg-red-400":"bg-red-400"}`}
                          style={{width:2}}
                          animate={{height:[4,14,4]}}
                          transition={{repeat:Infinity,duration:0.5+i*0.07,delay:i*0.05}}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Floating Action Button (FAB) Stack */}
      <div 
        onMouseDown={(e)=>e.stopPropagation()}
        onTouchStart={(e)=>e.stopPropagation()}
        className={`lg:hidden fixed bottom-20 ${isRTL ? "right-6" : "left-6"} z-[9999] flex flex-col items-center gap-3 print:hidden`}
      >
        <AnimatePresence>
          {isMobileMenuOpen && (
            <div className="flex flex-col gap-2.5 items-center mb-1">
              {/* Note Option */}
              <motion.button
                initial={{ opacity: 0, y: 15, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.8 }}
                onClick={() => {
                  setShowNote(!showNote);
                  if (!showNote && notePos.x === 100 && notePos.y === 100) {
                    setNotePos({ x: window.innerWidth / 2 - 140, y: window.innerHeight / 2 - 140 });
                  }
                  setIsMobileMenuOpen(false);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-all ${
                  showNote
                    ? "bg-blue-600 border-blue-500 text-white"
                    : isDark ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-white border-slate-200 text-slate-600"
                }`}
                title={isRTL ? "ملاحظة" : "Note"}
              >
                <NotePencil size={18} weight={showNote ? "fill" : "regular"} />
              </motion.button>

              {/* Highlight Option */}
              <motion.button
                initial={{ opacity: 0, y: 15, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.8 }}
                onClick={() => {
                  setIsDrawingMode(!isDrawingMode);
                  setIsErasingMode(false);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-all ${
                  isDrawingMode
                    ? "bg-yellow-500 border-yellow-400 text-white"
                    : isDark ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-white border-slate-200 text-slate-600"
                }`}
                title={isRTL ? "تظليل" : "Highlight"}
              >
                <Highlighter size={18} weight={isDrawingMode ? "fill" : "regular"} />
              </motion.button>

              {/* Eraser Option */}
              <motion.button
                initial={{ opacity: 0, y: 15, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.8 }}
                onClick={() => {
                  setIsErasingMode(!isErasingMode);
                  setIsDrawingMode(false);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-all ${
                  isErasingMode
                    ? "bg-red-600 border-red-500 text-white"
                    : isDark ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-white border-slate-200 text-slate-600"
                }`}
                title={isRTL ? "ممحاة" : "Eraser"}
              >
                <Eraser size={18} weight={isErasingMode ? "fill" : "regular"} />
              </motion.button>

              {/* Save to Folder Option */}
              <motion.button
                initial={{ opacity: 0, y: 15, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.8 }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("nzamy-open-folder-modal"));
                  setIsMobileMenuOpen(false);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-all ${
                  isDark ? "bg-zinc-800 border-zinc-700 text-amber-400" : "bg-white border-slate-200 text-amber-500"
                }`}
                title={isRTL ? "حفظ بمجلد" : "Save to Folder"}
              >
                <Bookmark size={18} />
              </motion.button>
            </div>
          )}
        </AnimatePresence>

        {/* Main Trigger Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`w-12 h-12 rounded-full text-white shadow-xl flex items-center justify-center border border-white/10 active:scale-95 transition-all ${
            isMobileMenuOpen ? "bg-red-500 rotate-45" : "bg-[#C8A762] hover:bg-[#b09051]"
          }`}
          title={isRTL ? "الأدوات والمجلد" : "Tools & Folders"}
        >
          {isMobileMenuOpen ? <X size={20} weight="bold" /> : <NotePencil size={20} weight="fill" />}
        </button>
      </div>

      {/* Mobile Color Palette and Controls when Drawing/Highlighting is active */}
      <AnimatePresence>
        {isDrawingMode && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            onMouseDown={(e)=>e.stopPropagation()}
            onTouchStart={(e)=>e.stopPropagation()}
            className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2.5 rounded-full border shadow-2xl backdrop-blur-xl bg-white/90 border-slate-200 dark:bg-zinc-900/90 dark:border-white/10"
            dir={isRTL ? "rtl" : "ltr"}
          >
            <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
              {isRTL ? "اللون:" : "Color:"}
            </span>
            <div className="flex items-center gap-2">
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    color === c.hex
                      ? "scale-110 ring-2 ring-offset-2 ring-amber-500 dark:ring-offset-zinc-900"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.hex }}
                >
                  {color === c.hex && <Check size={12} className="text-black/60 font-bold" />}
                </button>
              ))}
            </div>
            {strokes.length > 0 && (
              <>
                <span className="w-px h-4 bg-slate-200 dark:bg-white/10" />
                <button
                  onClick={() => {
                    setStrokes([]);
                    localStorage.removeItem(`highlighter_strokes_${pageId}`);
                    const c = canvasRef.current;
                    if (c) {
                      const ctx = c.getContext("2d");
                      if (ctx) ctx.clearRect(0, 0, c.width, c.height);
                    }
                  }}
                  className="p-1 rounded-lg text-red-500 hover:bg-red-500/10 transition"
                  title={isRTL ? "مسح الكل" : "Clear All"}
                >
                  <Trash size={16} />
                </button>
              </>
            )}
            <span className="w-px h-4 bg-slate-200 dark:bg-white/10" />
            <button
              onClick={() => setIsDrawingMode(false)}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-500/10 transition"
              title={isRTL ? "إغلاق" : "Close"}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Eraser Controls when Erasing is active */}
      <AnimatePresence>
        {isErasingMode && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            onMouseDown={(e)=>e.stopPropagation()}
            onTouchStart={(e)=>e.stopPropagation()}
            className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2.5 rounded-full border shadow-2xl backdrop-blur-xl bg-white/90 border-slate-200 dark:bg-zinc-900/90 dark:border-white/10"
            dir={isRTL ? "rtl" : "ltr"}
          >
            <span className="text-[10px] font-bold text-red-500 flex items-center gap-1.5 animate-pulse">
              <Eraser size={14} />
              {isRTL ? "الممحاة نشطة - امسح التظليل بإصبعك" : "Eraser Active - Rub to erase"}
            </span>
            <span className="w-px h-4 bg-slate-200 dark:bg-white/10" />
            <button
              onClick={() => setIsErasingMode(false)}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-500/10 transition"
              title={isRTL ? "إغلاق" : "Close"}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  ) : null;

  return (
    <>
      {floatingLayers}
      <div 
        onMouseDown={(e)=>e.stopPropagation()}
        onTouchStart={(e)=>e.stopPropagation()}
        className="hidden lg:block mt-3 w-full relative z-50" 
        dir={isRTL?"rtl":"ltr"}
      >
        <div className={`flex flex-col gap-2 p-3 rounded-2xl shadow-sm border ${isDark?"bg-zinc-900 border-white/10":"bg-white border-slate-200"}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark?"text-zinc-500":"text-slate-400"}`}>{isRTL?"أدوات البحث":"Research tools"}</p>
          <div className="flex items-center justify-between gap-1.5 mt-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
            <button onClick={toggleNote}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all ${showNote?(isDark?"bg-blue-600/30 text-blue-400 ring-1 ring-blue-500/50":"bg-blue-100 text-blue-700 ring-1 ring-blue-400"):(isDark?"text-zinc-400 hover:bg-white/10":"text-slate-500 hover:bg-white hover:shadow-sm")}`}>
              <NotePencil size={20} weight={showNote?"fill":"duotone"}/>
              <span className="text-[9px] font-bold">{isRTL?"ملاحظة":"Note"}</span>
            </button>
            <button onClick={()=>{const n=!isDrawingMode;setIsDrawingMode(n);if(n){setIsErasingMode(false);setShowNote(false);}}}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all ${isDrawingMode?(isDark?"bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/50":"bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400"):(isDark?"text-zinc-400 hover:bg-white/10":"text-slate-500 hover:bg-white hover:shadow-sm")}`}>
              <Highlighter size={20} weight={isDrawingMode?"fill":"duotone"}/>
              <span className="text-[9px] font-bold">{isRTL?"تظليل":"Highlight"}</span>
            </button>
            <button onClick={()=>{const n=!isErasingMode;setIsErasingMode(n);if(n){setIsDrawingMode(false);setShowNote(false);}}}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all ${isErasingMode?(isDark?"bg-red-500/20 text-red-400 ring-1 ring-red-500/50":"bg-red-100 text-red-700 ring-1 ring-red-400"):(isDark?"text-zinc-400 hover:bg-white/10":"text-slate-500 hover:bg-white hover:shadow-sm")}`}>
              <Eraser size={20} weight={isErasingMode?"fill":"duotone"}/>
              <span className="text-[9px] font-bold">{isRTL?"ممحاة":"Eraser"}</span>
            </button>
          </div>
          <AnimatePresence>
            {isDrawingMode && (
              <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                <div className="flex items-center justify-center gap-3 pt-2 mt-1 border-t border-black/5 dark:border-white/5">
                  {HIGHLIGHT_COLORS.map(c=>(
                    <button key={c.hex} onClick={()=>setColor(c.hex)}
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${color===c.hex?'scale-125 shadow-sm ring-2 ring-offset-2 ring-zinc-400 dark:ring-offset-zinc-900':'hover:scale-110'}`}
                      style={{backgroundColor:c.hex}}>
                      {color===c.hex&&<Check size={10} weight="bold" className="text-black/60"/>}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {strokes.length > 0 && (
              <motion.button
                initial={{height:0,opacity:0,marginTop:0}} animate={{height:"auto",opacity:1,marginTop:8}} exit={{height:0,opacity:0,marginTop:0}}
                onClick={()=>{setStrokes([]);localStorage.removeItem(`highlighter_strokes_${pageId}`);const c=canvasRef.current;if(c){const ctx=c.getContext("2d");if(ctx)ctx.clearRect(0,0,c.width,c.height);}}}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${isDark?"bg-red-900/10 text-red-500 hover:bg-red-900/30":"bg-red-50 text-red-500 hover:bg-red-100"}`}>
                <Trash size={14} weight="duotone"/>
                {isRTL?"مسح كل التظليلات":"Clear all highlights"}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}