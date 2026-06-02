"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NotePencil, X, ArrowsOutCardinal } from "@phosphor-icons/react";

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: "yellow" | "blue" | "pink" | "green";
}

export function StickyNotesManager({ isDark, pageId }: { isDark: boolean; pageId: string }) {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`sticky_notes_${pageId}`);
    if (saved) {
      try {
        setNotes(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load notes", e);
      }
    }
    setIsLoaded(true);
  }, [pageId]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`sticky_notes_${pageId}`, JSON.stringify(notes));
    }
  }, [notes, isLoaded, pageId]);

  const addNote = () => {
    const newNote: StickyNote = {
      id: Date.now().toString(),
      x: window.innerWidth / 2 - 100, // Center roughly
      y: window.innerHeight / 2 - 100,
      text: "",
      color: "yellow",
    };
    setNotes([...notes, newNote]);
  };

  const updateNote = (id: string, text: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, text } : n));
  };

  const updatePosition = (id: string, x: number, y: number) => {
    setNotes(notes.map(n => n.id === id ? { ...n, x, y } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const getColorClasses = (color: string) => {
    if (isDark) {
      switch (color) {
        case "blue": return "bg-blue-900/40 border-blue-500/30 text-blue-100";
        case "pink": return "bg-pink-900/40 border-pink-500/30 text-pink-100";
        case "green": return "bg-green-900/40 border-green-500/30 text-green-100";
        default: return "bg-yellow-900/40 border-yellow-500/30 text-yellow-100";
      }
    } else {
      switch (color) {
        case "blue": return "bg-blue-50 border-blue-200 text-blue-900 shadow-blue-500/10";
        case "pink": return "bg-pink-50 border-pink-200 text-pink-900 shadow-pink-500/10";
        case "green": return "bg-green-50 border-green-200 text-green-900 shadow-green-500/10";
        default: return "bg-yellow-50 border-yellow-200 text-yellow-900 shadow-yellow-500/10";
      }
    }
  };

  if (!isLoaded) return null;

  return (
    <>
      {/* Add Note Button */}
      <div className="fixed bottom-6 right-20 z-50 mr-20">
        <button
          onClick={addNote}
          className={`p-2.5 rounded-xl shadow-xl border transition-all ${isDark ? "bg-zinc-900 border-white/10 hover:bg-white/5 text-zinc-300" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}
          title="ملاحظة جديدة"
        >
          <NotePencil size={18} weight="duotone" />
        </button>
      </div>

      {/* Render Notes */}
      {notes.map(note => (
        <motion.div
          key={note.id}
          drag
          dragMomentum={false}
          initial={{ x: note.x, y: note.y, scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onDragEnd={(e, info) => {
            // Update x,y using current transform and info.point
            // Since framer-motion handles transform, actual saving needs offset calculation or relying on state.
            // For simplicity, we just save the final offset.
            updatePosition(note.id, note.x + info.offset.x, note.y + info.offset.y);
          }}
          className={`fixed z-40 w-56 flex flex-col rounded-xl border shadow-2xl backdrop-blur-md overflow-hidden ${getColorClasses(note.color)}`}
          style={{ x: note.x, y: note.y }}
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-1.5 border-b border-black/5 dark:border-white/5 cursor-move handle">
            <ArrowsOutCardinal size={14} className="opacity-50" />
            <button onClick={() => deleteNote(note.id)} className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition">
              <X size={12} />
            </button>
          </div>
          {/* Body */}
          <textarea
            value={note.text}
            onChange={e => updateNote(note.id, e.target.value)}
            placeholder="اكتب ملاحظاتك..."
            className="w-full min-h-[120px] p-3 text-[12px] bg-transparent resize-none focus:outline-none placeholder-black/30 dark:placeholder-white/30"
          />
        </motion.div>
      ))}
    </>
  );
}
