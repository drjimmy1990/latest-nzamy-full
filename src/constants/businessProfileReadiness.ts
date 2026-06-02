import type {
  BusinessAdminControl,
  BusinessCompanySize,
  BusinessLegalStructure,
  BusinessProfileScenario,
  BusinessServiceEntitlement,
  BusinessServiceKey,
  BusinessServiceModel,
} from "@/types/businessBackendReady";

export const BUSINESS_COMPANY_SIZE_LABEL: Record<BusinessCompanySize, string> = {
  owner_only: "شركة صغيرة يديرها المالك",
  small: "شركة صغيرة",
  medium: "شركة متوسطة",
  large: "شركة كبيرة",
  enterprise: "مجموعة/Enterprise",
};

export const BUSINESS_LEGAL_STRUCTURE_LABEL: Record<BusinessLegalStructure, string> = {
  owner_managed: "المالك يدير الاحتياج القانوني",
  external_counsel: "مستشار/مكتب خارجي",
  internal_advisor: "مستشار قانوني داخلي",
  legal_department: "إدارة قانونية داخلية",
  hybrid: "داخلي + خارجي",
};

export const BUSINESS_SERVICE_MODEL_LABEL: Record<BusinessServiceModel, string> = {
  platform_only: "خدمات منصة فقط",
  litigation_only: "تقاضي فقط",
  platform_and_litigation: "منصة + تقاضي",
  secondment: "انتداب مستشار",
  advisory_only: "استشارات ووقاية",
};

export const BUSINESS_SERVICE_ENTITLEMENTS: BusinessServiceEntitlement[] = [
  {
    key: "legal_requests",
    label: "طلبات قانونية",
    description: "رفع طلب من المالك أو الإدارات وتوجيهه للمسار المناسب.",
    availableForSizes: ["owner_only", "small", "medium", "large", "enterprise"],
    routes: ["/dashboard/business/requests", "/dashboard/business/kanban"],
    contract: "BusinessLegalRequest",
    readiness: "UI Working",
  },
  {
    key: "litigation",
    label: "قضايا وتقاضي",
    description: "ملفات تقاضي وجلسات ومتابعة نزاعات للشركات التي فعّلت الخدمة.",
    availableForSizes: ["small", "medium", "large", "enterprise"],
    needsAdminFlag: true,
    routes: ["/dashboard/business/cases", "/dashboard/business/hearings"],
    contract: "BusinessLitigationMatter",
    readiness: "Backend-ready",
  },
  {
    key: "contract_review",
    label: "مراجعة عقود",
    description: "مسار مراجعة/إنشاء عقود للإدارات أو المالك أو المستشار الداخلي.",
    availableForSizes: ["owner_only", "small", "medium", "large", "enterprise"],
    routes: ["/dashboard/business/reviews", "/dashboard/business/reviews/new", "/ai/contracts"],
    contract: "BusinessContractReview",
    readiness: "UI Working",
  },
  {
    key: "legal_library",
    label: "المكتبة القانونية",
    description: "وصول للمكتبة والنصوص النظامية مع توثيق اعتماد المصدر لاحقاً.",
    availableForSizes: ["owner_only", "small", "medium", "large", "enterprise"],
    routes: ["/laws"],
    contract: "LegalLibrarySystem",
    readiness: "Backend-ready",
  },
  {
    key: "ai_corp_tools",
    label: "أدوات AI للشركات",
    description: "CorpMind، تحليل الصفقات، مراجعة امتثال، ومساعد HR ضمن قيود البيتا.",
    availableForSizes: ["small", "medium", "large", "enterprise"],
    needsAdminFlag: true,
    routes: ["/ai/corp/deal-intel", "/ai/corp/corpmind", "/ai/corp/hr"],
    contract: "BusinessAiEntitlement",
    readiness: "Backend-ready",
  },
  {
    key: "marketplace",
    label: "سوق المهنيين",
    description: "طلب محامي/مكتب خارجي أو نشر طلب قانوني للشركة.",
    availableForSizes: ["owner_only", "small", "medium", "large", "enterprise"],
    needsAdminFlag: true,
    routes: ["/dashboard/business/marketplace", "/marketplace"],
    contract: "BusinessMarketplaceAccess",
    readiness: "Backend-ready",
  },
  {
    key: "secondment",
    label: "مستشار منتدب",
    description: "ربط مستشار خارجي يعمل داخل بيئة الشركة وساعاته ومساراته.",
    availableForSizes: ["medium", "large", "enterprise"],
    needsAdminFlag: true,
    routes: ["/dashboard/business/seconded-counsel"],
    contract: "BusinessSecondment",
    readiness: "Backend-ready",
  },
  {
    key: "governance",
    label: "حوكمة وامتثال",
    description: "فحص 360 ومصفوفة موافقات ومخاطر تنظيمية للشركات الأكبر.",
    availableForSizes: ["medium", "large", "enterprise"],
    needsAdminFlag: true,
    routes: ["/dashboard/business/governance", "/dashboard/business/health-check"],
    contract: "BusinessGovernanceProgram",
    readiness: "Backend-ready",
  },
  {
    key: "hr_contracts",
    label: "عقود الموظفين",
    description: "لوحة HR لعقود العمل والتنبيهات والمخاطر العمالية.",
    availableForSizes: ["small", "medium", "large", "enterprise"],
    routes: ["/dashboard/business/employee-contracts"],
    contract: "BusinessEmploymentContract",
    readiness: "UI Working",
  },
  {
    key: "finance_reports",
    label: "تقارير مالية",
    description: "عرض تكلفة الملفات والتحصيل والفواتير للمالك/المدير المالي.",
    availableForSizes: ["medium", "large", "enterprise"],
    routes: ["/dashboard/business/reports", "/dashboard/business/wallet"],
    contract: "BusinessFinancialReport",
    readiness: "Backend-ready",
  },
  {
    key: "departments",
    label: "إدارات وصلاحيات",
    description: "إدارات داخلية ورؤساء أقسام ومسارات موافقات بحسب الدور.",
    availableForSizes: ["medium", "large", "enterprise"],
    needsInternalLegal: true,
    routes: ["/dashboard/business/departments", "/dashboard/business/team"],
    contract: "BusinessOrgUnit",
    readiness: "UI Working",
  },
  {
    key: "community_supervision",
    label: "إشراف مجتمع الشركة",
    description: "تجهيز صلاحيات مشرفين داخليين عند فتح مجتمع/قناة قانونية للشركة.",
    availableForSizes: ["large", "enterprise"],
    needsAdminFlag: true,
    routes: ["/dashboard/admin/community/moderation"],
    contract: "CommunityModerationItem",
    readiness: "Backend-ready",
  },
];

