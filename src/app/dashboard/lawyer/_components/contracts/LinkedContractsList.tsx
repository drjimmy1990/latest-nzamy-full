"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "@phosphor-icons/react";
import { getContracts, type Contract } from "@/lib/services/contractsService";
import { CONTRACT_TYPE_AR, CONTRACT_STATUS_AR } from "@/lib/services/contractVocabulary";
import type { ListRead } from "@/lib/services/listRead";

/**
 * LinkedContractsList — N01-7 (owner 13-Nov): the contracts of ONE case
 * (`requestId`, on cases/[id]) or of ONE client card (`lawyerClientId`, on
 * clients/[id]). Read-only; each row opens the contract in the contracts
 * manager. Reads GET /api/v1/lawyer/contracts with the matching filter — the
 * same RLS-scoped list the contracts page shows, narrowed.
 *
 * A failed read says so; it is never shown as «لا توجد عقود».
 */
interface Props {
  isDark: boolean;
  requestId?: string;
  lawyerClientId?: string;
  /** Where a contract opens (default the lawyer contracts manager). */
  basePath?: "/dashboard/lawyer" | "/dashboard/firm";
}

export default function LinkedContractsList({ isDark, requestId, lawyerClientId, basePath = "/dashboard/lawyer" }: Props) {
  const key = `${requestId ?? ""}|${lawyerClientId ?? ""}`;
  const [read, setRead] = useState<{ key: string; result: ListRead<Contract> } | null>(null);

  useEffect(() => {
    if (!requestId && !lawyerClientId) return;
    let cancelled = false;
    getContracts({
      status: "all",
      limit: 50,
      ...(requestId ? { requestId } : {}),
      ...(lawyerClientId ? { lawyerClientId } : {}),
    }).then((result) => {
      if (!cancelled) setRead({ key, result });
    });
    return () => { cancelled = true; };
  }, [key, requestId, lawyerClientId]);

  if (!requestId && !lawyerClientId) return null;

  const loading = !read || read.key !== key;
  const muted = isDark ? "text-zinc-500" : "text-slate-500";

  return (
    <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`}>
      <div className="mb-3 flex items-center gap-2">
        <FileText size={16} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
          {requestId ? "عقود هذه القضية" : "عقود هذا الموكّل"}
        </h3>
      </div>

      {loading ? (
        <p className={`text-[12px] ${muted}`}>جارٍ تحميل العقود…</p>
      ) : !read.result.ok ? (
        <p className="text-[12px] font-semibold text-red-500">تعذّر تحميل العقود — هذه ليست قائمة فارغة، بل قراءة لم تنجح.</p>
      ) : read.result.items.length === 0 ? (
        <p className={`text-[12px] ${muted}`}>
          {requestId
            ? "لا توجد عقود مربوطة بهذه القضية. اربط عقداً من «مدير العقود» عبر حقل «ربط بقضية قائمة»."
            : "لا توجد عقود مربوطة بهذا الموكّل."}
        </p>
      ) : (
        <ul className="space-y-2">
          {read.result.items.map((c) => (
            <li key={c.id}>
              <Link
                href={`${basePath}/contracts/${encodeURIComponent(c.id)}`}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                  isDark ? "border-white/[0.06] hover:bg-zinc-800" : "border-slate-100 hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[12.5px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                    {c.title || "عقد بدون عنوان"}
                  </span>
                  <span className={`block text-[11px] ${muted}`}>
                    {CONTRACT_TYPE_AR[c.contractType] ?? c.contractType}
                    {c.valueSar !== null && ` · ${c.valueSar.toLocaleString("ar-SA")} ر.س`}
                  </span>
                </span>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                  isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"
                }`}>
                  {CONTRACT_STATUS_AR[c.status] ?? c.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
