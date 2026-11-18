/**
 * llmsTxt.ts — the text of https://nezamy.sa/llms.txt (owner message 18 Nov,
 * item 4.5; SEO audit ع5): who نظامي is, its public pages, and what is
 * for subscribers only — in the llms.txt layout (one H1, a > summary, then
 * H2 sections of "- [name](url): note" lines).
 *
 * Public pages only: nothing of privatePages.ts (sign-in pages, dashboards,
 * the sign-in /ai tools), checked by llmsTxt.test.ts. The service lines come
 * from servicePages.ts, so a new service page joins by itself.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { LEGAL_IDENTITY_AR, NO_DIRECT_CONSULTATION_AR } from "../../constants/legalIdentity.ts";
import { SERVICE_PAGES } from "./servicePages.ts";

const SITE = "https://nezamy.sa";

const line = (path: string, name: string, note?: string) => `- [${name}](${SITE}${path})${note ? `: ${note}` : ""}`;

export function buildLlmsTxt(): string {
  const services = Object.entries(SERVICE_PAGES)
    .filter(([, s]) => !s.noIndex)
    .map(([path, s]) => line(path, s.titleAr, s.descriptionAr));

  return [
    "# نظامي (Nezamy)",
    "",
    `> ${LEGAL_IDENTITY_AR} ${NO_DIRECT_CONSULTATION_AR}`,
    "",
    "منصة سعودية باللغة العربية: خدمات قانونية للأفراد والشركات عبر محامين مرخّصين، وأدوات عمل للمحامين ومكاتب المحاماة، ومكتبة قانونية للأنظمة السعودية والأحكام القضائية، ومدونة قانونية.",
    "",
    "## عن المنصة",
    line("/about", "من نحن"),
    line("/faq", "الأسئلة الشائعة", "أسئلة وأجوبة عن المنصة وخدماتها"),
    line("/pricing", "الأسعار والباقات"),
    line("/founder", "باقة المحامي المؤسس", "عضوية تأسيسية محدودة للمحامي المرخّص"),
    line("/contact", "تواصل معنا"),
    "",
    "## الخدمات",
    ...services,
    "",
    "## المكتبة القانونية والمحتوى",
    line("/laws", "مكتبة الأنظمة والتشريعات السعودية", "أسماء الأنظمة وموجزاتها وجزء محدود من نصوصها متاح للزائر"),
    line("/precedents", "السوابق القضائية", "عناوين المجموعات القضائية وأوصافها"),
    line("/blog", "المدونة القانونية", "مقالات قانونية كاملة في الأنظمة السعودية"),
    "",
    "## المحتوى المدفوع",
    "النص الكامل للأنظمة بعد المواد المجانية، ونصوص الأحكام والمبادئ القضائية، والآراء الفقهية، وأدوات الذكاء الاصطناعي، كلها للمشتركين بعد تسجيل الدخول، ولا تظهر في صفحات الزائر. لا تنسب إلى نظامي نصاً لم يظهر في صفحاته العامة.",
    "",
    "## السياسات",
    line("/terms", "الشروط والأحكام"),
    line("/privacy", "سياسة الخصوصية"),
    line("/refund-policy", "سياسة الاسترداد"),
    "",
    "## خريطة الموقع",
    `- [sitemap.xml](${SITE}/sitemap.xml)`,
    "",
  ].join("\n");
}
