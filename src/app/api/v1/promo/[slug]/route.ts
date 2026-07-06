import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/promo/[slug] — Look up a provider promo link by its code.
 *
 * The promo_links table (20260603_phase1_003_subscriptions_billing.sql) keys
 * links by `code` (unique). The public landing route is /promo/[slug], so the
 * slug is matched against promo_links.code. Presentation fields
 * (providerName / providerType / value / serviceLabel / expiresAt) live in the
 * row's `metadata` jsonb; we surface them with sensible fallbacks.
 *
 * Resilient: on any error or missing table this returns 404 rather than
 * crashing, so the landing page can fall back to its own default display.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const admin = await createServiceClient();
    const { data: row, error } = await admin
      .from("promo_links")
      .select(
        "id, code, service_id, commission_pct, active, expires_at, metadata, clicks, conversions",
      )
      .eq("code", slug)
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;

    const data = {
      code: row.code as string,
      serviceId: (row.service_id as string) ?? null,
      active: row.active !== false,
      expiresAt: (row.expires_at as string | null) ?? str(meta.expiresAt),
      providerName: str(meta.providerName) ?? str(meta.provider_name),
      providerType: str(meta.providerType) ?? str(meta.provider_type),
      value: str(meta.value) ?? str(meta.discount),
      serviceLabel:
        str(meta.serviceLabel) ??
        str(meta.service_label) ??
        (str(row.service_id as string) ?? null),
      metadata: meta,
    };

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
