"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, ArrowLeft, ArrowRight, ArrowUp } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import {
  LEGAL_IDENTITY_AR,
  LEGAL_IDENTITY_EN,
  NO_DIRECT_CONSULTATION_AR,
  NO_DIRECT_CONSULTATION_EN,
} from "@/constants/legalIdentity";
import {
  PLATFORM_PROTECTION_ANCHOR,
  TERMS_LAST_UPDATED_AR,
  TERMS_LAST_UPDATED_EN,
} from "@/lib/legal/termsVersion";

// ─── Sections ────────────────────────────────────────────────────────────────

const sections = {
  ar: [
    {
      id: "definitions",
      title: "١. التعريفات",
      content: [
        "**المنصة**: موقع نظامي الإلكتروني وتطبيقاته المتاحة على عناوين الإنترنت ومتاجر التطبيقات.",
        "**المستخدم**: كل شخص طبيعي أو اعتباري يسجل أو يستخدم المنصة، سواء كان طالب خدمة أو مقدم خدمة.",
        "**طالب الخدمة**: الفرد أو الجهة التي تطلب خدمات قانونية عبر المنصة.",
        "**مقدم الخدمة**: المحامي أو الموثق أو المعقب أو المحكم المرخص الذي يقدم خدماته عبر المنصة.",
        "**الأتعاب**: المقابل المالي المستحق عن الخدمة القانونية، ويُحصَّل عبر قنوات الدفع المعتمدة في المنصة وحدها.",
      ],
    },
    {
      id: "services",
      title: "٢. الخدمات المقدمة",
      content: [
        LEGAL_IDENTITY_AR,
        NO_DIRECT_CONSULTATION_AR,
        "تشمل الخدمات: الاستشارات القانونية، صياغة العقود ومراجعتها، التمثيل القضائي، التوثيق الرسمي، التحكيم التجاري، وتعقيب المعاملات.",
        "تتيح المنصة أدوات ذكاء اصطناعي للمساعدة في الصياغة والبحث والتحليل وتُعدّ هذه الأدوات داعمة لا بديلاً عن الاستشارة القانونية.",
        "تحتفظ المنصة بحق تغيير أو إضافة أو وقف أي خدمة مع إشعار مسبق.",
      ],
    },
    {
      id: "registration",
      title: "٣. شروط التسجيل",
      content: [
        "يجب أن يكون المستخدم بالغاً (١٨ سنة فأكثر) أو يحمل صفة نظامية مخولة للتعاقد.",
        "تُقدَّم بيانات التسجيل صحيحة وكاملة ومحدَّثة. تتحمل المسؤولية الكاملة عن أي بيانات مضللة.",
        "حساب واحد فقط لكل هوية وطنية أو سجل تجاري. يُحظر نقل الحساب أو مشاركته مع الغير.",
        "بالنسبة لمقدمي الخدمة: يشترط التحقق من الترخيص المهني الساري من الجهة المختصة (هيئة المحامين / وزارة العدل).",
      ],
    },
    {
      id: "user-rights",
      title: "٤. حقوق والتزامات المستخدم",
      content: [
        "للمستخدم الحق في الوصول لخدمات المنصة وفق الخطة المشترك بها وبما لا يتعارض مع هذه الشروط.",
        "يلتزم المستخدم بعدم استخدام المنصة في أغراض مخالفة للأنظمة السعودية أو للنظام العام والآداب.",
        "يُحظر محاولة اختراق المنصة أو التلاعب ببياناتها أو التواصل مع مقدمي الخدمة خارج المنصة لتجاوز نظام الأتعاب.",
        "يوافق المستخدم على تلقي إشعارات الخدمة عبر البريد الإلكتروني والرسائل النصية والإشعارات داخل المنصة.",
      ],
    },
    {
      id: "provider-obligations",
      title: "٥. حقوق والتزامات مقدم الخدمة",
      content: [
        "يلتزم مقدم الخدمة بتقديم خدماته بالمعايير المهنية اللازمة ووفق أحكام الأنظمة المهنية المعمول بها في المملكة.",
        "يُقرّ مقدم الخدمة بأن ترخيصه ساري المفعول ويلتزم بإخطار المنصة فور انتهائه أو تعليقه.",
        "يُحظر على مقدم الخدمة تحويل العملاء لجهات خارجية أو طلب دفع خارج قنوات الدفع المعتمدة في المنصة.",
        "تحتفظ المنصة بحق تعليق أو إنهاء حساب مقدم الخدمة في حال ثبوت مخالفة مهنية أو تلقي شكاوى موثقة.",
        "يحق لمقدم الخدمة الطعن في أي قرار تعليق وفق إجراءات الاعتراض المنصوص عليها في سياسة الدعم.",
      ],
    },
    {
      id: "financial",
      title: "٦. السياسة المالية",
      content: [
        "تُعرض الأتعاب كاملة وشاملة للضريبة قبل تأكيد الطلب، ولا يُستحق أي مبلغ لم يُعرض على طالب الخدمة قبل الدفع.",
        "تُحصَّل الأتعاب عبر قنوات الدفع المعتمدة في المنصة عند تأكيد الطلب، ويُصرف المستحق لمقدم الخدمة بعد إنجاز الخدمة أو المرحلة المتفق عليها منها.",
        "رسوم المنصة: تُقتطع عمولة الخدمة (تتراوح بين ٥٪ و١٥٪ حسب الخدمة) مباشرة من الأتعاب قبل تحويلها لمقدم الخدمة.",
        "**حق العدول**: لطالب الخدمة الحق في العدول عن الطلب واسترداد ما دفعه وفق المدد والحالات المقررة في نظام التجارة الإلكترونية ولائحته التنفيذية، ما لم يكن تنفيذ الخدمة قد بدأ بموافقته الصريحة أو كان المخرج مُعدّاً خصيصاً له.",
        "سياسة الاسترداد التفصيلية — بما فيها مدد المعالجة وحالات الاستثناء — مبيّنة في **سياسة الاسترداد** وتُعدّ جزءاً لا يتجزأ من هذه الشروط.",
        "يخضع نظام الفوترة لمتطلبات الفاتورة الإلكترونية لهيئة الزكاة والضريبة والجمارك (ZATCA المرحلة الثانية).",
      ],
    },
    {
      id: "ip",
      title: "٧. الملكية الفكرية",
      content: [
        "جميع عناصر المنصة (شعار، تصميم، كود، محتوى، نماذج) محمية بموجب نظام حماية حقوق المؤلف السعودي.",
        "لا يُمنح المستخدم سوى ترخيص محدود وغير حصري لاستخدام المنصة لأغراضه الشخصية أو المهنية.",
        "يُحظر نسخ أو توزيع أو إعادة بيع أي محتوى من المنصة دون إذن كتابي مسبق.",
      ],
    },
    {
      // R8 (owner package 2026-11-17, file 11 «ثالثاً أ»): the owner's text,
      // verbatim. Pending a specialist lawyer's review (file 11 «ثانياً»);
      // nothing here may claim otherwise.
      id: PLATFORM_PROTECTION_ANCHOR,
      title: "٨. حماية المنصة ومحتواها",
      content: [
        "١. أقرّ بأن المنصة وبرمجياتها وتطبيقاتها وقواعد بياناتها ومحتوى مكتبتها القانونية مصنفات محمية بموجب نظام حقوق المؤلف، وأن دخولي إليها واستخدامي لها مشروطان بما ورد في هذه الشروط وفق المادة (الثانية عشرة) من نظام حقوق المؤلف، وأن كل دخول أو استخدام على خلاف هذه الشروط دخول غير مصرح به.",
        "٢. وبناءً عليه ألتزم بما يأتي، وأعلم أن مخالفته تعرّضني للعقوبة المبيّنة أمام كل التزام:",
        "**التزام أول:** ألتزم بعدم استخراج محتوى المكتبة أو بياناتها بوسائل آلية، ومنها برمجيات الزحف والسحب والاستعلام الآلي المتتابع، أو نسخه بصورة منهجية. والعقوبة: إن تضمّن ذلك دخولاً غير مشروع فهو جريمة بموجب المادة (الثالثة) من نظام مكافحة جرائم المعلوماتية، عقوبتها السجن مدة لا تزيد على سنة وغرامة لا تزيد على خمسمائة ألف ريال، أو إحدى هاتين العقوبتين. وإن أفضى إلى إعاقة الخدمة أو تعطيلها فبموجب المادة (الخامسة) السجن مدة لا تزيد على أربع سنوات وغرامة لا تزيد على ثلاثة ملايين ريال، أو إحدى هاتين العقوبتين.",
        "**التزام ثانٍ:** ألتزم بعدم تجاوز الحصص أو حدود الاستخدام أو التحقق الأمني أو سياسة الأجهزة المصرح بها، وبعدم التحايل عليها. والعقوبة: التحايل على تدابير الحماية التقنية جريمة بموجب المادة (السابعة والأربعين) من نظام حقوق المؤلف، عقوبتها السجن مدة لا تزيد على سنة وغرامة لا تزيد على مليون ريال، أو إحدى هاتين العقوبتين.",
        "**التزام ثالث:** ألتزم بعدم فك المنصة أو تفكيكها، أو محاولة استخراج شيفرتها أو تعليمات تشغيل أدواتها أو نماذجها أو منطق عملها، بقصد استنساخها، ومنه توجيه أسئلة منهجية متتابعة أو استدراج المخرجات لاستنساخ سلوك النماذج، أو استخدام واجهات برمجية غير معلنة. والعقوبة: التحايل على تدابير الحماية لهذا الغرض يعاقب بالمادة (السابعة والأربعين) المذكورة، وللمنصة المطالبة بالتعويض وإيقاف النسخ.",
        "**التزام رابع:** ألتزم بعدم استخدام محتوى المنصة أو مخرجاتها لتدريب أي نموذج آلي أو بناء أي قاعدة بيانات، سواء كانت منافسة أم لا. والعقوبة: التعويض وفق ما يلي في البند (٣)، وما يترتب على الاستخراج الآلي من عقوبات في الالتزام الأول.",
        "**التزام خامس:** ألتزم بعدم مشاركة بيانات دخولي أو السماح لغيري باستخدام حسابي. والعقوبة: إيقاف الحساب، وتحمّلي مسؤولية ما يجريه الغير بحسابي.",
        "٣. **الجزاء المدني والتعاقدي:** عند المخالفة يحق للمنصة فوراً إيقاف حسابي أو إنهاء اشتراكي وفق سياسة الاسترداد المعتمدة، والمطالبة بالتعويض عن الأضرار بموجب المادة (العشرين بعد المائة) من نظام المعاملات المدنية والمادة (الحادية والخمسين) من نظام حقوق المؤلف ومنها الأرباح التي جناها المتعدي، والإبلاغ للجهات المختصة. وقد يشمل التعويض ما يلحق المنصة من أضرار ناتجة عن سحب بيانات شخصية لمشتركين وفق نظام حماية البيانات الشخصية.",
        "٤. **أحكام عامة في العقوبة:** يعاقب المحرّض والمساعد والمتفق على الجريمة وفق المادة (التاسعة) من نظام مكافحة جرائم المعلوماتية، ويعاقب الشروع بنصف الحد الأعلى وفق المادة (العاشرة) منه، وتضاعف العقوبة في العود وفق المادة (الثامنة والأربعين) من نظام حقوق المؤلف. والمبالغ والمدد المذكورة حدود قصوى، وتقدّر المحكمة المختصة العقوبة في كل حالة.",
        "٥. لا يخلّ هذا البند بما يجيزه النظام صراحةً لمالك النسخة المشروعة بموجب المادة (الثالثة والثلاثين) من نظام حقوق المؤلف.",
      ],
    },
    {
      id: "liability",
      title: "٩. تحديد المسؤولية",
      content: [
        "لا تتحمل المنصة المسؤولية عن جودة الخدمة القانونية المقدمة من مقدمي الخدمة المستقلين.",
        "الحد الأقصى لمسؤولية المنصة في جميع الأحوال لا يتجاوز قيمة الأتعاب المدفوعة فعلياً عن الخدمة محل النزاع، ولا يخلّ هذا الحد بأي حق مقرر لطالب الخدمة بموجب نظام التجارة الإلكترونية أو نظام حماية المستهلك.",
        "لا تتحمل المنصة المسؤولية عن أي خسائر غير مباشرة أو عرضية أو تبعية تنشأ عن استخدام المنصة.",
      ],
    },
    {
      id: "termination",
      title: "١٠. الإنهاء والتعليق",
      content: [
        "يحق للمستخدم إنهاء حسابه في أي وقت عبر صفحة الإعدادات. تُنجز المعاملات الجارية قبل الإنهاء.",
        "تحتفظ المنصة بحق تعليق أي حساب فوراً في حال ثبوت انتهاك لهذه الشروط أو الأنظمة النافذة.",
        "عند إنهاء الحساب، تُرد أي مبالغ مدفوعة عن خدمات لم تُنجَز، وفق سياسة الاسترداد.",
      ],
    },
    {
      id: "governing-law",
      title: "١١. القانون الحاكم والاختصاص القضائي",
      content: [
        "تخضع هذه الشروط لأحكام نظام التجارة الإلكترونية السعودي ونظام حماية المستهلك وسائر الأنظمة ذات الصلة.",
        "تختص المحاكم السعودية بالنظر في أي نزاع ينشأ عن هذه الشروط، وتكون مكة المكرمة هي دار القضاء المختصة.",
        "يُشجع على حل النزاعات وداً أو عبر نظام التحكيم الإلكتروني المتاح في المنصة قبل اللجوء للقضاء.",
        "ولطالب الخدمة في جميع الأحوال الحق في تقديم شكوى إلى وزارة التجارة عبر قنواتها المعتمدة، ولا يُعدّ اللجوء إلى المنصة أولاً شرطاً لذلك.",
      ],
    },
    {
      id: "amendments",
      title: "١٢. التعديلات",
      content: [
        "تحتفظ المنصة بحق تعديل هذه الشروط في أي وقت مع إشعار المستخدمين المسجلين بالبريد الإلكتروني قبل ١٤ يوماً من نفاذ التعديل.",
        "استمرار استخدام المنصة بعد إشعار التعديل يُعدّ قبولاً ضمنياً للشروط المعدّلة.",
      ],
    },
    {
      id: "contact-legal",
      title: "١٣. التواصل",
      content: [
        "لأي استفسارات قانونية أو شكاوى تتعلق بهذه الشروط، يُرجى التواصل عبر: legal@nezamy.sa",
        "العنوان: نظامي، مكة المكرمة — بطحاء قريش، المملكة العربية السعودية.",
      ],
    },
  ],
  en: [
    {
      id: "definitions",
      title: "1. Definitions",
      content: [
        "**Platform**: Nezamy's website and applications available on internet addresses and app stores.",
        "**User**: Any natural or legal person who registers or uses the platform, whether as a service seeker or provider.",
        "**Service Seeker**: The individual or entity requesting legal services through the platform.",
        "**Service Provider**: The licensed lawyer, notary, tracker, or arbitrator providing services through the platform.",
        "**Fees**: The amount payable for the legal service, collected exclusively through the platform's approved payment channels.",
      ],
    },
    {
      id: "services",
      title: "2. Services Provided",
      content: [
        LEGAL_IDENTITY_EN,
        NO_DIRECT_CONSULTATION_EN,
        "Services include: legal consultations, contract drafting and review, legal representation, official notarization, commercial arbitration, and transaction tracking.",
        "The platform provides AI tools for drafting, research, and analysis assistance — these are supportive tools, not a substitute for legal consultation.",
        "The platform reserves the right to change, add, or suspend any service with prior notice.",
      ],
    },
    {
      id: "registration",
      title: "3. Registration Requirements",
      content: [
        "Users must be adults (18+ years) or hold a legally authorized capacity to contract.",
        "Registration data must be accurate, complete, and up-to-date. You bear full responsibility for any misleading data.",
        "Only one account per national ID or commercial registration. Transferring or sharing accounts is prohibited.",
        "For service providers: Valid professional license verification from the competent authority (Bar Association / Ministry of Justice) is required.",
      ],
    },
    {
      id: "user-rights",
      title: "4. User Rights and Obligations",
      content: [
        "Users have the right to access platform services according to their subscription plan without conflicting with these terms.",
        "Users must not use the platform for purposes violating Saudi regulations or public order and morals.",
        "Attempting to breach the platform, manipulate its data, or communicate with service providers outside the platform to bypass the fee system is prohibited.",
        "Users agree to receive service notifications via email, SMS, and in-platform notifications.",
      ],
    },
    {
      id: "provider-obligations",
      title: "5. Service Provider Rights and Obligations",
      content: [
        "Service providers must deliver services to required professional standards and in accordance with applicable professional regulations in the Kingdom.",
        "Service providers acknowledge that their license is valid and must notify the platform immediately upon its expiry or suspension.",
        "Directing clients to external parties or requesting payment outside the platform's approved payment channels is prohibited.",
        "The platform reserves the right to suspend or terminate a service provider's account upon proven professional violation or documented complaints.",
        "Service providers have the right to appeal any suspension decision according to the support policy appeal procedures.",
      ],
    },
    {
      id: "financial",
      title: "6. Financial Policy",
      content: [
        "Fees are displayed in full and inclusive of tax before an order is confirmed; no amount not shown to the service seeker before payment becomes due.",
        "Fees are collected through the platform's approved payment channels upon order confirmation, and are paid out to the service provider after the service — or the agreed milestone of it — has been delivered.",
        "Platform fees: A service commission (ranging from 5% to 15% depending on the service) is deducted directly from fees before transfer to the service provider.",
        "**Right of withdrawal**: Service seekers may withdraw from an order and recover what they paid within the periods and cases set out in the Saudi E-Commerce Law and its Implementing Regulations, unless performance has begun with their express consent or the deliverable was prepared specifically for them.",
        "The detailed refund terms — including processing times and exclusions — are set out in the **Refund Policy**, which forms an integral part of these terms.",
        "The billing system complies with ZATCA e-invoicing requirements (Phase 2).",
      ],
    },
    {
      id: "ip",
      title: "7. Intellectual Property",
      content: [
        "All platform elements (logo, design, code, content, templates) are protected under Saudi copyright law.",
        "Users are granted only a limited, non-exclusive license to use the platform for personal or professional purposes.",
        "Copying, distributing, or reselling any content from the platform without prior written permission is prohibited.",
      ],
    },
    {
      // R8: an English rendering of the owner's Arabic clause above.
      id: PLATFORM_PROTECTION_ANCHOR,
      title: "8. Platform and Content Protection",
      content: [
        "1. I acknowledge that the platform, its software, applications, databases and the content of its legal library are works protected under the Copyright Law; that my access to and use of them are conditional on these terms pursuant to Article (12) of the Copyright Law; and that any access or use contrary to these terms is unauthorised access.",
        "2. Accordingly, I undertake the following, and I am aware that breaching it exposes me to the penalty stated against each undertaking:",
        "**First undertaking:** I will not extract the library's content or data by automated means — including crawling, scraping and sequential automated querying software — nor copy it systematically. Penalty: if this involves unlawful access, it is a crime under Article (3) of the Anti-Cyber Crime Law, punishable by imprisonment of up to one year and a fine of up to five hundred thousand riyals, or either penalty; and if it leads to obstructing or disabling the service, under Article (5), imprisonment of up to four years and a fine of up to three million riyals, or either penalty.",
        "**Second undertaking:** I will not exceed or circumvent the quotas, usage limits, security verification or the authorised-devices policy. Penalty: circumventing technical protection measures is a crime under Article (47) of the Copyright Law, punishable by imprisonment of up to one year and a fine of up to one million riyals, or either penalty.",
        "**Third undertaking:** I will not decompile or disassemble the platform, or attempt to extract its code, the operating instructions of its tools or models, or its working logic, in order to replicate it — including by systematic sequential questioning or eliciting outputs to replicate the models' behaviour, or by using undisclosed programming interfaces. Penalty: circumventing protection measures for this purpose is punishable under the said Article (47), and the platform may claim compensation and the cessation of copying.",
        "**Fourth undertaking:** I will not use the platform's content or outputs to train any automated model or to build any database, whether competing or not. Penalty: compensation as set out in clause (3) below, together with the penalties attached to automated extraction under the first undertaking.",
        "**Fifth undertaking:** I will not share my login details or allow anyone else to use my account. Penalty: suspension of the account, and my bearing responsibility for whatever others do through my account.",
        "3. **Civil and contractual sanctions:** upon a breach, the platform may immediately suspend my account or terminate my subscription in accordance with the approved refund policy, claim compensation for damages under Article (120) of the Civil Transactions Law and Article (51) of the Copyright Law — including the profits made by the infringer — and report to the competent authorities. Compensation may include damage the platform suffers from the scraping of subscribers' personal data under the Personal Data Protection Law.",
        "4. **General provisions on penalties:** the instigator, the accomplice and the party agreeing to the crime are punished under Article (9) of the Anti-Cyber Crime Law; an attempt is punished by half the maximum under Article (10) thereof; and the penalty is doubled for repeat offences under Article (48) of the Copyright Law. The amounts and periods stated are maximum limits, and the competent court determines the penalty in each case.",
        "5. This clause does not prejudice what the law expressly permits the owner of a lawful copy under Article (33) of the Copyright Law.",
      ],
    },
    {
      id: "liability",
      title: "9. Limitation of Liability",
      content: [
        "The platform bears no responsibility for the quality of legal services provided by independent service providers.",
        "The platform's maximum liability in all cases shall not exceed the fees actually paid for the disputed service. This cap does not limit any right afforded to the service seeker under the Saudi E-Commerce Law or the Consumer Protection Law.",
        "The platform bears no responsibility for any indirect, incidental, or consequential losses arising from use of the platform.",
      ],
    },
    {
      id: "termination",
      title: "10. Termination and Suspension",
      content: [
        "Users may terminate their account at any time through the settings page. Ongoing transactions are completed before termination.",
        "The platform reserves the right to immediately suspend any account upon proven violation of these terms or applicable regulations.",
        "Upon account termination, any amounts paid for services not delivered are refunded according to the refund policy.",
      ],
    },
    {
      id: "governing-law",
      title: "11. Governing Law and Jurisdiction",
      content: [
        "These terms are governed by Saudi e-commerce law, consumer protection regulations, and other relevant laws.",
        "Saudi courts have jurisdiction over any dispute arising from these terms, with Makkah as the competent court location.",
        "Amicable resolution or the platform's electronic arbitration system is encouraged before resorting to litigation.",
        "Service seekers retain, in all cases, the right to file a complaint with the Ministry of Commerce through its official channels; approaching the platform first is not a precondition.",
      ],
    },
    {
      id: "amendments",
      title: "12. Amendments",
      content: [
        "The platform reserves the right to amend these terms at any time with 14 days prior notice to registered users by email before the amendment takes effect.",
        "Continued use of the platform after the amendment notice is considered implicit acceptance of the amended terms.",
      ],
    },
    {
      id: "contact-legal",
      title: "13. Contact",
      content: [
        "For any legal inquiries or complaints related to these terms, please contact: legal@nezamy.sa",
        "Address: Nezamy, Makkah — Batha Quraish, Kingdom of Saudi Arabia.",
      ],
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TermsPage() {
  const { isRTL, isDark } = useTheme();
  const currentSections = isRTL ? sections.ar : sections.en;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Header ── */}
      <section className={`pt-32 pb-12 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-4xl px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/10">
              <FileText size={28} weight="bold" className="text-royal" />
            </div>
            <h1 className={`text-4xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "الشروط والأحكام" : "Terms & Conditions"}
            </h1>
            <p className={`mt-3 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? `آخر تحديث: ${TERMS_LAST_UPDATED_AR}` : `Last updated: ${TERMS_LAST_UPDATED_EN}`}
            </p>
            <div className={`mx-auto mt-4 max-w-lg rounded-xl border px-4 py-3 text-sm ${isDark ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {isRTL
                ? "باستخدام منصة نظامي، أنت توافق على هذه الشروط والأحكام. يُرجى قراءتها بعناية."
                : "By using the Nezamy platform, you agree to these Terms & Conditions. Please read them carefully."}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className={`py-16 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid gap-10 lg:grid-cols-4">

            {/* Table of contents */}
            <aside className="hidden lg:block">
              <div className={`sticky top-24 rounded-2xl border p-5 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                <p className={`mb-3 text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-slate-400"}`}>
                  {isRTL ? "المحتويات" : "Contents"}
                </p>
                <nav className="space-y-1">
                  {currentSections.map((sec) => (
                    <a key={sec.id} href={`#${sec.id}`} className={`block rounded-lg px-3 py-2 text-xs transition hover:bg-royal/10 hover:text-royal ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                      {sec.title}
                    </a>
                  ))}
                </nav>
                <a href="#top" className={`mt-4 flex items-center gap-1.5 text-xs ${isDark ? "text-gray-500 hover:text-gray-300" : "text-slate-400 hover:text-slate-600"}`}>
                  <ArrowUp size={12} />
                  {isRTL ? "أعلى الصفحة" : "Back to top"}
                </a>
              </div>
            </aside>

            {/* Sections */}
            <div className="space-y-10 lg:col-span-3">
              {currentSections.map((sec, i) => (
                <motion.section
                  key={sec.id}
                  id={sec.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03 }}
                >
                  <h2 className={`mb-4 text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{sec.title}</h2>
                  <ul className="space-y-3">
                    {sec.content.map((item, j) => (
                      <li key={j} className={`flex gap-3 text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-royal/50" />
                        <span dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(item) }} />
                      </li>
                    ))}
                  </ul>
                  {i < currentSections.length - 1 && <hr className={`mt-8 ${isDark ? "border-white/10" : "border-slate-200"}`} />}
                </motion.section>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={`py-12 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-3xl px-4 text-center">
          <p className={`${isDark ? "text-gray-400" : "text-slate-500"}`}>
            {isRTL ? "هل لديك سؤال حول شروط الاستخدام؟" : "Have a question about the Terms of Use?"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="rounded-xl bg-royal px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-royal/90">
              {isRTL ? "تواصل معنا" : "Contact Us"}
            </Link>
            <Link href="/privacy" className={`rounded-xl border px-6 py-2.5 text-sm font-semibold transition ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
              {isRTL ? "سياسة الخصوصية" : "Privacy Policy"}
            </Link>
            <Link href="/refund-policy" className={`rounded-xl border px-6 py-2.5 text-sm font-semibold transition ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
              {isRTL ? "سياسة الاسترجاع" : "Refund Policy"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
          </div>
  );
}
