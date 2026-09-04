"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import ContractDetail from "@/app/dashboard/lawyer/_components/contracts/ContractDetail";

export default function LawyerContractDetailPage() {
  const { isDark } = useTheme();
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="max-w-[900px] mx-auto pb-4" dir="rtl">
      <Link
        href="/dashboard/lawyer/contracts"
        className={`inline-flex items-center gap-1.5 mb-4 text-[12px] font-bold hover:underline ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"}`}
      >
        <CaretLeft size={12} /> مدير العقود
      </Link>
      <ContractDetail contractId={id} isDark={isDark} basePath="/dashboard/lawyer" />
    </div>
  );
}
