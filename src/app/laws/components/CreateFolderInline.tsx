"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { FolderSimple } from "@phosphor-icons/react";
import { ColorPicker } from "./FolderCard";
import { FOLDER_COLORS } from "./SmartFolderTypes";

interface CreateFolderInlineProps {
  isDark: boolean;
  isRTL: boolean;
  onCreate: (name: string, color: string) => void;
  onCancel: () => void;
}

export default function CreateFolderInline({
  isDark, isRTL, onCreate, onCancel,
}: CreateFolderInlineProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(FOLDER_COLORS[0].hex);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={`rounded-2xl border p-4 space-y-3 ${
        isDark ? "bg-[#161b22] border-[#C8A762]/20" : "bg-white border-[#0B3D2E]/15 shadow-[0_4px_20px_-6px_rgba(11,61,46,0.06)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <FolderSimple size={16} weight="fill" color={color} />
        </div>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && name.trim()) onCreate(name.trim(), color); if (e.key === "Escape") onCancel(); }}
          placeholder={isRTL ? "اسم المجلد..." : "Folder name..."}
          className={`flex-1 text-sm font-bold px-3 py-2 rounded-xl border outline-none ${
            isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder-gray-600" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
          }`}
        />
      </div>

      <ColorPicker selected={color} onChange={setColor} isDark={isDark} />

      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          {isRTL ? "إلغاء" : "Cancel"}
        </button>
        <button
          onClick={() => { if (name.trim()) onCreate(name.trim(), color); }}
          disabled={!name.trim()}
          className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
            name.trim()
              ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] active:scale-[0.98]"
              : isDark ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isRTL ? "إنشاء" : "Create"}
        </button>
      </div>
    </motion.div>
  );
}
