// ─── Floating Widget: Role-aware service menus ──────────────────────────────
// Logged-in users should see the actions that belong to their real role.
// Service requesters keep guided request flows. Professional/admin roles get
// quick routes and AI actions, so they do not fall into client-only forms.

import React from "react";
import type { UserSession, ProviderRole } from "@/hooks/useUser";
import type { WaStep, UserCategory } from "../types";
import type { WhatsAppQuickRequestDefinition } from "../whatsappWorkflow";
import {
  AddressBook,
  Bank,
  BookOpen,
  Briefcase,
  Buildings,
  CalendarCheck,
  ChartBar,
  ChatCircle,
  ClipboardText,
  Coins,
  FileText,
  Gavel,
  Gear,
  HandHeart,
  Handshake,
  Key,
  MagnifyingGlass,
  MapTrifold,
  Money,
  PencilSimple,
  Robot,
  Scales,
  SealCheck,
  ShieldCheck,
  Stamp,
  Storefront,
  Timer,
  TrendUp,
  Users,
  UsersFour,
  UsersThree,
  Vault,
  Warning,
} from "@phosphor-icons/react";

export interface ServiceItem {
  key: string;
  icon: React.ReactElement;
  label: string;
  sub: string;
  next?: WaStep;
  href?: string;
  badge?: string;
  quickRequest?: WhatsAppQuickRequestDefinition;
}

const iconProps = { size: 18, weight: "duotone" as const };

type ServiceSession = Pick<
  UserSession,
  | "isLoggedIn"
  | "userType"
  | "subRole"
  | "active_roles"
  | "businessRole"
  | "businessType"
  | "governmentRole"
  | "tier"
  | "dashboardMode"
  | "affiliation"
> | null | undefined;

function hasProviderRole(user: ServiceSession, role: ProviderRole) {
  return user?.subRole === role || Boolean(user?.active_roles?.includes(role));
}

function addSupport(items: ServiceItem[], label = "دعم مباشر"): ServiceItem[] {
  return [
    ...items,
    {
      key: "support",
      icon: <ChatCircle {...iconProps} />,
      label,
      sub: "يرسل نوع حسابك والمسار الحالي لفريق نظامي",
      next: "customer-service",
    },
  ];
}

function quickRequest(
  title: string,
  description: string,
  receiver: WhatsAppQuickRequestDefinition["receiver"],
  requestType: WhatsAppQuickRequestDefinition["requestType"] = "service",
  metadata: WhatsAppQuickRequestDefinition["metadata"] = {},
): WhatsAppQuickRequestDefinition {
  return {
    title,
    description,
    receiver,
    requestType,
    status: "pending_assignment",
    paymentStatus: "not_required",
    metadata,
  };
}

// ─── Guest / service-requester flows ────────────────────────────────────────

const GENERIC_SERVICES: ServiceItem[] = [
  { key: "guest-consult", icon: <ChatCircle {...iconProps} />, label: "استشارة قانونية", sub: "صوت أو فيديو أو كتابة", next: "consult-timing" },
  { key: "guest-contract", icon: <FileText {...iconProps} />, label: "مراجعة عقد", sub: "AI أو محامٍ متخصص", next: "contract-type" },
  { key: "guest-representation", icon: <Scales {...iconProps} />, label: "تمثيل قضائي", sub: "ترافع وصياغة وحضور", next: "representation-sub" },
  { key: "guest-notary", icon: <Stamp {...iconProps} />, label: "توثيق رسمي", sub: "عقود ووكالات وإقرارات", next: "notary-type" },
];

const INDIVIDUAL_SERVICES: ServiceItem[] = [
  { key: "individual-consult", icon: <ChatCircle {...iconProps} />, label: "استشارة شخصية", sub: "عمل • أسرة • عقار • إدارية", next: "consult-timing" },
  { key: "individual-contract", icon: <FileText {...iconProps} />, label: "مراجعة عقد", sub: "AI أو محامٍ متخصص", next: "contract-type" },
  { key: "individual-representation", icon: <Scales {...iconProps} />, label: "تمثيل قضائي", sub: "ترافع وصياغة وحضور", next: "representation-sub" },
  { key: "individual-notary", icon: <Stamp {...iconProps} />, label: "توثيق رسمي", sub: "عقود ووكالات وإقرارات", next: "notary-type" },
  { key: "individual-ai", icon: <Robot {...iconProps} />, label: "المستشار الذكي", sub: "سؤال سريع بالذكاء الاصطناعي", next: "ai-chat" },
];

