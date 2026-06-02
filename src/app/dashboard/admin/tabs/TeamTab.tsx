"use client";
import { motion } from "framer-motion";
import { UsersThree, Headset, PencilSimple, ChartBar, Robot, BookOpen, Storefront, Shield, Star, Clock } from "@phosphor-icons/react";

// فريق نظامي الداخلي — الموظفون الذين يعملون لصالح المنصة
const TEAM = [
  {
    id:"NZ-001", name:"إبراهيم الجهني", role:"مدير المنصة", dept:"الإدارة",
    desc:"الإشراف الكامل على عمليات المنصة وقرارات الأعمال الاستراتيجية",
    access:["كل لوحات التحكم","إعدادات النظام","قرارات الأسعار","الوصول للبيانات الكاملة"],
    dashboardTabs:["نظرة عامة","المستخدمون","الإيرادات","AI","المكتبة","المجتمع","السوق","ERP","الدعم","الفريق"],
    kpi:"مدير عام ← الأعلى صلاحية", color:"text-[#C8A762]", bg:"bg-[#C8A762]/10", border:"border-[#C8A762]/20",
  },
  {
    id:"NZ-002", name:"مشرف المحتوى", role:"مشرف المكتبة والمجتمع", dept:"المحتوى",
    desc:"مراجعة وإدارة المكتبة القانونية ومنشورات المجتمع والإشراف على الجودة",
    access:["مكتبة الأنظمة","إدارة المجتمع","موافقة/رفض المحتوى","تقارير الجودة"],
    dashboardTabs:["المكتبة","المجتمع"],
    kpi:"٤٧ منشور راجعه اليوم", color:"text-blue-400", bg:"bg-blue-500/10", border:"border-blue-500/20",
  },
  {
    id:"NZ-003", name:"مدير خدمة العملاء", role:"Customer Success Manager", dept:"الدعم",
    desc:"إدارة علاقات المشتركين، خفض الـ Churn، وإدارة التذاكر الحرجة",
    access:["تذاكر الدعم","بيانات المشتركين","إدارة الاتصالات","تقارير الرضا"],
    dashboardTabs:["المستخدمون","الدعم"],
    kpi:"معدل رضا ٩٤%", color:"text-emerald-400", bg:"bg-emerald-500/10", border:"border-emerald-500/20",
  },
  {
    id:"NZ-004", name:"مختص الدعم الفني", role:"Technical Support", dept:"الدعم",
    desc:"حل المشكلات التقنية وإدارة التقارير والبلاغات التقنية من المستخدمين",
    access:["تذاكر الدعم الفني","سجل الأخطاء","صحة النظام","audit log"],
    dashboardTabs:["الدعم","صحة النظام"],
    kpi:"١٢ تذكرة مفتوحة", color:"text-purple-400", bg:"bg-purple-500/10", border:"border-purple-500/20",
  },
  {
    id:"NZ-005", name:"مدير شراكات المكاتب", role:"Partnerships Manager", dept:"المبيعات",
    desc:"استقطاب مكاتب المحاماة الكبرى وإدارة حسابات Enterprise وتجديد العقود",
    access:["بوابة ERP","بيانات المكاتب","إدارة الخطط","عروض الأسعار"],
    dashboardTabs:["ERP","الإيرادات","المستخدمون"],
    kpi:"٣ مكاتب في المفاوضات", color:"text-amber-400", bg:"bg-amber-500/10", border:"border-amber-500/20",
  },
  {
    id:"NZ-006", name:"مشرف السوق", role:"Marketplace Manager", dept:"العمليات",
    desc:"الإشراف على سوق المهنيين وموافقة الطلبات وإدارة النزاعات والعمولات",
    access:["سوق المهنيين","إدارة العمولات","النزاعات","تقييمات المزودين"],
    dashboardTabs:["السوق"],
    kpi:"٣ نزاعات مفتوحة", color:"text-orange-400", bg:"bg-orange-500/10", border:"border-orange-500/20",
  },
];

const DEPT_ICON: Record<string,React.ElementType> = {
  الإدارة:Shield, المحتوى:BookOpen, الدعم:Headset, المبيعات:ChartBar, العمليات:Storefront,
};

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";

export default function TeamTab() {
  return (
    <motion.div key="team" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="space-y-4">
      {/* Header KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:"أعضاء الفريق", val:TEAM.length, c:"text-blue-400" },
          { label:"الأقسام", val:new Set(TEAM.map(t=>t.dept)).size, c:"text-purple-400" },
          { label:"تذاكر مفتوحة", val:"١٢", c:"text-amber-400" },
          { label:"SLA الالتزام", val:"٩٤%", c:"text-emerald-400" },
        ].map((s,i)=>(
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <UsersThree size={18} className={s.c} weight="duotone"/>
            <div><p className="text-[10px] text-zinc-500">{s.label}</p><p className={`text-[20px] font-black ${s.c}`}>{s.val}</p></div>
          </div>
        ))}
      </div>

      {/* Team Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEAM.map((m,i)=>{
          const DeptIcon = DEPT_ICON[m.dept] || UsersThree;
          return (
            <motion.div key={m.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.07}}
              className={`${card} border ${m.border} p-5 hover:border-opacity-60 transition-all`}>
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${m.bg} border ${m.border}`}>
                  <DeptIcon size={22} className={m.color} weight="duotone"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-[14px] font-black text-white">{m.name}</p>
                      <p className={`text-[11px] font-semibold ${m.color}`}>{m.role}</p>
                    </div>
                    <span className="text-[9px] font-bold bg-white/[0.04] text-zinc-500 px-2 py-1 rounded-lg flex-shrink-0">{m.dept}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">{m.desc}</p>

                  {/* KPI */}
                  <div className={`rounded-xl ${m.bg} border ${m.border} px-3 py-2 mb-3`}>
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className={m.color}/>
                      <p className={`text-[10px] font-bold ${m.color}`}>{m.kpi}</p>
                    </div>
                  </div>

                  {/* Dashboard Tabs */}
                  <div>
                    <p className="text-[9px] text-zinc-600 mb-1.5">يمكنه الوصول لتبويبات:</p>
                    <div className="flex flex-wrap gap-1">
                      {m.dashboardTabs.map(tab=>(
                        <span key={tab} className="text-[9px] font-semibold bg-white/[0.04] text-zinc-400 px-2 py-0.5 rounded-md">{tab}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Add member button */}
      <button className={`${card} w-full p-4 flex items-center justify-center gap-2 text-[12px] font-bold text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12] transition-all border-dashed`}>
        <UsersThree size={16}/> إضافة عضو فريق جديد
      </button>
    </motion.div>
  );
}
