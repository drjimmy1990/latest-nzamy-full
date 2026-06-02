"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderSimple, FolderSimplePlus, PencilSimple, Trash,
  Check, X, BookOpen, Plus, CaretDown, PushPin,
  Palette, Star, ArrowRight, DotsSixVertical,
} from "@phosphor-icons/react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────────────
export interface LawRef {
  slug: string;
  title: string;
  titleEn: string;
  catId: string;
}

export interface SmartFolder {
  id: string;
  name: string;
  nameEn: string;
  color: string;
  icon: "default" | "star" | "pin" | "book";
  isDefault: boolean;
  laws: LawRef[];
}

// ─── Preset Colors ──────────────────────────────────────────────────────────────
const FOLDER_COLORS = [
  { id: "emerald",  hex: "#10b981", label: "أخضر",  labelEn: "Emerald" },
  { id: "sky",      hex: "#0ea5e9", label: "أزرق",  labelEn: "Sky" },
  { id: "amber",    hex: "#f59e0b", label: "ذهبي",  labelEn: "Amber" },
  { id: "rose",     hex: "#f43f5e", label: "وردي",  labelEn: "Rose" },
  { id: "violet",   hex: "#8b5cf6", label: "بنفسجي", labelEn: "Violet" },
  { id: "slate",    hex: "#64748b", label: "رمادي",  labelEn: "Slate" },
  { id: "orange",   hex: "#f97316", label: "برتقالي", labelEn: "Orange" },
  { id: "teal",     hex: "#14b8a6", label: "تركواز", labelEn: "Teal" },
];

// ─── Default Folder Data ────────────────────────────────────────────────────────
const DEFAULT_LAWS: LawRef[] = [
  { slug: "civil-procedure",     title: "نظام المرافعات الشرعية",     titleEn: "Civil Procedure Law",      catId: "SA-00" },
  { slug: "evidence-law",        title: "نظام الإثبات",               titleEn: "Evidence Law",             catId: "SA-00" },
  { slug: "execution-law",       title: "نظام التنفيذ",               titleEn: "Execution Law",            catId: "SA-00" },
  { slug: "civil-transactions",  title: "نظام المعاملات المدنية",     titleEn: "Civil Transactions Law",   catId: "SA-03" },
  { slug: "labor-law",           title: "نظام العمل",                 titleEn: "Labor Law",                catId: "SA-06" },
  { slug: "companies-law",       title: "نظام الشركات",               titleEn: "Companies Law",            catId: "SA-04" },
  { slug: "commercial-court",    title: "نظام المحاكم التجارية",      titleEn: "Commercial Courts Law",    catId: "SA-04" },
  { slug: "personal-status",     title: "نظام الأحوال الشخصية",       titleEn: "Personal Status Law",      catId: "SA-03" },
];

const DEMO_FOLDERS: SmartFolder[] = [
  {
    id: "default-daily",
    name: "الأنظمة الأساسية",
    nameEn: "Core Daily Laws",
    color: "#0B3D2E",
    icon: "star",
    isDefault: true,
    laws: DEFAULT_LAWS,
  },
  {
    id: "folder-real-estate",
    name: "العقارات والإيجار",
    nameEn: "Real Estate & Leasing",
    color: "#0ea5e9",
    icon: "book",
    isDefault: false,
    laws: [
      { slug: "real-estate-brokerage", title: "نظام الوساطة العقارية", titleEn: "Real Estate Brokerage Law", catId: "SA-07" },
      { slug: "registered-lease",      title: "نظام إيجار",             titleEn: "Ejar Law",                 catId: "SA-07" },
      { slug: "real-estate-registry",  title: "نظام التسجيل العيني للعقار", titleEn: "Real Estate Registry Law", catId: "SA-07" },
    ],
  },
  {
    id: "folder-arbitration",
    name: "التحكيم والمنازعات",
    nameEn: "Arbitration & Disputes",
    color: "#8b5cf6",
    icon: "pin",
    isDefault: false,
    laws: [
      { slug: "arbitration-law",  title: "نظام التحكيم",                 titleEn: "Arbitration Law",          catId: "SA-28" },
      { slug: "enforcement-law",  title: "نظام التنفيذ أمام ديوان المظالم", titleEn: "BOG Enforcement Law",    catId: "SA-28" },
    ],
  },
];

