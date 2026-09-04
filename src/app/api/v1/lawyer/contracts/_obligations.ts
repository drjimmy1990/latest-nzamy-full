/**
 * _obligations.ts — the ONE place a contract date becomes a radar deadline
 * (item 116, Phase 3 DECISION 5). Server-only.
 * ─────────────────────────────────────────────────────────
 * A contract obligation carries a plain date (`due_on`); the radar carries a
 * `deadlines` row with reminders. This module keeps the two in step:
 *   • createDeadlineForObligation — insert the deadline, queue its reminders,
 *     link it back through obligation.deadline_id
 *   • syncObligationDeadline — a re-dated / completed / cancelled / reopened
 *     obligation moves its deadline the same way (and re-queues reminders)
 *   • ensureRenewalObligation — a contract with an end date owns exactly one
 *     pending «إشعار التجديد / عدم التجديد» obligation, due
 *     renewal_notice_days before ends_on; no end date → that obligation is
 *     cancelled
 * Nothing here computes a statutory period; there is none — the date is the
 * contract's own. Everything is best-effort after the obligation row itself is
 * saved: a radar failure is logged and returned, never thrown.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hijriLabelAr } from "@/lib/services/hijri";
import { isoDate, parseIsoDate } from "@/lib/services/deadlineEngine";
import { renewalNoticeDueOn } from "@/lib/services/contractDates";
import { OBLIGATION_KIND_AR } from "@/lib/services/contractVocabulary";
import { enqueueDeadlineReminders, cancelPendingDeadlineReminders, DEFAULT_REMINDER_OFFSETS } from "@/lib/deadlineReminders";
import { OBLIGATION_SELECT, type ObligationRow } from "./_shared";

export const RENEWAL_OBLIGATION_TITLE = "إشعار التجديد / عدم التجديد";

interface ContractForDeadline {
  id: string;
  title: string;
  firm_id: string | null;
  starts_on: string | null;
}

interface ObligationForDeadline {
  id: string;
  title: string;
  kind: string;
  due_on: string;
}

const todayIso = () => isoDate(new Date());

/** trigger_date must not exceed due_date (CHECK on deadlines). */
function triggerFor(contract: ContractForDeadline, dueOn: string): string {
  const start = contract.starts_on && parseIsoDate(contract.starts_on) ? contract.starts_on : todayIso();
  return start <= dueOn ? start : dueOn;
}

function hijriOf(iso: string): string | null {
  const d = parseIsoDate(iso);
  return d ? hijriLabelAr(d) : null;
}