function getGuestServicesForCategory(cat: UserCategory | "guest"): ServiceItem[] {
  if (cat === "corporate" || cat === "business") {
    return addSupport([
      { key: "guest-corp-consult", icon: <ChatCircle {...iconProps} />, label: "استشارة للشركة", sub: "عقود • عمال • امتثال • مطالبات", next: "consult-timing" },
      { key: "guest-corp-contract", icon: <FileText {...iconProps} />, label: "مراجعة عقد شركة", sub: "توريد • عمل • شراكة • خدمات", next: "contract-type" },
      { key: "guest-corp-representation", icon: <Scales {...iconProps} />, label: "نزاع أو مطالبة", sub: "تحويل أولي لمحامٍ أو فريق شركات", next: "representation-sub" },
      { key: "guest-corp-market", icon: <Storefront {...iconProps} />, label: "تصفح مزودي الشركات", sub: "محامون ومكاتب وخدمات مهنية", href: "/marketplace" },
    ], "دعم الشركات");
  }

  if (cat === "micro") {
    return addSupport([
      { key: "guest-micro-requirements", icon: <Storefront {...iconProps} />, label: "اشتراطات منشأتي", sub: "رخص • بلدية • عمل • زكاة", next: "consult-timing" },
      { key: "guest-micro-contract", icon: <FileText {...iconProps} />, label: "عقد بسيط", sub: "عمل • توريد • إيجار • شراكة", next: "contract-type" },
      { key: "guest-micro-claim", icon: <Scales {...iconProps} />, label: "مطالبة أو مشكلة", sub: "عميل • مورد • موظف", next: "representation-sub" },
    ], "دعم المنشآت");
  }

  if (cat === "provider") {
    return addSupport([
      { key: "guest-provider-notary", icon: <Stamp {...iconProps} />, label: "أحتاج موثقاً", sub: "وكالة • إقرار • عقد", next: "notary-type" },
      { key: "guest-provider-market", icon: <Storefront {...iconProps} />, label: "تصفح مقدمي الخدمة", sub: "موثق • معقب • محكم", href: "/marketplace" },
      { key: "guest-provider-onboarding", icon: <SealCheck {...iconProps} />, label: "انضم كمقدم خدمة", sub: "اعتماد مهني جاهز للربط", href: "/register" },
    ], "دعم مقدمي الخدمة");
  }

  if (cat === "lawyer") {
    return addSupport([
      { key: "guest-lawyer-join", icon: <SealCheck {...iconProps} />, label: "انضم كمحام", sub: "ملف مهني واعتماد وسوق خدمات", href: "/register" },
      { key: "guest-lawyer-ai", icon: <Robot {...iconProps} />, label: "جرّب مساعد المحامي", sub: "بحث وصياغة كنموذج واجهة", next: "ai-chat" },
      { key: "guest-lawyer-market", icon: <Storefront {...iconProps} />, label: "طلبات السوق", sub: "اطلع على شكل الفرص القانونية", href: "/marketplace" },
    ], "دعم المحامين");
  }

  if (cat === "firm") {
    return addSupport([
      { key: "guest-firm-onboarding", icon: <Buildings {...iconProps} />, label: "تجهيز مكتب محاماة", sub: "فريق • مقاعد • نقاط • حوكمة", href: "/register" },
      { key: "guest-firm-demo", icon: <UsersThree {...iconProps} />, label: "تحدث مع فريق المكاتب", sub: "تقييم حجم المكتب واحتياجاته", next: "customer-service" },
      { key: "guest-firm-market", icon: <Storefront {...iconProps} />, label: "سوق المكاتب", sub: "إحالات وتعاون مهني", href: "/marketplace" },
    ], "دعم مكاتب المحاماة");
  }

  if (cat === "government") {
    return addSupport([
      { key: "guest-gov-b2g", icon: <ShieldCheck {...iconProps} />, label: "تواصل B2G", sub: "ترخيص جهة أو إدارة أو دور حكومي", next: "customer-service" },
      { key: "guest-gov-contract", icon: <FileText {...iconProps} />, label: "استفسار عقد حكومي", sub: "منافسات ومشتريات ورأي قانوني", next: "consult-timing" },
      { key: "guest-gov-compliance", icon: <Gavel {...iconProps} />, label: "صلاحيات حكومية", sub: "قاضي • نيابة • ضابط • مستشار", next: "customer-service" },
    ], "دعم الجهات الحكومية");
  }

  if (cat === "ngo") {
    return addSupport([
      { key: "guest-ngo-governance", icon: <HandHeart {...iconProps} />, label: "جمعية أو وقف", sub: "حوكمة • برامج • تقارير • أوقاف", next: "customer-service" },
      { key: "guest-ngo-contract", icon: <FileText {...iconProps} />, label: "عقد تطوع أو برنامج", sub: "صياغة ومراجعة أولية", next: "contract-type" },
      { key: "guest-ngo-market", icon: <UsersFour {...iconProps} />, label: "مزودون للجمعيات", sub: "محامون ومراجعون وخدمات امتثال", href: "/marketplace" },
    ], "دعم الجمعيات والأوقاف");
  }

  return GENERIC_SERVICES;
}

const MICRO_SERVICES: ServiceItem[] = [
  { key: "micro-requirements", icon: <Storefront {...iconProps} />, label: "الرخص والاشتراطات", sub: "بلدية • زكاة • تأمينات", href: "/dashboard/micro/requirements" },
  { key: "micro-requests", icon: <ClipboardText {...iconProps} />, label: "طلب خدمة قانونية", sub: "يفتح طلبات المنشأة ومتابعتها", href: "/dashboard/micro/requests" },
  { key: "micro-contracts", icon: <FileText {...iconProps} />, label: "عقود المنشأة", sub: "توريد • عمل • شراكات بسيطة", href: "/dashboard/micro/contracts" },
  { key: "micro-ai", icon: <Robot {...iconProps} />, label: "مساعد المنشآت", sub: "إجراء ذكي حسب نوع النشاط", href: "/ai/micro" },
  { key: "micro-case", icon: <Scales {...iconProps} />, label: "قضايا ومطالبات", sub: "عرض أو إنشاء ملف نزاع", href: "/dashboard/micro/cases" },
  {
    key: "micro-quick-help",
    icon: <Warning {...iconProps} />,
    label: "طلب سريع للمنشأة",
    sub: "يسجل طلباً محلياً ويرسله لواتساب",
    badge: "Backend-ready",
    quickRequest: quickRequest(
      "طلب سريع لمنشأة صغيرة",
      "طلب وارد من زر واتساب العائم لمنشأة صغيرة: الرخص أو العقود أو المطالبات تظل واجهة محلية لحين ربط الباك إند.",
      "lawyer",
      "service",
      { sector: "micro" },
    ),
  },
];

