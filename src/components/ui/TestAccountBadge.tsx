import { TEST_ROW_LABEL_AR } from "@/lib/testAccounts/testRow";

/**
 * «تجريبي» — the tag on a row a test account created (batch l7, decision 3;
 * src/lib/testAccounts/testRow.ts decides). Amber on a translucent amber
 * surface: readable on the dark and the light theme alike (no gray text —
 * src/lib/ui/darkModeGuard.test.ts).
 */
export default function TestAccountBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="بيانات حساب تجريبي — لا تُحتسب في الإيرادات ولا التقارير"
      className={`inline-flex shrink-0 items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-500 ${className}`}
    >
      {TEST_ROW_LABEL_AR}
    </span>
  );
}
