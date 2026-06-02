import type {
  GovernmentEntityType,
  GovernmentPlanId,
  GovernmentRoleContract,
  GovernmentRoleKey,
  GovernmentServiceKey,
  MicroBusinessType,
  MicroPlanId,
  MicroServiceKey,
  NgoOrganizationType,
  NgoPlanId,
  NgoServiceKey,
  SectorAdminControl,
  SectorEntitlement,
  SectorPlanContract,
  SectorProfileScenario,
  SectorProfileType,
} from "@/types/sectorBackendReady";

export const GOVERNMENT_ENTITY_TYPE_LABEL: Record<GovernmentEntityType, string> = {
  court: "محكمة / جهة قضائية",
  prosecution: "نيابة / ادعاء عام",
  police: "شرطة / ضبط جنائي",
  ministry: "وزارة",
  regulator: "جهة رقابية",
  municipality: "أمانة / بلدية",
  public_authority: "هيئة عامة",
};

export const GOVERNMENT_PLAN_LABEL: Record<GovernmentPlanId, string> = {
  "gov-eval": "تقييم مجاني",
  "gov-department": "ترخيص إدارة سنوي",
  "gov-enterprise": "ترخيص مؤسسي بعرض سعر",
};

export const GOVERNMENT_ROLE_LABEL: Record<GovernmentRoleKey, string> = {
  judge: "قاضي",
  prosecution: "نيابة / ادعاء",
  investigator: "محقق",
  police_officer: "ضابط شرطة",
  government_counsel: "مستشار حكومي",
  compliance_regulator: "امتثال / رقابة",
};

export const NGO_ORGANIZATION_TYPE_LABEL: Record<NgoOrganizationType, string> = {
  charity: "جمعية خيرية",
  waqf: "وقف / أوقاف",
  foundation: "مؤسسة أهلية",
  campaign: "حملة مرخصة",
};

export const NGO_PLAN_LABEL: Record<NgoPlanId, string> = {
  "ngo-free": "Free",
  "ngo-impact": "Impact سنوي",
  "ngo-institutional": "Institutional سنوي",
};

export const MICRO_BUSINESS_TYPE_LABEL: Record<MicroBusinessType, string> = {
  retail: "تجزئة / متجر",
  restaurant: "مطعم / مقهى",
  clinic: "عيادة / مركز صحي صغير",
  workshop: "ورشة / خدمات ميدانية",
  professional_services: "خدمات مهنية",
  online_store: "متجر إلكتروني",
};

export const MICRO_PLAN_LABEL: Record<MicroPlanId, string> = {
  "micro-free": "مجاني",
  "micro-shield": "درع المنشأة سنوي",
};