// ─── Lawyers / firms ────────────────────────────────────────────────────────

function getLawyerServices(user: ServiceSession): ServiceItem[] {
  const services: ServiceItem[] = [
    { key: "lawyer-ai-chat", icon: <Robot {...iconProps} />, label: "مساعدك المهني", sub: "سؤال سريع للبحث أو الصياغة", next: "ai-chat", badge: "AI" },
    { key: "lawyer-draft", icon: <PencilSimple {...iconProps} />, label: "الصائغ القانوني", sub: "مذكرات • دفوع • لوائح", href: "/ai/draft" },
    { key: "lawyer-research", icon: <BookOpen {...iconProps} />, label: "بحث أنظمة وسوابق", sub: "المكتبة والمرشد القضائي", href: "/ai/procedures" },
    { key: "lawyer-cases", icon: <Gavel {...iconProps} />, label: "قضايا ومهام اليوم", sub: "جلسات • مهام • ملفات عمل", href: "/dashboard/lawyer/cases" },
    { key: "lawyer-market", icon: <Handshake {...iconProps} />, label: "تعاون وإحالات", sub: "طلبات السوق والتعاون المباشر", href: "/marketplace/collaborate" },
    {
      key: "lawyer-quick-support",
      icon: <Warning {...iconProps} />,
      label: "طلب دعم مهني",
      sub: "مشكلة جلسة أو اعتماد أو سوق خدمات",
      badge: "Backend-ready",
      quickRequest: quickRequest(
        "طلب دعم مهني لمحام",
        "طلب محلي من زر واتساب لمحام: دعم في الجلسات أو السوق أو الاعتماد، جاهز للربط بنظام التذاكر.",
        "ai_workspace",
        "service",
        { persona: "lawyer" },
      ),
    },
  ];

  if (hasProviderRole(user, "notary")) {
    services.push({
      key: "lawyer-addon-notary",
      icon: <Stamp {...iconProps} />,
      label: "طلبات التوثيق",
      sub: "امتياز موثّق مفعّل على حسابك",
      href: "/dashboard/provider/notary/requests",
      badge: "موثّق",
    });
  }
  if (hasProviderRole(user, "bailiff")) {
    services.push({
      key: "lawyer-addon-bailiff",
      icon: <MapTrifold {...iconProps} />,
      label: "طلبات التعقيب",
      sub: "معاملات حكومية وإجراءات",
      href: "/dashboard/provider/bailiff/requests",
      badge: "معقّب",
    });
  }
  if (hasProviderRole(user, "arbitrator")) {
    services.push({
      key: "lawyer-addon-arbitrator",
      icon: <Scales {...iconProps} />,
      label: "قضايا التحكيم",
      sub: "جلسات وأحكام تحكيمية",
      href: "/dashboard/provider/arbitration/cases",
      badge: "محكّم",
    });
  }

  return addSupport(services, "دعم مهني سريع");
}

