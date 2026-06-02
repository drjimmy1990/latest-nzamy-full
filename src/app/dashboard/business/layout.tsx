"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import FloatingButtons from "@/components/FloatingButtons";
import { EntityRouteGuard } from "@/components/dashboard/EntityRouteGuard";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";
import { Storefront } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Business (Corporate) Dashboard Layout
 * Uses SharedSidebar (CORPORATE_SIDEBAR config from navigation.ts)
 *
 * Supports two modes:
 * - ERP (default): Full corporate legal department dashboard
 * - Service: Simplified view for companies without in-house lawyer
 *
 * The role toggle is a DEV/DEMO preview tool — in production the role
 * would come from the authenticated user's account, not a manual toggle.
 */
function ModeHandler({ setMode }: { setMode: (m: "erp" | "service") => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "service") setMode("service");
    else setMode("erp");
    try { localStorage.setItem("nzamy_last_dashboard", "business"); } catch {}
  }, [searchParams, setMode]);
  return null;
}

export default function BusinessDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<"erp" | "service">("erp");
  const { lang } = useTheme();
  const isAr = lang === "ar";

  return (
    <UserTypeGuard allowedTypes={["corporate", "admin"]}>
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir={isAr ? "rtl" : "ltr"} suppressHydrationWarning>
        <Suspense fallback={null}>
          <ModeHandler setMode={setMode} />
        </Suspense>

        <SharedSidebar />

        <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh]">

          {/* ── Service Mode indicator ── */}
          {mode === "service" && (
            <div className="mx-4 md:mx-6 mt-4 mb-0">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-royal/8 dark:bg-royal/15 border border-royal/12 dark:border-royal/20">
                <Storefront size={15} className="text-royal dark:text-emerald-400" />
                <span className="text-xs font-bold text-royal dark:text-emerald-400">
                  {isAr ? "وضع طلب الخدمة — لا يوجد قسم قانوني داخلي" : "Service Mode — No Internal Legal Department"}
                </span>
              </div>
            </div>
          )}

          <div className="p-4 md:p-6 pt-4">
            <EntityRouteGuard scope="business">
              {children}
            </EntityRouteGuard>
          </div>
        </main>

        <FloatingButtons />
      </div>
    </UserTypeGuard>
  );
}


