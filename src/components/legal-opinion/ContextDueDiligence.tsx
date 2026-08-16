"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Buildings, House, FolderOpen, HandCoins,
  CloudArrowUp, X, CheckCircle, Warning, Spinner, FileText,
} from "@phosphor-icons/react";
import type { OrderAttachment } from "@/lib/services/orderIntake";

export type EntityType = "company" | "property" | "project" | "deal";
export type DdGoal = "acquisition" | "investment" | "partnership" | "dispute";
export type DdSide = "buyer" | "seller" | "investor";

// Exported so page.tsx can resolve entityType/goal/side to Arabic labels for
// the submit-step recap and the order title without duplicating this list.
export const ENTITY_TYPES: { id: EntityType; label: string; icon: React.ElementType; extraField: string | null }[] = [
  { id: "company",  label: "شركة",   icon: Buildings, extraField: "رقم السجل التجاري" },
  { id: "property", label: "عقار",   icon: House,     extraField: "رقم الصك" },
  { id: "project",  label: "مشروع",  icon: FolderOpen, extraField: null },
  { id: "deal",     label: "صفقة",   icon: HandCoins, extraField: null },
];

export const DD_GOALS: { id: DdGoal; label: string }[] = [
  { id: "acquisition", label: "استحواذ" },
  { id: "investment",  label: "استثمار" },
  { id: "partnership", label: "شراكة" },
  { id: "dispute",     label: "تسوية نزاع" },
];

export const DD_SCOPE_ITEMS = [
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
  entityType: EntityType;
  setEntityType: (v: EntityType) => void;
  entityName: string;
  setEntityName: (v: string) => void;
  extraFieldVal: string;
  setExtraFieldVal: (v: string) => void;
  goal: DdGoal;
  setGoal: (v: DdGoal) => void;
  side: DdSide;
  setSide: (v: DdSide) => void;
  scope: Record<string, boolean>;
  setScope: (v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  isDark: boolean;
  card: string;
  attachments: OrderAttachment[];
  uploading: boolean;
  attachError: string;
  attachFile: (file: File) => Promise<OrderAttachment>;
  removeAttachment: (documentId: string) => void;
}

// entityType/entityName/extraFieldVal/goal/side/scope used to be local
// useState here — Props exposed only description/setDescription/isDark/card,
// so every one of them died the moment the user chose it and never reached
// the order except `description` (Task C4 recon). Now controlled props
// owned by page.tsx, matching the pattern already used for description.
export function ContextDueDiligence({
  description, setDescription,
  entityType, setEntityType, entityName, setEntityName,
  extraFieldVal, setExtraFieldVal, goal, setGoal, side, setSide,
  scope, setScope, isDark, card,
  attachments, uploading, attachError, attachFile, removeAttachment,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedEntity = ENTITY_TYPES.find(e => e.id === entityType)!;

  // Real uploads (Task C4) — previously kept f.name only, into a local
  // string[] that never left the component. Multiple files supported, same
  // as the original.
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      try { await attachFile(f); } catch { /* attachError is set inside the hook and rendered below */ }
    }
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

        {/* File upload — real attachments (Task C4) */}
        <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" className="hidden" disabled={uploading} onChange={handleFile} />
        <button
          onClick={() => { if (!uploading) fileRef.current?.click(); }}
          disabled={uploading}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-[11px] transition-colors disabled:opacity-60 ${
            isDark ? "border-white/[0.07] text-zinc-500 hover:border-red-500/30 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:border-red-300 hover:text-slate-600"
          }`}
        >
          {uploading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Spinner size={14} />
            </motion.div>
          ) : (
            <CloudArrowUp size={15} />
          )}
          {uploading ? "جارٍ رفع الملف..." : "ارفع مستندات الكيان (متعدد)"}
        </button>
        {attachError && (
          <p className="flex items-center gap-1.5 text-[11px] text-red-500 mt-1">
            <Warning size={12} />{attachError}
          </p>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {attachments.map(a => (
              <span key={a.documentId} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] ${
                isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"
              }`}>
                <FileText size={11} />
                {a.name.length > 20 ? `${a.name.slice(0, 20)}…` : a.name}
                <button onClick={() => removeAttachment(a.documentId)} className="hover:text-red-400"><X size={9} /></button>
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

      {/* Additional notes — was labelled optional with no minimum, so the
          context step had no gate at all (Task C4 recon: "due-diligence has
          no gate at all"). This is the only free-text field due-diligence
          has, and the order validator requires >= 20 characters of
          description for every non-letter sub-flow, so it is now required. */}
      <div className={`${card} p-4`}>
        <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          تفاصيل الفحص المطلوب
        </p>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="اشرح ما تحتاج فحصه بالتفصيل — نوع القطاع، القيمة التقديرية، الجداول الزمنية، أي نقاط قلق محددة..."
          rows={3}
          className={`w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${
            isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
          }`}
        />
        <p className={`text-[10px] mt-1.5 ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
          {description.length} حرف {description.length < 20 && "— الحد الأدنى ٢٠ حرفاً"}
        </p>
      </div>
    </motion.div>
  );
}
