import { motion } from "framer-motion";
import { CheckCircle, ShieldCheck, Warning, SpinnerGap, SignIn, PaperPlaneTilt } from "@phosphor-icons/react";
import { SpecialtyDef, TypeDef, ConsultationType, ScheduleMode } from "@/components/consultation/constants";
import { timingLabelAr } from "@/components/consultation/buildConsultationIntake";
import type { ConsultationAttachFailure } from "@/hooks/useConsultationForm";
import Link from "next/link";

/**
 * The last step of the public booking wizard.
 *
 * WHAT THIS SCREEN USED TO DO
 * `onClick={() => setConfirmed(true)}` — no await, no request, no server. It
 * then rendered a success card whose reference number was the string literal
 * «#CL-20260330», identical for every visitor, and whose reassurance paragraph
 * described an Escrow hold on a payment that never happened. The button itself
 * said «تأكيد واستمرار للدفع» and led nowhere.
 *
 * WHAT IT DOES NOW
 * The button calls `onSubmit()`, which creates a real `service_requests` row on
 * `receiver: "ai_workspace"` and returns its id. `confirmed` — and therefore
 * this success card — is reachable only after the server has answered, and the
 * reference it prints is `referenceId`, the row's own id. When a document
 * failed to upload the card says so instead of claiming a complete submission.
 */

interface StepConfirmProps {
  isAr: boolean;
  confirmed: boolean;
  selectedSpecialty?: SpecialtyDef;
  description: string;
  consultType: ConsultationType | null;
  selectedType?: TypeDef;
  scheduleMode: ScheduleMode;
  calDay: string | null;
  calTime: string | null;
  fileCount: number;
  // ── submission ──
  onSubmit: () => void;
  submitting: boolean;
  submitError: string;
  referenceId: string | null;
  attachFailures: ConsultationAttachFailure[];
  skippedNames: string[];
  // ── preconditions ──
  isLoggedIn: boolean;
  sessionLoading: boolean;
  /** True when the workflow backend is off, so no request can be created. */
  backendDisabled: boolean;
}

