"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderSimple, PencilSimple, Trash, Check, X, BookOpen, Star, PushPin, Palette,
  Scroll, Gavel, CaretDown, Plus, DotsThreeVertical
} from "@phosphor-icons/react";
import Link from "next/link";
import { SmartFolder, FOLDER_COLORS } from "./SmartFolderTypes";

interface FolderIconProps {
  icon: SmartFolder["icon"];
  color: string;
  size?: number;
}

export function FolderIcon({ icon, color, size = 18 }: FolderIconProps) {
  const iconColor = color;
  switch (icon) {
    case "star": return <Star size={size} weight="fill" color={iconColor} />;
    case "pin":  return <PushPin size={size} weight="fill" color={iconColor} />;
    case "book": return <BookOpen size={size} weight="fill" color={iconColor} />;
    default:     return <FolderSimple size={size} weight="fill" color={iconColor} />;
  }
}

interface ColorPickerProps {
  selected: string;
  onChange: (hex: string) => void;
  isDark: boolean;
}

export function ColorPicker({ selected, onChange, isDark }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-1.5 py-1.5">
      {FOLDER_COLORS.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.hex)}
          className={`w-6 h-6 rounded-full transition-all duration-200 flex items-center justify-center ${
            selected === c.hex ? "ring-2 ring-offset-2 scale-110" : "hover:scale-110"
          }`}
          style={{ backgroundColor: c.hex }}
        >
          {selected === c.hex && <Check size={12} weight="bold" color="#fff" />}
        </button>
      ))}
    </div>
  );
}

interface FolderCardProps {
  folder: SmartFolder;
  isDark: boolean;
  isRTL: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
  onTogglePin: (id: string) => void;
  onManageContent: () => void;
  onRemoveItem: (itemSlug: string, itemType: string) => void;
}

