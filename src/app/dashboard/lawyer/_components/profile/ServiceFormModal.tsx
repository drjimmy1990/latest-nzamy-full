"use client";

/**
 * ServiceFormModal — create/edit one row of `lawyer_services` (item 178).
 * ─────────────────────────────────────────────────────────
 * Used by the «الخدمات» tab on the lawyer's own profile
 * (src/app/dashboard/lawyer/profile/page.tsx). Both modes share one form:
 * `initial` present → PATCH via `updateService`; absent → POST via
 * `createService`. The vocabulary (pricing kinds, categories, price rule) is
 * lawyerProfileFields.ts and the CHECK constraints on `lawyer_services` in
 * supabase/migrations/20260907_phase7_profile_services_reviews.sql — this
 * file does not invent either.
 *
 * Off-platform contact (item 179): title, description and duration are every
 * free-text field this endpoint lets a lawyer publish, and POST/PATCH
 * /api/v1/lawyer/services check all three with offPlatformContactIssue(). The
 * same check runs here, on every keystroke, so the lawyer sees the refusal
 * before submitting rather than only after a 400 comes back — and the 400
 * still renders verbatim (`err.message`) if it ever disagrees with this copy.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Warning, XCircle, CircleNotch } from "@phosphor-icons/react";
import {
  PRICING_KINDS,
  PRICING_KIND_AR,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_AR,
  type PricingKind,
  type ServiceCategory,
} from "@/lib/services/lawyerProfileFields";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import {
  createService,
  updateService,
  type LawyerService,
  type LawyerServiceInput,
} from "@/lib/services/lawyerServicesService";

interface Props {
  isDark: boolean;
  /** Present → editing this row (PATCH). Absent → new row (POST). */
  initial?: LawyerService;
  onClose: () => void;
  /** Called once the server has confirmed the write, with the saved row. */
  onSaved: (service: LawyerService) => void;
}

