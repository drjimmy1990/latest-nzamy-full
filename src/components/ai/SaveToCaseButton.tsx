"use client";

/**
 * «حفظ في مستندات القضية» — N01-21/22 (owner package 13 Nov, file 01, bridge 6).
 *
 * Saves an AI tool's result as a document of one of the caller's cases through
 * POST /api/v1/cases/[id]/documents/from-ai (which re-checks access on the
 * server and, given `runId`, links the stored run to the case). The case list
 * is the one the case pages show: GET /api/v1/service-requests (lawyer:
 * receiver=lawyer; firm: no receiver filter — the firm cases page's rule),
 * narrowed by isLawyerCaseRow, cancelled cases left out.
 *
 * Shown to lawyer and firm accounts only (the AI result bar's collector rule).
 * When the picked case was filed by someone else (a client), the warning the
 * case's documents tab already shows is repeated before saving: the client
 * sees the files of his own case.
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, FolderPlus, Spinner, Eye, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { apiGet } from "@/lib/services/api";
import { isLawyerCaseRow } from "@/app/dashboard/lawyer/cases/_caseListRules";
import type { WorkflowRequest } from "@/lib/workflowStore";

interface CaseOption { id: string; title: string; filedByOther: boolean }

type Picker =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; cases: CaseOption[] };

export default function SaveToCaseButton({
  text,
  title,
  runId,
  className = "",
}: {
  text: string;
  title?: string;
  runId?: string | null;
  className?: string;
}) {
  const { isDark } = useTheme();
  const user = useUser();
  const [picker, setPicker] = useState<Picker>({ kind: "closed" });
  const [caseId, setCaseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ caseId: string; fileName: string } | null>(null);

  const isFirm = user.userType === "firm";
  if (user.userType !== "lawyer" && !isFirm) return null;
  if (!text.trim()) return null;

  async function open() {
    setPicker({ kind: "loading" });
    setError(null);
    setSaved(null);
    try {
      const res = await apiGet<{ data?: WorkflowRequest[]; degraded?: boolean }>(
        "/api/v1/service-requests",
        isFirm ? { limit: 200 } : { receiver: "lawyer", limit: 200 },
      );
      if (res.degraded) throw new Error("degraded");
      const cases = (res.data ?? [])
        .filter(isLawyerCaseRow)
        .filter((r) => r.status !== "cancelled")
        .map((r) => {
          const requester = (r as { requester_user_id?: string | null }).requester_user_id ?? null;
          return {
            id: r.id,
            title: r.title || "قضية بدون عنوان",
            filedByOther: requester !== (user.userId ?? null),
          };
        });
      setPicker({ kind: "ready", cases });
      setCaseId(cases[0]?.id ?? "");
    } catch {
      setPicker({ kind: "error" });
    }
  }

  async function save() {
    if (!caseId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/documents/from-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title, runId: runId ?? undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { fileName?: string }; error?: string };
      if (!res.ok) {
        setError(body.error || "تعذّر حفظ المستند في القضية.");
        return;
      }
      setSaved({ caseId, fileName: body.data?.fileName ?? "" });
      setPicker({ kind: "closed" });
    } catch {
      setError("تعذّر حفظ المستند — تحقّق من الاتصال وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  const btn = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all border";
  const ghost = isDark
    ? `${btn} border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200`
    : `${btn} border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm`;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const casePath = (id: string) => `/dashboard/${isFirm ? "firm" : "lawyer"}/cases/${encodeURIComponent(id)}`;
  const picked = picker.kind === "ready" ? picker.cases.find((c) => c.id === caseId) : undefined;

  return (
    <div className={`inline-flex flex-col gap-2 ${className}`} dir="rtl">
      {picker.kind === "closed" ? (
        <button type="button" onClick={() => void open()} className={ghost} aria-label="حفظ في مستندات القضية">
          <FolderPlus size={14} /> حفظ في مستندات القضية
        </button>
      ) : (
        <div className={`rounded-xl border p-3 space-y-2 min-w-[260px] ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-slate-200 bg-white shadow-sm"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>حفظ في مستندات القضية</p>
            <button type="button" onClick={() => setPicker({ kind: "closed" })} aria-label="إغلاق" className={muted}>
              <X size={13} />
            </button>
          </div>
          {picker.kind === "loading" ? (
            <p className={`flex items-center gap-1.5 text-[11px] ${muted}`}><Spinner size={12} className="animate-spin" /> جارٍ تحميل قضاياك…</p>
          ) : picker.kind === "error" ? (
            <p className="text-[11px] font-semibold text-red-500">تعذّر تحميل قضاياك — حاول مرة أخرى.</p>
          ) : picker.cases.length === 0 ? (
            <p className={`text-[11px] ${muted}`}>لا توجد لديك قضايا تُحفظ فيها هذه النتيجة.</p>
          ) : (
            <>
              <label htmlFor="save-to-case" className={`block text-[11px] font-semibold ${muted}`}>القضية</label>
              <select
                id="save-to-case"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className={`w-full rounded-lg border px-2 py-1.5 text-[12px] ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {picker.cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {picked?.filedByOther && (
                <p role="note" className={`flex items-center gap-1 text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  <Eye size={12} aria-hidden="true" /> الموكّل يرى مستندات هذه القضية
                </p>
              )}
              <button
                type="button"
                disabled={saving || !caseId}
                onClick={() => void save()}
                className={`${btn} border-[#0B3D2E]/30 bg-[#0B3D2E] text-[#C8A762] disabled:opacity-50`}
              >
                {saving ? <Spinner size={12} className="animate-spin" /> : <FolderPlus size={12} />}
                {saving ? "جارٍ الحفظ…" : "حفظ"}
              </button>
            </>
          )}
          {error && <p className="text-[11px] font-semibold text-red-500">{error}</p>}
        </div>
      )}
      {saved && (
        <p className={`flex items-center gap-1.5 text-[11px] font-semibold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
          <CheckCircle size={13} weight="fill" /> حُفظ في مستندات القضية{saved.fileName ? ` باسم «${saved.fileName}»` : ""}.
          <Link href={casePath(saved.caseId)} className="underline">فتح القضية</Link>
        </p>
      )}
    </div>
  );
}
