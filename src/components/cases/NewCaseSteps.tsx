import { motion } from "framer-motion";
import {
  Check,
  CalendarBlank,
  Warning,
  UploadSimple,
  FilePlus,
  FileText,
  X,
  CheckCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  CASE_TYPES,
  DOCS_MAP,
  type CaseType,
  type FormData,
} from "@/constants/newCaseData";

// ---- Step 1 ----
export function Step1({
  isRTL,
  isDark,
  selected,
  onSelect,
}: {
  isRTL: boolean;
  isDark: boolean;
  selected: CaseType;
  onSelect: (t: CaseType) => void;
}) {
  return (
    <div>
      <h2 className={`text-xl font-bold mb-6 ${isDark ? "text-white" : "text-gray-800"}`}>
        {isRTL ? "اختر نوع القضية" : "Select Case Type"}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {CASE_TYPES.map(({ label, labelEn, icon: Icon, color }) => {
          const isActive = selected === label;
          return (
            <motion.button
              key={label}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(label as CaseType)}
              className={`relative rounded-2xl p-5 flex flex-col items-center gap-3 border-2 transition-all cursor-pointer ${
                isActive
                  ? "border-[#0B3D2E] bg-[#0B3D2E]/10"
                  : isDark
                    ? "border-[#2d3748] bg-[#161b22] hover:border-[#0B3D2E]/50"
                    : "border-gray-200 bg-white hover:border-[#0B3D2E]/40"
              }`}
            >
              {isActive && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#0B3D2E] flex items-center justify-center">
                  <Check size={12} color="#fff" weight="bold" />
                </div>
              )}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${color}20` }}
              >
                <Icon size={26} color={color} weight="duotone" />
              </div>
              <span className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>
                {isRTL ? label : labelEn}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Step 2 ----
export function Step2({
  isRTL,
  isDark,
  form,
  setForm,
}: {
  isRTL: boolean;
  isDark: boolean;
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
}) {
  const inputClass = `w-full rounded-xl px-4 py-3 border text-sm outline-none transition-colors ${
    isDark
      ? "bg-[#161b22] border-[#2d3748] text-white focus:border-[#C8A762]"
      : "bg-white border-gray-200 text-gray-800 focus:border-[#0B3D2E]"
  }`;

  const labelClass = `block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`;

  return (
    <div className="space-y-6">
      <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
        {isRTL ? "تفاصيل القضية" : "Case Details"}
      </h2>

      <div>
        <label className={labelClass}>{isRTL ? "وصف القضية *" : "Case Description *"}</label>
        <textarea
          rows={5}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder={isRTL ? "اكتب وصفاً تفصيلياً للقضية... (٥٠ حرف كحد أدنى)" : "Describe your case in detail... (min 50 chars)"}
          className={`${inputClass} resize-none`}
        />
        <div className={`flex justify-between mt-1 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
          <span>{form.description.length < 50 && form.description.length > 0 && (isRTL ? `${50 - form.description.length} حرف متبقٍ` : `${50 - form.description.length} more chars needed`)}</span>
          <span>{form.description.length} / ٥٠+</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{isRTL ? "المحكمة المختصة *" : "Competent Court *"}</label>
          <select
            value={form.court}
            onChange={(e) => setForm((f) => ({ ...f, court: e.target.value }))}
            className={inputClass}
          >
            <option value="">{isRTL ? "اختر المحكمة" : "Select Court"}</option>
            <option value="ابتدائي">ابتدائي</option>
            <option value="استئناف">استئناف</option>
            <option value="عليا">عليا</option>
            <option value="إدارية">إدارية</option>
            <option value="تجارية">تجارية</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>{isRTL ? "المدينة *" : "City *"}</label>
          <select
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className={inputClass}
          >
            <option value="">{isRTL ? "اختر المدينة" : "Select City"}</option>
            <option value="الرياض">الرياض</option>
            <option value="جدة">جدة</option>
            <option value="مكة">مكة</option>
            <option value="المدينة">المدينة</option>
            <option value="الدمام">الدمام</option>
            <option value="أبها">أبها</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>
          <CalendarBlank size={14} className="inline ml-1" />
          {isRTL ? "التاريخ المتوقع للجلسة" : "Expected Hearing Date"}
        </label>
        <input
          type="date"
          value={form.sessionDate}
          onChange={(e) => setForm((f) => ({ ...f, sessionDate: e.target.value }))}
          className={inputClass}
        />
      </div>

      <div className={`flex items-center justify-between rounded-xl p-4 border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
        <div className="flex items-center gap-3">
          <Warning size={20} color="#e8a528" weight="duotone" />
          <div>
            <p className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>
              {isRTL ? "قضية عاجلة" : "Urgent Case"}
            </p>
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "تتطلب مراجعة خلال ٢٤ ساعة" : "Requires review within 24 hours"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setForm((f) => ({ ...f, urgent: !f.urgent }))}
          className={`relative w-12 h-6 rounded-full transition-colors ${form.urgent ? "bg-[#0B3D2E]" : isDark ? "bg-gray-700" : "bg-gray-300"}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.urgent ? (isRTL ? "right-1" : "left-7") : (isRTL ? "right-7" : "left-1")}`}
          />
        </button>
      </div>
    </div>
  );
}

// ---- Step 3 ----
export function Step3({
  isRTL,
  isDark,
  docs,
  recDocs,
  onAdd,
  onRemove,
}: {
  isRTL: boolean;
  isDark: boolean;
  docs: string[];
  recDocs: string[];
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-6">
      <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
        {isRTL ? "رفع المستندات" : "Upload Documents"}
      </h2>

      {/* Drag-and-drop area */}
      <div
        className={`rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
          isDark
            ? "border-[#2d3748] bg-[#161b22] hover:border-[#C8A762]/50"
            : "border-gray-300 bg-gray-50 hover:border-[#0B3D2E]/50"
        }`}
        onClick={onAdd}
      >
        <UploadSimple size={40} color="#C8A762" weight="duotone" />
        <p className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
          {isRTL ? "اسحب الملفات هنا أو انقر للرفع" : "Drag files here or click to upload"}
        </p>
        <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
          PDF, DOCX, JPG — {isRTL ? "حتى ١٠ ميجابايت" : "up to 10 MB"}
        </p>
      </div>

      {/* Recommended docs */}
      <div>
        <h3 className={`text-sm font-semibold mb-3 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          {isRTL ? "المستندات المقترحة لهذا النوع:" : "Recommended documents for this case type:"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {recDocs.map((d) => (
            <span
              key={d}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                isDark
                  ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/20 text-[#C8A762]"
                  : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]"
              }`}
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Add button */}
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 text-[#0B3D2E] dark:text-[#C8A762] font-medium text-sm hover:bg-[#0B3D2E]/20 transition-colors"
      >
        <FilePlus size={18} weight="duotone" />
        {isRTL ? "إضافة مستند" : "Add Document"}
      </button>

      {/* Uploaded docs list */}
      {docs.length > 0 && (
        <div className="space-y-2">
          <h3 className={`text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-600"}`}>
            {isRTL ? `المستندات المرفوعة (${docs.length})` : `Uploaded (${docs.length})`}
          </h3>
          {docs.map((doc, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center justify-between rounded-xl px-4 py-3 ${isDark ? "bg-[#161b22] border border-[#2d3748]" : "bg-white border border-gray-200"}`}
            >
              <div className="flex items-center gap-3">
                <FileText size={20} color="#C8A762" weight="duotone" />
                <span className={`text-sm ${isDark ? "text-gray-200" : "text-gray-700"}`}>{doc}</span>
              </div>
              <button
                onClick={() => onRemove(i)}
                className={`p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors`}
              >
                <X size={14} color="#ef4444" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Step 4 ----
export function Step4({
  isRTL,
  isDark,
  form,
  setForm,
  budget,
  onSubmit,
}: {
  isRTL: boolean;
  isDark: boolean;
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  budget: string;
  onSubmit: () => void;
}) {
  const rows = [
    { label: isRTL ? "نوع القضية" : "Case Type", value: form.caseType ?? "—" },
    { label: isRTL ? "المحكمة" : "Court", value: form.court || "—" },
    { label: isRTL ? "المدينة" : "City", value: form.city || "—" },
    { label: isRTL ? "تاريخ الجلسة" : "Hearing Date", value: form.sessionDate || "—" },
    { label: isRTL ? "الأولوية" : "Priority", value: form.urgent ? (isRTL ? "عاجل" : "Urgent") : (isRTL ? "عادي" : "Normal") },
    { label: isRTL ? "المستندات" : "Documents", value: `${form.documents.length}` },
    { label: isRTL ? "النطاق التقديري للتكلفة" : "Estimated Budget", value: budget },
  ];

  return (
    <div className="space-y-6">
      <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
        {isRTL ? "مراجعة وإرسال" : "Review & Submit"}
      </h2>

      {/* Summary card */}
      <div className={`rounded-2xl border overflow-hidden ${isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
        <div className="bg-[#0B3D2E] px-5 py-3">
          <p className="text-white font-semibold text-sm">
            {isRTL ? "ملخص القضية" : "Case Summary"}
          </p>
        </div>
        <div className={isDark ? "bg-[#161b22]" : "bg-white"}>
          {rows.map((r, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-5 py-3 text-sm border-b last:border-b-0 ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}
            >
              <span className={isDark ? "text-gray-400" : "text-gray-500"}>{r.label}</span>
              <span className={`font-medium ${isDark ? "text-white" : "text-gray-800"}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Description preview */}
      {form.description && (
        <div className={`rounded-xl p-4 border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-gray-50 border-gray-200"}`}>
          <p className={`text-xs font-semibold mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {isRTL ? "وصف القضية:" : "Case Description:"}
          </p>
          <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {form.description}
          </p>
        </div>
      )}

      {/* Terms checkbox */}
      <label className="flex items-start gap-3 cursor-pointer group text-right">
        <div
          onClick={() => setForm((f) => ({ ...f, agreed: !f.agreed }))}
          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
            form.agreed
              ? "bg-[#0B3D2E] border-[#0B3D2E]"
              : isDark
                ? "border-gray-600"
                : "border-gray-300"
          }`}
        >
          {form.agreed && <Check size={11} color="#fff" weight="bold" />}
        </div>
        <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          {isRTL
            ? "أوافق على شروط الخدمة وسياسة الخصوصية الخاصة بمنصة نظامي"
            : "I agree to Nezamy's Terms of Service and Privacy Policy"}
        </span>
      </label>

      {/* Submit button */}
      <motion.button
        whileHover={{ scale: form.agreed ? 1.02 : 1 }}
        whileTap={{ scale: form.agreed ? 0.98 : 1 }}
        onClick={onSubmit}
        disabled={!form.agreed}
        className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
          form.agreed
            ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] cursor-pointer"
            : isDark
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
        }`}
      >
        {isRTL ? "إرسال القضية" : "Submit Case"}
      </motion.button>
    </div>
  );
}

// ---- Success state ----
export function SuccessState({
  isRTL,
  isDark,
  caseType,
}: {
  isRTL: boolean;
  isDark: boolean;
  caseType: CaseType;
}) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className={`text-center py-12 px-6 rounded-3xl border ${isDark ? "border-[#0B3D2E]/40 bg-[#161b22]" : "border-[#0B3D2E]/20 bg-white"}`}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring" }}
        className="w-20 h-20 rounded-full bg-[#0B3D2E] flex items-center justify-center mx-auto mb-6"
      >
        <CheckCircle size={44} color="#C8A762" weight="duotone" />
      </motion.div>
      <h2 className={`text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-800"}`}>
        {isRTL ? "تم رفع القضية بنجاح!" : "Case Submitted Successfully!"}
      </h2>
      <p className={`text-sm mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
        {isRTL ? `قضية ${caseType ?? ""} — رقم المرجع:` : `${caseType ?? ""} case — Reference:`}
      </p>
      <p className="text-[#C8A762] font-bold text-lg mb-6">NZ-2026-{Math.floor(Math.random() * 90000) + 10000}</p>
      <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
        {isRTL
          ? "سيتواصل معك أحد المحامين المختصين خلال ٢٤ ساعة"
          : "A qualified lawyer will contact you within 24 hours"}
      </p>
    </motion.div>
  );
}
