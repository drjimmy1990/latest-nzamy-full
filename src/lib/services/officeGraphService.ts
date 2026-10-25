/**
 * Typed client for GET /api/v1/lawyer/office-graph (N3.11). Throws on any
 * failure — the page shows «تعذّرت القراءة», never an empty map in its place.
 */

"use client";

import { apiGet } from "@/lib/services/api";
import type { OfficeGraph } from "@/lib/services/officeGraph";

export interface OfficeGraphRead {
  graph: OfficeGraph;
  truncated: { cases: boolean; clients: boolean };
  caps: { cases: number; clients: number };
}

export async function getOfficeGraph(): Promise<OfficeGraphRead> {
  const res = await apiGet<{
    data: OfficeGraph;
    truncated?: { cases: boolean; clients: boolean };
    caps?: { cases: number; clients: number };
  }>("/api/v1/lawyer/office-graph");
  if (!res?.data || !Array.isArray(res.data.nodes)) throw new Error("تعذّرت قراءة خريطة القضايا.");
  return {
    graph: res.data,
    truncated: res.truncated ?? { cases: false, clients: false },
    caps: res.caps ?? { cases: 0, clients: 0 },
  };
}