export const SECTOR_PLAN_CONTRACTS: SectorPlanContract[] = [
  {
    id: "gov-eval",
    sector: "government",
    label: "تقييم مجاني",
    pricingModel: "free",
    includedUsers: 5,
    usageModel: "contract_scope",
    betaLocked: true,
    note: "تجربة تقييم محدودة بلا نقاط ولا فوترة فعلية.",
  },
  {
    id: "gov-department",
    sector: "government",
    label: "ترخيص إدارة سنوي",
    pricingModel: "annual_quote",
    includedUsers: 50,
    usageModel: "contract_scope",
    betaLocked: true,
    note: "B2G بعقد سنوي ونطاق عمل، والسعر النهائي بعرض سعر.",
  },
  {
    id: "gov-enterprise",
    sector: "government",
    label: "ترخيص مؤسسي",
    pricingModel: "annual_quote",
    includedUsers: 250,
    usageModel: "contract_scope",
    betaLocked: true,
    note: "SSO وتكاملات وتقارير مؤسسية كلها Backend-ready.",
  },
  {
    id: "ngo-free",
    sector: "ngo",
    label: "Free",
    pricingModel: "free",
    yearlyPrice: 0,
    includedUsers: 3,
    usageModel: "limits",
    betaLocked: true,
    note: "وصول أساسي للحوكمة والعقود دون نقاط.",
  },
  {
    id: "ngo-impact",
    sector: "ngo",
    label: "Impact سنوي",
    pricingModel: "annual_fixed",
    yearlyPrice: 2388,
    includedUsers: 10,
    usageModel: "limits",
    betaLocked: true,
    note: "متطوعون، تبرعات، برامج، وتقارير بحدود واجهة فقط.",
  },
  {
    id: "ngo-institutional",
    sector: "ngo",
    label: "Institutional سنوي",
    pricingModel: "annual_fixed",
    yearlyPrice: 5988,
    includedUsers: 30,
    usageModel: "limits",
    betaLocked: true,
    note: "مجلس إدارة، أوقاف، برامج متعددة، وتقارير مؤسسية.",
  },
  {
    id: "micro-free",
    sector: "micro",
    label: "مجاني",
    pricingModel: "free",
    yearlyPrice: 0,
    includedUsers: 1,
    usageModel: "limits",
    betaLocked: true,
    note: "اشتراطات أساسية وخدمات بسيطة دون نقاط.",
  },
  {
    id: "micro-shield",
    sector: "micro",
    label: "درع المنشأة سنوي",
    pricingModel: "annual_fixed",
    yearlyPrice: 2499,
    includedUsers: 3,
    usageModel: "limits",
    betaLocked: true,
    note: "متابعة اشتراطات، عقود، مستندات، وطلبات قانونية بحدود استخدام.",
  },
];

export const GOVERNMENT_ROLE_CONTRACTS: GovernmentRoleContract[] = [
  {
    role: "judge",
    label: GOVERNMENT_ROLE_LABEL.judge,
    scope: "case",
    permissions: ["cases:judge:view", "judgments:draft", "judicial_search:use", "reports:judiciary"],
    aiTools: ["/ai/gov/judgment-weigher", "/ai/gov/judicial-search", "/ai/gov/judgment-drafter"],
    restrictedFrom: ["police_officer", "investigator"],
  },
  {
    role: "prosecution",
    label: GOVERNMENT_ROLE_LABEL.prosecution,
    scope: "department",
    permissions: ["investigations:view", "indictments:draft", "evidence:analyze", "deadlines:calculate"],
    aiTools: ["/ai/gov/indictment-drafter", "/ai/gov/evidence-analyzer", "/ai/gov/deadline-calculator"],
    restrictedFrom: ["judge"],
  },
  {
    role: "investigator",
    label: GOVERNMENT_ROLE_LABEL.investigator,
    scope: "case",
    permissions: ["investigations:forms", "evidence:collect", "guarantees:check"],
    aiTools: ["/ai/gov/investigation-forms", "/ai/gov/guarantees-checker"],
    restrictedFrom: ["judge"],
  },
  {
    role: "police_officer",
    label: GOVERNMENT_ROLE_LABEL.police_officer,
    scope: "case",
    permissions: ["incident:report", "detention:records", "arrest_forms:prepare", "procedure_guide:use"],
    aiTools: ["/ai/gov/detention-records", "/ai/gov/incident-report", "/ai/gov/arrest-forms"],
    restrictedFrom: ["judge", "government_counsel"],
  },
  {
    role: "government_counsel",
    label: GOVERNMENT_ROLE_LABEL.government_counsel,
    scope: "entity",
    permissions: ["contracts:review", "procurement:review", "opinions:draft", "external_counsel:manage"],
    aiTools: ["/ai/gov/procurement-reviewer", "/ai/gov/legal-opinion-drafter", "/ai/gov/contract-reviewer"],
    restrictedFrom: ["police_officer"],
  },
  {
    role: "compliance_regulator",
    label: GOVERNMENT_ROLE_LABEL.compliance_regulator,
    scope: "oversight",
    permissions: ["compliance:review", "reports:oversight", "audit:view"],
    aiTools: ["/ai/gov/compliance-checker", "/dashboard/government/reports"],
    restrictedFrom: ["police_officer"],
  },
];

