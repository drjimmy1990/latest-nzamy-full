"use client";

/**
 * The page shell shared by /dashboard/lawyer/graph and /dashboard/firm/graph
 * (N3.11). The firm route is also gated by FIRM_ROUTE_RULES
 * (src/constants/entityRouteAccess.ts: the roles that may open «قضايا المكتب»).
 */
import { TreeStructure } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import OfficeGraphView from "./OfficeGraphView";

export default function OfficeGraphPage({ base }: { base: "lawyer" | "firm" }) {
  const { isDark } = useTheme();
  return (
    <div className="mx-auto max-w-7xl space-y-5" dir="rtl">
      <div>
        <h1 className={`flex items-center gap-2 text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
          <TreeStructure size={22} weight="duotone" className="text-[#C8A762]" />
          {base === "firm" ? "خريطة قضايا المكتب" : "خريطة القضايا"}
        </h1>
        <p className={`mt-1 text-[13px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          قضاياك وموكّلوك والأطراف الأخرى المسجّلة في ملفاتها على خريطة واحدة. اضغط أي عنصر لإبراز ما يرتبط به.
        </p>
      </div>
      <OfficeGraphView base={base} isDark={isDark} />
    </div>
  );
}
