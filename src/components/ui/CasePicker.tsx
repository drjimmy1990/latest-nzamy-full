"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlass, Scales, X, CheckCircle, CircleNotch } from "@phosphor-icons/react";
import { getCaseTypeLabel, type CaseType } from "@/lib/casesStore";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { getWorkflowRequestsByReceiver } from "@/lib/services/workflowService";
import type { WorkflowRequest } from "@/lib/workflowStore";
import { workflowTypeToCaseType } from "@/constants/lawyerCasesData";

interface CasePickerProps {
  value: string;       // currently selected case id
  onChange: (id: string, title: string) => void;
  isDark: boolean;
}

/**
 * A pickable case. `id` is a `service_requests.id` — the same id
 * /dashboard/lawyer/cases/[id] resolves — so a task linked through this picker
 * can be found again from the case page.
 */
interface PickerCase {
  id: string;
  title: string;
  client: string;
  type: CaseType;
  status: "active" | "pending";
  nextDate?: string;
}

const STATUS_DOT: Record<string, string> = {
  active:    "bg-emerald-400 animate-pulse",
  pending:   "bg-amber-400",
  suspended: "bg-blue-400",
};

/**
 * Same source the lawyer's own case list reads (receiver="lawyer" service
 * requests), so the picker and /dashboard/lawyer/cases can never disagree.
 * Task rows live in that table too — they are created with receiver="lawyer"
 * and metadata.task === true — so they are filtered out here, otherwise every
 * task the lawyer wrote would come back offered as a case to link to.
 */
function toPickerCases(requests: WorkflowRequest[]): PickerCase[] {
  return requests
    // type === "service" is the same gate /dashboard/lawyer/cases applies, so
    // the picker offers exactly what that list shows — minus the task rows,
    // which share both receiver="lawyer" and type="service" with real cases
    // and are told apart only by metadata.task.
    .filter(r => r.type === "service" && !(r.metadata as Record<string, unknown> | null)?.task)
    // completed → closed, cancelled → archived: neither is worth hanging a new
    // task off, matching what the old getActiveCases() excluded.
    .filter(r => r.status !== "completed" && r.status !== "cancelled")
    .map(r => ({
      id: r.id,
      title: r.title || "قضية بدون عنوان",
      client: r.requester?.name || "موكل",
      type: workflowTypeToCaseType(r),
      status: (r.status === "assigned" || r.status === "in_review" ? "active" : "pending") as PickerCase["status"],
      nextDate: typeof r.metadata?.deadline === "string" ? r.metadata.deadline : undefined,
    }));
}

export function CasePicker({ value, onChange, isDark }: CasePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cases, setCases] = useState<PickerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Real cases only. An empty result stays empty — a lawyer with no cases must
  // not be shown invented ones, or they would link a task to a case id that
  // does not exist and the case page would never find it again.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const requests = isSupabaseMode
          // The shared helper defaults to limit=20, which would silently hide a
          // busy lawyer's older cases from the picker; ask for the full page.
          ? (await apiGet<{ data: WorkflowRequest[] }>("/api/v1/service-requests", { receiver: "lawyer", limit: 100 })).data
          : await getWorkflowRequestsByReceiver("lawyer");
        if (!alive) return;
        setCases(toPickerCases(requests ?? []));
      } catch (e) {
        if (!alive) return;
        console.error("[CasePicker] failed to load cases:", e);
        setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = cases.filter(c =>
    !query.trim() ||
    c.title.includes(query) ||
    c.client.includes(query) ||
    getCaseTypeLabel(c.type).includes(query)
  );

  const selected = cases.find(c => c.id === value);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // focus search on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const base = isDark
    ? "border-white/[0.06] bg-zinc-800 text-zinc-100"
    : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] text-right flex items-center gap-2 transition-all ${base} ${open ? isDark ? "border-[#C8A762]/40" : "border-[#0B3D2E]/30 ring-2 ring-[#0B3D2E]/10" : ""}`}
      >
        {selected ? (
          <>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[selected.status] ?? "bg-slate-300"}`} />
            <span className="flex-1 truncate font-medium">{selected.title}</span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange("", ""); }}
              className={`p-0.5 rounded-md hover:bg-red-500/10 ${isDark ? "text-zinc-500 hover:text-red-400" : "text-slate-400 hover:text-red-400"}`}
            >
              <X size={11} />
            </button>
          </>
        ) : value ? (
          // A case is linked but its row is not in the loaded list (still
          // loading, or the fetch failed). Say that — never fall back to the
          // "مهمة مستقلة" label, which would misreport a linked task as free.
          <span className={`flex-1 truncate ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            {loading ? "جارٍ تحميل القضية..." : "قضية مرتبطة"}
          </span>
        ) : (
          <span className={isDark ? "text-zinc-500" : "text-slate-400"}>
            — مهمة مستقلة —
          </span>
        )}
        <Scales size={13} className={isDark ? "text-zinc-600" : "text-slate-400"} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute top-full mt-1.5 inset-x-0 z-50 rounded-2xl border shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"}`}
          >
            {/* Search bar */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              <MagnifyingGlass size={13} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ابحث عن قضية..."
                className={`flex-1 text-[12px] bg-transparent outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
              />
              {query && (
                <button onClick={() => setQuery("")} className={isDark ? "text-zinc-600 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}>
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Independent task option */}
            <button
              type="button"
              onClick={() => { onChange("", ""); setOpen(false); setQuery(""); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-right text-[12px] transition-colors ${!value ? isDark ? "bg-white/[0.05]" : "bg-slate-50" : ""} ${isDark ? "hover:bg-white/[0.04] text-zinc-400" : "hover:bg-slate-50 text-slate-500"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
              <span className="flex-1">— مهمة مستقلة —</span>
              {!value && <CheckCircle size={12} className="text-emerald-500" />}
            </button>

            {/* Case list */}
            <div className="overflow-y-auto max-h-[220px]">
              {loading ? (
                <p className={`flex items-center justify-center gap-2 text-[12px] py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  <CircleNotch size={13} className="animate-spin" />
                  جارٍ تحميل قضاياك...
                </p>
              ) : loadError ? (
                <p className={`text-center text-[12px] py-6 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                  تعذّر تحميل قضاياك. يمكنك حفظ المهمة كمهمة مستقلة.
                </p>
              ) : cases.length === 0 ? (
                // Honest empty state. The lawyer genuinely has no cases — do
                // NOT substitute demo cases here.
                <div className="py-6 px-4 text-center">
                  <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    لا توجد لديك قضايا بعد
                  </p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    ستظهر قضاياك هنا فور إسنادها إليك — احفظها الآن كمهمة مستقلة.
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <p className={`text-center text-[12px] py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  لا توجد قضايا مطابقة
                </p>
              ) : filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(c.id, c.title); setOpen(false); setQuery(""); }}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-right text-[12px] transition-colors ${value === c.id ? isDark ? "bg-[#0B3D2E]/30" : "bg-emerald-50" : isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50"}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${STATUS_DOT[c.status] ?? "bg-slate-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${value === c.id ? isDark ? "text-emerald-300" : "text-emerald-700" : isDark ? "text-zinc-200" : "text-slate-700"}`}>
                      {c.title}
                    </p>
                    <p className={`text-[10px] truncate mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      {c.client} · {getCaseTypeLabel(c.type)}
                      {c.nextDate && ` · ${c.nextDate}`}
                    </p>
                  </div>
                  {value === c.id && <CheckCircle size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
