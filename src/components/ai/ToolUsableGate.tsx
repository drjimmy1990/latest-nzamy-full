"use client";

import { useUser } from "@/hooks/useUser";
import { useToolUsable } from "@/hooks/useToolUsable";
import { useTheme } from "@/components/ThemeProvider";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * A whole-page AI tool's tool-status gate (as /ai/quick-answer and
 * /ai/analyze-strength): a signed-in caller sees no form and no price until
 * GET /api/v1/ai/tool-status says he may run the tool, and «قريباً» when it says
 * no (the tool's mode, or a role outside it). A visitor gets the page as it was,
 * with its own sign-in handling: tool-status answers a visitor 401, which is not
 * «قريباً». Put it inside ConsultantGate on a consultant-blocked page, so a
 * consultant keeps the Art. 18 lock.
 */
export default function ToolUsableGate({ tool, title, description, children }: {
  tool: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const user = useUser();
  const { isDark } = useTheme();
  if (user.loading) {
    return <p role="status" dir="rtl" className={`py-16 text-center text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ التحقق…</p>;
  }
  if (!user.isLoggedIn) return <>{children}</>;
  return <SignedInGate tool={tool} title={title} description={description}>{children}</SignedInGate>;
}

function SignedInGate({ tool, title, description, children }: {
  tool: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const usable = useToolUsable(tool);
  const { isDark } = useTheme();
  if (usable === null) {
    return <p role="status" dir="rtl" className={`py-16 text-center text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ التحقق…</p>;
  }
  if (!usable) return <DashboardComingSoon title={title} description={description} backHref="/ai" />;
  return <>{children}</>;
}
