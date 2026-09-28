"use client";

/**
 * «مراجعة وتدقيق مذكرة» — a real order the TEAM fulfils (owner decision,
 * registry Q77, 28 Sep).
 *
 * This page used to be «مراجع الدوائر الحكومية»: drop any file, wait a
 * `setTimeout(2800)`, and read the same five hard-coded findings (a repealed
 * article, a precedent that "does not exist", …) as if they had been found in
 * YOUR memo. Nothing read the file. It is now an intake form: the memo is
 * uploaded, the client's capacity and the wanted outcome are picked, and the
 * order lands in the admin queue (receiver `ai_workspace`) beside the four
 * wizard services. What the team sends back is delivered on /ai/orders/<id>.
 *
 * NO BetaReviewGate. That gate hides an AI RESULT behind a review card while
 * BETA_REVIEW_MODE is on; with no `orderPayload` it replaces its children with
 * «غير متاح». There is no AI result here any more — the page only creates a
 * team order — so wrapping the form would hide the one real thing on it.
 *
 * The upload goes through useOrderAttachments (uploadDocumentFile with no
 * requestId) when the file is picked, and its documentId travels in
 * `metadata.attachments`; POST /api/v1/service-requests binds it to the new
 * order server-side. Uploading AFTER the order exists
 * (uploadDocumentFile(file, { requestId })) would bind the file but leave it
 * out of `metadata.attachments`, which is the list the admin queue, the order
 * page and the fulfilment brief read — the team would never see the memo.
 *
 * Price: none is shown, the same as the four wizard services — their orders
 * are placed with payment `{0, not_required}` and their pages name no price.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import {
  FileMagnifyingGlass, CloudArrowUp, X, Warning, PaperPlaneTilt, SignIn, Paperclip,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { apiMutate } from "@/lib/services/api";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import {
  BRIEF_CLIENT_ROLES, BRIEF_REVIEW_SCOPES, BRIEF_REVIEW_SOURCE_PATH, MEMO_FILE_ACCEPT,
  MAX_ROLE_OTHER_LENGTH, MAX_COURT_LENGTH, MAX_CASE_TYPE_LENGTH, MAX_NOTES_LENGTH,
  memoFileRejection, validateBriefReviewForm, buildBriefReviewOrderBody, briefReviewSubmitErrorAr,
  type BriefClientRoleId, type BriefReviewScopeId,
} from "@/lib/services/briefReviewOrder";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIBriefCheckPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const { uploading, attachError, attachFile, removeAttachment, clearAttachError } = useOrderAttachments();
  const inputRef = useRef<HTMLInputElement>(null);

  const [memo, setMemo] = useState<OrderAttachment | null>(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [clientRole, setClientRole] = useState<BriefClientRoleId | "">("");
  const [clientRoleOther, setClientRoleOther] = useState("");
  const [reviewScope, setReviewScope] = useState<BriefReviewScopeId | "">("");
  const [courtType, setCourtType] = useState("");
  const [caseType, setCaseType] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Uploading and ordering both need a session. `loading` is its own state:
  // treating "not yet known" as signed out would flash the sign-in prompt at
  // a signed-in lawyer (same rule as ServiceRequestWizard.tsx).
  const signedIn = !user.loading && user.isLoggedIn;

  async function pickFile(file: File | undefined) {
    if (!file || uploading) return;
    setFileError("");
    clearAttachError();
    const rejection = memoFileRejection(file.name);
    if (rejection) { setFileError(rejection); return; }
    try {
      setMemo(await attachFile(file));
    } catch {
      // attachFile has already put the Arabic reason in `attachError`.
    }
  }

  function removeMemo() {
    if (memo) removeAttachment(memo.documentId);
    setMemo(null);
    setFileError("");
    clearAttachError();
  }

  async function submit() {
    if (uploading || submitting) return;
    setErrors([]);
    const check = validateBriefReviewForm({
      memo, clientRole, clientRoleOther, reviewScope, courtType, caseType, notes,
    });
    if (!check.ok) { setErrors(check.errors); return; }

    setSubmitting(true);
    try {
      // Same profile read as the four wizards (useDraftState.submitOrder): the
      // n8n WhatsApp notice addresses `requester.phone`.
      const supabase = createBrowserClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = authUser
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", authUser.id).single()
        : { data: null };

      const body = buildBriefReviewOrderBody(check.value, {
        name: profile?.display_name ?? undefined,
        phone: profile?.phone ?? undefined,
        email: profile?.email ?? undefined,
      });
      const res = await apiMutate<{ data: { id: string } }>("/api/v1/service-requests", "POST", body);
      // `submitting` stays true on success: the page is leaving, and a second
      // click must not place a second order.
      window.location.href = `/ai/orders/${res.data.id}`;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error("[AIBriefCheckPage] submit failed:", raw);
      setErrors([briefReviewSubmitErrorAr(raw)]);
      setSubmitting(false);
    }
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const label = `block text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const hint = `text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`;
  const input = `w-full rounded-xl border px-3.5 py-2.5 text-[13px] outline-none ${
    isDark ? "border-white/[0.07] bg-zinc-950 text-zinc-200 focus:border-[#C8A762]/40" : "border-zinc-200 bg-white text-zinc-800 focus:border-[#0B3D2E]/40"}`;
  const pill = (active: boolean) => `rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-colors ${
    active
      ? isDark ? "border-[#C8A762]/50 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/40 bg-[#0B3D2E]/5 text-[#0B3D2E]"
      : isDark ? "border-white/[0.07] text-zinc-400 hover:border-white/20" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`;
  const shownFileError = fileError || attachError;

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <h1 className={`text-xl font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>مراجعة وتدقيق مذكرة</h1>
        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          ارفع مذكرتك واختر المطلوب: تقرير بالثغرات في الأسانيد والتسلسل والدفوع والطلبات والوقائع، أو مراجعة المذكرة وتنقيحها كاملة.
          يراجع فريق نظامي مذكرتك ويعيد إليك النتيجة في صفحة طلباتك.
        </p>
      </div>

      {/* Guests: the page stays readable, the form needs a session. */}
      {user.loading && (
        <p className={hint}>جارٍ التحقق من الجلسة…</p>
      )}
      {!user.loading && !user.isLoggedIn && (
        <div className={`${card} p-6 shadow-sm space-y-3`}>
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>سجّل الدخول لإرسال مذكرتك للمراجعة</p>
          <p className={hint}>
            ستحتاج إلى: ملف المذكرة (PDF أو Word)، وصفة الموكل، واختيار المطلوب — ويمكنك إضافة المحكمة ونوع القضية وملاحظاتك.
          </p>
          <Link
            href={`/login?from=${encodeURIComponent(BRIEF_REVIEW_SOURCE_PATH)}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white"
          >
            <SignIn size={14} /> تسجيل الدخول
          </Link>
        </div>
      )}

      {signedIn && (
        <div className={`${card} p-5 md:p-6 shadow-sm space-y-6`}>

          {/* ١ — the memo */}
          <div>
            <p className={label}>١. المذكرة المراد مراجعتها</p>
            {!memo ? (
              <div
                role="button"
                tabIndex={0}
                aria-disabled={uploading}
                onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); void pickFile(e.dataTransfer.files[0]); }}
                onClick={() => { if (!uploading) inputRef.current?.click(); }}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all ${uploading ? "cursor-wait" : "cursor-pointer"} ${dragging
                  ? isDark ? "border-[#C8A762]/60 bg-[#C8A762]/5" : "border-[#0B3D2E]/40 bg-[#0B3D2E]/5"
                  : isDark ? "border-white/[0.08] hover:border-[#C8A762]/30" : "border-zinc-200 hover:border-[#0B3D2E]/30"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  accept={MEMO_FILE_ACCEPT}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void pickFile(f); }}
                />
                <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.05]" : "bg-zinc-100"}`}>
                  {uploading
                    ? <CloudArrowUp size={22} className="text-[#C8A762]" />
                    : <FileMagnifyingGlass size={22} className={isDark ? "text-zinc-400" : "text-zinc-500"} />}
                </div>
                <p className={`text-[13px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  {uploading ? "جارٍ رفع المذكرة…" : "اسحب المذكرة هنا أو اضغط لاختيارها"}
                </p>
                <p className={hint}>PDF أو Word — حد أقصى ٢٠ ميجابايت</p>
              </div>
            ) : (
              <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${isDark ? "border-white/[0.07] bg-zinc-950" : "border-zinc-200 bg-zinc-50"}`}>
                <Paperclip size={16} className="flex-shrink-0 text-[#C8A762]" />
                <p className={`flex-1 min-w-0 truncate text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{memo.name}</p>
                <button
                  onClick={removeMemo}
                  disabled={submitting}
                  aria-label="إزالة المذكرة"
                  className={`flex h-8 w-8 items-center justify-center rounded-xl disabled:opacity-40 ${isDark ? "hover:bg-white/[0.07] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"}`}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {shownFileError && <p className="mt-2 text-[11px] text-red-500">{shownFileError}</p>}
          </div>

          {/* ٢ — the client's capacity */}
          <div>
            <p className={label}>٢. صفة الموكل</p>
            <div className="flex flex-wrap gap-2">
              {BRIEF_CLIENT_ROLES.map(r => (
                <button key={r.id} type="button" onClick={() => setClientRole(r.id)} className={pill(clientRole === r.id)} aria-pressed={clientRole === r.id}>
                  {r.label}
                </button>
              ))}
            </div>
            {clientRole === "other" && (
              <input
                type="text"
                value={clientRoleOther}
                onChange={e => setClientRoleOther(e.target.value)}
                maxLength={MAX_ROLE_OTHER_LENGTH}
                placeholder="اكتب صفة الموكل"
                className={`${input} mt-2`}
              />
            )}
          </div>

          {/* ٣ — what the client wants back */}
          <div>
            <p className={label}>٣. المطلوب</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BRIEF_REVIEW_SCOPES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setReviewScope(s.id)}
                  aria-pressed={reviewScope === s.id}
                  className={`${pill(reviewScope === s.id)} text-start leading-relaxed py-3`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* ٤ — optional context */}
          <div className="space-y-3">
            <p className={label}>٤. بيانات إضافية (اختياري)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="text" value={courtType} onChange={e => setCourtType(e.target.value)} maxLength={MAX_COURT_LENGTH}
                placeholder="المحكمة أو الجهة" className={input} />
              <input type="text" value={caseType} onChange={e => setCaseType(e.target.value)} maxLength={MAX_CASE_TYPE_LENGTH}
                placeholder="نوع القضية" className={input} />
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={MAX_NOTES_LENGTH} rows={4}
              placeholder="ملاحظات للفريق — مثلاً: ما الذي يقلقك في المذكرة، أو موعد الجلسة" className={`${input} leading-relaxed`} />
          </div>

          {errors.length > 0 && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
              {errors.map(e => (
                <p key={e} className="flex items-center gap-1.5 text-[11px] text-red-500">
                  <Warning size={12} /> {e}
                </p>
              ))}
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" />
            <span className={hint}>
              أقر بأن البيانات المدخلة صحيحة، وأوافق على إرسال المذكرة المرفوعة لفريق نظامي لمراجعتها.
            </span>
          </label>

          <button
            onClick={submit}
            disabled={!confirmed || submitting || uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[13px] font-bold text-white shadow-md disabled:opacity-40"
          >
            <PaperPlaneTilt size={15} />
            {submitting ? "جارٍ الإرسال…" : uploading ? "انتظر اكتمال رفع المذكرة…" : "إرسال الطلب"}
          </button>
        </div>
      )}
    </div>
  );
}
