"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import { EntityRouteGuard } from "@/components/dashboard/EntityRouteGuard";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";
import { Storefront } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { isHiddenBusinessSection } from "@/constants/navigation.sidebars.business";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

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

/**
 * «قيد التطوير» — what a company section outside the live set renders.
 *
 * Owner decision ٥ (answers of 2026-10-06): «تفعيل الأقسام الأساسية الخمسة أولاً
 * (العقود، القضايا، المواعيد، التفويض، والفريق) وإبقاء البقية قيد التطوير».
 * The live sections are the ones CORPORATE_SIDEBAR links; any other
 * /dashboard/business/* URL — a bookmark, an old link — lands here instead of
 * on its page. Rendered through DashboardComingSoon, the one honest «not yet»
 * screen, rather than a notice of this layout's own (the 26 August «هذا القسم
 * قيد الإعداد … ما كان يظهر فيه لم يكن يخصّك», which it replaces).
 *
 * It does not redirect: a silent bounce would leave the company wondering
 * whether it had lost access to something it was paying for.
 */
function SectionInDevelopment() {
  return (
    <DashboardComingSoon
      title="هذا القسم قيد التطوير"
      description="لم يُربط هذا القسم ببيانات منشأتك بعد. الأقسام العاملة الآن: القضايا، والعقود، والمواعيد، والتفويض، وإدارة الفريق."
      backHref="/dashboard/business"
    />
  );
}

export default function BusinessDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<"erp" | "service">("erp");
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const pathname = usePathname() ?? "";
  const { userType } = useUser();

  // The nineteen hidden sections stay in the tree, so the URL still resolves.
  // Refuse to RENDER them rather than redirecting after the fact: a
  // useEffect + router.replace paints the invented kanban for a frame first,
  // which is the one thing this change exists to stop.
  //
  // The admin passes through. UserTypeGuard above deliberately admits
  // ["corporate", "admin"] so the platform owner can look at these pages; a
  // guard that bounced the admin too would remove the only way to inspect them.
  // While useUser is still resolving, userType is not yet "admin" and the
  // notice shows — the safe direction to be wrong in.
  // isHiddenBusinessSection, NOT isVisibleBusinessRoute. This layout is also
  // the chrome for every /ai/* page a corporate account opens
  // (src/app/ai/layout.tsx dispatches on user_type, not on path), so asking
  // "is this a VISIBLE business route" answered `false` for /ai/orders/[id] —
  // a company that clicked its own order was told the section was not ready
  // and that what used to be there was not its own data. See the predicate's
  // docblock for the full trace.
  const sectionHidden = userType !== "admin" && isHiddenBusinessSection(pathname);

  return (
    <UserTypeGuard allowedTypes={["corporate", "admin"]}>
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir={isAr ? "rtl" : "ltr"} suppressHydrationWarning>
        <Suspense fallback={null}>
          <ModeHandler setMode={setMode} />
        </Suspense>

        <SharedSidebar />

        <div className="print-main lg:mr-64 pt-[calc(env(safe-area-inset-top)+60px)] lg:pt-0 min-h-[100dvh]">

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
            {sectionHidden ? (
              <SectionInDevelopment />
            ) : (
              <EntityRouteGuard scope="business">
                {children}
              </EntityRouteGuard>
            )}
          </div>
        </div>

              </div>
    </UserTypeGuard>
  );
}


