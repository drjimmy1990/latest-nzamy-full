"use client";

import { motion } from "framer-motion";
import { Lightbulb } from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";

// ─── 27 قسم قانوني — مطابق للمكتبة القانونية ─────────────────────────────────

const LEGAL_AREAS_27 = [
  { id: "commercial",   label: "تجاري",               color: "blue"    },
  { id: "labor",        label: "عمالي",               color: "amber"   },
  { id: "civil",        label: "مدني",                color: "emerald" },
  { id: "admin",        label: "إداري",               color: "purple"  },
  { id: "family",       label: "أحوال شخصية",        color: "pink"    },
  { id: "real_estate",  label: "عقاري",               color: "teal"    },
  { id: "criminal",     label: "جنائي",               color: "red"     },
  { id: "companies",    label: "شركات",               color: "indigo"  },
  { id: "contracts",    label: "عقود",                color: "cyan"    },
  { id: "ip",           label: "ملكية فكرية",        color: "violet"  },
  { id: "tax",          label: "ضريبي وزكوي",        color: "orange"  },
  { id: "insurance",    label: "تأمين",               color: "lime"    },
  { id: "banking",      label: "بنكي ومالي",         color: "sky"     },
  { id: "ma",           label: "اندماج واستحواذ",    color: "fuchsia" },
  { id: "bankruptcy",   label: "إفلاس وإعادة هيكلة", color: "rose"   },
  { id: "execution",    label: "تنفيذ وإشكالات",     color: "amber"   },
  { id: "arbitration",  label: "تحكيم دولي",          color: "blue"   },
  { id: "maritime",     label: "بحري وجوي",           color: "sky"    },
  { id: "competition",  label: "منافسة وحماية مستهلك",color: "teal"  },
  { id: "capital",      label: "سوق مالية وأوراق مالية",color: "indigo"},
  { id: "gov_contract", label: "عقود حكومية",         color: "emerald"},
  { id: "environment",  label: "بيئة وموارد طبيعية", color: "green"  },
  { id: "digital",      label: "جرائم معلوماتية",    color: "blue"    },
  { id: "medical",      label: "طبي وصحي",            color: "red"    },
  { id: "tourism",      label: "سياحة وضيافة",        color: "orange" },
  { id: "inheritance",  label: "ميراث وتركات",        color: "amber"  },
  { id: "other",        label: "أخرى",                color: "zinc"   },
];

const COLOR_MAP: Record<string, { active: string; hover: string }> = {
  blue:    { active: "bg-blue-500 border-blue-500 text-white",       hover: "hover:border-blue-500/30 hover:text-blue-600" },
  amber:   { active: "bg-amber-500 border-amber-500 text-white",     hover: "hover:border-amber-500/30 hover:text-amber-600" },
  emerald: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-500/30 hover:text-emerald-600" },
  purple:  { active: "bg-purple-500 border-purple-500 text-white",   hover: "hover:border-purple-500/30 hover:text-purple-600" },
  pink:    { active: "bg-pink-500 border-pink-500 text-white",       hover: "hover:border-pink-500/30 hover:text-pink-600" },
  teal:    { active: "bg-teal-500 border-teal-500 text-white",       hover: "hover:border-teal-500/30 hover:text-teal-600" },
  red:     { active: "bg-red-500 border-red-500 text-white",         hover: "hover:border-red-500/30 hover:text-red-600" },
  indigo:  { active: "bg-indigo-500 border-indigo-500 text-white",   hover: "hover:border-indigo-500/30 hover:text-indigo-600" },
  cyan:    { active: "bg-cyan-500 border-cyan-500 text-white",       hover: "hover:border-cyan-500/30 hover:text-cyan-600" },
  violet:  { active: "bg-violet-500 border-violet-500 text-white",   hover: "hover:border-violet-500/30 hover:text-violet-600" },
  orange:  { active: "bg-orange-500 border-orange-500 text-white",   hover: "hover:border-orange-500/30 hover:text-orange-600" },
  lime:    { active: "bg-lime-500 border-lime-500 text-white",       hover: "hover:border-lime-500/30 hover:text-lime-600" },
  sky:     { active: "bg-sky-500 border-sky-500 text-white",         hover: "hover:border-sky-500/30 hover:text-sky-600" },
  fuchsia: { active: "bg-fuchsia-500 border-fuchsia-500 text-white", hover: "hover:border-fuchsia-500/30 hover:text-fuchsia-600" },
  rose:    { active: "bg-rose-500 border-rose-500 text-white",       hover: "hover:border-rose-500/30 hover:text-rose-600" },
  green:   { active: "bg-green-500 border-green-500 text-white",     hover: "hover:border-green-500/30 hover:text-green-600" },
  zinc:    { active: "bg-zinc-500 border-zinc-500 text-white",       hover: "hover:border-zinc-500/30 hover:text-zinc-600" },
};

const QUICK_QUESTIONS = [
  "هل يحق لصاحب العمل الفصل دون إشعار؟",
  "ما هي مدة نظام الاختبار في العقد؟",
  "كيف تُحتسب مكافأة نهاية الخدمة؟",
  "هل يحق إخلاء المستأجر قبل انتهاء العقد؟",
  "ما الفرق بين الإيصال والسند الإذني؟",
  "متى تسقط دعوى الحق بالتقادم؟",
  "ما شروط الطعن بالاستئناف؟",
];

interface Props {
  topicArea: string;
  setTopicArea: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  isDark: boolean;
  card: string;
}

export function ContextConsult({ topicArea, setTopicArea, description, setDescription, isDark, card }: Props) {
  const selectedArea = LEGAL_AREAS_27.find(a => a.id === topicArea);

  return (
    <motion.div
      key="ctx-consult"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      {/* ─── 27 Legal Branches ─── */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            المجال القانوني — ٢٧ قسم
          </p>
          {selectedArea && (
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
              isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-700"
            }`}>
              {selectedArea.label}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LEGAL_AREAS_27.map(area => {
            const col = COLOR_MAP[area.color] ?? COLOR_MAP.zinc;
            const isActive = topicArea === area.id;
            return (
              <button
                key={area.id}
                onClick={() => setTopicArea(area.id)}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-medium border transition-all ${
                  isActive
                    ? col.active
                    : isDark
                    ? `border-white/[0.08] text-zinc-500 ${col.hover}`
                    : `border-slate-200 text-slate-500 ${col.hover}`
                }`}
              >
                {area.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Description ─── */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            استفسارك القانوني
            <span className={`text-[10px] font-normal ms-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
              سؤال محدد ومباشر أفضل
            </span>
          </p>
          <VoiceInput
            onTranscript={t => setDescription(description ? description + " " + t : t)}
            compact
          />
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="مثال: موظف عمل سنتين وتم فصله بسبب إعادة الهيكلة، هل يستحق التعويض وفق المادة ٧٧؟"
          rows={4}
          className={`w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${
            isDark
              ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40"
              : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400 focus:border-emerald-500/40"
          }`}
        />
        <p className={`text-[10px] mt-1.5 ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
          {description.length} حرف {description.length < 20 && description.length > 0 && "— أضف مزيداً من التفاصيل للحصول على إجابة أدق"}
        </p>
      </div>

      {/* ─── Quick Questions ─── */}
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={13} weight="duotone" className="text-[#C8A762]" />
          <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            أمثلة على أسئلة شائعة
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => setDescription(q)}
              className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
                isDark
                  ? "border-white/[0.07] text-zinc-500 hover:border-[#C8A762]/40 hover:text-zinc-300"
                  : "border-slate-200 text-slate-400 hover:border-[#C8A762]/40 hover:text-slate-600"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
