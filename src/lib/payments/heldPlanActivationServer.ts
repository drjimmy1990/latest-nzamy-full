/**
 * heldPlanActivationServer.ts — the server wiring of heldPlanActivation.ts
 * (batch l18, owner ٢٣٩): the service client, the grant dependencies
 * fulfilment uses, the platform Moyasar refund (refundCore.refundOrderWith
 * with confirm = true, acting as the admin who decided the verification),
 * the in-app notification and the admins' bell. Server-only.
 */

import "server-only";
import type { createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig, TIER_RANK } from "@/lib/access-control";
import { grantLibraryAccess } from "@/lib/libraryAccessServer";
import { createMoyasarClient } from "@/lib/payments/moyasarClient";
import { REFUND_NOTICE_AR, refundOrderWith } from "@/lib/payments/refundCore";
import { recordNotification } from "@/lib/notify";
import { settleHeldPlansOnVerification, type HeldPlanResult } from "./heldPlanActivation.ts";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * After the admin approved or rejected a LAWYER's or a FIRM's verification:
 * activates the professional plans the account paid for while pending (their
 * period starts now), or refunds them in full. Never throws.
 */
export async function settleHeldPlansAfterDecision(
  admin: Svc,
  actorId: string,
  userId: string,
  decision: "approve" | "reject",
): Promise<HeldPlanResult> {
  return settleHeldPlansOnVerification(
    {
      admin,
      grantLibrary: grantLibraryAccess,
      ranks: TIER_RANK,
      notify: (n) => recordNotification(n),
      notifyAdmins: async (n) => {
        const { error } = await admin.rpc("library_monitor_notify_admins", { p_title: n.title, p_body: n.body, p_href: n.href });
        if (error) throw new Error(`library_monitor_notify_admins ${error.code ?? "error"}`);
      },
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
    },
    userId,
    decision,
  );
}