export default function ServiceFormModal({ isDark, initial, onClose, onSaved }: Props) {
  const editing = !!initial;

  const [titleAr, setTitleAr] = useState(initial?.titleAr ?? "");
  const [descriptionAr, setDescriptionAr] = useState(initial?.descriptionAr ?? "");
  const [pricingKind, setPricingKind] = useState<PricingKind>(initial?.pricingKind ?? "quote");
  const [priceSar, setPriceSar] = useState(initial?.priceSar != null ? String(initial.priceSar) : "");
  const [durationLabel, setDurationLabel] = useState(initial?.durationLabel ?? "");
  const [category, setCategory] = useState<ServiceCategory>(initial?.category ?? "consultation");
  const [active, setActive] = useState(initial?.active ?? true);

  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none disabled:opacity-50 ${
    isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"
  }`;
  const labelCls = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;

  // ── Inline validation — the same rules the route enforces ──────────────────
  const titleTrimmed = titleAr.trim();
  const titleLengthIssue =
    titleTrimmed.length === 0
      ? null // required, but "empty" is reported only on submit — not on every keystroke of a fresh field
      : titleTrimmed.length < 2 || titleTrimmed.length > 120
        ? "عنوان الخدمة يجب أن يكون بين حرفين و١٢٠ حرفاً."
        : null;
  const titleContactIssue = titleTrimmed ? offPlatformContactIssue(titleTrimmed) : null;
  const descriptionContactIssue = descriptionAr.trim() ? offPlatformContactIssue(descriptionAr.trim()) : null;
  const durationLengthIssue = durationLabel.trim().length > 40 ? "مدة الخدمة يجب ألا تتجاوز ٤٠ حرفاً." : null;
  const durationContactIssue = durationLabel.trim() ? offPlatformContactIssue(durationLabel.trim()) : null;

  const priceRequired = pricingKind !== "quote";
  const priceNum = priceSar.trim() === "" ? null : Number(priceSar);
  const priceInvalid = priceRequired && (priceNum === null || !Number.isFinite(priceNum) || priceNum < 0);

  const blockingIssues = [
    titleTrimmed.length === 0 ? "عنوان الخدمة مطلوب." : null,
    titleLengthIssue,
    titleContactIssue,
    descriptionContactIssue,
    durationLengthIssue,
    durationContactIssue,
    priceInvalid ? "السعر مطلوب ويجب أن يكون صفراً أو أكثر — إلا عند اختيار «بحسب الحالة»." : null,
  ].filter((v): v is string => !!v);

  async function handleSave() {
    if (blockingIssues.length > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      // Explicit `priceSar: null` on "quote" rather than omitting the key —
      // PATCH's merge-with-current-row logic only clears a stale amount left
      // from a previous fixed/from/hourly pricing when pricingKind is
      // present AND priceSar is untouched; sending null here is unambiguous
      // in both create and edit.
      const input: LawyerServiceInput = {
        titleAr: titleTrimmed,
        descriptionAr: descriptionAr.trim(),
        pricingKind,
        priceSar: pricingKind === "quote" ? null : priceNum,
        durationLabel: durationLabel.trim() || null,
        category,
        active,
      };
      const saved = editing ? await updateService(initial!.id, input) : await createService(input);
      onSaved(saved);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : "تعذّر حفظ الخدمة. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            {editing ? "تعديل الخدمة" : "إضافة خدمة"}
          </h3>
          <button onClick={onClose} disabled={saving} className={`flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-40 ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            <XCircle size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {serverError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] font-semibold text-red-500">
              <Warning size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <div>
            <label className={labelCls}>عنوان الخدمة</label>
            <input
              type="text" autoFocus value={titleAr} disabled={saving}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="مثال: استشارة قانونية أولية"
              className={inputCls}
            />
            {(titleLengthIssue || titleContactIssue) && (
              <p className="mt-1 text-[11px] font-semibold text-red-500">{titleLengthIssue || titleContactIssue}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>الوصف (اختياري)</label>
            <textarea
              value={descriptionAr} disabled={saving} rows={3}
              onChange={(e) => setDescriptionAr(e.target.value)}
              placeholder="اشرح ما تتضمنه هذه الخدمة"
              className={inputCls}
            />
            {descriptionContactIssue && (
              <p className="mt-1 text-[11px] font-semibold text-red-500">{descriptionContactIssue}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>فئة الخدمة</label>
              <select value={category} disabled={saving} onChange={(e) => setCategory(e.target.value as ServiceCategory)} className={inputCls}>
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{SERVICE_CATEGORY_AR[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>نوع التسعير</label>
              <select
                value={pricingKind} disabled={saving}
                onChange={(e) => {
                  const kind = e.target.value as PricingKind;
                  setPricingKind(kind);
                  if (kind === "quote") setPriceSar("");
                }}
                className={inputCls}
              >
                {PRICING_KINDS.map((k) => (
                  <option key={k} value={k}>{PRICING_KIND_AR[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                السعر (ر.س){priceRequired ? "" : " — غير مطلوب"}
              </label>
              <input
                type="number" min={0} step="0.01"
                value={priceSar} disabled={saving || pricingKind === "quote"}
                onChange={(e) => setPriceSar(e.target.value)}
                placeholder={pricingKind === "quote" ? "بحسب الحالة" : "٣٠٠"}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>المدة (اختياري)</label>
              <input
                type="text" value={durationLabel} disabled={saving}
                onChange={(e) => setDurationLabel(e.target.value)}
                placeholder="مثال: ٣٠ دقيقة"
                className={inputCls}
              />
              {(durationLengthIssue || durationContactIssue) && (
                <p className="mt-1 text-[11px] font-semibold text-red-500">{durationLengthIssue || durationContactIssue}</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12px] font-semibold cursor-pointer select-none">
            <input type="checkbox" checked={active} disabled={saving} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded" />
            <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>مُفعَّلة (تظهر في ملفك عند فتح الدليل العام)</span>
          </label>

          <button
            onClick={handleSave}
            disabled={saving || blockingIssues.length > 0}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-[#C8A762] mt-2 disabled:opacity-50"
          >
            {saving ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <CheckCircle size={14} weight="bold" />}
            {saving ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الخدمة"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