export async function createDeadlineForObligation(params: {
  supabase: SupabaseClient;
  userId: string;
  contract: ContractForDeadline;
  obligation: ObligationForDeadline;
}): Promise<{ deadlineId: string | null; error: string | null }> {
  const { supabase, userId, contract, obligation } = params;
  try {
    const kindAr = (OBLIGATION_KIND_AR as Record<string, string>)[obligation.kind] ?? obligation.kind;
    const { data, error } = await supabase
      .from("deadlines")
      .insert({
        owner_user_id: userId,
        firm_id: contract.firm_id,
        contract_id: contract.id,
        title: `${obligation.title} — ${contract.title}`,
        kind: "contract",
        trigger_date: triggerFor(contract, obligation.due_on),
        due_date: obligation.due_on,
        due_date_hijri: hijriOf(obligation.due_on),
        days_count: null,
        computed_by_rule: false,
        rolled_from_holiday: false,
        reminder_offsets_days: [...DEFAULT_REMINDER_OFFSETS],
        priority: "normal",
        status: "open",
        notes: `التزام عقد (${kindAr})`,
      })
      .select("id, due_date, title")
      .single();
    if (error || !data) {
      console.error("[contracts/_obligations] deadline insert failed:", error?.message, error?.code);
      return { deadlineId: null, error: error?.message ?? "insert failed" };
    }
    const deadline = data as { id: string; due_date: string; title: string };

    await enqueueDeadlineReminders({
      supabase, deadlineId: deadline.id, recipientUserId: userId, title: deadline.title, dueDate: deadline.due_date,
    });

    const { error: linkError } = await supabase
      .from("contract_obligations")
      .update({ deadline_id: deadline.id })
      .eq("id", obligation.id);
    if (linkError) console.error("[contracts/_obligations] deadline link failed:", linkError.message, linkError.code);

    return { deadlineId: deadline.id, error: null };
  } catch (err) {
    console.error("[contracts/_obligations] createDeadlineForObligation threw:", err);
    return { deadlineId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * After an obligation row was updated: move / close / reopen its deadline.
 * `previous` is the row before the update, `current` the row after.
 */
export async function syncObligationDeadline(params: {
  supabase: SupabaseClient;
  userId: string;
  contract: ContractForDeadline;
  previous: Pick<ObligationRow, "id" | "title" | "kind" | "due_on" | "status" | "deadline_id">;
  current: Pick<ObligationRow, "id" | "title" | "kind" | "due_on" | "status" | "deadline_id">;
}): Promise<void> {
  const { supabase, userId, contract, previous, current } = params;
  try {
    // no deadline yet and the obligation is (still) pending → create one
    if (!current.deadline_id) {
      if (current.status === "pending") await createDeadlineForObligation({ supabase, userId, contract, obligation: current });
      return;
    }
    const deadlineId = current.deadline_id;
    const patch: Record<string, unknown> = {};
    let requeue = false;

    if (current.due_on !== previous.due_on) {
      patch.due_date = current.due_on;
      patch.due_date_hijri = hijriOf(current.due_on);
      patch.trigger_date = triggerFor(contract, current.due_on);
      requeue = true;
    }
    if (current.title !== previous.title) patch.title = `${current.title} — ${contract.title}`;

    if (current.status !== previous.status) {
      if (current.status === "done") { patch.status = "done"; patch.completed_at = new Date().toISOString(); }
      else if (current.status === "cancelled") patch.status = "cancelled";
      else if (current.status === "pending") { patch.status = "open"; patch.completed_at = null; requeue = true; }
      // "missed" is decided by the cron on the deadline itself; nothing to push
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("deadlines").update(patch).eq("id", deadlineId);
      if (error) console.error("[contracts/_obligations] deadline sync failed:", error.message, error.code);
    }
    if (current.status === "done" || current.status === "cancelled") {
      await cancelPendingDeadlineReminders(supabase, deadlineId);
    } else if (requeue) {
      await cancelPendingDeadlineReminders(supabase, deadlineId);
      await enqueueDeadlineReminders({
        supabase, deadlineId, recipientUserId: userId, title: `${current.title} — ${contract.title}`, dueDate: current.due_on,
      });
    }
  } catch (err) {
    console.error("[contracts/_obligations] syncObligationDeadline threw:", err);
  }
}

/** Before deleting an obligation: its deadline is cancelled, not deleted (history stays). */
export async function cancelObligationDeadline(supabase: SupabaseClient, deadlineId: string | null): Promise<void> {
  if (!deadlineId) return;
  try {
    const { error } = await supabase.from("deadlines").update({ status: "cancelled" }).eq("id", deadlineId).eq("status", "open");
    if (error) console.error("[contracts/_obligations] deadline cancel failed:", error.message, error.code);
    await cancelPendingDeadlineReminders(supabase, deadlineId);
  } catch (err) {
    console.error("[contracts/_obligations] cancelObligationDeadline threw:", err);
  }
}

/**
 * Exactly one pending renewal-notice obligation per contract with an end
 * date, due `renewal_notice_days` before `ends_on`. Call after POST and after
 * a PATCH that touched ends_on / renewal_notice_days / status.
 */
export async function ensureRenewalObligation(params: {
  supabase: SupabaseClient;
  userId: string;
  contract: ContractForDeadline & { ends_on: string | null; renewal_notice_days: number; status: string };
}): Promise<void> {
  const { supabase, userId, contract } = params;
  try {
    const { data, error } = await supabase
      .from("contract_obligations")
      .select(OBLIGATION_SELECT)
      .eq("contract_id", contract.id)
      .eq("kind", "renewal")
      .eq("status", "pending")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error) { console.error("[contracts/_obligations] renewal lookup failed:", error.message, error.code); return; }
    const existing = (data ?? null) as ObligationRow | null;

    const closed = contract.status === "terminated" || contract.status === "cancelled" || contract.status === "expired";
    const dueOn = closed ? null : renewalNoticeDueOn(contract.ends_on, contract.renewal_notice_days);

    if (!dueOn) {
      if (existing) {
        const { error: cancelError } = await supabase
          .from("contract_obligations").update({ status: "cancelled" }).eq("id", existing.id);
        if (cancelError) console.error("[contracts/_obligations] renewal cancel failed:", cancelError.message, cancelError.code);
        await cancelObligationDeadline(supabase, existing.deadline_id);
      }
      return;
    }

    if (!existing) {
      const { data: created, error: insertError } = await supabase
        .from("contract_obligations")
        .insert({ contract_id: contract.id, title: RENEWAL_OBLIGATION_TITLE, kind: "renewal", due_on: dueOn, status: "pending" })
        .select(OBLIGATION_SELECT)
        .single();
      if (insertError || !created) { console.error("[contracts/_obligations] renewal insert failed:", insertError?.message, insertError?.code); return; }
      const row = created as unknown as ObligationRow;
      await createDeadlineForObligation({ supabase, userId, contract, obligation: row });
      return;
    }

    if (existing.due_on !== dueOn) {
      const { data: updated, error: updateError } = await supabase
        .from("contract_obligations").update({ due_on: dueOn }).eq("id", existing.id).select(OBLIGATION_SELECT).single();
      if (updateError || !updated) { console.error("[contracts/_obligations] renewal re-date failed:", updateError?.message, updateError?.code); return; }
      await syncObligationDeadline({ supabase, userId, contract, previous: existing, current: updated as unknown as ObligationRow });
    } else if (!existing.deadline_id) {
      await createDeadlineForObligation({ supabase, userId, contract, obligation: existing });
    }
  } catch (err) {
    console.error("[contracts/_obligations] ensureRenewalObligation threw:", err);
  }
}