// ─── Folder Icon Component ──────────────────────────────────────────────────────
function FolderIcon({ icon, color, size = 18 }: { icon: SmartFolder["icon"]; color: string; size?: number }) {
  const iconColor = color;
  switch (icon) {
    case "star": return <Star size={size} weight="fill" color={iconColor} />;
    case "pin":  return <PushPin size={size} weight="fill" color={iconColor} />;
    case "book": return <BookOpen size={size} weight="fill" color={iconColor} />;
    default:     return <FolderSimple size={size} weight="fill" color={iconColor} />;
  }
}

// ─── Color Picker ───────────────────────────────────────────────────────────────
function ColorPicker({
  selected, onChange, isDark,
}: {
  selected: string;
  onChange: (hex: string) => void;
  isDark: boolean;
}) {
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

// ─── Single Folder Component ────────────────────────────────────────────────────
function FolderCard({
  folder, isDark, isRTL, isExpanded, onToggle, onDelete, onRename, onColorChange,
}: {
  folder: SmartFolder;
  isDark: boolean;
  isRTL: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const handleSave = () => {
    if (editName.trim()) {
      onRename(folder.id, editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <motion.div
      layout
      className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
        isDark
          ? "bg-[#161b22] border-[#2d3748]"
          : "bg-white border-gray-200/70"
      } ${isExpanded ? (isDark ? "border-[#C8A762]/20" : "border-[#0B3D2E]/15 shadow-[0_4px_20px_-6px_rgba(11,61,46,0.06)]") : ""}`}
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

        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0`}
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
            <div className="flex items-center gap-2">
              <h4 className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-gray-900"}`}>
                {isRTL ? folder.name : folder.nameEn}
              </h4>
              {folder.isDefault && (
                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                  isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/5 text-[#0B3D2E]"
                }`}>
                  {isRTL ? "افتراضي" : "DEFAULT"}
                </span>
              )}
            </div>
          )}
          <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-600" : "text-gray-400"}`}>
            {folder.laws.length} {isRTL ? "نظام" : "laws"}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {!folder.isDefault && !isEditing && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setShowColors(!showColors); }}
                className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${
                  isDark ? "hover:bg-white/5 text-gray-600" : "hover:bg-gray-100 text-gray-400"
                }`}
                style={{ opacity: 1 }}
              >
                <Palette size={13} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditName(folder.name); setIsEditing(true); }}
                className={`p-1.5 rounded-lg transition-all ${
                  isDark ? "hover:bg-white/5 text-gray-600" : "hover:bg-gray-100 text-gray-400"
                }`}
              >
                <PencilSimple size={13} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(folder.id); }}
                className={`p-1.5 rounded-lg transition-all ${
                  isDark ? "hover:bg-red-900/20 text-gray-600 hover:text-red-400" : "hover:bg-red-50 text-gray-400 hover:text-red-500"
                }`}
              >
                <Trash size={13} />
              </button>
            </>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <CaretDown size={14} weight="bold" className={isDark ? "text-gray-500" : "text-gray-400"} />
          </motion.div>
        </div>
      </div>

      {/* Color picker */}
      <AnimatePresence>
        {showColors && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`overflow-hidden px-4 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}
          >
            <ColorPicker
              selected={folder.color}
              onChange={hex => { onColorChange(folder.id, hex); setShowColors(false); }}
              isDark={isDark}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Laws List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
            className="overflow-hidden"
          >
            <div className={`px-4 pb-4 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
              <div className="pt-3 space-y-1">
                {folder.laws.map((law, idx) => (
                  <motion.div
                    key={law.slug}
                    initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03, type: "spring", stiffness: 300, damping: 28 }}
                  >
                    <Link
                      href={`/laws/${law.slug}`}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all group/law ${
                        isDark
                          ? "hover:bg-white/[0.04] text-gray-300 hover:text-white"
                          : "hover:bg-gray-50 text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="text-[13px] font-semibold flex-1 truncate">
                        {isRTL ? law.title : law.titleEn}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        isDark ? "bg-white/5 text-gray-600" : "bg-gray-100 text-gray-400"
                      }`}>
                        {law.catId}
                      </span>
                      <ArrowRight
                        size={12}
                        weight="bold"
                        className={`opacity-0 group-hover/law:opacity-100 transition-opacity ${
                          isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"
                        } ${isRTL ? "rotate-180" : ""}`}
                      />
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Create Folder Modal ────────────────────────────────────────────────────────
function CreateFolderInline({
  isDark, isRTL, onCreate, onCancel,
}: {
  isDark: boolean;
  isRTL: boolean;
  onCreate: (name: string, color: string) => void;
  onCancel: () => void;
}) {
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

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function SmartFolders({
  isDark, isRTL,
}: {
  isDark: boolean;
  isRTL: boolean;
}) {
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    // In production, load from localStorage / API
    setFolders(DEMO_FOLDERS);
    // Auto-expand default folder
    setExpandedId("default-daily");
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const handleRename = useCallback((id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name, nameEn: name } : f));
  }, []);

  const handleColorChange = useCallback((id: string, color: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, color } : f));
  }, []);

  const handleCreate = useCallback((name: string, color: string) => {
    const newFolder: SmartFolder = {
      id: `folder-${Date.now()}`,
      name,
      nameEn: name,
      color,
      icon: "default",
      isDefault: false,
      laws: [],
    };
    setFolders(prev => [...prev, newFolder]);
    setIsCreating(false);
    setExpandedId(newFolder.id);
  }, []);

  return (
    <motion.div
      layout
      className={`mb-8 rounded-[1.75rem] border overflow-hidden ${
        isDark
          ? "bg-[#161b22]/60 border-[#2d3748]"
          : "bg-white/70 border-gray-200/70 backdrop-blur-sm"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/5"
          }`}>
            <FolderSimple
              size={18}
              weight="duotone"
              className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}
            />
          </div>
          <div className={isRTL ? "text-right" : "text-left"}>
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "مجلداتي" : "My Folders"}
            </h3>
            <p className={`text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {isRTL
                ? `${folders.length} مجلد · ${folders.reduce((acc, f) => acc + f.laws.length, 0)} نظام`
                : `${folders.length} folders · ${folders.reduce((acc, f) => acc + f.laws.length, 0)} laws`}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${
            isDark
              ? "bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20"
              : "bg-[#0B3D2E]/5 text-[#0B3D2E] hover:bg-[#0B3D2E]/10"
          }`}
        >
          <Plus size={14} weight="bold" />
          {isRTL ? "مجلد جديد" : "New Folder"}
        </button>
      </div>

      {/* Folder List */}
      <div className={`px-5 pb-5 space-y-2 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
        <div className="pt-4 space-y-2">
          <AnimatePresence mode="popLayout">
            {folders.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                isDark={isDark}
                isRTL={isRTL}
                isExpanded={expandedId === folder.id}
                onToggle={() => handleToggle(folder.id)}
                onDelete={handleDelete}
                onRename={handleRename}
                onColorChange={handleColorChange}
              />
            ))}
          </AnimatePresence>

          {/* Create folder inline */}
          <AnimatePresence>
            {isCreating && (
              <CreateFolderInline
                isDark={isDark}
                isRTL={isRTL}
                onCreate={handleCreate}
                onCancel={() => setIsCreating(false)}
              />
            )}
          </AnimatePresence>

          {/* Empty state */}
          {folders.length === 0 && !isCreating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`py-10 text-center rounded-2xl border border-dashed ${
                isDark ? "border-[#2d3748] bg-white/[0.02]" : "border-gray-200 bg-gray-50/50"
              }`}
            >
              <FolderSimplePlus size={32} className={`mx-auto mb-3 ${isDark ? "text-gray-600" : "text-gray-300"}`} weight="duotone" />
              <p className={`text-sm font-bold mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {isRTL ? "لا توجد مجلدات بعد" : "No folders yet"}
              </p>
              <p className={`text-xs ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                {isRTL ? "أنشئ مجلداً لتنظيم أنظمتك المفضلة" : "Create a folder to organize your favorite laws"}
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
