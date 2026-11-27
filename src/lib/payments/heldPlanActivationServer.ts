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
import {
  settleHeldPlansOfFirmMembers,
  settleHeldPlansOnVerification,
  type FirmMembersRelease,
  type HeldPlanRelease,
  type HeldPlanResult,
} from "./heldPlanActivation.ts";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

const notifyAdminsWith = (admin: Svc) => async (n: { title: string; body: string; href: string }) => {
  const { error } = await admin.rpc("library_monitor_notify_admins", { p_title: n.title, p_body: n.body, p_href: n.href });
  if (error) throw new Error(`library_monitor_notify_admins ${error.code ?? "error"}`);
};

/**
 * After the admin approved or rejected a LAWYER's or a FIRM's verification:
 * activates the professional plans the account paid for while pending (their
 * period starts now), or refunds them in full. Never throws.
 *
 * `autoRefund` false (l18 review — fulfilment's late release, where no admin
 * acted): no refund runs under the buyer's id; a lower held plan is left in
 * the admin's refund review with an alert instead.
 * `via` "firm" (l19, ٢٤٢): a member released by his firm's approval.
 */
export async function settleHeldPlansAfterDecision(
  admin: Svc,
  actorId: string,
  userId: string,
  decision: "approve" | "reject",
  autoRefund = true,
  via: HeldPlanRelease = "own",
): Promise<HeldPlanResult> {
  return settleHeldPlansOnVerification(
    {
      admin,
      grantLibrary: grantLibraryAccess,
      ranks: TIER_RANK,
      notify: (n) => recordNotification(n),
      notifyAdmins: notifyAdminsWith(admin),
      refund: (orderId) => {
        if (!autoRefund) {
          return Promise.resolve({ status: 409, body: { error: "اعتُمد التوثيق أثناء معالجة الدفع، فيُجرى الاسترداد من صفحة المدفوعات" } });
        }
        return refundOrderWith(
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
        );
      },
    },
    userId,
    decision,
    { via },
  );
}

/**
 * l19 (owner ٢٤٢): after the admin APPROVED a firm's verification, the held
 * professional plans of its active member lawyers are released the same way
 * (each keyed on that member, refunds of a lower held plan acting as the
 * admin). A member whose own licence was rejected or suspended stays as is.
 * Never throws.
 */
export async function settleFirmMembersHeldPlansAfterApproval(
  admin: Svc,
  actorId: string,
  firmId: string,
  ownerUserId: string,
): Promise<FirmMembersRelease> {
  return settleHeldPlansOfFirmMembers({ admin, notifyAdmins: notifyAdminsWith(admin) }, firmId, ownerUserId, (memberId) =>
    settleHeldPlansAfterDecision(admin, actorId, memberId, "approve", true, "firm"),
  );
}
