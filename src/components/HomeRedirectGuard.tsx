"use client";

/**
 * HomeRedirectGuard — S79
 * إذا المستخدم لديه جلسة نشطة (demo cookie) → يُحوَّل لداشبورده تلقائياً.
 * إذا لا → تُعرض الـ Landing Page الاعتيادية.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";

const DASHBOARD_MAP: Record<string, string> = {
  lawyer:     "/dashboard/lawyer",
  firm:       "/dashboard/firm",
  individual: "/dashboard/client",
  client:     "/dashboard/client",
  corporate:  "/dashboard/business",
  micro:      "/dashboard/micro",
  provider:   "/dashboard/provider",
  government: "/dashboard/government",
  ngo:        "/dashboard/ngo",
  admin:      "/dashboard/lawyer", // fallback
};

export default function HomeRedirectGuard() {
  const router = useRouter();
  const user   = useUser();

  useEffect(() => {
    if (user.isLoggedIn && user.userType) {
      const dest = DASHBOARD_MAP[user.userType] ?? "/dashboard/lawyer";
      router.replace(dest);
    }
  }, [user.isLoggedIn, user.userType, router]);

  // renders nothing — purely side-effect
  return null;
}
