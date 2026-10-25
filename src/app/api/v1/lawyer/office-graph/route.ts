import { NextResponse } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { buildOfficeGraph, isCaseRow, type OfficeCaseInput, type OfficeClientInput } from "@/lib/services/officeGraph";

/**
 * GET /api/v1/lawyer/office-graph — «خريطة قضايا المكتب» (N3.11).
 *
 * READ-ONLY. Every query runs on the caller's own RLS client, exactly like
 * GET /api/v1/lawyer/conflict-check: his cases and his firm's (service_requests
 * "firm members read firm service requests"), his client cards and his
 * firm's (lawyer_clients). Nothing is read with the service role and nothing
 * is written — not case_graphs, not anything else.
 *
 * The response carries names and ids only (officeGraph.ts drops every
 * identity number, phone and register an intake may hold). Each source is
 * capped; `truncated` says when a cap cut it, and the page says so.
 */

const CASE_CAP = 300;
const CLIENT_CAP = 500;

interface CaseRow {
  id: string;
  title: string | null;
  status: string;
  type: string;
  lawyer_client_id: string | null;
  requester: { name?: unknown } | null;
  metadata: Record<string, unknown> | null;
}

interface ClientRow {
  id: string;
  name: string;
  client_type: string;
}

export async function GET() {
  try {
    // Lawyers, firm accounts, and active firm members of any account type (a
    // legal secretary is not a "lawyer" account) — the case-file gate.
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const [casesRes, clientsRes] = await Promise.all([
      supabase
        .from("service_requests")
        .select("id, title, status, type, lawyer_client_id, requester, metadata", { count: "exact" })
        .eq("type", "service")
        .order("created_at", { ascending: false })
        .limit(CASE_CAP),
      supabase
        .from("lawyer_clients")
        .select("id, name, client_type", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(CLIENT_CAP),
    ]);

    if (casesRes.error || clientsRes.error) {
      const e = casesRes.error ?? clientsRes.error;
      console.error("[lawyer/office-graph GET] read failed:", e?.message, e?.code);
      return NextResponse.json({ error: "تعذّرت قراءة قضايا المكتب وموكّليه." }, { status: 500 });
    }

    const caseRows = ((casesRes.data ?? []) as CaseRow[]).filter((r) => isCaseRow(r.type, r.metadata));
    const cases: OfficeCaseInput[] = caseRows.map((r) => ({
      id: r.id,
      title: r.title ?? "",
      status: r.status,
      lawyerClientId: r.lawyer_client_id,
      requester: r.requester,
      metadata: r.metadata,
    }));
    const clients: OfficeClientInput[] = ((clientsRes.data ?? []) as ClientRow[]).map((c) => ({
      id: c.id,
      name: c.name,
      clientType: c.client_type,
    }));

    const graph = buildOfficeGraph(cases, clients);
    return NextResponse.json({
      data: graph,
      truncated: {
        cases: (casesRes.count ?? 0) > CASE_CAP,
        clients: (clientsRes.count ?? 0) > CLIENT_CAP,
      },
      caps: { cases: CASE_CAP, clients: CLIENT_CAP },
    });
  } catch (err) {
    console.error("[lawyer/office-graph GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت قراءة قضايا المكتب وموكّليه." }, { status: 500 });
  }
}
