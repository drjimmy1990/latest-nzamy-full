"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Buildings, House, FolderOpen, HandCoins,
  CloudArrowUp, X, CheckCircle,
} from "@phosphor-icons/react";

type EntityType = "company" | "property" | "project" | "deal";
type DdGoal = "acquisition" | "investment" | "partnership" | "dispute";
type DdSide = "buyer" | "seller" | "investor";

const ENTITY_TYPES: { id: EntityType; label: string; icon: React.ElementType; extraField: string | null }[] = [
  { id: "company",  label: "شركة",   icon: Buildings, extraField: "رقم السجل التجاري" },
  { id: "property", label: "عقار",   icon: House,     extraField: "رقم الصك" },
  { id: "project",  label: "مشروع",  icon: FolderOpen, extraField: null },
  { id: "deal",     label: "صفقة",   icon: HandCoins, extraField: null },
];

const DD_GOALS: { id: DdGoal; label: string }[] = [
  { id: "acquisition", label: "استحواذ" },
  { id: "investment",  label: "استثمار" },
  { id: "partnership", label: "شراكة" },
  { id: "dispute",     label: "تسوية نزاع" },
];

const DD_SCOPE_ITEMS = [
  { id: "legal_structure",  label: "الهيكل القانوني",        default: true },
  { id: "regulatory",       label: "الالتزامات التنظيمية",   default: true },
  { id: "contracts",        label: "العقود القائمة",          default: true },
  { id: "disputes",         label: "النزاعات المعلقة",        default: false },
  { id: "ip",               label: "الملكية الفكرية",         default: true },
  { id: "financial",        label: "البنية المالية (للاطلاع فقط)", default: false },
];

interface Props {
  description: string;
  setDescription: (v: string) => void;
  isDark: boolean;
  card: string;
}

export function ContextDueDiligence({ description, setDescription, isDark, card }: Props) {
  const [entityType, setEntityType] = useState<EntityType>("company");
  const [entityName, setEntityName] = useState("");
  const [extraFieldVal, setExtraFieldVal] = useState("");
  const [goal, setGoal] = useState<DdGoal>("acquisition");
  const [side, setSide] = useState<DdSide>("buyer");
  const [scope, setScope] = useState<Record<string, boolean>>(
    Object.fromEntries(DD_SCOPE_ITEMS.map(i => [i.id, i.default]))
  );
  const [files, setFiles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedEntity = ENTITY_TYPES.find(e => e.id === entityType)!;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []).map(f => f.name);
    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const toggleScope = (id: string) =>
    setScope(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <motion.div
      key="ctx-due-diligence"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      {/* Entity type */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          نوع الكيان
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ENTITY_TYPES.map(et => {
            const Icon = et.icon;
            const isActive = entityType === et.id;
            return (
              <button
                key={et.id}
                onClick={() => setEntityType(et.id)}
                className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border text-center transition-all ${
                  isActive
                    ? isDark ? "border-red-500/40 bg-red-900/15 text-red-400" : "border-red-300 bg-red-50 text-red-700"
                    : isDark ? "border-white/[0.07] text-zinc-400 hover:border-red-500/20" : "border-slate-200 text-slate-500 hover:border-red-200"
                }`}
              >
                <Icon size={18} weight={isActive ? "fill" : "duotone"} />
                <span className="text-[11px] font-semibold">{et.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Entity details */}
      <div className={`${card} p-4 space-y-3`}>
        <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          تفاصيل الكيان
        </p>
        <input
          type="text"
          value={entityName}
          onChange={e => setEntityName(e.target.value)}
          placeholder={`اسم ${selectedEntity.label}`}
          className={`w-full rounded-xl border px-3.5 py-2.5 text-[13px] outline-none ${
            isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
          }`}
        />

        <AnimatePresence>
          {selectedEntity.extraField && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <input
                type="text"
                value={extraFieldVal}
                onChange={e => setExtraFieldVal(e.target.value)}
                placeholder={`${selectedEntity.extraField} (اختياري)`}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-[13px] outline-none ${
                  isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
                }`}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* File upload */}
        <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-[11px] transition-colors ${
            isDark ? "border-white/[0.07] text-zinc-500 hover:border-red-500/30 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:border-red-300 hover:text-slate-600"
          }`}
        >
          <CloudArrowUp size={15} /> ارفع مستندات الكيان (متعدد)
        </button>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {files.map((f, i) => (
              <span key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] ${
                isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"
              }`}>
                {f.slice(0, 20)}
                <button onClick={() => setFiles(prev => prev.filter((_, fi) => fi !== i))} className="hover:text-red-400"><X size={9} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Goal + Side */}
      <div className={`${card} p-4 space-y-4`}>
        {/* Goal */}
        <div>
          <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>هدف الفحص</p>
          <div className="flex flex-wrap gap-2">
            {DD_GOALS.map(g => (
              <button
                key={g.id}
                onClick={() => setGoal(g.id)}
                className={`px-4 py-2 rounded-xl border text-[12px] font-medium transition-all ${
                  goal === g.id
                    ? isDark ? "border-red-500/40 bg-red-900/15 text-red-400" : "border-red-300 bg-red-50 text-red-700 font-semibold"
                    : isDark ? "border-white/[0.07] text-zinc-400 hover:border-red-500/20" : "border-slate-200 text-slate-500 hover:border-red-200"
                }`}
              >{g.label}</button>
            ))}
          </div>
        </div>

        {/* Side */}
        <div>
          <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>جانبك في الصفقة</p>
          <div className="flex gap-2">
            {([{ id: "buyer" as DdSide, label: "مشترٍ" }, { id: "seller" as DdSide, label: "بائع" }, { id: "investor" as DdSide, label: "مستثمر" }]).map(opt => (
              <button
                key={opt.id}
                onClick={() => setSide(opt.id)}
                className={`flex-1 py-2 rounded-xl border text-[12px] font-medium transition-all ${
                  side === opt.id
                    ? isDark ? "border-red-500/40 bg-red-900/15 text-red-400" : "border-red-300 bg-red-50 text-red-700"
                    : isDark ? "border-white/[0.07] text-zinc-400" : "border-slate-200 text-slate-500"
                }`}
              >{opt.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Scope checklist */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          محاور الفحص
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DD_SCOPE_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => toggleScope(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-start transition-all ${
                scope[item.id]
                  ? isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
                  : isDark ? "border-white/[0.06] hover:border-white/[0.10]" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <CheckCircle size={14} weight={scope[item.id] ? "fill" : "regular"} className={scope[item.id] ? "text-emerald-500" : isDark ? "text-zinc-600" : "text-slate-400"} />
              <span className={`text-[11px] font-medium ${scope[item.id] ? isDark ? "text-zinc-200" : "text-zinc-800" : isDark ? "text-zinc-500" : "text-slate-500"}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Additional notes */}
      <div className={`${card} p-4`}>
        <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          ملاحظات إضافية
          <span className={`text-[10px] font-normal ms-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>(اختياري)</span>
        </p>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="أي معلومات إضافية تساعد في الفحص — نوع القطاع، القيمة التقديرية، الجداول الزمنية..."
          rows={3}
          className={`w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${
            isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
          }`}
        />
      </div>
    </motion.div>
  );
}