export const SECTOR_ENTITLEMENTS: SectorEntitlement[] = [
  {
    key: "judiciary",
    sector: "government",
    label: "صلاحيات القضاء",
    description: "أدوات الأحكام والاختصاص والبحث القضائي للقاضي فقط.",
    routes: ["/dashboard/government/cases", "/ai/gov/judgment-drafter", "/ai/gov/judicial-search"],
    contract: "GovernmentRoleContract",
    readiness: "Backend-ready",
  },
  {
    key: "prosecution",
    sector: "government",
    label: "صلاحيات النيابة/الادعاء",
    description: "لوائح اتهام، تحليل أدلة، مدد نظامية، وتقارير تحقيق.",
    routes: ["/ai/gov/indictment-drafter", "/ai/gov/evidence-analyzer", "/dashboard/government/reports"],
    contract: "GovernmentRoleContract",
    readiness: "Backend-ready",
  },
  {
    key: "investigation",
    sector: "government",
    label: "التحقيق والإجراءات",
    description: "نماذج تحقيق وضمانات وإجراءات منفصلة عن أدوات الضابط والقاضي.",
    routes: ["/ai/gov/investigation-forms", "/ai/gov/guarantees-checker"],
    contract: "GovernmentRoleContract",
    readiness: "Backend-ready",
  },
  {
    key: "police",
    sector: "government",
    label: "أدوات الضبط الشرطي",
    description: "محاضر، تقارير حوادث، قبض وتفتيش، ودليل إجراءات.",
    routes: ["/ai/gov/detention-records", "/ai/gov/incident-report", "/ai/gov/arrest-forms"],
    contract: "GovernmentRoleContract",
    readiness: "Backend-ready",
  },
  {
    key: "counsel",
    sector: "government",
    label: "المستشار الحكومي",
    description: "عقود حكومية، مشتريات، آراء قانونية، ومستشارون خارجيون.",
    routes: ["/dashboard/government/contracts", "/dashboard/government/external-counsel", "/ai/gov/procurement-reviewer"],
    contract: "GovernmentProfileContract",
    readiness: "UI Working",
  },
  {
    key: "compliance",
    sector: "government",
    label: "الامتثال والرقابة",
    description: "تقارير امتثال ومراجعات رقابية حسب نطاق الجهة.",
    routes: ["/dashboard/government/compliance", "/ai/gov/compliance-checker"],
    contract: "SectorEntitlement",
    readiness: "Backend-ready",
  },
  {
    key: "reports",
    sector: "government",
    label: "تقارير الجهة",
    description: "لوحات متابعة مؤسسية وقياسات تشغيلية بلا تصدير خادمي الآن.",
    routes: ["/dashboard/government/reports"],
    contract: "SectorAuditEvent",
    readiness: "Backend-ready",
  },
  {
    key: "contracts",
    sector: "government",
    label: "العقود الحكومية",
    description: "سجل عقود ومراجعة بنود ومخاطر للمستشارين الحكوميين.",
    routes: ["/dashboard/government/contracts", "/ai/gov/contract-reviewer"],
    contract: "GovernmentProfileContract",
    readiness: "UI Working",
  },
  {
    key: "sso",
    sector: "government",
    label: "SSO والتكاملات",
    description: "ظاهر كحالة pending فقط ولا يوجد تكامل هوية أو أنظمة حكومية.",
    routes: ["/dashboard/admin/sector-profiles"],
    contract: "GovernmentProfileContract",
    readiness: "Backend-ready",
  },
  {
    key: "ai_by_role",
    sector: "government",
    label: "AI حسب الدور",
    description: "القاضي لا يرى أدوات الضابط كصلاحية فعلية، والعكس.",
    routes: ["/dashboard/government", "/ai/gov/procedure-guide"],
    contract: "GovernmentRoleContract",
    readiness: "UI Working",
  },
  {
    key: "volunteers",
    sector: "ngo",
    label: "المتطوعون",
    description: "إضافة وتنظيم متطوعين وعقود تطوع كواجهة فقط.",
    routes: ["/dashboard/ngo/volunteers", "/dashboard/ngo/volunteers/new"],
    contract: "NgoProfileContract",
    readiness: "UI Working",
  },
  {
    key: "donations",
    sector: "ngo",
    label: "التبرعات والماليات",
    description: "عرض سجل تبرعات وتمويل برامج بدون Payment/Billing API.",
    routes: ["/dashboard/ngo/finance"],
    contract: "NgoProfileContract",
    readiness: "Backend-ready",
  },
  {
    key: "awqaf",
    sector: "ngo",
    label: "الأوقاف والأصول",
    description: "إدارة وقف أو أصل وربطه ببرنامج ومصدر دخل كحالة واجهة.",
    routes: ["/dashboard/ngo/awqaf"],
    contract: "NgoProfileContract",
    readiness: "Backend-ready",
  },
  {
    key: "board",
    sector: "ngo",
    label: "مجلس الإدارة",
    description: "أعضاء، اجتماعات، قرارات، ومصفوفة اعتماد داخلية.",
    routes: ["/dashboard/ngo/board"],
    contract: "NgoProfileContract",
    readiness: "Backend-ready",
  },
  {
    key: "programs",
    sector: "ngo",
    label: "البرامج والحملات",
    description: "برامج خيرية، حملات، مستفيدون، وتقارير أثر.",
    routes: ["/dashboard/ngo/programs"],
    contract: "NgoProfileContract",
    readiness: "Backend-ready",
  },
  {
    key: "compliance",
    sector: "ngo",
    label: "امتثال القطاع غير الربحي",
    description: "تقارير وحوكمة ومتطلبات المركز الوطني كواجهة متابعة.",
    routes: ["/dashboard/ngo/compliance"],
    contract: "NgoProfileContract",
    readiness: "UI Working",
  },
  {
    key: "reports",
    sector: "ngo",
    label: "التقارير الدورية",
    description: "تقارير ربع سنوية وسنوية بدون تصدير أو رفع فعلي.",
    routes: ["/dashboard/ngo/reports"],
    contract: "SectorAuditEvent",
    readiness: "Backend-ready",
  },
  {
    key: "ai",
    sector: "ngo",
    label: "AI للجمعيات والأوقاف",
    description: "عقود تطوع، مدقق حوكمة، محلل تبرعات، ومعد تقارير.",
    routes: ["/ai/ngo/volunteer-contract", "/ai/ngo/governance-checker", "/ai/ngo/donation-analyzer"],
    contract: "SectorEntitlement",
    readiness: "Backend-ready",
  },
  {
    key: "requirements",
    sector: "micro",
    label: "اشتراطات النشاط",
    description: "بلدية، زكاة، تأمينات، عمل، ورخص بمنطق بسيط لصاحب المنشأة.",
    routes: ["/dashboard/micro/requirements"],
    contract: "MicroProfileContract",
    readiness: "UI Working",
  },
  {
    key: "contracts",
    sector: "micro",
    label: "العقود",
    description: "قوالب ومراجعة عقود تشغيلية بسيطة.",
    routes: ["/dashboard/micro/contracts"],
    contract: "MicroProfileContract",
    readiness: "UI Working",
  },
  {
    key: "documents",
    sector: "micro",
    label: "المستندات والرخص",
    description: "ملفات ورخص وتصاريح بدون تخزين خادمي.",
    routes: ["/dashboard/micro/documents"],
    contract: "MicroProfileContract",
    readiness: "Backend-ready",
  },
  {
    key: "wallet",
    sector: "micro",
    label: "درع المنشأة/الاستخدام",
    description: "يعرض حدود استخدام داخل الخطة، وليس نقاط.",
    routes: ["/dashboard/micro/wallet"],
    contract: "SectorPlanContract",
    readiness: "Backend-ready",
  },
  {
    key: "requests",
    sector: "micro",
    label: "طلبات قانونية",
    description: "رفع طلب خدمة أو متابعة طلبات بسيطة.",
    routes: ["/dashboard/micro/requests"],
    contract: "MicroProfileContract",
    readiness: "UI Working",
  },
  {
    key: "marketplace",
    sector: "micro",
    label: "سوق المهنيين",
    description: "تصعيد لمهني أو محام عند الحاجة بدون مقاعد أو نقاط.",
    routes: ["/marketplace?tab=post-request"],
    contract: "SectorEntitlement",
    readiness: "Backend-ready",
  },
  {
    key: "cases",
    sector: "micro",
    label: "قضايا وتصعيد",
    description: "متابعة قضية أو تصعيد خدمة عند الحاجة، بدون تعقيد إداري.",
    routes: ["/dashboard/micro/cases"],
    contract: "MicroProfileContract",
    readiness: "UI Working",
  },
  {
    key: "ai",
    sector: "micro",
    label: "AI للمنشآت الصغيرة",
    description: "مساعد منشآت وفحص مستندات واستشارة قانونية ضمن حدود الخطة.",
    routes: ["/ai/micro", "/ai/consult", "/ai/analyze?source=labor"],
    contract: "SectorEntitlement",
    readiness: "Backend-ready",
  },
];