function getFirmServices(user: ServiceSession): ServiceItem[] {
  const role = user?.affiliation?.role ?? "managing_partner";
  const quick = {
    key: `firm-${role}-quick`,
    icon: <Warning {...iconProps} />,
    label: "طلب دعم للمكتب",
    sub: "يسجل سياق دورك ويرسل متابعة واتساب",
    badge: "Backend-ready",
    quickRequest: quickRequest(
      "طلب دعم عمليات مكتب محاماة",
      `طلب محلي من زر واتساب لمكتب محاماة حسب دور ${role}. لا يوجد حفظ خادمي حتى الآن.`,
      "firm",
      "service",
      { firmRole: role },
    ),
  } satisfies ServiceItem;

  if (role === "finance_manager") {
    return addSupport([
      { key: "firm-finance", icon: <Money {...iconProps} />, label: "مالية المكتب", sub: "إيرادات وأتعاب ومحفظة", href: "/dashboard/firm/finance" },
      { key: "firm-fees", icon: <Coins {...iconProps} />, label: "الأتعاب", sub: "تسعير ومطالبات العملاء", href: "/dashboard/firm/fees" },
      { key: "firm-finance-reports", icon: <ChartBar {...iconProps} />, label: "تقارير مالية", sub: "تحليلات ومؤشرات تحصيل", href: "/dashboard/firm/analytics" },
      { key: "firm-finance-calc", icon: <Key {...iconProps} />, label: "حاسبة قانونية", sub: "رسوم وأتعاب وتقديرات", href: "/ai/fee-calculator" },
      quick,
    ], "دعم مالية المكتب");
  }

  if (role === "hr_manager") {
    return addSupport([
      { key: "firm-hr-team", icon: <UsersThree {...iconProps} />, label: "فريق المكتب", sub: "دعوات ومقاعد وملفات", href: "/dashboard/firm/team" },
      { key: "firm-hr-timesheets", icon: <Timer {...iconProps} />, label: "ساعات العمل", sub: "Timesheets وحضور", href: "/dashboard/firm/team/timesheets" },
      { key: "firm-hr-trainees", icon: <Users {...iconProps} />, label: "المتدربون", sub: "متابعة تدريب وإنجازات", href: "/dashboard/firm/team/trainees" },
      { key: "firm-hr-ai", icon: <Robot {...iconProps} />, label: "مستشار HR", sub: "سياسات داخلية وإنذارات", href: "/ai/corp/hr" },
      quick,
    ], "دعم موارد المكتب");
  }

  if (role === "legal_secretary" || role === "office_admin") {
    return addSupport([
      { key: "firm-admin-hearings", icon: <CalendarCheck {...iconProps} />, label: "جلسات اليوم", sub: "مواعيد وتنبيهات ومحاضر", href: "/dashboard/firm/hearings" },
      { key: "firm-admin-clients", icon: <AddressBook {...iconProps} />, label: "العملاء والاستشارات", sub: "مواعيد وبيانات تواصل", href: "/dashboard/firm/clients" },
      { key: "firm-admin-docs", icon: <FileText {...iconProps} />, label: "المستندات والأرشيف", sub: "رفع وفرز ومتابعة", href: "/dashboard/firm/documents" },
      { key: "firm-admin-secretary", icon: <Robot {...iconProps} />, label: "السكرتير الذكي", sub: "تلخيص وتفريغ وتنبيه", href: "/ai/secretary" },
      ...(role === "office_admin" ? [{ key: "firm-office-team", icon: <UsersThree {...iconProps} />, label: "إدارة الفريق", sub: "دعوات وأدوار تشغيلية", href: "/dashboard/firm/team" }] : []),
      quick,
    ], role === "office_admin" ? "دعم مدير المكتب" : "دعم السكرتارية");
  }

  if (role === "compliance_manager") {
    return addSupport([
      { key: "firm-compliance-conflict", icon: <ShieldCheck {...iconProps} />, label: "تعارض المصالح", sub: "Conflict • KYC • قيود", href: "/dashboard/firm/compliance/conflict" },
      { key: "firm-compliance-walls", icon: <Vault {...iconProps} />, label: "الجدران الصينية", sub: "فصل الملفات الحساسة", href: "/dashboard/firm/compliance/walls" },
      { key: "firm-compliance-governance", icon: <Gavel {...iconProps} />, label: "الحوكمة", sub: "سياسات ومصفوفة صلاحيات", href: "/dashboard/firm/governance" },
      { key: "firm-compliance-monitor", icon: <Warning {...iconProps} />, label: "مراقبة الأنظمة", sub: "تحديثات ومخاطر امتثال", href: "/ai/monitor" },
      quick,
    ], "دعم الامتثال");
  }

  if (role === "trainee") {
    return addSupport([
      { key: "firm-trainee-tasks", icon: <ClipboardText {...iconProps} />, label: "مهامي", sub: "تكليفات تحت إشراف", href: "/dashboard/firm/tasks" },
      { key: "firm-trainee-templates", icon: <FileText {...iconProps} />, label: "النماذج", sub: "مذكرات وقوالب مساعدة", href: "/dashboard/firm/templates" },
      { key: "firm-trainee-library", icon: <BookOpen {...iconProps} />, label: "المكتبة القانونية", sub: "أنظمة وسوابق للتعلم", href: "/erp/library" },
      { key: "firm-trainee-ai", icon: <Robot {...iconProps} />, label: "سؤال قانوني سريع", sub: "إجابة تدريبية داخلية", next: "ai-chat" },
      quick,
    ], "دعم المتدرب");
  }

  if (["lawyer", "senior_lawyer", "external_of_counsel", "legal_consultant", "in_house_counsel"].includes(role)) {
    return addSupport([
      { key: "firm-lawyer-cases", icon: <Gavel {...iconProps} />, label: "قضاياي ومهامي", sub: "ملفات مصرح بها حسب دورك", href: "/dashboard/firm/cases" },
      { key: "firm-lawyer-docs", icon: <FileText {...iconProps} />, label: "مستندات القضية", sub: "رفع ومراجعة وصياغة", href: "/dashboard/firm/documents" },
      { key: "firm-lawyer-draft", icon: <PencilSimple {...iconProps} />, label: "صياغة قانونية", sub: "لوائح ومذكرات وعقود", href: "/ai/draft" },
      { key: "firm-lawyer-conflict", icon: <ShieldCheck {...iconProps} />, label: "فحص تعارض", sub: "قبل قبول ملف أو عميل", href: "/dashboard/firm/compliance/conflict" },
      { key: "firm-lawyer-shared", icon: <UsersFour {...iconProps} />, label: "غرف مشتركة", sub: "تعاون داخلي أو خارجي", href: "/dashboard/firm/shared-rooms" },
      quick,
    ], "دعم محامي المكتب");
  }

  return addSupport([
    { key: "firm-assign", icon: <UsersThree {...iconProps} />, label: "توزيع قضية", sub: "اختيار الفريق وحِمل العمل", href: "/dashboard/firm/cases/assign" },
    { key: "firm-conflict", icon: <ShieldCheck {...iconProps} />, label: "فحص تعارض مصالح", sub: "Conflict • KYC • جدران صينية", href: "/dashboard/firm/compliance/conflict" },
    { key: "firm-workload", icon: <ChartBar {...iconProps} />, label: "عبء الفريق", sub: "الشركاء والمتدربون والسكرتارية", href: "/dashboard/firm/team/workload" },
    { key: "firm-contract-review", icon: <FileText {...iconProps} />, label: "مراجع عقود المكتب", sub: "تقرير مخاطر لعقود العملاء", href: "/ai/contract-reviewer" },
    { key: "firm-market", icon: <Storefront {...iconProps} />, label: "طلبات السوق", sub: "فرص وإحالات للمكتب", href: "/dashboard/firm/marketplace" },
    quick,
  ], "دعم عمليات المكتب");
}

