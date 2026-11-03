"use client";

import type { SectorProfileType } from "@/types/sectorBackendReady";
import { UnfinishedModulesPanel } from "./UnfinishedModulesPanel";

/**
 * Top-of-dashboard panel for the government, NGO and micro-business homes.
 *
 * LIVE-F07 (owner package 2026-10-30): this used to be a "readiness" panel —
 * «جاهزية الجهة الحكومية / الجمعية / درع المنشأة», "Backend-ready" and
 * "Beta local" badges, metrics read from the browser's admin-settings copy
 * (users, volunteers, board seats, a requirements score), "enabled surfaces"
 * chips and a link to the admin sector-profiles page. The owner's live test
 * read it as a claim that these modules work. It now shows only the plain
 * list of what is unfinished (src/constants/sectorUnfinishedModules.ts).
 * The export name and props are kept for the three home pages that use it.
 */
export function SectorProfileReadinessPanel({ sector, compact = false }: { sector: SectorProfileType; compact?: boolean }) {
  return <UnfinishedModulesPanel sector={sector} compact={compact} />;
}