export const SECTOR_PROFILE_SCENARIOS: SectorProfileScenario[] = [
  {
    id: "gov-justice-mixed",
    sector: "government",
    title: "جهة عدلية متعددة الأدوار",
    description: "قضاء، نيابة، تحقيق، ومستشارون حكوميون مع فصل واضح بين أدوات كل دور.",
    recommendedServices: ["judiciary", "prosecution", "investigation", "counsel", "reports", "ai_by_role"],
    dashboardRoutes: ["/dashboard/government", "/dashboard/government/cases", "/dashboard/government/reports"],
    adminRoute: "/dashboard/admin/sector-profiles",
    readiness: "Backend-ready",
    backendBoundary: "RBAC وSSO والتقارير المؤسسية واجهة فقط حتى ربط Auth/RBAC/Reporting APIs.",
    betaNotes: "يجب إبقاء فصل أدوات القاضي/الضابط/المحقق ظاهرا قبل أي ربط إنتاجي.",
  },
  {
    id: "gov-police-investigation",
    sector: "government",
    title: "شرطة وتحقيقات وإجراءات",
    description: "محاضر ضبط، تقارير حوادث، نماذج قبض وتفتيش، وضمانات إجرائية.",
    recommendedServices: ["police", "investigation", "reports", "ai_by_role"],
    dashboardRoutes: ["/dashboard/government", "/ai/gov/detention-records", "/ai/gov/investigation-forms"],
    adminRoute: "/dashboard/admin/sector-profiles",
    readiness: "Backend-ready",
    backendBoundary: "كل الإجراء محلي/تعليمي في البيتا ولا يمثل سجلا رسميا أو تكاملا حكوميا.",
    betaNotes: "الأدوات الشرطية لا تظهر كصلاحية للقاضي أو المستشار الحكومي.",
  },
  {
    id: "gov-counsel-compliance",
    sector: "government",
    title: "إدارة قانونية حكومية وامتثال",
    description: "عقود حكومية، مشتريات، آراء قانونية، امتثال، ومستشارون خارجيون.",
    recommendedServices: ["counsel", "contracts", "compliance", "reports", "ai_by_role"],
    dashboardRoutes: ["/dashboard/government/contracts", "/dashboard/government/compliance"],
    adminRoute: "/dashboard/admin/sector-profiles",
    readiness: "Backend-ready",
    backendBoundary: "العقود والتقارير جاهزة واجهيا فقط، ولا يوجد تكامل مع أنظمة مشتريات أو وثائق.",
    betaNotes: "الحكومة B2G بعقد سنوي/عرض سعر، بلا نقاط وبلا أسعار ثابتة إجبارية.",
  },
  {
    id: "ngo-charity-impact",
    sector: "ngo",
    title: "جمعية خيرية ببرامج ومتطوعين",
    description: "تدير المتطوعين والتبرعات والبرامج والتقارير الدورية بواجهة بسيطة.",
    recommendedServices: ["volunteers", "donations", "programs", "compliance", "reports", "ai"],
    dashboardRoutes: ["/dashboard/ngo", "/dashboard/ngo/volunteers", "/dashboard/ngo/programs"],
    adminRoute: "/dashboard/admin/sector-profiles",
    readiness: "Backend-ready",
    backendBoundary: "لا يوجد Donation API أو Volunteer DB أو تقارير رفع فعلية في هذه المرحلة.",
    betaNotes: "كل زر إضافة/تصدير/اعتماد يظهر أنه محلي وجاهز للباك إند.",
  },
  {
    id: "ngo-waqf-institutional",
    sector: "ngo",
    title: "وقف/أوقاف بأصول ومجلس إدارة",
    description: "يفصل الوقف كنوع داخل NGO مع أصول وبرامج ومجلس وامتثال مؤسسي.",
    recommendedServices: ["awqaf", "board", "programs", "reports", "compliance", "ai"],
    dashboardRoutes: ["/dashboard/ngo/awqaf", "/dashboard/ngo/board", "/dashboard/ngo/reports"],
    adminRoute: "/dashboard/admin/sector-profiles",
    readiness: "Backend-ready",
    backendBoundary: "الأصول والوقف وسجلات المجلس واجهة فقط حتى وجود CMS/DB وتدقيق.",
    betaNotes: "الوقف لا يعامل كجمعية عادية فقط؛ تظهر إدارة الأصول والريع والقرارات.",
  },
  {
    id: "micro-simple-shield",
    sector: "micro",
    title: "منشأة صغيرة بدرع قانوني بسيط",
    description: "اشتراطات، رخص، عقود، مستندات، واستشارة دون مقاعد أو نقاط.",
    recommendedServices: ["requirements", "contracts", "documents", "wallet", "requests", "marketplace", "ai"],
    dashboardRoutes: ["/dashboard/micro", "/dashboard/micro/requirements", "/dashboard/micro/contracts"],
    adminRoute: "/dashboard/admin/sector-profiles",
    readiness: "Backend-ready",
    backendBoundary: "الخطة تعرض حدود استخدام فقط؛ لا نقاط ولا مقاعد ولا فوترة فعلية.",
    betaNotes: "الواجهة تبقى خفيفة وغير مزدحمة لصاحب المنشأة.",
  },
];

