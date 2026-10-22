import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { getMoyasarConfig } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { createMoyasarClient } from "@/lib/payments/moyasarClient";
import { REFUND_NOTICE_AR, refundOrderWith } from "@/lib/payments/refundCore";
import { recordNotification } from "@/lib/notify";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("payments.refund");
  if (!gate.ok) return gate.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "طلب الاسترداد غير صالح" }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof (body as { confirm?: unknown }).confirm !== "boolean") return NextResponse.json({ error: "يلزم تأكيد طلب الاسترداد" }, { status: 400 });
  const { id } = await context.params;
  try {
    const admin = await createServiceClient();
    const result = await refundOrderWith({ admin,
      gateway: async () => { const cfg = await getMoyasarConfig(); return cfg.enabled ? createMoyasarClient(cfg) : null; },
      syncTier: async (userId, tier) => { await admin.auth.admin.updateUserById(userId, { user_metadata: { tier } }); },
      notify: async userId => recordNotification({ userId, title: REFUND_NOTICE_AR.title, body: REFUND_NOTICE_AR.body, href: "/dashboard/billing" }),
    }, id, gate.userId, (body as { confirm: boolean }).confirm);
    // finish_payment_refund records the audit in the same transaction as
    // reversal; no best-effort audit can be lost after money has moved.
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "الاسترداد غير متاح مؤقتاً" }, { status: 503 }); }
}