// ─── Corporate / business ──────────────────────────────────────────────────

function getCorporateServices(user: ServiceSession): ServiceItem[] {
  const role = user?.businessRole ?? "owner";
  const serviceMode = user?.businessType === "service" || user?.tier === "shield";
  const roleQuick = quickRequest(
    "طلب سريع للشركة التجارية",
    `طلب محلي من زر واتساب للشركة التجارية حسب دور ${role}. يظهر في واجهة الطلبات فقط حتى ربط الباك إند.`,
    "business_legal",
    role === "employee" || role === "department_head" ? "service" : "business_case",
    { businessRole: role, serviceMode },
  );

  if (role === "hr_manager") {
    return addSupport([
      { key: "corp-hr-contracts", icon: <Briefcase {...iconProps} />, label: "عقود الموظفين", sub: "تحديث أو مراجعة عقد عمل", href: "/dashboard/business/employee-contracts" },
      { key: "corp-hr-ai", icon: <Robot {...iconProps} />, label: "مستشار HR القانوني", sub: "فصل • إنذار • مخالصة", href: "/ai/corp/hr" },
      { key: "corp-hr-review", icon: <ClipboardText {...iconProps} />, label: "طلب مراجعة", sub: "أرسل ملفاً للفريق القانوني", href: "/dashboard/business/reviews/new" },
      { key: "corp-hr-cases", icon: <Scales {...iconProps} />, label: "نزاعات عمالية", sub: "قضايا موظفين ومطالبات", href: "/dashboard/business/cases" },
      { key: "corp-hr-quick", icon: <Warning {...iconProps} />, label: "تصعيد HR سريع", sub: "يوثق الطلب محلياً ويرسله لواتساب", badge: "Backend-ready", quickRequest: roleQuick },
    ], "دعم شؤون الموظفين");
  }

  if (role === "finance_manager") {
    return addSupport([
      { key: "corp-finance-reports", icon: <ChartBar {...iconProps} />, label: "تقارير ومخاطر", sub: "التزامات مالية وقانونية", href: "/dashboard/business/reports" },
      { key: "corp-finance-wallet", icon: <Money {...iconProps} />, label: "المحفظة والفواتير", sub: "مدفوعات وأمانات الخدمة", href: "/dashboard/business/wallet" },
      { key: "corp-finance-review", icon: <ClipboardText {...iconProps} />, label: "مراجعة مستند", sub: "عقد أو مطالبة مالية", href: "/dashboard/business/reviews/new" },
      { key: "corp-finance-risk", icon: <ShieldCheck {...iconProps} />, label: "تقييم مخاطر", sub: "طرف تعاقدي أو مطالبة", href: "/ai/corp/risk-assessment" },
      { key: "corp-finance-quick", icon: <Warning {...iconProps} />, label: "تصعيد مالي سريع", sub: "طلب محلي للفريق القانوني/المالي", badge: "Backend-ready", quickRequest: roleQuick },
    ], "دعم مالي/قانوني");
  }

  if (role === "employee") {
    return addSupport([
      { key: "corp-employee-requests", icon: <ClipboardText {...iconProps} />, label: "طلباتي", sub: "متابعة ما أرسلته للإدارة", href: "/dashboard/business/requests" },
      { key: "corp-employee-new", icon: <Warning {...iconProps} />, label: "ارفع طلباً جديداً", sub: "عقد أو مشكلة أو موافقة", href: "/dashboard/business/reviews/new" },
      { key: "corp-employee-board", icon: <Briefcase {...iconProps} />, label: "مهامي اليومية", sub: "ما يخصني فقط في لوحة العمل", href: "/dashboard/business/kanban" },
      { key: "corp-employee-quick", icon: <ChatCircle {...iconProps} />, label: "طلب عاجل", sub: "يسجل الطلب محلياً ويرسله لواتساب", badge: "Backend-ready", quickRequest: roleQuick },
    ], "دعم الموظف");
  }

  if (role === "department_head") {
    return addSupport([
      { key: "corp-head-dept", icon: <Buildings {...iconProps} />, label: "قسمك", sub: "طلبات القسم ونطاقه", href: "/dashboard/business/departments" },
      { key: "corp-head-review", icon: <ClipboardText {...iconProps} />, label: "طلب مراجعة", sub: "إرسال مستند للفريق القانوني", href: "/dashboard/business/reviews/new" },
      { key: "corp-head-requests", icon: <FileText {...iconProps} />, label: "طلبات القسم", sub: "متابعة الحالة والتصعيد", href: "/dashboard/business/requests" },
      { key: "corp-head-quick", icon: <Warning {...iconProps} />, label: "تصعيد قسم سريع", sub: "طلب محلي موجه للشؤون القانونية", badge: "Backend-ready", quickRequest: roleQuick },
    ], "دعم مدير القسم");
  }

  if (role === "legal_staff" || role === "seconded") {
    return addSupport([
      { key: "corp-legal-cases", icon: <Scales {...iconProps} />, label: "قضاياي", sub: "ملفات مصرح بها فقط", href: "/dashboard/business/cases" },
      { key: "corp-legal-reviews", icon: <ClipboardText {...iconProps} />, label: "مراجعات الأقسام", sub: "طلبات قادمة من الإدارات", href: "/dashboard/business/reviews" },
      { key: "corp-legal-draft", icon: <PencilSimple {...iconProps} />, label: "صياغة عقد", sub: "صياغة ومراجعة مؤسسية", href: "/ai/corp/contracts" },
      { key: "corp-legal-mail", icon: <FileText {...iconProps} />, label: "LegalMail", sub: "مخاطبات ومهام قانونية", href: "/ai/mail-advisor" },
      { key: "corp-legal-quick", icon: <Warning {...iconProps} />, label: "طلب داخلي سريع", sub: "يربط الطلب بدورك ونطاقك", badge: "Backend-ready", quickRequest: roleQuick },
    ], role === "seconded" ? "دعم المستشار المنتدب" : "دعم الأخصائي القانوني");
  }

  if (role === "compliance_officer") {
    return addSupport([
      { key: "corp-compliance-home", icon: <ShieldCheck {...iconProps} />, label: "امتثال وحوكمة", sub: "PDPL • زكاة • لوائح", href: "/dashboard/business/governance" },
      { key: "corp-compliance-risk", icon: <Warning {...iconProps} />, label: "تقييم مخاطر", sub: "طرف تعاقدي أو سياسة", href: "/ai/corp/risk-assessment" },
      { key: "corp-compliance-health", icon: <TrendUp {...iconProps} />, label: "فحص 360", sub: "مخاطر وثغرات واشتراطات", href: "/dashboard/business/health-check" },
      { key: "corp-compliance-reports", icon: <ChartBar {...iconProps} />, label: "تقارير الامتثال", sub: "لوحات وتقارير تنفيذية", href: "/dashboard/business/reports" },
      { key: "corp-compliance-quick", icon: <ChatCircle {...iconProps} />, label: "تصعيد امتثال سريع", sub: "طلب محلي قابل للمتابعة", badge: "Backend-ready", quickRequest: roleQuick },
    ], "دعم الامتثال");
  }

  return addSupport([
    {
      key: "corp-service-request",
      icon: <Warning {...iconProps} />,
      label: serviceMode ? "اطلب محامياً خارجياً" : "طلب مراجعة عاجلة",
      sub: serviceMode ? "للشركات بلا قسم قانوني داخلي" : "عقد أو مستند عاجل — رد سريع",
      href: serviceMode ? "/dashboard/business/seconded-counsel" : "/dashboard/business/reviews/new",
      badge: serviceMode ? "Service" : undefined,
    },
    { key: "corp-new-case", icon: <Scales {...iconProps} />, label: "إضافة قضية", sub: "نزاع تجاري أو مطالبة", href: "/dashboard/business/cases/new" },
    { key: "corp-contract-ai", icon: <FileText {...iconProps} />, label: "عقود الشركات", sub: "صياغة أو مراجعة مؤسسية", href: "/ai/corp/contracts" },
    { key: "corp-compliance", icon: <ShieldCheck {...iconProps} />, label: "امتثال وحوكمة", sub: "PDPL • زكاة • لوائح", href: "/dashboard/business/governance" },
    { key: "corp-ai-chat", icon: <Robot {...iconProps} />, label: "مساعد قانوني داخلي", sub: "سؤال سريع حسب سياق الشركة", next: "ai-chat", badge: "AI" },
    { key: "corp-owner-quick", icon: <ChatCircle {...iconProps} />, label: "طلب سريع للإدارة", sub: "يسجل طلباً محلياً ويرسله لواتساب", badge: "Backend-ready", quickRequest: roleQuick },
  ], "دعم الشركة");
}

