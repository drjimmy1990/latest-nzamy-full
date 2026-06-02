import React from "react";
import {
  Scales, FileText, Handshake, MagnifyingGlassPlus, ChatCircle,
  Gavel, Scroll, Lightbulb, BookOpen, Star, Student, Key,
  Trophy, Flame, Target, Lightning, Lock
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type MemberRole = 'managing_partner' | 'partner' | 'associate' | 'trainee' | 'admin';
export type MemberStatus = 'available' | 'busy' | 'leave';
export type WorkItemType = 'case' | 'contract' | 'advisory' | 'study';
export type WorkItemStatus = 'active' | 'scheduled' | 'done' | 'pending';

export interface TaskBreakdown {
  litigation: number; memos: number; contracts_complex: number;
  contracts_standard: number; due_diligence: number; advisory: number; negotiations: number;
}

export interface WorkItem {
  id: string; title: string; type: WorkItemType;
  status: WorkItemStatus; date: string;
  collaborators?: string[]; // other member names
  isLead: boolean; // this member leads or assists
}

export interface TeamMember {
  id: string; name: string; role: MemberRole; specialization: string;
  status: MemberStatus; joinDate: string; phone: string; email: string; bio: string;
  primaryResponsibilities: string[]; // يتولى بشكل رئيسي
  assistsIn: string[];               // يساعد في
  expertise: string[];
  education: { degree: string; institution: string; year: string }[];
  courts?: string[];
  casesWon: number; casesTotal: number; rating: number;
  utilizationRate: number; deadlineAdherence: number;
  tasks: TaskBreakdown;
  workItems: WorkItem[];
}

// ─── Weights ──────────────────────────────────────────────────────────────────
export const TASK_WEIGHTS: Record<keyof TaskBreakdown, { weight: number; label: string; icon: React.ElementType }> = {
  litigation:         { weight: 8, label: 'ترافع',       icon: Scales },
  memos:              { weight: 5, label: 'مذكرات',      icon: FileText },
  contracts_complex:  { weight: 5, label: 'عقود معقدة',  icon: Handshake },
  contracts_standard: { weight: 2, label: 'عقود نمطية',  icon: FileText },
  due_diligence:      { weight: 6, label: 'عناية واجبة', icon: MagnifyingGlassPlus },
  advisory:           { weight: 3, label: 'استشارات',    icon: ChatCircle },
  negotiations:       { weight: 4, label: 'تفاوض',       icon: Handshake },
};

export const MAX_POINTS = 50;

export function calcPoints(t: TaskBreakdown) {
  return (Object.keys(t) as (keyof TaskBreakdown)[]).reduce((s,k)=>s+t[k]*TASK_WEIGHTS[k].weight,0);
}

// ─── Work Item Config ─────────────────────────────────────────────────────────
export const WORK_TYPE: Record<WorkItemType,{label:string;icon:React.ElementType;color:string;bg:string}> = {
  case:     { label:'قضية',       icon:Gavel,      color:'text-emerald-600', bg:'bg-emerald-500/10' },
  contract: { label:'عقد',        icon:Scroll,     color:'text-blue-600',    bg:'bg-blue-500/10'    },
  advisory: { label:'استشارة',    icon:Lightbulb,  color:'text-amber-600',   bg:'bg-amber-500/10'   },
  study:    { label:'دراسة قانونية', icon:BookOpen, color:'text-violet-600', bg:'bg-violet-500/10'  },
};

export const WORK_STATUS: Record<WorkItemStatus,{label:string;dot:string;badge:string}> = {
  active:    { label:'نشطة',    dot:'bg-emerald-400',             badge:'bg-emerald-50 text-emerald-700'  },
  scheduled: { label:'مجدولة', dot:'bg-amber-400 animate-pulse', badge:'bg-amber-50 text-amber-700'      },
  done:      { label:'منتهية', dot:'bg-slate-400',               badge:'bg-slate-100 text-slate-600'     },
  pending:   { label:'معلّقة', dot:'bg-red-400',                 badge:'bg-red-50 text-red-700'          },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
export const MOCK_TEAM: TeamMember[] = [
  {
    id:'1', name:'سارة المنصور', role:'managing_partner', specialization:'التجاري والعقاري',
    status:'available', joinDate:'٢٠١٩', phone:'٠٥٠‑١١١‑٢٢٢٢', email:'sara@firm.sa',
    bio:'شريكة مؤسسة، خبرة 12 سنة في القضايا التجارية والعقارية على مستوى المملكة. تترأس لجنة قضايا الاستثمار الأجنبي.',
    primaryResponsibilities:['إدارة ملفات الشركات الكبرى','قيادة قضايا التحكيم التجاري','مراجعة عقود الاستثمار الأجنبي','الإشراف على الفريق'],
    assistsIn:['العناية الواجبة في صفقات الاندماج','استشارات نظام العمل'],
    expertise:['القانون التجاري','عقارات وتطوير','نزاعات الشركات','الاستثمار الأجنبي'],
    education:[
      {degree:'بكالوريوس القانون',institution:'جامعة الملك سعود',year:'2012'},
      {degree:'ماجستير قانون تجاري',institution:'جامعة إكستر - بريطانيا',year:'2014'},
    ],
    courts:['المحكمة التجارية بالرياض','محكمة الاستئناف','هيئة التحكيم التجاري'],
    casesWon:187, casesTotal:210, rating:4.9, utilizationRate:72, deadlineAdherence:96,
    tasks:{litigation:2,memos:1,contracts_complex:1,contracts_standard:2,due_diligence:0,advisory:2,negotiations:1},
    workItems:[
      {id:'w1',title:'نزاع عقاري شركة الأفق',type:'case',status:'active',date:'٢٠٢٥/٠٤/١٠',isLead:true},
      {id:'w2',title:'عقد شراكة استثمارية',type:'contract',status:'active',date:'٢٠٢٥/٠٤/١٥',isLead:true},
      {id:'w3',title:'استشارة إدارة مخاطر',type:'advisory',status:'done',date:'٢٠٢٥/٠٣/٢٢',isLead:true},
      {id:'w4',title:'دراسة تأسيس شركة خليجية',type:'study',status:'scheduled',date:'٢٠٢٥/٠٥/٠١',isLead:true},
      {id:'w5',title:'قضية فصل تعسفي — جدة',type:'case',status:'active',date:'٢٠٢٥/٠٤/١٨',collaborators:['تركي العمر'],isLead:false},
    ],
  },
  {
    id:'2', name:'تركي العمر', role:'associate', specialization:'العمالي والمدني',
    status:'busy', joinDate:'٢٠٢١', phone:'٠٥٥‑٣٣٣‑٤٤٤٤', email:'turki@firm.sa',
    bio:'محامٍ متخصص في نزاعات العمل والشؤون المدنية، حاصل على ماجستير قانون من جامعة القاهرة.',
    primaryResponsibilities:['تمثيل العملاء في قضايا العمل','صياغة عقود التوظيف','الترافع أمام المحاكم العمالية'],
    assistsIn:['مراجعة العقود التجارية','إعداد مذكرات الاستئناف المدني','البحث القانوني للقضايا الكبرى'],
    expertise:['نظام العمل السعودي','النزاعات المدنية','التعويضات والفصل التعسفي'],
    education:[
      {degree:'بكالوريوس الحقوق',institution:'جامعة الملك عبدالعزيز',year:'2019'},
      {degree:'ماجستير القانون الخاص',institution:'جامعة القاهرة',year:'2021'},
    ],
    courts:['المحكمة العمالية','محكمة الاستئناف','المحكمة العامة'],
    casesWon:98, casesTotal:120, rating:4.7, utilizationRate:81, deadlineAdherence:88,
    tasks:{litigation:3,memos:2,contracts_complex:0,contracts_standard:1,due_diligence:1,advisory:1,negotiations:0},
    workItems:[
      {id:'w1',title:'قضية فصل تعسفي — جدة',type:'case',status:'active',date:'٢٠٢٥/٠٤/١٨',collaborators:['سارة المنصور'],isLead:true},
      {id:'w2',title:'نزاع عمالي جماعي — الدمام',type:'case',status:'active',date:'٢٠٢٥/٠٤/٠٥',isLead:true},
      {id:'w3',title:'مذكرة استئناف مدني',type:'study',status:'scheduled',date:'٢٠٢٥/٠٥/١٠',isLead:true},
      {id:'w4',title:'عقد توظيف تنفيذي',type:'contract',status:'done',date:'٢٠٢٥/٠٣/١٥',isLead:true},
      {id:'w5',title:'استشارة نظام العمل الجديد',type:'advisory',status:'active',date:'٢٠٢٥/٠٤/٢٢',isLead:true},
      {id:'w6',title:'عناية واجبة — اندماج شركتين',type:'case',status:'pending',date:'٢٠٢٥/٠٥/٢٠',collaborators:['سارة المنصور','نورة الشمري'],isLead:false},
    ],
  },
  {
    id:'3', name:'نورة الشمري', role:'associate', specialization:'الأحوال الشخصية',
    status:'available', joinDate:'٢٠٢٢', phone:'٠٥٦‑٥٥٥‑٦٦٦٦', email:'noura@firm.sa',
    bio:'محامية متخصصة في قضايا الأسرة والأحوال الشخصية بأسلوب تفاوضي يُقلّل من وطأة النزاعات.',
    primaryResponsibilities:['ترافع قضايا الطلاق والحضانة','التفاوض في النفقة والمهر','تمثيل القاصرين'],
    assistsIn:['إعداد صكوك الإرث','استشارات الوصايا','البحث في أحكام الأحوال الشخصية'],
    expertise:['الطلاق والحضانة','النفقة والمهر','الإرث والوصايا','قضايا القاصرين'],
    education:[{degree:'بكالوريوس الشريعة والقانون',institution:'جامعة أم القرى',year:'2020'}],
    courts:['محكمة الأحوال الشخصية','محكمة الاستئناف'],
    casesWon:76, casesTotal:95, rating:4.8, utilizationRate:65, deadlineAdherence:97,
    tasks:{litigation:1,memos:1,contracts_complex:0,contracts_standard:0,due_diligence:0,advisory:3,negotiations:1},
    workItems:[
      {id:'w1',title:'قضية حضانة — الرياض',type:'case',status:'active',date:'٢٠٢٥/٠٤/١٢',isLead:true},
      {id:'w2',title:'استشارة زواج وعقود',type:'advisory',status:'done',date:'٢٠٢٥/٠٣/٢٨',isLead:true},
      {id:'w3',title:'دراسة الإرث الشرعي',type:'study',status:'active',date:'٢٠٢٥/٠٤/٢٠',isLead:true},
      {id:'w4',title:'عناية واجبة — اندماج شركتين',type:'case',status:'pending',date:'٢٠٢٥/٠٥/٢٠',collaborators:['تركي العمر'],isLead:false},
    ],
  },
  {
    id:'4', name:'خالد الحربي', role:'associate', specialization:'الإداري',
    status:'available', joinDate:'٢٠٢٣', phone:'٠٥٩‑٧٧٧‑٨٨٨٨', email:'khalid@firm.sa',
    bio:'محامٍ إداري متخصص في الطعن على القرارات الإدارية أمام ديوان المظالم وإدارة شؤون التراخيص الحكومية.',
    primaryResponsibilities:['الترافع أمام ديوان المظالم','إعداد لوائح الطعن الإداري','متابعة التراخيص الحكومية'],
    assistsIn:['مراجعة العقود الحكومية','بحث القرارات الوزارية'],
    expertise:['ديوان المظالم','القرارات الإدارية','التراخيص الحكومية','المناقصات'],
    education:[{degree:'بكالوريوس القانون',institution:'جامعة الإمام محمد بن سعود',year:'2021'}],
    courts:['ديوان المظالم','المحكمة الإدارية','محكمة الاستئناف الإدارية'],
    casesWon:42, casesTotal:58, rating:4.6, utilizationRate:55, deadlineAdherence:94,
    tasks:{litigation:0,memos:1,contracts_complex:1,contracts_standard:3,due_diligence:0,advisory:1,negotiations:0},
    workItems:[
      {id:'w1',title:'عقد مناقصة حكومية',type:'contract',status:'active',date:'٢٠٢٥/٠٤/٠٨',isLead:true},
      {id:'w2',title:'طعن على قرار ترخيص',type:'case',status:'scheduled',date:'٢٠٢٥/٠٥/٠٥',isLead:true},
      {id:'w3',title:'استشارة امتثال حكومي',type:'advisory',status:'active',date:'٢٠٢٥/٠٤/٢٥',isLead:true},
    ],
  },
  {
    id:'5', name:'موضي القرشي', role:'trainee', specialization:'عام',
    status:'busy', joinDate:'٢٠٢٤', phone:'٠٥١‑٩٩٩‑٠٠٠٠', email:'mawdi@firm.sa',
    bio:'متدربة قانونية في السنة الأولى، طالبة حقوق. تُساعد في بحث المستجدات التشريعية وإعداد الملفات.',
    primaryResponsibilities:['البحث القانوني','إعداد ملخصات الأحكام','تنظيم ملفات القضايا'],
    assistsIn:['صياغة المراسلات','تحضير جلسات الترافع','مراجعة العقود النمطية'],
    expertise:['البحث القانوني','إعداد الملفات','القانون العام'],
    education:[{degree:'بكالوريوس القانون (جارٍ)',institution:'جامعة الملك عبدالعزيز',year:'2026'}],
    casesWon:5, casesTotal:12, rating:4.4, utilizationRate:48, deadlineAdherence:92,
    tasks:{litigation:0,memos:1,contracts_complex:0,contracts_standard:2,due_diligence:0,advisory:1,negotiations:0},
    workItems:[
      {id:'w1',title:'بحث قانوني — نظام العمل',type:'study',status:'active',date:'٢٠٢٥/٠٤/١٠',isLead:false,collaborators:['تركي العمر']},
      {id:'w2',title:'مراجعة عقود نمطية',type:'contract',status:'done',date:'٢٠٢٥/٠٣/٢٠',isLead:false,collaborators:['خالد الحربي']},
    ],
  },
  {
    id:'6', name:'فيصل الدوسري', role:'trainee', specialization:'التجاري',
    status:'leave', joinDate:'٢٠٢٤', phone:'٠٥٤‑٤٤٤‑٥٥٥٥', email:'faisal@firm.sa',
    bio:'متدرب في قسم القانون التجاري، يتمتع بمهارات بحثية متميزة وفهم جيد للتعاملات التجارية الدولية.',
    primaryResponsibilities:['البحث في الأنظمة التجارية الدولية','إعداد ملخصات القضايا'],
    assistsIn:['ترجمة العقود الأجنبية','تحليل بيانات القضايا'],
    expertise:['القانون التجاري','العقود الدولية','البحث والتوثيق'],
    education:[{degree:'بكالوريوس القانون (جارٍ)',institution:'جامعة الملك سعود',year:'2026'}],
    casesWon:2, casesTotal:8, rating:4.3, utilizationRate:40, deadlineAdherence:100,
    tasks:{litigation:0,memos:0,contracts_complex:0,contracts_standard:1,due_diligence:0,advisory:2,negotiations:0},
    workItems:[
      {id:'w1',title:'دراسة العقود الدولية',type:'study',status:'pending',date:'٢٠٢٥/٠٥/١٥',isLead:false,collaborators:['سارة المنصور']},
    ],
  },
];

// ─── Role Hierarchy ──────────────────────────────────────────────────────────
export const ROLE_RANK: Record<MemberRole, number> = {
  managing_partner: 4, partner: 3, associate: 2, trainee: 1, admin: 1,
};

export const ROLE_CONFIG: Record<MemberRole,{label:string;color:string;bg:string;icon:React.ElementType}> = {
  managing_partner: {label:'شريك مدير', color:'#C8A762',bg:'#C8A762',icon:Star},
  partner:   {label:'شريك',  color:'#0B3D2E',bg:'#0B3D2E',icon:Star},
  associate: {label:'محامي', color:'#3b82f6',bg:'#3b82f6',icon:Gavel},
  trainee:   {label:'متدرب', color:'#8b5cf6',bg:'#8b5cf6',icon:Student},
  admin:     {label:'إداري', color:'#64748b',bg:'#64748b',icon:Key},
};

export const STATUS_CFG: Record<MemberStatus,{label:string;dot:string;text:string}> = {
  available: {label:'متاح',  dot:'bg-emerald-400',             text:'text-emerald-500'},
  busy:      {label:'مشغول', dot:'bg-amber-400 animate-pulse', text:'text-amber-500'},
  leave:     {label:'إجازة', dot:'bg-blue-400',                text:'text-blue-500'},
};

export const ACH_TEMPLATES = [
  {title:'أول انتصار',    desc:'ربحت أول قضية',          icon:Gavel,   field:'casesWon', threshold:1,   points:50},
  {title:'١٠ قضايا',     desc:'١٠ قضايا مكسوبة',         icon:Trophy,  field:'casesWon', threshold:10,  points:100},
  {title:'٥٠ قضية',      desc:'٥٠ قضية مكسوبة',          icon:Flame,   field:'casesWon', threshold:50,  points:200},
  {title:'نجم التقييم',  desc:'تقييم أعلى من ٤.٧',       icon:Star,    field:'rating',   threshold:4.7, points:150},
  {title:'الالتزام ١٠٠', desc:'٩٥٪+ الالتزام بالمواعيد', icon:Target,  field:'deadline', threshold:95,  points:120},
  {title:'خبير التفاوض', desc:'أتمّ ٣+ جلسات تفاوض',     icon:Lightning,field:'nego',    threshold:3,   points:80},
];

// DEMO: pretend id=2 (تركي — associate) is the logged-in user
export const CURRENT_USER = { id: '2', role: 'associate' as MemberRole };
export const sp = {type:'spring' as const, stiffness:100, damping:20};
