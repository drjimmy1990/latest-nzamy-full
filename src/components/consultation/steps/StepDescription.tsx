import { useRef } from "react";
import { FileText, X, Paperclip, Warning } from "@phosphor-icons/react";
import { SpecialtyDef } from "@/components/consultation/constants";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@/lib/services/fileValidation";

interface StepDescriptionProps {
  isAr: boolean;
  selectedSpecialty?: SpecialtyDef;
  description: string;
  setDescription: (v: string) => void;
  files: File[];
  addFiles: (incoming: FileList | File[]) => void;
  removeFile: (index: number) => void;
  fileError: string;
}

/** «١٫٢ ميجابايت» / «٣٤٠ كيلوبايت» — a real size for a real file. */
function formatSize(bytes: number, isAr: boolean): string {
  if (bytes >= 1024 * 1024) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    return isAr ? `${mb} ميجابايت` : `${mb} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return isAr ? `${kb} كيلوبايت` : `${kb} KB`;
}

const ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(",");

export function StepDescription({
  isAr, selectedSpecialty, description, setDescription, files, addFiles, removeFile, fileError,
}: StepDescriptionProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // WHAT THIS REPLACED — «إضافة ملف» used to push the literal string "file0"
  // onto a string[], and the chip beside it printed one of three hardcoded
  // Arabic filenames («عقد_العمل.pdf», «رسالة_الفصل.pdf», «شهادة_العمل.jpg»)
  // chosen by `i % 3`. No file picker ever opened, nothing was ever read from
  // disk, and nothing was ever uploaded — yet the next screen told the client
  // their documents were with the lawyer. These are now real Files, validated
  // by the same rule as every other attachment surface in the app and uploaded
  // by submitBooking() before the request row is created.
  const trimmed = description.trim();
  const atLimit = files.length >= 3;

  return (
    <div>
      <h2 className="mb-1 font-brand text-lg font-bold text-ink">
        {isAr ? "اشرح مشكلتك" : "Describe your issue"}
      </h2>
      <p className="mb-5 text-sm text-ink-muted dark:text-gray-400">
        {isAr
          ? "كلما وصفت أكثر، كان الطلب أوضح أمام فريق نظامي"
          : "The more detail you give, the clearer your request is for the Nezamy team"}
      </p>

      {/* Specialty chip */}
      {selectedSpecialty && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-royal/5 px-3 py-1.5 dark:bg-royal/20">
          <selectedSpecialty.icon size={13} weight="duotone" className="text-royal dark:text-gold" />
          <span className="text-xs font-semibold text-royal dark:text-gold">{selectedSpecialty.label}</span>
        </div>
      )}

      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={6}
        placeholder={isAr
          ? "مثال: لدي عقد عمل مع شركة منذ 3 سنوات، تم فصلي بشكل مفاجئ بدون سبب واضح. أريد معرفة حقوقي القانونية..."
          : "Example: I have an employment contract for 3 years, I was suddenly dismissed without clear reason. I want to know my legal rights..."
        }
        className={`w-full resize-none rounded-2xl border p-4 text-sm leading-relaxed outline-none transition-all ${
          trimmed.length >= 20
            ? "border-emerald-300 focus:border-emerald-400 dark:border-emerald-500/40"
            : "border-slate-200 focus:border-royal/40 dark:border-white/10"
        } bg-surface dark:bg-dark-bg text-ink placeholder:text-slate-400 dark:placeholder:text-gray-600`}
      />
      <div className="mt-2 flex items-center justify-between">
        {/* Counts the trimmed length, which is the same length canNext() gates
            on — the two used to disagree, so twenty spaces unlocked «التالي»
            while the counter said the requirement was met. */}
        <span className={`text-xs ${trimmed.length >= 20 ? "text-emerald-600" : "text-ink-faint dark:text-gray-600"}`}>
          {isAr ? `${trimmed.length} حرف — الحد الأدنى ٢٠` : `${trimmed.length} chars — min 20`}
        </span>
      </div>

      {/* File upload — a real picker */}
      <div className="mt-5">
        <p className="mb-1 text-xs font-semibold text-ink-muted dark:text-gray-400">
          {isAr ? "المرفقات (اختياري)" : "Attachments (optional)"}
        </p>
        <p className="mb-2 text-[11px] text-ink-faint dark:text-gray-500">
          {isAr
            ? "حتى ٣ ملفات — PDF أو Word أو صورة، بحد أقصى ٢٠ ميجابايت للملف. تُرفع عند إرسال الطلب."
            : "Up to 3 files — PDF, Word or image, max 20 MB each. Uploaded when you submit."}
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            // Reset so re-picking the same file fires onChange again.
            e.target.value = "";
          }}
        />

        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
              <FileText size={13} className="text-royal dark:text-gold" />
              <span className="max-w-[180px] truncate text-xs text-ink-muted dark:text-gray-400" title={f.name}>{f.name}</span>
              <span className="text-[10px] text-ink-faint dark:text-gray-500">{formatSize(f.size, isAr)}</span>
              <button type="button" onClick={() => removeFile(i)} aria-label={isAr ? `إزالة ${f.name}` : `Remove ${f.name}`}>
                <X size={12} className="text-slate-400 hover:text-red-500" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={atLimit}
            onClick={() => inputRef.current?.click()}
            className={`flex items-center gap-2 rounded-xl border border-dashed px-3 py-1.5 text-xs transition-colors ${
              atLimit
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-white/5 dark:bg-white/5 dark:text-gray-600"
                : "border-slate-300 bg-slate-50 text-slate-500 hover:border-royal/40 hover:text-royal dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:text-gold"
            }`}
          >
            <Paperclip size={13} />
            {isAr ? "إضافة ملف" : "Add file"}
          </button>
        </div>

        {fileError && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-500/20 dark:bg-amber-500/10">
            <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">{fileError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