// ─── Government / NGO ───────────────────────────────────────────────────────

function getGovernmentServices(user: ServiceSession): ServiceItem[] {
  const role = user?.governmentRole ?? "gov_counsel";
  const byRole: Record<string, ServiceItem[]> = {
    judge: [
      { key: "gov-judge-weigher", icon: <Scales {...iconProps} />, label: "مُرجّح الأحكام", sub: "تحليل اتجاهات وأسانيد", href: "/ai/gov/judgment-weigher", badge: "قاضي" },
      { key: "gov-judge-search", icon: <MagnifyingGlass {...iconProps} />, label: "باحث المبادئ", sub: "مبادئ قضائية منظمة", href: "/ai/gov/judicial-search" },
      { key: "gov-judge-verdict", icon: <Gavel {...iconProps} />, label: "صائغ منطوق", sub: "مسودة حكم أو منطوق", href: "/ai/gov/verdict-drafter" },
    ],
    prosecutor: [
      { key: "gov-pros-indictment", icon: <ClipboardText {...iconProps} />, label: "لائحة اتهام", sub: "صياغة منظمة للوقائع", href: "/ai/gov/indictment-drafter", badge: "نيابة" },
      { key: "gov-pros-evidence", icon: <ShieldCheck {...iconProps} />, label: "تحليل الأدلة", sub: "وزن بينة وضمانات", href: "/ai/gov/evidence-analyzer" },
      { key: "gov-pros-forms", icon: <FileText {...iconProps} />, label: "نماذج التحقيق", sub: "محاضر وأسئلة إجرائية", href: "/ai/gov/investigation-forms" },
    ],
    officer: [
      { key: "gov-officer-incident", icon: <Warning {...iconProps} />, label: "تقرير حادثة", sub: "محضر منظم ومكتمل", href: "/ai/gov/incident-report", badge: "ضابط" },
      { key: "gov-officer-arrest", icon: <SealCheck {...iconProps} />, label: "نماذج القبض", sub: "تفتيش وضمانات إجرائية", href: "/ai/gov/arrest-forms" },
      { key: "gov-officer-procedure", icon: <MapTrifold {...iconProps} />, label: "دليل الإجراءات", sub: "خطوات وضوابط العمل", href: "/ai/gov/procedure-guide" },
    ],
    gov_counsel: [
      { key: "gov-counsel-procurement", icon: <Buildings {...iconProps} />, label: "مراجعة مناقصة", sub: "منافسات ومشتريات حكومية", href: "/ai/gov/procurement-reviewer", badge: "مستشار" },
      { key: "gov-counsel-opinion", icon: <BookOpen {...iconProps} />, label: "رأي قانوني حكومي", sub: "مسودة رأي منظم", href: "/ai/gov/legal-opinion-drafter" },
      { key: "gov-counsel-contract", icon: <FileText {...iconProps} />, label: "مراجعة عقد حكومي", sub: "مخاطر والتزامات", href: "/ai/gov/contract-reviewer" },
    ],
  };

  return addSupport([
    ...(byRole[role] ?? byRole.gov_counsel),
    { key: "gov-cases", icon: <Gavel {...iconProps} />, label: "قضايا الجهة", sub: "نزاعات وعقود ومخاطر", href: "/dashboard/government/cases" },
    { key: "gov-external-counsel", icon: <AddressBook {...iconProps} />, label: "مستشارون خارجيون", sub: "ربط منطقي مع مزودي الخدمة", href: "/dashboard/government/external-counsel" },
    {
      key: "gov-role-quick",
      icon: <Warning {...iconProps} />,
      label: "طلب دعم حكومي سريع",
      sub: "يسجل الدور الحكومي ويجهز المتابعة",
      badge: "Backend-ready",
      quickRequest: quickRequest(
        "طلب دعم حكومي من زر واتساب",
        `طلب محلي من جهة حكومية حسب دور ${role}: صلاحيات وأدوات AI وتكاملات B2G جاهزة للربط.`,
        "government_reviewer",
        "service",
        { governmentRole: role },
      ),
    },
  ], "دعم الجهة");
}