export const SECTOR_ADMIN_CONTROLS: SectorAdminControl[] = [
  {
    id: "government-profile",
    title: "اعتماد بروفيل الجهة الحكومية",
    sector: "government",
    route: "/dashboard/admin/sector-profiles",
    contract: "GovernmentProfileContract",
    readiness: "Backend-ready",
    note: "نوع الجهة، الأدوار، SSO pending، وخطة B2G كلها محلية حتى ربط عقود الجهة.",
  },
  {
    id: "government-rbac",
    title: "فصل أدوار القاضي والمحقق والضابط",
    sector: "government",
    route: "/dashboard/government",
    contract: "GovernmentRoleContract",
    readiness: "Backend-ready",
    note: "الواجهة تفصل الأدوات، لكن الإلزام الحقيقي يحتاج Auth/RBAC.",
  },
  {
    id: "ngo-profile",
    title: "بروفيل الجمعية/الوقف",
    sector: "ngo",
    route: "/dashboard/admin/sector-profiles",
    contract: "NgoProfileContract",
    readiness: "Backend-ready",
    note: "النوع والخطة والحدود والأوقاف والبرامج ومجلس الإدارة واجهة فقط.",
  },
  {
    id: "ngo-governance",
    title: "الحوكمة والتقارير غير الربحية",
    sector: "ngo",
    route: "/dashboard/ngo/compliance",
    contract: "SectorAuditEvent",
    readiness: "Risk",
    note: "التقارير وسجل المجلس يحتاجان Audit/Reporting APIs قبل الإنتاج.",
  },
  {
    id: "micro-profile",
    title: "درع المنشأة الصغيرة",
    sector: "micro",
    route: "/dashboard/admin/sector-profiles",
    contract: "MicroProfileContract",
    readiness: "Backend-ready",
    note: "النشاط والرخص والاشتراطات وخطة micro-shield محلية، بلا نقاط أو مقاعد.",
  },
  {
    id: "sector-plans",
    title: "نماذج التسعير الحالية للقطاعات",
    sector: "government",
    route: "/dashboard/admin/pricing",
    contract: "SectorPlanContract",
    readiness: "Backend-ready",
    note: "الحكومة B2G، والجمعيات سنوي، والمنشآت الصغيرة سنوي/مجاني؛ الحفظ الحقيقي ينتظر Billing/Entitlements APIs.",
  },
];

