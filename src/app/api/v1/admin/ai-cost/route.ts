import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { COST_WINDOWS, costWindow, type CostRunRow } from "@/lib/ai/aiCost";
import { MODEL_PRICES, SAR_PER_USD } from "@/lib/ai/modelPrices";

/**
 * GET /api/v1/admin/ai-cost — owner ١٥٦ (batch l13): «التكلفة الحقيقية لكل
 * أداة» for the admin AI usage page. Every run of the last 30 days (any status:
 * the provider bills a failed call too), its reported tokens × the one price
 * table (src/lib/ai/modelPrices.ts), per tool, for 7 and 30 days, admin runs
 * apart from the users' (src/lib/ai/aiCost.ts).
 *
 * Read in pages of 1,000 (PostgREST's cap) up to MAX_ROWS; past that the answer
 * says `truncated` and the page says the totals are partial. Any staff role may
 * read; service client because ai_runs.usage is not readable by sessions.
 */

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_ROWS = 100_000;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;

  try {
    const admin = await createServiceClient();
    const now = new Date();
    const since = new Date(now.getTime() - Math.max(...COST_WINDOWS) * 86_400_000).toISOString();

    const rows: CostRunRow[] = [];
    let truncated = false;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("ai_runs")
        .select("tool, model, usage, status, created_at, user_id")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") {
          return NextResponse.json({ windows: [], prices: MODEL_PRICES, sarPerUsd: SAR_PER_USD, schemaMissing: true }, { headers: NO_STORE });
        }
        console.error("[admin/ai-cost] read failed:", error.code, error.message);
        return NextResponse.json({ error: "تعذّر تحميل التكلفة" }, { status: 503, headers: NO_STORE });
      }
      const page = (data ?? []) as CostRunRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
    }

    const { data: admins, error: adminsError } = await admin.from("profiles").select("id").eq("user_type", "admin");
    if (adminsError) {
      console.error("[admin/ai-cost] admin list failed:", adminsError.code, adminsError.message);
      return NextResponse.json({ error: "تعذّر تحميل التكلفة" }, { status: 503, headers: NO_STORE });
    }
    const adminIds = new Set(((admins ?? []) as Array<{ id: string }>).map((a) => a.id));

    return NextResponse.json(
      {
        windows: COST_WINDOWS.map((days) => costWindow(rows, adminIds, now, days)),
        prices: MODEL_PRICES,
        sarPerUsd: SAR_PER_USD,
        truncated,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[admin/ai-cost] threw:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "تعذّر تحميل التكلفة" }, { status: 503, headers: NO_STORE });
  }
}
