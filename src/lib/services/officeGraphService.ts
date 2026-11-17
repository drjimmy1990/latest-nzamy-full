/**
 * Typed client for GET /api/v1/lawyer/office-graph (N3.11). Throws on any
 * failure — the page shows «تعذّرت القراءة», never an empty map in its place.
 */

"use client";

import { apiGet } from "@/lib/services/api";
import type { OfficeGraph } from "@/lib/services/officeGraph";

/** Which sources a cap cut. `cases` / `clients` always; the others when the route sends them. */
export type OfficeGraphTruncated = { cases: boolean; clients: boolean } & Partial<
  Record<"contracts" | "consultations" | "hearings" | "tasks" | "invoices", boolean>
>;

export interface OfficeGraphRead {
  graph: OfficeGraph;
  truncated: OfficeGraphTruncated;
  caps: { cases: number; clients: number };
  /** Sources that failed to read and are not on the map (Arabic names). */
  partial: string[];
}

export async function getOfficeGraph(): Promise<OfficeGraphRead> {
  const res = await apiGet<{
    data: OfficeGraph;
    truncated?: OfficeGraphTruncated;
    caps?: { cases: number; clients: number };
    partial?: string[];
  }>("/api/v1/lawyer/office-graph");
  if (!res?.data || !Array.isArray(res.data.nodes)) throw new Error("تعذّرت قراءة خريطة القضايا.");
  return {
    graph: res.data,
    truncated: res.truncated ?? { cases: false, clients: false },
    caps: res.caps ?? { cases: 0, clients: 0 },
    partial: Array.isArray(res.partial) ? res.partial.filter((p) => typeof p === "string") : [],
  };
}
