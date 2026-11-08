"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useUser } from "@/hooks/useUser";
import { canSeeLawyerTools } from "@/lib/ai/lawyerOnlyTools";

/**
 * A link to a lawyer tool (src/lib/ai/lawyerOnlyTools.ts) on a screen other
 * accounts also open: drawn for a lawyer, a firm and an admin, and for nobody
 * else (owner ٤١٧ / ٤٤٣, 8 Nov 2026). Nothing is drawn while the session loads.
 */
export default function LawyerToolLink(props: ComponentProps<typeof Link>) {
  const user = useUser();
  if (user.loading || !canSeeLawyerTools(user.userType)) return null;
  return <Link {...props} />;
}