const NGO_SERVICES: ServiceItem[] = addSupport([
  { key: "ngo-volunteer-contract", icon: <HandHeart {...iconProps} />, label: "عقود التطوع", sub: "صياغة متوافقة مع النظام", href: "/ai/ngo/volunteer-contract" },
  { key: "ngo-governance", icon: <ShieldCheck {...iconProps} />, label: "الحوكمة والامتثال", sub: "المركز الوطني واللوائح", href: "/dashboard/ngo/compliance" },
  { key: "ngo-donation", icon: <ChartBar {...iconProps} />, label: "تحليل التبرعات", sub: "مخاطر وامتثال مالي", href: "/ai/ngo/donation-analyzer" },
  { key: "ngo-reports", icon: <FileText {...iconProps} />, label: "التقارير الدورية", sub: "تقرير ربعي أو سنوي", href: "/dashboard/ngo/reports" },
  { key: "ngo-market", icon: <UsersFour {...iconProps} />, label: "تصفح المهنيين", sub: "محامون ومراجعون ومزودون", href: "/marketplace" },
  {
    key: "ngo-quick-support",
    icon: <Warning {...iconProps} />,
    label: "طلب دعم للجمعية/الوقف",
    sub: "حوكمة أو برنامج أو تقرير",
    badge: "Backend-ready",
    quickRequest: quickRequest(
      "طلب دعم جمعية أو وقف",
      "طلب محلي من زر واتساب لجمعية/وقف: حوكمة، برامج، تقارير، أو أصول وقفية. جاهز للربط بالباك إند.",
      "ngo_admin",
      "service",
      { sector: "ngo_awqaf" },
    ),
  },
], "دعم الجمعية");

// ─── Providers / admin ──────────────────────────────────────────────────────