export const BUSINESS_PROFILE_SCENARIOS: BusinessProfileScenario[] = [
  {
    id: "owner-only-service",
    title: "شركة صغيرة بلا قسم قانوني",
    companySize: "owner_only",
    legalStructure: "owner_managed",
    serviceModel: "advisory_only",
    hasInternalLegal: false,
    description: "المالك يحتاج طلب خدمة، مراجعة عقد، استشارة، أو تصعيد لمكتب خارجي بدون تعقيد ERP.",
    roles: ["owner"],
    recommendedServices: ["legal_requests", "contract_review", "legal_library", "marketplace"],
    dashboardRoutes: ["/dashboard/business?mode=service", "/dashboard/business/marketplace", "/ai/consult"],
    adminRoute: "/dashboard/admin/business",
    readiness: "Backend-ready",
    backendBoundary: "الواجهة تحدد المسارات والاشتراك محلياً فقط؛ الربط الحقيقي ينتظر CompanyProfile API.",
    betaNotes: "أي مخرجات AI قانونية تبقى خلف BetaReviewGate حتى انتهاء مراجعة المصادر.",
  },
  {
    id: "small-external-counsel",
    title: "شركة صغيرة بمستشار خارجي",
    companySize: "small",
    legalStructure: "external_counsel",
    serviceModel: "platform_and_litigation",
    hasInternalLegal: false,
    description: "الشركة ترفع الطلبات ويجري توجيهها لمستشار أو مكتب خارجي مع إمكانية قضايا/تقاضي.",
    roles: ["owner", "hr_manager", "finance_manager"],
    recommendedServices: ["legal_requests", "litigation", "contract_review", "marketplace", "hr_contracts"],
    dashboardRoutes: ["/dashboard/business", "/dashboard/business/cases", "/dashboard/business/team"],
    adminRoute: "/dashboard/admin/business",
    readiness: "Backend-ready",
    backendBoundary: "تفعيل التقاضي والسوق محلي في الأدمن؛ لا توجد عقود تمثيل أو فوترة خادمية بعد.",
    betaNotes: "مناسب للبيتا كمسار خدمة واضح بدون إيحاء أن التمثيل القانوني أصبح إنتاجياً.",
  },
  {
    id: "medium-internal-advisor",
    title: "شركة متوسطة بمستشار قانوني داخلي",
    companySize: "medium",
    legalStructure: "internal_advisor",
    serviceModel: "platform_only",
    hasInternalLegal: true,
    description: "مستشار داخلي يستقبل طلبات الإدارات، يراجع العقود، ويحتاج HR/Finance وتقارير.",
    roles: ["owner", "legal_manager", "legal_staff", "department_head", "hr_manager", "finance_manager"],
    recommendedServices: ["legal_requests", "contract_review", "governance", "hr_contracts", "finance_reports", "departments", "ai_corp_tools"],
    dashboardRoutes: ["/dashboard/business", "/dashboard/business/departments", "/dashboard/business/reviews"],
    adminRoute: "/dashboard/admin/business",
    readiness: "Backend-ready",
    backendBoundary: "RBAC والمسارات ظاهرة؛ مصدر الحقيقة للأدوار والموافقات ينتظر Auth/RBAC backend.",
    betaNotes: "السيناريو الافتراضي لاختبار الإدارة القانونية الداخلية قبل بناء الجداول.",
  },
  {
    id: "large-legal-dept",
    title: "شركة كبيرة بإدارة قانونية",
    companySize: "large",
    legalStructure: "legal_department",
    serviceModel: "platform_and_litigation",
    hasInternalLegal: true,
    description: "إدارة قانونية كاملة، إدارات متعددة، حوكمة، تقاضي، انتداب، وسوق مهنيين.",
    roles: ["owner", "legal_manager", "legal_staff", "compliance_officer", "seconded", "department_head", "hr_manager", "finance_manager", "employee"],
    recommendedServices: ["legal_requests", "litigation", "contract_review", "legal_library", "ai_corp_tools", "marketplace", "secondment", "governance", "hr_contracts", "finance_reports", "departments", "community_supervision"],
    dashboardRoutes: ["/dashboard/business", "/dashboard/business/governance", "/dashboard/business/seconded-counsel"],
    adminRoute: "/dashboard/admin/business",
    readiness: "Backend-ready",
    backendBoundary: "كل الأسطح UI-ready؛ audit/approval/service entitlement الحقيقي ينتظر backend.",
    betaNotes: "يجب إبقاء Feature Flags وBetaReviewGate حتى اعتماد سياسات البيانات القانونية.",
  },
  {
    id: "enterprise-hybrid",
    title: "مجموعة كبيرة بنموذج هجين",
    companySize: "enterprise",
    legalStructure: "hybrid",
    serviceModel: "secondment",
    hasInternalLegal: true,
    description: "فريق داخلي مع مكاتب خارجية ومستشارين منتدبين وتوزيع حسب الفروع/الإدارات.",
    roles: ["owner", "legal_manager", "legal_staff", "compliance_officer", "seconded", "department_head", "hr_manager", "finance_manager", "employee"],
    recommendedServices: ["legal_requests", "litigation", "contract_review", "ai_corp_tools", "marketplace", "secondment", "governance", "hr_contracts", "finance_reports", "departments", "community_supervision"],
    dashboardRoutes: ["/dashboard/business", "/dashboard/business/team", "/dashboard/business/reports"],
    adminRoute: "/dashboard/admin/business",
    readiness: "Backend-ready",
    backendBoundary: "تجربة الهيكل الهجين محلية فقط؛ الربط يتطلب org graph وservice entitlement backend.",
    betaNotes: "يعامل كأعلى سيناريو بيتا لاختبار تداخل الصلاحيات قبل الإنتاج.",
  },
];