export default function FolderCard({
  folder, isDark, isRTL, isExpanded, onToggle, onDelete, onRename, onColorChange, onTogglePin, onManageContent, onRemoveItem,
}: FolderCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [showColors, setShowColors] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showMenu]);

  const handleSave = () => {
    if (editName.trim()) {
      onRename(folder.id, editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <motion.div
      layout
      className={`rounded-2xl border overflow-hidden transition-all duration-200 group/folder ${
        isDark
          ? "bg-[#161b22] border-[#2d3748]"
          : "bg-white border-gray-200/70"
      } ${folder.isPinned ? "border-[#C8A762]/35 bg-[#C8A762]/[0.03] dark:bg-[#C8A762]/[0.02]" : ""} ${isExpanded ? (isDark ? "border-[#C8A762]/20" : "border-[#0B3D2E]/15 shadow-[0_4px_20px_-6px_rgba(11,61,46,0.06)]") : ""}`}
    >
      {/* Folder Header */}
      <div
        onClick={onToggle}
        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
          isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50/50"
        }`}
      >
        {/* Folder color bar */}
        <div
          className="w-1 h-8 rounded-full flex-shrink-0"
          style={{ backgroundColor: folder.color }}
        />

        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${folder.color}15` }}
        >
          <FolderIcon icon={folder.icon} color={folder.color} size={16} />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <input
                ref={inputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setIsEditing(false); }}
                className={`text-sm font-bold px-2 py-1 rounded-lg border outline-none w-full ${
                  isDark ? "bg-[#0c0f12] border-[#2d3748] text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                }`}
              />
              <button onClick={handleSave} className="p-1 rounded-lg text-emerald-500 hover:bg-emerald-500/10">
                <Check size={14} weight="bold" />
              </button>
              <button onClick={() => setIsEditing(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={14} weight="bold" />
              </button>
            </div>
          ) : (
            <div className="min-w-0 w-full">
              <h4 className={`text-[13px] font-bold whitespace-normal break-words leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                {isRTL ? folder.name : folder.nameEn}
              </h4>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {folder.laws.length} {isRTL ? "مادة" : "items"}
            </span>
            {folder.isPinned && (
              <PushPin size={11} weight="fill" className="text-[#C8A762] shrink-0" />
            )}
            {folder.isDefault && (
              <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
                isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/5 text-[#0B3D2E]"
              }`}>
                {isRTL ? "افتراضي" : "DEFAULT"}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {!isEditing && (
            <div className="relative flex items-center">
              <button
                onClick={() => { setShowMenu(!showMenu); setShowColors(false); }}
                className={`p-1.5 rounded-lg transition-all ${
                  isDark ? "hover:bg-white/5 text-gray-400 hover:text-white" : "hover:bg-gray-100 text-gray-500 hover:text-gray-800"
                }`}
                title={isRTL ? "خيارات المجلد" : "Folder options"}
              >
                <DotsThreeVertical size={16} weight="bold" />
              </button>
              
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute bottom-full mb-2 ${isRTL ? "left-0" : "right-0"} w-40 rounded-xl border shadow-xl z-30 p-1.5 ${
                      isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"
                    }`}
                  >
                    {/* Add Content */}
                    <button
                      onClick={() => { onManageContent(); setShowMenu(false); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition ${
                        isDark ? "text-emerald-400 hover:bg-emerald-500/10" : "text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      <Plus size={13} weight="bold" />
                      <span>{isRTL ? "إدارة المحتوى" : "Manage Content"}</span>
                    </button>

                    {/* Toggle Pin */}
                    <button
                      onClick={() => { onTogglePin(folder.id); setShowMenu(false); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition ${
                        isDark ? "text-gray-300 hover:bg-white/5" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <PushPin size={13} weight={folder.isPinned ? "fill" : "regular"} className="text-[#C8A762]" />
                      <span>{folder.isPinned ? (isRTL ? "إلغاء التثبيت" : "Unpin") : (isRTL ? "تثبيت المجلد" : "Pin")}</span>
                    </button>

                    {/* Change Color */}
                    {!folder.isDefault && (
                      <button
                        onClick={() => { setShowColors(true); setShowMenu(false); }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition ${
                          isDark ? "text-gray-300 hover:bg-white/5" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <Palette size={13} />
                        <span>{isRTL ? "تغيير اللون" : "Change Color"}</span>
                      </button>
                    )}

                    {/* Rename */}
                    {!folder.isDefault && (
                      <button
                        onClick={() => { setEditName(folder.name); setIsEditing(true); setShowMenu(false); }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition ${
                          isDark ? "text-gray-300 hover:bg-white/5" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <PencilSimple size={13} />
                        <span>{isRTL ? "إعادة تسمية" : "Rename"}</span>
                      </button>
                    )}

                    {/* Delete */}
                    {!folder.isDefault && (
                      <button
                        onClick={() => { onDelete(folder.id); setShowMenu(false); }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg text-red-500 hover:bg-red-500/10 transition"
                      >
                        <Trash size={13} />
                        <span>{isRTL ? "حذف المجلد" : "Delete Folder"}</span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <button
            onClick={() => onToggle()}
            className={`p-1.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          >
            <CaretDown size={14} />
          </button>
        </div>
      </div>

      {/* Colors Dropdown */}
      <AnimatePresence>
        {showColors && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className={`px-4 pb-3 border-t ${isDark ? "border-[#2d3748] bg-black/10" : "border-gray-100 bg-gray-50/30"}`}
          >
            <ColorPicker selected={folder.color} onChange={c => { onColorChange(folder.id, c); setShowColors(false); }} isDark={isDark} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folder Expanded Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}
          >
            <div className={`p-3 space-y-2 ${isDark ? "bg-black/10" : "bg-gray-50/20"}`}>
              {folder.laws.map((law, li) => {
                const t = law.type || "law";
                const href = 
                  t === "book" ? `/book/${law.slug}` :
                  t === "order" ? `/laws/orders/${law.slug}` :
                  t === "precedent" ? `/precedents/judgment/${law.slug}` :
                  `/laws/${law.slug}`;
                
                return (
                  <div
                    key={`${li}-${law.slug}`}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                      isDark
                        ? "bg-[#0c0f12]/40 border-white/[0.04] hover:bg-white/[0.04]"
                        : "bg-white border-gray-100 hover:border-gray-200/80 shadow-sm"
                    }`}
                  >
                    <Link
                      href={href}
                      className="flex items-center gap-2.5 min-w-0 flex-1"
                    >
                      <div className="flex-shrink-0">
                        {t === "order" ? <Scroll size={13} className="text-emerald-500" /> :
                         t === "precedent" ? <Gavel size={13} className="text-purple-500" /> :
                         t === "book" ? <BookOpen size={13} className="text-amber-500" /> :
                         <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: folder.color }} />}
                      </div>
                      <span className="text-xs font-semibold truncate leading-tight select-all">
                        {isRTL ? law.title : law.titleEn}
                      </span>
                    </Link>
                    <button
                      onClick={() => onRemoveItem(law.slug, t)}
                      className={`p-1 rounded-md text-red-400 hover:bg-red-500/10 transition-all`}
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                );
              })}
              {folder.laws.length === 0 && (
                <div className="text-center py-5 text-gray-500 text-xs">
                  {isRTL ? "المجلد فارغ حالياً." : "Folder is empty."}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
