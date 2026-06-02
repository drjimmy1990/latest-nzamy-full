import { FileText, X, Paperclip } from "@phosphor-icons/react";
import { SpecialtyDef } from "@/components/consultation/constants";

interface StepDescriptionProps {
  isAr: boolean;
  selectedSpecialty?: SpecialtyDef;
  description: string;
  setDescription: (v: string) => void;
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
}

export function StepDescription({ isAr, selectedSpecialty, description, setDescription, files, setFiles }: StepDescriptionProps) {
  const mockFileName = (i: number) => ["عقد_العمل.pdf", "رسالة_الفصل.pdf", "شهادة_العمل.jpg"][i % 3];

  return (
    <div>
      <h2 className="mb-1 font-brand text-lg font-bold text-ink dark:text-gray-100">
        {isAr ? "اشرح مشكلتك" : "Describe your issue"}
      </h2>
      <p className="mb-5 text-sm text-ink-muted dark:text-gray-400">
        {isAr
          ? "كلما وصفت أكثر، كلما وجدنا المحامي الأنسب لك"
          : "The more detail you provide, the better we match you with the right lawyer"}
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
          description.length >= 20
            ? "border-emerald-300 focus:border-emerald-400 dark:border-emerald-500/40"
            : "border-slate-200 focus:border-royal/40 dark:border-white/10"
        } bg-surface dark:bg-dark-bg text-ink placeholder:text-slate-400 dark:text-gray-200 dark:placeholder:text-gray-600`}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs ${description.length >= 20 ? "text-emerald-600" : "text-ink-faint dark:text-gray-600"}`}>
          {isAr ? `${description.length} حرف — الحد الأدنى ٢٠` : `${description.length} chars — min 20`}
        </span>
      </div>

      {/* File upload */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold text-ink-muted dark:text-gray-400">
          {isAr ? "المرفقات (اختياري)" : "Attachments (optional)"}
        </p>
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
              <FileText size={13} className="text-royal dark:text-gold" />
              <span className="text-xs text-ink-muted dark:text-gray-400">{mockFileName(i)}</span>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                <X size={12} className="text-slate-400 hover:text-red-500" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setFiles(prev => prev.length < 3 ? [...prev, `file${prev.length}`] : prev)}
            className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 hover:border-royal/40 hover:text-royal dark:border-white/10 dark:bg-white/5 dark:text-gray-500 dark:hover:text-gold transition-colors"
          >
            <Paperclip size={13} />
            {isAr ? "إضافة ملف" : "Add file"}
          </button>
        </div>
      </div>
    </div>
  );
}
