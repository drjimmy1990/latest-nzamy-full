"use client";

/**
 * OrderSummary.tsx — Task 6, Step 3.
 *
 * Shows the client a record of what they actually sent: their intake
 * answers and their own uploaded attachments. `metadata.intake` has a
 * different shape per service (DraftIntakeV1 / ContractsIntakeV1 /
 * WargamingIntakeV1 / LegalOpinionIntakeV1 — see
 * src/lib/services/orderIntake*.ts), so this renders it generically —
 * iterate the object, skip empty values, label each key from a lookup with
 * a fallback to the raw key — rather than four bespoke layouts.
 *
 * Which INTAKE rows appear, what each is labelled and what text each value
 * shows is decided entirely by ./intakeValues.ts (buildSummaryRows →
 * SummaryField[]); this file only turns that tree into JSX. The split is not
 * tidiness: this file is JSX, Node's native TypeScript support does not
 * compile JSX, and so `node --test` can only see the rules once they live in
 * a plain .ts module — see the header over that half of intakeValues.ts.
 *
 * The attachment list below that is this file's own: it needs `order.id` and
 * a fetch, neither of which buildSummaryRows has. Its one display rule — the
 * «مذكرة» badge, Task 5 — therefore lives here too, in isMemoAttachment(),
 * and consequently is NOT covered by node --test for the same JSX reason.
 *
 * Deliberately does NOT import buildOrderPrompt (the admin-facing prompt
 * builder, Task 4): that output is written to brief an admin on how to
 * fulfil the order, phrased and shaped for that audience. A client re-reading
 * their own submission needs a receipt, not an internal work ticket.
 */

import { useState, type ReactNode } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import type { ServiceOrder } from "@/lib/services/serviceOrders";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import { buildSummaryRows, type SummaryValue } from "./intakeValues";