export function getSectorEntitlements(sector: SectorProfileType) {
  return SECTOR_ENTITLEMENTS.filter((item) => item.sector === sector);
}

export function getSectorPlanContracts(sector: SectorProfileType) {
  return SECTOR_PLAN_CONTRACTS.filter((item) => item.sector === sector);
}

export function resolveGovernmentScenario(entityType: GovernmentEntityType): SectorProfileScenario {
  if (entityType === "police" || entityType === "prosecution") {
    return SECTOR_PROFILE_SCENARIOS.find((scenario) => scenario.id === "gov-police-investigation")!;
  }
  if (entityType === "ministry" || entityType === "regulator" || entityType === "municipality" || entityType === "public_authority") {
    return SECTOR_PROFILE_SCENARIOS.find((scenario) => scenario.id === "gov-counsel-compliance")!;
  }
  return SECTOR_PROFILE_SCENARIOS.find((scenario) => scenario.id === "gov-justice-mixed")!;
}

export function resolveNgoScenario(organizationType: NgoOrganizationType): SectorProfileScenario {
  if (organizationType === "waqf") {
    return SECTOR_PROFILE_SCENARIOS.find((scenario) => scenario.id === "ngo-waqf-institutional")!;
  }
  return SECTOR_PROFILE_SCENARIOS.find((scenario) => scenario.id === "ngo-charity-impact")!;
}

