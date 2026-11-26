import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OFFICE_PLAN_UNAVAILABLE_AR,
  officeGateDecision,
  officePlanRefusalBody,
  type OfficeFeature,
} from "@/lib/auth/officePlan";

/**
 * officePlanRefusal — owner س٢١٢ on the server: a paid «إدارة المكتب» write
 * (team & seats, cases & clients, shared documents, tasks / hearings,
 * invoices & reports) is refused to an account on the free side.
 *
 * Call it in a WRITE handler after the auth check, before the body is parsed
 * or anything is written:
 *
 *   const locked = await officePlanRefusal(supabase, "tasks");
 *   if (locked) return locked;
 *
 * Asks the database about the caller only (public.my_office_features_locked,
 * 20261206_70 — the session client, never the service role). A client, a
 * company, a paid lawyer, a founder and a paid firm's member pass; reads are
 * never gated, so what an account already holds stays readable.
 *
 *   403 { error: «… متاحة في باقة «إدارة المكتب».», code: "office_plan_required", linkHref, linkLabel }
 *   503 when the check itself failed (fail closed)
 *   null to go on — also before 20261206_70 is applied (logged once)
 */

let loggedNotInstalled = false;

export async function officePlanRefusal(supabase: SupabaseClient, feature: OfficeFeature): Promise<NextResponse | null> {
  let read: { data?: unknown; error?: { code?: string | null; message?: string } | null };
  try {
    read = await supabase.rpc("my_office_features_locked");
  } catch (err) {
    console.error("[officePlan] check threw:", err instanceof Error ? err.name : "error");
    read = { error: { code: "threw" } };
  }
  const decision = officeGateDecision(read);
  if (decision === "allow") return null;
  if (decision === "not_installed") {
    if (!loggedNotInstalled) {
      loggedNotInstalled = true;
      console.warn("[officePlan] my_office_features_locked() is missing (run 20261206_70); the office gate lets every write through");
    }
    return null;
  }
  if (decision === "locked") {
    return NextResponse.json(officePlanRefusalBody(feature), {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  console.error("[officePlan] check failed:", read.error?.code ?? "no-data");
  return NextResponse.json({ error: OFFICE_PLAN_UNAVAILABLE_AR }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}