function renderSummaryValue(value: SummaryValue, isDark: boolean): ReactNode {
  if (value.kind === "text") return value.text;

  if (value.kind === "list") {
    return (
      <ul className="list-disc pr-4 space-y-0.5">
        {value.items.map((item, i) => (
          <li key={i}>{renderSummaryValue(item, isDark)}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className={`space-y-1 pe-3 border-e-2 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
      {value.fields.map((f) => (
        <div key={f.key}>
          <span className={`text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            {f.label}:{" "}
          </span>
          <span>{renderSummaryValue(f.value, isDark)}</span>
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  return `(${Math.max(1, Math.round(bytes / 1024))} كيلوبايت)`;
}

/**
 * Task 5 (owner س٥) — is this one attachment the «المذكرة المراد نقضها», as
 * opposed to an ordinary case file?
 *
 * The only evidence is `metadata.intake.memoAttachmentIds`: the documentIds
 * the client tagged through wargaming's memo-specific dropzone, NOT "any file
 * on the order". It is written by buildIntake() in
 * src/app/ai/wargaming/page.tsx:922-923 and normalised by
 * src/lib/services/orderIntake.wargaming.ts:80-81.
 *
 * It is ABSENT — and this returns false for every attachment, so nothing is
 * badged — in three ordinary cases, none of them a fault:
 *   1. every non-wargaming order (draft, contracts, legal_opinion);
 *   2. every wargaming order placed before commit 7b5480b added the control;
 *   3. a wargaming order whose client typed the memo into `memoText` instead
 *      of uploading it — there is genuinely no memo FILE to badge.
 * Badging an unrelated case file would be worse than badging nothing, so the
 * absent case fails closed rather than guessing.
 *
 * String(v) on both sides, never `typeof v === "string"`: these ids trace to
 * attachments.id, a Postgres bigserial that PostgREST serialises as a JSON
 * NUMBER — see documentIdStr() in src/lib/services/orderIntake.ts:78-82 and
 * the test that pins the numeric case at
 * src/lib/services/orderIntake.wargaming.test.ts:88-98. A `typeof` guard here
 * would silently un-badge every real memo while tsc and the suite stayed green.
 *
 * Twin of the identical function in
 * src/app/dashboard/admin/service-orders/page.tsx, which shows the same badge
 * to the admin. Duplicated on purpose: the two live in different feature
 * trees, this file's neighbour intakeValues.ts is client-page-local, and six
 * lines did not justify a third module. Change one, change the other.
 */
function isMemoAttachment(intake: Record<string, unknown> | undefined, documentId: string): boolean {
  if (!documentId) return false;
  const raw = intake?.memoAttachmentIds;
  if (!Array.isArray(raw)) return false;
  return raw.some((v) => String(v) === documentId);
}

export function OrderSummary({ order, isDark }: { order: ServiceOrder; isDark: boolean }) {
  const [downloadErr, setDownloadErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";
  const mutedText = isDark ? "text-zinc-400" : "text-zinc-600";

  const rows = buildSummaryRows(order.metadata?.intake ?? {});

  // documentId is typed `string` on OrderAttachment, but that's a TS-level
  // promise only: attachments.id is a Postgres bigserial, and PostgREST
  // serialises int8 as a JSON number — POST /api/v1/documents returns it
  // uncast — so it can arrive here as a runtime `number` despite its
  // declared type (same gotcha documented in orderIntake.ts's
  // documentIdStr() and the admin service-orders page's attachment list).
  // Coerce with String(...) rather than type-guarding on "string" alone, or
  // a numeric id silently drops that attachment's row.
  const attachments = (order.metadata?.attachments ?? []).filter(
    (a): a is OrderAttachment =>
      !!a && (typeof a.documentId === "string" || typeof a.documentId === "number"),
  );

  // GET /api/v1/service-requests/[id]/attachments/[attachmentId] authorises
  // the requester explicitly (`order.requester_user_id === user.id`,
  // verified by reading that route before wiring this) — a client
  // downloading their own attachment is a legitimate use of it, the same
  // route the admin queue already uses for the same file.
  async function downloadAttachment(attachmentId: string) {
    setDownloadErr("");
    setBusyId(attachmentId);
    try {
      const res = await fetch(
        `/api/v1/service-requests/${order.id}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDownloadErr(body.error ?? "تعذّر التحميل");
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      setDownloadErr("تعذّر التحميل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0 && attachments.length === 0) return null;

  return (
    <div className={`${card} p-5 space-y-4`} dir="rtl">
      <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
        ما أرسلته
      </p>

      {rows.length > 0 && (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.key} className="text-[12px] leading-[1.9]">
              <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                {row.label}:{" "}
              </span>
              <span className={mutedText}>{renderSummaryValue(row.value, isDark)}</span>
            </div>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1.5 border-t pt-3 border-white/[0.06]">
          <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            مرفقاتك
          </p>
          <div className="flex flex-col gap-1">
            {attachments.map((a) => {
              const documentId = String(a.documentId);
              const isMemo = isMemoAttachment(order.metadata?.intake, documentId);
              return (
                <button
                  key={documentId}
                  disabled={busyId === documentId}
                  onClick={() => downloadAttachment(documentId)}
                  className={`flex items-center gap-2 text-[12px] font-semibold disabled:opacity-40 ${
                    isDark ? "text-emerald-400" : "text-emerald-700"}`}
                >
                  <DownloadSimple size={13} />
                  {a.name || "مرفق"} {formatSize(a.size)}
                  {/* Task 5 (owner س٥) — the same amber «مذكرة» badge the admin
                      sees on the same file in
                      src/app/dashboard/admin/service-orders/page.tsx, so the
                      client and the admin are looking at one marking, not two
                      different ones. Amber separates it from the emerald the
                      file name itself is drawn in. */}
                  {isMemo && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                      isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-500/10 text-amber-600"}`}>
                      مذكرة
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {downloadErr && <p className="text-[11px] text-red-500">{downloadErr}</p>}
    </div>
  );
}
