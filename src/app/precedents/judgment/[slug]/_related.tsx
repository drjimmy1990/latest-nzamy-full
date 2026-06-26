import Link from "next/link";
import { Stack } from "@phosphor-icons/react";

interface DocLink {
  slug: string;
  title: string;
}

interface LawMetaType {
  related_systems?: DocLink[];
  related_principles?: DocLink[];
}

export function RelatedDocs({
  lawMeta,
  isRTL,
  isDark,
}: {
  lawMeta: LawMetaType;
  isRTL: boolean;
  isDark: boolean;
}) {
  const hasRelated =
    (lawMeta.related_systems && lawMeta.related_systems.length > 0) ||
    (lawMeta.related_principles && lawMeta.related_principles.length > 0);

  if (!hasRelated) return null;

  return (
    <div
      className={`p-4 rounded-2xl border ${
        isDark
          ? "bg-zinc-900 border-white/[0.07]"
          : "bg-white border-slate-200 shadow-sm"
      } space-y-3.5`}
    >
      <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5">
        <Stack size={14} className="text-[#C8A762]" weight="fill" />
        <span>{isRTL ? "وثائق وأنظمة ذات صلة" : "Related Documents"}</span>
      </h3>

      {/* Related Systems */}
      {lawMeta.related_systems && lawMeta.related_systems.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
            {isRTL ? "الأنظمة واللوائح المرتبطة:" : "Related Laws & Regs:"}
          </h4>
          <div className="flex flex-col gap-1.5">
            {lawMeta.related_systems.map((doc, idx) => (
              <Link
                key={idx}
                href={`/laws/${doc.slug}`}
                className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                  isDark
                    ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white"
                    : "border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#0B3D2E]"
                }`}
              >
                <span>{doc.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Related Principles */}
      {lawMeta.related_principles && lawMeta.related_principles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-black text-purple-600 dark:text-purple-400/90 uppercase tracking-wider">
            {isRTL ? "المبادئ القضائية المرتبطة:" : "Related Judicial Principles:"}
          </h4>
          <div className="flex flex-col gap-1.5">
            {lawMeta.related_principles.map((doc, idx) => (
              <Link
                key={idx}
                href={`/precedents/${doc.slug}`}
                className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                  isDark
                    ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white"
                    : "border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#0B3D2E]"
                }`}
              >
                <span>{doc.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