export function StepConfirm({
  isAr, confirmed, selectedSpecialty, description,
  consultType, selectedType, scheduleMode, calDay, calTime, fileCount,
  onSubmit, submitting, submitError, referenceId,
  attachFailures, skippedNames, isLoggedIn, sessionLoading, backendDisabled,
}: StepConfirmProps) {

  const timingAr = timingLabelAr({ consultTypeId: consultType, scheduleMode, calDay, calTime });
  const timingEn =
    consultType === "ai" ? "No fixed time — handled by the Nezamy team"
    : scheduleMode === "instant" ? "Preference: as soon as possible"
    : scheduleMode === "asap" ? "Preference: first available time"
    : scheduleMode === "calendar" ? `Preference: ${[calDay, calTime].filter(Boolean).join(" — ") || "not set"}`
    : "Not set";

  // ─── Success ────────────────────────────────────────────────────────────────
  if (confirmed) {
    const attachmentsIncomplete = attachFailures.length > 0 || skippedNames.length > 0;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 dark:bg-emerald-500/10">
          <CheckCircle size={44} weight="fill" className="text-emerald-500" />
        </motion.div>
        <h2 className="font-brand text-2xl font-extrabold text-ink">
          {isAr ? "وصل طلبك إلى فريق نظامي" : "Your request reached the Nezamy team"}
        </h2>
        {/* No interval is quoted. Fulfilment is manual from the admin queue, so
            «خلال ١٥–٢٠ دقيقة» was a commitment nothing in the app could keep. */}
        <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
          {isAr
            ? "يراجع الفريق طلبك ويتواصل معك لتأكيد الموعد وإرسال عرض السعر. لم يُخصم منك أي مبلغ."
            : "The team will review it and contact you to confirm the time and send a quote. You have not been charged."}
        </p>

        <div className="mx-auto mt-6 max-w-[340px] rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-start dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <div className="space-y-2 text-xs text-emerald-700 dark:text-emerald-300">
            {/* The row's own id, straight from the server's response. */}
            <div className="flex items-start gap-2">
              <CheckCircle size={13} weight="fill" className="mt-0.5 shrink-0" />
              <span className="break-all font-semibold">
                {isAr ? `رقم الطلب: ${referenceId ?? "—"}` : `Request #: ${referenceId ?? "—"}`}
              </span>
            </div>
            <div className="flex items-start gap-2"><CheckCircle size={13} weight="fill" className="mt-0.5 shrink-0" />{isAr ? `التخصص: ${selectedSpecialty?.label ?? "—"}` : `Specialty: ${selectedSpecialty?.label ?? "—"}`}</div>
            <div className="flex items-start gap-2"><CheckCircle size={13} weight="fill" className="mt-0.5 shrink-0" />{isAr ? `النوع: ${selectedType?.label ?? "—"}` : `Type: ${selectedType?.label ?? "—"}`}</div>
            <div className="flex items-start gap-2"><CheckCircle size={13} weight="fill" className="mt-0.5 shrink-0" />{isAr ? `الموعد المطلوب: ${timingAr}` : `Requested timing: ${timingEn}`}</div>
            <div className="flex items-start gap-2">
              <CheckCircle size={13} weight="fill" className="mt-0.5 shrink-0" />
              {isAr
                ? `السعر التقديري: ${selectedType?.price ?? "—"} — يُؤكَّد في عرض السعر`
                : `Estimated price: ${selectedType?.price ?? "—"} — confirmed in the quote`}
            </div>
          </div>
        </div>

        {/* Partial success. A booking that promises the team has the client's
            documents and does not is the same defect this whole page was
            fixing, so the failure is named here rather than swallowed. */}
        {attachmentsIncomplete && (
          <div className="mx-auto mt-4 max-w-[340px] rounded-2xl border border-amber-200 bg-amber-50 p-4 text-start dark:border-amber-500/20 dark:bg-amber-500/10">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
              <Warning size={14} weight="fill" />
              {isAr ? "لم تُرفَق بعض الملفات" : "Some files were not attached"}
            </div>
            <ul className="space-y-1 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              {attachFailures.map((f) => (
                <li key={f.name}>• {f.name} — {f.reason}</li>
              ))}
              {skippedNames.length > 0 && (
                <li>
                  • {isAr ? `لم تُجرَّب: ${skippedNames.join("، ")}` : `Not attempted: ${skippedNames.join(", ")}`}
                </li>
              )}
            </ul>
            {/* «أو أرفقها من صفحة الطلب» stood here and named a control that
                does not exist: neither /ai/orders nor /ai/orders/[id] has an
                attach input — the only attachments on that screen are the
                deliverables the team uploads. Sending a client to look for a
                button we never built is the same defect as the failed upload
                it was apologising for, so this now says the one thing that is
                actually true: the team asks for the files when it calls. */}
            <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              {isAr
                ? "الطلب نفسه وصل، ويراجعه الفريق بما وصله من بيانات. احتفظ بالملفات معك وأرسلها للفريق عند تواصله معك."
                : "The request itself arrived and the team reviews it with what it has. Keep the files to hand and send them when the team contacts you."}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {/* «متابعة طلباتي» pointed at /ai/orders, the duplicate list page
              that was deleted this session. It only avoided a 404 because
              next.config.ts:97 redirects /ai/orders permanently to
              /dashboard/client/requests — so the link was one config line away
              from being dead. It now names the surviving destination directly:
              «طلباتي», the page that actually lists the service_requests row
              this screen just created. */}
          <Link href="/dashboard/client/requests" className="rounded-2xl bg-royal px-6 py-3 text-sm font-semibold text-white">
            {isAr ? "متابعة طلباتي" : "Track my requests"}
          </Link>
          <Link href="/dashboard" className="rounded-2xl border border-slate-200 px-6 py-3 text-sm text-ink-muted dark:border-white/10 dark:text-gray-400">
            {isAr ? "عودة للداشبورد" : "Back to Dashboard"}
          </Link>
        </div>
      </motion.div>
    );
  }

  // ─── Review ─────────────────────────────────────────────────────────────────
  const rows = [
    { labelAr: "التخصص", labelEn: "Specialty", value: selectedSpecialty?.label ?? "—" },
    {
      labelAr: "وصف المشكلة", labelEn: "Issue Description",
      value: description.slice(0, 80) + (description.length > 80 ? "..." : ""),
    },
    {
      labelAr: "نوع الاستشارة", labelEn: "Consultation Type",
      value: `${selectedType?.label ?? "—"} — ${isAr ? "تقديري" : "est."} ${selectedType?.price ?? "—"}`,
    },
    { labelAr: "الموعد المطلوب", labelEn: "Requested timing", value: isAr ? timingAr : timingEn },
    {
      labelAr: "المرفقات", labelEn: "Attachments",
      value: fileCount === 0
        ? (isAr ? "لا يوجد" : "None")
        : (isAr ? `${fileCount} ملف — تُرفع عند الإرسال` : `${fileCount} file(s) — uploaded on submit`),
    },
  ];

  const needsSignIn = !backendDisabled && !sessionLoading && !isLoggedIn;
  const blocked = backendDisabled || needsSignIn;

  return (
    <div>
      <h2 className="mb-5 font-brand text-lg font-bold text-ink">
        {isAr ? "مراجعة وإرسال" : "Review & Send"}
      </h2>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-surface p-3.5 dark:border-white/10 dark:bg-dark-bg">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal/5">
              <CheckCircle size={11} weight="fill" className="text-royal dark:text-gold" />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint dark:text-gray-500">{isAr ? row.labelAr : row.labelEn}</div>
              <div className="text-sm text-ink">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* The Escrow paragraph that stood here described a payment hold on a
          platform with no payment gateway. Replaced by what actually happens. */}
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 p-4">
        <ShieldCheck size={20} weight="duotone" className="shrink-0 text-gold-dark" />
        <p className="text-xs leading-relaxed text-ink-muted dark:text-gray-400">
          {isAr
            ? "إرسال الطلب مجاني ولا يترتب عليه أي دفع. يراجعه فريق نظامي يدوياً ويرسل لك عرض السعر النهائي قبل أي التزام منك."
            : "Sending this request is free and commits you to nothing. The Nezamy team reviews it manually and sends you a final quote before anything is owed."}
        </p>
      </div>

      {/* Sign-in requirement, stated BEFORE the button rather than as an error
          after it. /book/consultation is public (it is absent from PROTECTED in
          src/proxy.ts) but POST /api/v1/service-requests answers 401 without a
          session, and an attachment has no owner without one either. */}
      {/* Demo mode is a precondition too, and it is stated in the same place
          for the same reason: createWorkflowRequest() falls back to
          localStorage when the workflow backend is off, so submitting would
          write a row no one can ever see. Better said before the click than
          discovered after it. */}
      {backendDisabled && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
            <Warning size={16} weight="fill" />
            {isAr ? "الإرسال معطّل في وضع العرض التجريبي" : "Sending is disabled in demo mode"}
          </div>
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            {isAr
              ? "هذه نسخة عرض لا تتصل بقاعدة البيانات، فلن يصل الطلب إلى أحد. تواصل معنا مباشرة لحجز استشارة."
              : "This preview is not connected to the database, so nothing would reach the team. Contact us directly to book."}
          </p>
          <Link href="/contact" className="mt-3 inline-block rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white">
            {isAr ? "تواصل معنا" : "Contact us"}
          </Link>
        </div>
      )}

      {needsSignIn && (
        <div className="mt-4 rounded-xl border border-royal/20 bg-royal/5 p-4 dark:border-gold/20 dark:bg-gold/5">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-royal dark:text-gold">
            <SignIn size={16} weight="fill" />
            {isAr ? "يلزم تسجيل الدخول لإرسال الطلب" : "Sign in to send this request"}
          </div>
          <p className="text-xs leading-relaxed text-ink-muted dark:text-gray-400">
            {isAr
              ? "الطلب يُحفظ باسمك حتى تتابعه وتستلم عرض السعر والردود. سجّل الدخول ثم عد لإكمال الحجز."
              : "The request is filed under your account so you can track it and receive the quote. Sign in, then come back to finish."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/login?from=/book/consultation" className="rounded-xl bg-royal px-4 py-2 text-xs font-bold text-white">
              {isAr ? "تسجيل الدخول" : "Sign in"}
            </Link>
            <Link href="/register?from=/book/consultation" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-ink-muted dark:border-white/10 dark:text-gray-400">
              {isAr ? "إنشاء حساب" : "Create account"}
            </Link>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 dark:border-red-500/20 dark:bg-red-500/10">
          <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-red-500" />
          <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">{submitError}</p>
        </div>
      )}

      <motion.button
        whileHover={submitting || blocked ? undefined : { scale: 1.02 }}
        whileTap={submitting || blocked ? undefined : { scale: 0.98 }}
        onClick={onSubmit}
        disabled={submitting || blocked || sessionLoading}
        aria-busy={submitting}
        className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all ${
          submitting || blocked || sessionLoading
            ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-gray-500"
            : "bg-royal text-white shadow-[0_4px_20px_-4px_rgba(11,61,46,0.4)]"
        }`}
      >
        {submitting ? (
          <>
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="flex">
              <SpinnerGap size={18} weight="bold" />
            </motion.span>
            {/* Says what is happening now, and only while it is happening. */}
            {isAr
              ? (fileCount > 0 ? "جارٍ رفع المرفقات وإرسال الطلب..." : "جارٍ إرسال الطلب...")
              : (fileCount > 0 ? "Uploading files and sending..." : "Sending your request...")}
          </>
        ) : (
          <>
            <PaperPlaneTilt size={18} weight="fill" />
            {isAr ? "إرسال الطلب (مجاناً)" : "Send request (free)"}
          </>
        )}
      </motion.button>
    </div>
  );
}