function getProviderServices(user: ServiceSession): ServiceItem[] {
  const providerQuick = (role: string, label = "طلب دعم مقدم خدمة"): ServiceItem => ({
    key: `provider-${role}-quick`,
    icon: <Warning {...iconProps} />,
    label,
    sub: "اعتماد أو طلب أو مشكلة تشغيل",
    badge: "Backend-ready",
    quickRequest: quickRequest(
      label,
      `طلب محلي من زر واتساب لمقدم خدمة بدور ${role}. جاهز للربط بتذاكر الدعم والاعتماد.`,
      "provider",
      "service",
      { providerRole: role },
    ),
  });

  if (user?.subRole === "notary") {
    return addSupport([
      { key: "provider-notary-requests", icon: <Stamp {...iconProps} />, label: "طلبات التوثيق", sub: "طلبات جديدة وجارية", href: "/dashboard/provider/notary/requests", badge: "موثّق" },
      { key: "provider-notary-drafts", icon: <PencilSimple {...iconProps} />, label: "مسودات التوثيق", sub: "عقود ووكالات وإقرارات", href: "/dashboard/provider/notary/drafts" },
      { key: "provider-notary-ai", icon: <Robot {...iconProps} />, label: "صائغ عقد التوثيق", sub: "مسودة أولية منظمة", href: "/ai/draft?mode=notary", badge: "AI" },
      { key: "provider-profile", icon: <SealCheck {...iconProps} />, label: "تقوية الملف", sub: "تخصصات وتراخيص وثقة", href: "/dashboard/provider/profile" },
      providerQuick("notary", "دعم الموثق"),
    ], "دعم الموثّق");
  }

  if (user?.subRole === "bailiff") {
    return addSupport([
      { key: "provider-bailiff-requests", icon: <ClipboardText {...iconProps} />, label: "طلبات التعقيب", sub: "جديدة • جارية • مكتملة", href: "/dashboard/provider/bailiff/requests", badge: "معقّب" },
      { key: "provider-bailiff-procedures", icon: <MapTrifold {...iconProps} />, label: "دليل الإجراءات", sub: "اشتراطات وخطوات الجهات", href: "/ai/procedures" },
      { key: "provider-bailiff-ai", icon: <Robot {...iconProps} />, label: "مساعد المعاملات", sub: "صياغة رد أو تقرير", href: "/ai/consult", badge: "AI" },
      { key: "provider-market", icon: <Storefront {...iconProps} />, label: "تصفح السوق", sub: "طلبات مناسبة لتخصصك", href: "/marketplace" },
      providerQuick("bailiff", "دعم المعقب"),
    ], "دعم المعقّب");
  }

  if (user?.subRole === "arbitrator") {
    return addSupport([
      { key: "provider-arb-cases", icon: <Scales {...iconProps} />, label: "قضايا التحكيم", sub: "كل النزاعات والجلسات", href: "/dashboard/provider/arbitration/cases", badge: "محكّم" },
      { key: "provider-arb-hearings", icon: <CalendarCheck {...iconProps} />, label: "جلسات التحكيم", sub: "مواعيد وأطراف", href: "/dashboard/provider/arbitration/hearings" },
      { key: "provider-arb-drafts", icon: <Gavel {...iconProps} />, label: "مسودات الأحكام", sub: "صياغة حكم تحكيمي", href: "/dashboard/provider/arbitration/drafts" },
      { key: "provider-arb-market", icon: <Storefront {...iconProps} />, label: "طلبات تحكيم جديدة", sub: "سوق النزاعات", href: "/marketplace?category=arbitration" },
      providerQuick("arbitrator", "دعم المحكم"),
    ], "دعم المحكّم");
  }

  return addSupport([
    { key: "provider-requests", icon: <Storefront {...iconProps} />, label: "الطلبات المتاحة", sub: "فرص جديدة في السوق", href: "/dashboard/provider/requests" },
    { key: "provider-active", icon: <Timer {...iconProps} />, label: "عروضي الجارية", sub: "متابعة العروض والمواعيد", href: "/dashboard/provider/requests?tab=active" },
    { key: "provider-profile", icon: <SealCheck {...iconProps} />, label: "تقوية الملف", sub: "اعتمادات وتخصصات", href: "/dashboard/provider/profile" },
    { key: "provider-report", icon: <FileText {...iconProps} />, label: "صياغة تقرير", sub: "تقرير مهني سريع", href: "/ai/draft?mode=report" },
    providerQuick("provider"),
  ], "دعم مقدم الخدمة");
}

const ADMIN_SERVICES: ServiceItem[] = [
  { key: "admin-platform", icon: <Gear {...iconProps} />, label: "تناغم المنصة", sub: "حالة الأسطح والمحتوى", href: "/dashboard/admin/platform" },
  { key: "admin-users", icon: <Users {...iconProps} />, label: "ملفات المستخدمين", sub: "مراجعة حساب أو صلاحية", href: "/dashboard/admin/users" },
  { key: "admin-provider-kyc", icon: <SealCheck {...iconProps} />, label: "تحقق المزودين", sub: "KYC وتراخيص مهنية", href: "/dashboard/admin/provider-verification" },
  { key: "admin-disputes", icon: <Scales {...iconProps} />, label: "نزاعات وتصعيد", sub: "ربط العميل بالمزود والضمان", href: "/dashboard/admin/disputes" },
  { key: "admin-pricing", icon: <Coins {...iconProps} />, label: "الأسعار والباقات", sub: "AI credits وخدمات السوق", href: "/dashboard/admin/pricing" },
  { key: "admin-audit", icon: <Vault {...iconProps} />, label: "سجل التدقيق", sub: "أمان وعمليات حساسة", href: "/dashboard/admin/audit-log" },
  {
    key: "admin-ops-ticket",
    icon: <Warning {...iconProps} />,
    label: "تذكرة تشغيل داخلية",
    sub: "لا تفتح عميل؛ تسجل ملاحظة إدارة محلية",
    badge: "Backend-ready",
    quickRequest: quickRequest(
      "تذكرة تشغيل من أدمن المنصة",
      "تذكرة محلية من زر واتساب للأدمن: متابعة خلل أو سطح تحكم، جاهزة للربط بنظام Incident/Audit.",
      "ai_workspace",
      "service",
      { persona: "admin" },
    ),
  },
];

// ─── Export lookup ──────────────────────────────────────────────────────────

export function getServicesForSession(cat: UserCategory | "guest", user?: ServiceSession): ServiceItem[] {
  if (!user?.isLoggedIn) return getGuestServicesForCategory(cat);

  switch (cat) {
    case "individual":
      return INDIVIDUAL_SERVICES;
    case "lawyer":
      return getLawyerServices(user);
    case "firm":
      return getFirmServices(user);
    case "business":
    case "corporate":
      return getCorporateServices(user);
    case "micro":
      return addSupport(MICRO_SERVICES, "دعم المنشأة");
    case "government":
      return getGovernmentServices(user);
    case "ngo":
      return NGO_SERVICES;
    case "provider":
      return getProviderServices(user);
    case "admin":
      return ADMIN_SERVICES;
    case "guest":
    default:
      return GENERIC_SERVICES;
  }
}

export function getServicesForCategory(cat: UserCategory | "guest"): ServiceItem[] {
  return getServicesForSession(cat, null);
}
