import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getMoyasarConfig } from "@/lib/access-control";
import { createMoyasarClient } from "@/lib/payments/moyasarClient";
import { BILLING_UNAVAILABLE_AR, deleteCardWith } from "@/lib/payments/billingCore";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(await createClient(), { error: "سجّل الدخول لإدارة البطاقات" });
    if (auth instanceof NextResponse) return auth;
    const { id } = await context.params;
    const result = await deleteCardWith({
      admin: await createServiceClient(),
      gateway: async () => {
        const cfg = await getMoyasarConfig();
        return cfg.enabled ? createMoyasarClient(cfg) : null;
      },
    }, auth.user.id, id);
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: BILLING_UNAVAILABLE_AR }, { status: 503 });
  }
}
