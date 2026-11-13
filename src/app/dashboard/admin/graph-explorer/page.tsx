"use client";

import dynamic from "next/dynamic";
import { CircleNotch } from "@phosphor-icons/react";

/**
 * /dashboard/admin/graph-explorer — «مستكشف الجراف القانوني».
 *
 * A read page (any staff role): the canvas only reads, through
 * GET /api/v1/admin/graph-explorer (requireStaff("read")). React Flow is
 * browser-only, so the explorer loads on the client.
 */
const GraphExplorer = dynamic(() => import("@/components/admin/graphExplorer/GraphExplorer"), {
  ssr: false,
  loading: () => (
    <div dir="rtl" className="flex h-[calc(100dvh-4.5rem)] min-h-[680px] items-center justify-center bg-[#060608] text-[13px] text-zinc-500">
      <CircleNotch size={20} className="ml-2 animate-spin text-[#C8A762]" /> جارٍ تحميل المستكشف…
    </div>
  ),
});

export default function AdminGraphExplorerPage() {
  return <GraphExplorer />;
}