export const BUSINESS_ADMIN_CONTROLS: BusinessAdminControl[] = [
  {
    id: "business-profile",
    title: "بروفيل الشركة وحجمها",
    route: "/dashboard/admin/business",
    contract: "BusinessProfileContract",
    readiness: "Backend-ready",
    note: "اختيار الحجم والهيكل القانوني ونموذج الخدمة يعمل محلياً فقط حتى ربط CompanyProfile API.",
  },
  {
    id: "business-services",
    title: "خدمات الشركة المفعلة",
    route: "/dashboard/admin/business",
    contract: "BusinessServiceEntitlement",
    readiness: "Backend-ready",
    note: "التقاضي، السوق، الانتداب، الحوكمة، وأدوات AI تظهر كتفعيل محلي مع حدود بيتا واضحة.",
  },
  {
    id: "business-rbac",
    title: "أدوار الشركة وصلاحياتها",
    route: "/dashboard/business/team",
    contract: "BusinessRolePermission",
    readiness: "Backend-ready",
    note: "الأدوار ظاهرة ومتغيرة في UI؛ الإلزام الخادمي ينتظر Auth/RBAC backend.",
  },
  {
    id: "business-audit",
    title: "تدقيق تغييرات الشركات",
    route: "/dashboard/admin/audit-log",
    contract: "AdminAuditEvent",
    readiness: "Risk",
    note: "أي تعديل محلي يحتاج لاحقاً سجل before/after وربط actor/time/entity قبل الإنتاج.",
  },
];

export function resolveBusinessScenario(
  companySize: BusinessCompanySize,
  legalStructure: BusinessLegalStructure,
  serviceModel: BusinessServiceModel,
): BusinessProfileScenario {
  return (
    BUSINESS_PROFILE_SCENARIOS.find((scenario) =>
      scenario.companySize === companySize &&
      scenario.legalStructure === legalStructure &&
      scenario.serviceModel === serviceModel
    ) ??
    BUSINESS_PROFILE_SCENARIOS.find((scenario) => scenario.companySize === companySize) ??
    BUSINESS_PROFILE_SCENARIOS[0]
  );
}

export function serviceKeyToFeatureFlag(serviceKey: BusinessServiceKey) {
  const map: Partial<Record<BusinessServiceKey, string>> = {
    litigation: "hasLitigation",
    marketplace: "hasMarketplace",
    secondment: "hasSecondment",
    governance: "hasGovernance",
    ai_corp_tools: "hasAiCorpTools",
    departments: "hasDepartments",
    community_supervision: "hasCommunitySupervisors",
  };

  return map[serviceKey];
}
