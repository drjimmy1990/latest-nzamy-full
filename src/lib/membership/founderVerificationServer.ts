/**
 * founderVerificationServer.ts — the server wiring of founderVerification.ts
 * (batch l7, decision 1): the service client, the platform Moyasar refund
 * (the admin refund route's own dependencies, refundCore.refundOrderWith with
 * confirm = true, acting as the admin who decided the verification), the
 * in-app notification and the admins' bell. Server-only.
 */

import type { createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig } from "@/lib/access-control";
import { createMoyasarClient } from "@/lib/payments/moyasarClient";
import { REFUND_NOTICE_AR, refundOrderWith } from "@/lib/payments/refundCore";
import { recordNotification } from "@/lib/notify";
import { settleFounderSeatOnVerification, type FounderVerificationResult } from "./founderVerification.ts";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * After the admin approved or rejected a LAWYER's verification: activates the
 * founder seat he paid for while pending, or refunds it in full. Never throws;
 * 'none' for a lawyer without such a seat.
 */
export async function settleFounderSeatAfterDecision(
  admin: Svc,
  actorId: string,
  userId: string,
  decision: "approve" | "reject",
): Promise<FounderVerificationResult> {
  return settleFounderSeatOnVerification(
    {
      admin,
      refund: (orderId) =>
        refundOrderWith(
          {
            admin,
            gateway: async () => {
              const cfg = await getMoyasarConfig();
              return cfg.enabled ? createMoyasarClient(cfg) : null;
            },
            syncTier: async (uid, tier) => {
              await admin.auth.admin.updateUserById(uid, { user_metadata: { tier } });
            },
            notify: async (uid) =>
              recordNotification({ userId: uid, title: REFUND_NOTICE_AR.title, body: REFUND_NOTICE_AR.body, href: "/dashboard/billing" }),
          },
          orderId,
          actorId,
          true,
        ),
      notify: (n) => recordNotification(n),
      notifyAdmins: async (n) => {
        const { error } = await admin.rpc("library_monitor_notify_admins", { p_title: n.title, p_body: n.body, p_href: n.href });
        if (error) throw new Error(`library_monitor_notify_admins ${error.code ?? "error"}`);
      },
    },
    userId,
    decision,
  );
}
