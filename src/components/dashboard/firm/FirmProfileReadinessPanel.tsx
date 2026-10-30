"use client";

import { UnfinishedModulesPanel } from "@/components/dashboard/sector/UnfinishedModulesPanel";

/**
 * Top-of-dashboard panel for the firm home and the firm health check.
 *
 * LIVE-F07 (owner package 2026-10-30): this used to be a "readiness" panel —
 * "Backend-ready" / "Beta" badges, seat and points figures and a points-spend
 * bar read from the browser's admin-settings copy, "enabled services" chips
 * and a link to the admin page. The owner's live test read it as a claim that
 * these modules work. It now shows only the plain list of what is unfinished
 * (src/constants/sectorUnfinishedModules.ts). Export name and props are kept
 * for its two callers.
 */
export function FirmProfileReadinessPanel({ compact = false }: { compact?: boolean }) {
  return <UnfinishedModulesPanel sector="firm" compact={compact} />;
}
