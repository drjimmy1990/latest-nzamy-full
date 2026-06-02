import { motion } from "framer-motion";
import { Gavel, MagnifyingGlass, BookOpen, ShieldCheck, CheckCircle } from "@phosphor-icons/react";

interface RoleCard {
  title: string;
  en: string;
  icon: React.ElementType;
  color: string;
  desc: string;
  tools: string[];
}

export function GovernmentRolesInfo({ isAr }: { isAr: boolean }) {
  const roles: RoleCard[] = [
    {
      title: "القضاء", en: "Judges", icon: Gavel, color: "text-amber-500",
      desc: "أدوات متخصصة لمساعدة القاضي في ترجيح وسرد الأحكام والتسبيب، بناءً على المبادئ القضائية المستقرة.",
      tools: ["مُرجّح الأحكام القضائية", "باحث سوابق المحكمة العليا", "صائغ ديباجة وتسبيب الحكم", "صائغ المنطوق", "محلل الاختصاص النوعي/المكاني"]
    },
    {
      title: "النيابة والتحقيق", en: "Prosecutors", icon: MagnifyingGlass, color: "text-blue-500",
      desc: "أدوات مخصصة لتكييف الوقائع الجنائية، صياغة لوائح الاتهام، والتأكد من الضمانات الإجرائية.",
      tools: ["صائغ لوائح الاتهام", "محلل قوة ومصداقية الأدلة", "توليد نماذج التحقيق", "مراجع ضمانات المتهم", "حاسبة المواعيد الإجرائية"]
    },
    {
      title: "الضبط الجنائي", en: "Officers", icon: ShieldCheck, color: "text-emerald-500",
      desc: "أدوات لدعم مأموري الضبط القضائي في كتابة المحاضر الإجرائية والتفتيش بشكل سليم نظامياً.",
      tools: ["منشئ محاضر الضبط", "مولد تقارير الحوادث", "نماذج القبض والتفتيش", "دليل الإجراءات الجنائية الميداني", "مُذكّر الحقوق والضمانات"]
    },
    {
      title: "المستشار الحكومي", en: "Gov Counsel", icon: BookOpen, color: "text-indigo-500",
      desc: "أدوات لرفع كفاءة مراجعة العقود الحكومية (المناقصات) والتأكد من الامتثال لتعاميم الجهات الرقابية.",
      tools: ["مراجع كراسات المناقصات", "صائغ الرأي القانوني الداخلي", "مدقق الامتثال (نزاهة، المراقبة)", "مراجع عقود الشراكات (PPP)"]
    }
  ];

  return (
    <section className="py-12 bg-white/50 dark:bg-dark-card/50 border-y border-slate-200 dark:border-white/5 my-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-slate-900/[0.04] dark:bg-grid-white/[0.02] bg-[bottom_1px_center]" style={{ maskImage: "linear-gradient(to bottom, transparent, black, transparent)" }} />
      <div className="max-w-6xl mx-auto px-4 relative">
        
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-royal dark:text-white mb-3">
            {isAr ? "اشتراك مؤسسي واحد، يشمل كافة الأدوار" : "One Institutional License, Covers All Roles"}
          </h2>
          <p className="text-ink-muted dark:text-gray-400 max-w-2xl mx-auto text-sm">
            {isAr 
              ? "تحصل الجهة الحكومية على لوحة تحكم موحدة، ويُمنح كل مستخدم صلاحيات وأدوات ذكاء اصطناعي مخصصة لمهامه اليومية بناءً على دوره (RBAC)."
              : "The government entity gets a unified dashboard, and each user receives specialized AI tools tailored to their daily tasks based on their role (RBAC)."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {roles.map((role, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-xl bg-slate-50 dark:bg-white/5 ${role.color}`}>
                  <role.icon size={24} weight="duotone" />
                </div>
                <h3 className="font-bold text-lg text-ink dark:text-white">
                  {isAr ? role.title : role.en}
                </h3>
              </div>
              <p className="text-xs text-ink-muted dark:text-gray-400 mb-5 leading-relaxed">
                {role.desc}
              </p>
              
              <div className="space-y-2.5">
                {role.tools.map((tool, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" weight="fill" />
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight">
                      {tool}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