export function resolveMicroScenario(_businessType: MicroBusinessType): SectorProfileScenario {
  return SECTOR_PROFILE_SCENARIOS.find((scenario) => scenario.id === "micro-simple-shield")!;
}

export function sectorServiceKeyToFeatureFlag(
  sector: SectorProfileType,
  serviceKey: GovernmentServiceKey | NgoServiceKey | MicroServiceKey,
) {
  const maps = {
    government: {
      judiciary: "hasJudiciary",
      prosecution: "hasProsecution",
      investigation: "hasInvestigation",
      police: "hasPolice",
      counsel: "hasCounsel",
      compliance: "hasCompliance",
      reports: "hasReports",
      contracts: "hasContracts",
      sso: "hasSso",
      ai_by_role: "hasAiByRole",
    },
    ngo: {
      volunteers: "hasVolunteers",
      donations: "hasDonations",
      awqaf: "hasAwqaf",
      board: "hasBoard",
      programs: "hasPrograms",
      compliance: "hasCompliance",
      reports: "hasReports",
      ai: "hasAi",
    },
    micro: {
      requirements: "hasRequirements",
      contracts: "hasContracts",
      documents: "hasDocuments",
      wallet: "hasWallet",
      requests: "hasRequests",
      marketplace: "hasMarketplace",
      cases: "hasCases",
      ai: "hasAi",
    },
  } as const;

  return maps[sector][serviceKey as keyof (typeof maps)[typeof sector]];
}
