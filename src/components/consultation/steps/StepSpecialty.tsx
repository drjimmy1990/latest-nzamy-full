import { motion } from "framer-motion";
import { SpecialtyDef } from "@/components/consultation/constants";

interface StepSpecialtyProps {
  isAr: boolean;
  specialtyList: SpecialtyDef[];
  specialty: string | null;
  setSpecialty: (id: string) => void;
}

export function StepSpecialty({ isAr, specialtyList, specialty, setSpecialty }: StepSpecialtyProps) {
  return (
    <div>
      <h2 className="mb-1 font-brand text-lg font-bold text-ink dark:text-gray-100">
        {isAr ? "ما تخصص قضيتك؟" : "What's your case specialty?"}
      </h2>
      <p className="mb-6 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "اختر الأقرب لطبيعة قضيتك" : "Select the closest to your case type"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {specialtyList.map((sp) => {
          const Icon = sp.icon;
          const isSelected = specialty === sp.id;
          return (
            <motion.button
              key={sp.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSpecialty(sp.id)}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all ${
                isSelected
                  ? "border-royal bg-royal text-white shadow-[0_4px_20px_-4px_rgba(11,61,46,0.3)]"
                  : "border-slate-200/50 bg-surface hover:border-royal/30 hover:bg-royal/5 dark:border-white/10 dark:bg-dark-bg dark:hover:border-royal/30"
              }`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? "bg-white/15" : "bg-royal/5 dark:bg-white/5"}`}>
                <Icon size={20} weight="duotone" className={isSelected ? "text-white" : "text-royal dark:text-gold"} />
              </span>
              <span className={`text-xs font-medium leading-tight ${isSelected ? "text-white" : "text-ink dark:text-gray-300"}`}>
                {sp.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
