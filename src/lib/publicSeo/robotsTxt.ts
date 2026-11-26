/**
 * robotsTxt.ts — the text of https://nezamy.sa/robots.txt (owner register 57
 * / 58 / 60, his draft `robots.txt.draft` of 19 Nov; batch l9).
 *
 * His legal notice and TDM reservation travel as comments (a robots.txt is a
 * notice, not enforcement: the view caps, rate limits, Turnstile and device
 * limit enforce). Three crawler tiers, by his decision 60:
 *   1. search and answer crawlers — the public pages, as every visitor;
 *   2. answer providers' TRAINING crawlers — the public pages too, but never
 *      the full text of a library document (owner default, register 57);
 *   3. bulk collectors — nothing at all.
 * Everyone else (`*`) gets the rules of tier 1 plus his /library/ line.
 *
 * His paths are fixed to this site (his draft says the programmer matches
 * them): there is no `/laws/<slug>/full`, `/account` or `/admin` here — a
 * document's full text reaches the browser only through `/api/` (closed to
 * every crawler), the admin is `/dashboard/admin` (under `/dashboard/`), and
 * the one HTML page that can carry a ruling's full text is
 * `/precedents/judgment/` (noindex; closed to tier 2, left open to tiers 1 and
 * `*` so they can read its noindex). `/library/` has no page; his line is kept.
 *
 * A named group does NOT inherit the `*` group, so EVERY group repeats the
 * private paths and the /_next/ rule (owner note ١٤ §٢ item ١٠: /_next/static
 * and /_next/image open, or Googlebot draws a blank page). His drafting notes
 * (decisions, the Amazonbot probation note) are not published.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { librarySitemapUrls } from "../library/libraryMetadata.ts";

const SITE = "https://nezamy.sa";

/** Search and answer crawlers (his tier 1, incl. Amazonbot on probation). */
export const SEARCH_AGENTS = [
  "Googlebot",
  "Bingbot",
  "Applebot",
  "OAI-SearchBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "ChatGPT-User",
  "Claude-User",
  "Perplexity-User",
  "Amazonbot",
] as const;

/** Answer providers' training crawlers (his tier 2). */
export const TRAINING_AGENTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"] as const;

/** Bulk collection / dataset building (his tier 3): the whole site is closed. */
export const BULK_AGENTS = [
  "CCBot",
  "Bytespider",
  "Diffbot",
  "ImagesiftBot",
  "Meta-ExternalAgent",
  "cohere-ai",
  "anthropic-ai",
] as const;

/** Open inside the closed /_next/: the build's files and the image optimizer. */
export const NEXT_ALLOW = ["/", "/_next/static/", "/_next/image"] as const;

/** Closed to every crawler: private pages, the API (where full texts travel), and the rest of /_next/. */
export const PRIVATE_DISALLOW = [
  "/dashboard/",
  "/api/",
  "/ai/settings",
  "/ai/vault",
  "/ai/share-history",
  // Client case tracking links (N3.6): private, token-keyed, noindex.
  "/track/",
  // Owner package 25-Nov (annex 09 GSC-05): pages that are no public content —
  // /review/ and /cases/ answer 404 (D-05 / D-30), the government and NGO
  // tools are for those accounts, and the two litigation studios are tools,
  // not pages to list. (His exception to the noindex-must-be-readable rule.)
  "/review/",
  "/cases/",
  "/ai/gov/",
  "/ai/ngo/",
  "/ai/debt-collection",
  "/ai/memo-studio",
  "/_next/",
  // NOT /checkout, /login, /register, /settings (his draft lists /checkout):
  // they carry noindex (privatePages.ts), which a crawler must be allowed to
  // read, or a linked URL can still be listed without its content.
] as const;

/** Tier 2 also never reads a library document's full text in HTML. */
export const FULL_TEXT_DISALLOW = ["/precedents/judgment/", "/library/"] as const;

const NOTICE = `# =====================================================================
# robots.txt — نظامي (nezamy.sa)
# =====================================================================
# إشعار قانوني
# يُمنع منعاً باتاً الهندسة العكسية لمنصة نظامي وأي سحب (scraping) لمحتواها
# أو بياناتها، ولا سيما عبر الروبوتات (bots)، ويعرّض المخالف للمساءلة القانونية.
# وينطبق الحظر نفسه على الأداة أو الوكيل الوسيط (الذكاء الاصطناعي) المستعمل
# في ذلك، مثل Claude وCodex وChatGPT وAntigravity وGemini وغيرها، والمسؤولية
# على من شغّلها أو أمرها بذلك ومزوّدها في الحدود التي يقررها النظام.
# أي محاولة التفاف على القيود التقنية ممنوعة منعاً باتاً.
#
# LEGAL NOTICE
# Reverse engineering of the Nezamy platform, and any scraping of its
# content or data, especially by bots, is strictly prohibited and exposes
# the violator to legal liability. The same prohibition applies to any
# intermediary tool or AI agent used to do it (e.g. Claude, Codex, ChatGPT,
# Antigravity, Gemini, etc.); responsibility lies with whoever operates or
# instructs it, and its provider to the extent the law decides.
# Any attempt to circumvent the technical restrictions is absolutely prohibited.
#
# الاستثناء الوحيد (يُفسَّر تفسيراً ضيقاً)
# يُسمح فقط للزواحف المسمّاة في هذا الملف، بعد التحقق من هويتها بنطاقات IP
# المنشورة رسمياً من مزوّدها أو reverse-DNS مع forward-confirm (لا بالـUser-Agent
# وحده)، بأمر واحد: فهرسة الصفحات العامة المسموحة في هذا الملف، وعرض عنوانها
# وملخصها العام ومقتطف قصير منها في نتائج البحث وإجابات الذكاء الاصطناعي،
# مع ذكر «نظامي» ورابط مباشر للصفحة المصدر.
# لا يشمل الاستثناء، ولا يجوز الاحتجاج به لتبرير، أيّاً مما يلي:
#  1) النص الكامل لأي مستند في المكتبة (نظام، حكم، مبدأ، قالب) أو أي محتوى
#     خلف تسجيل دخول أو اشتراك أو سقف مشاهدة، ولا واجهات الـAPI.
#  2) النسخ الجماعي أو المنهجي، أو رسم خريطة محتوى المكتبة أو بنيتها أو روابطها.
#  3) بناء قواعد بيانات أو مجموعات بيانات، أو تدريب النماذج أو تحسينها أو
#     تقييمها، إلا ما أُذن به صراحةً لزاحف مسمّى في هذا الملف وفي حدود مساراته.
#  4) إعادة النشر أو البيع أو الترخيص أو تقديم المحتوى لطرف ثالث، أو عرض ما
#     يغني القارئ عن زيارة الصفحة المصدر.
#  5) أي أداة أو وكيل ذكاء اصطناعي أو متصفح آلي يعمل بطلب مستخدم: يُعامل كزائر
#     عادي، ويخضع لكل السقوف، ولا يُعدّ زاحفاً مستثنى ولو صدر عن مزوّد موثَّق.
#  6) أي التفاف على القيود التقنية (تزوير الهوية، تدوير العناوين، تعدد
#     الحسابات، تجاوز التحقق أو السقوف).
# وصف النشاط بأنه «SEO» أو «GEO» أو «بحث» أو «إجابة لمستخدم» لا يدخله في
# الاستثناء. نظامي وحدها تقرر من يشمله الاستثناء، وتتحقق منه، ولها تعديل
# القائمة أو سحب الاستثناء في أي وقت دون إشعار. وعند الشك يُفسَّر النص لصالح
# المنع. طلبات الترخيص: support@nezamy.sa
#
# THE ONLY EXCEPTION (construed narrowly)
# Only the crawlers named in this file, once verified by their operator's
# officially published IP ranges or forward-confirmed reverse DNS (never by
# User-Agent alone), may do one thing: index the public pages allowed in this
# file and display their title, public summary and a short excerpt in search
# results and AI answers, with attribution to "Nezamy" and a direct link to
# the source page.
# The exception does not cover, and may not be invoked to justify:
#  1) the full text of any library document (law, ruling, principle, template),
#     any content behind login, subscription or a view cap, or any API;
#  2) bulk or systematic copying, or mapping the library's content, structure
#     or link graph;
#  3) building databases or datasets, or training, fine-tuning or evaluating
#     models, except where expressly permitted to a crawler named in this file
#     and only within its allowed paths;
#  4) republishing, selling, licensing or supplying the content to third
#     parties, or output that substitutes for visiting the source page;
#  5) any AI tool, agent or automated browser acting on a user's request: it
#     is treated as an ordinary visitor, subject to all caps, and is not an
#     exempt crawler even when it comes from a verified operator;
#  6) any circumvention of technical restrictions (identity spoofing, IP
#     rotation, multiple accounts, bypassing verification or caps).
# Describing an activity as "SEO", "GEO", "search" or "answering a user" does
# not bring it within the exception. Nezamy alone decides who qualifies,
# verifies it, and may change the list or withdraw the exception at any time
# without notice. In case of doubt, the prohibition prevails.
# Licensing requests: support@nezamy.sa
#
# TDM / AI-USE RESERVATION (EU DSM Directive Art. 4 and equivalent laws):
# All rights reserved. Text and data mining, and use of this site's content
# for training or fine-tuning AI/ML models, are NOT permitted without prior
# written permission from Nezamy. حقوق محفوظة: لا يجوز التنقيب في النصوص
# والبيانات ولا استعمال محتوى الموقع في تدريب نماذج الذكاء الاصطناعي دون
# إذن كتابي مسبق من نظامي.
#
# robots.txt إشعار وليس إنفاذاً؛ الإنفاذ الفعلي: سقف المشاهدة، وحد الطلبات،
# والتحقق البشري، وحد الأجهزة، والتسجيل.
# robots.txt is a notice, not enforcement. Enforcement = view cap, rate limit,
# human verification, device limit and logging.
# ---------------------------------------------------------------------`;

function group(title: string, agents: readonly string[], allow: readonly string[], disallow: readonly string[]): string {
  return [
    `# ${title}`,
    ...agents.map((a) => `User-agent: ${a}`),
    ...allow.map((p) => `Allow: ${p}`),
    ...disallow.map((p) => `Disallow: ${p}`),
  ].join("\n");
}

export function buildRobotsTxt(): string {
  return [
    NOTICE,
    "",
    group("1) Search and answers: public pages only", SEARCH_AGENTS, NEXT_ALLOW, PRIVATE_DISALLOW),
    "",
    group("2) Answer providers' training: public pages only, no library full text, no API", TRAINING_AGENTS, NEXT_ALLOW, [
      ...PRIVATE_DISALLOW,
      ...FULL_TEXT_DISALLOW,
    ]),
    "",
    group("3) Bulk collection and dataset building: the whole site is closed", BULK_AGENTS, [], ["/"]),
    "",
    group("4) Everyone else", ["*"], NEXT_ALLOW, [...PRIVATE_DISALLOW, "/library/"]),
    "",
    `Host: ${SITE}`,
    // The site map, then the library's per-type document maps (Next emits no
    // sitemap index, so each one is listed here).
    ...[`${SITE}/sitemap.xml`, ...librarySitemapUrls()].map((u) => `Sitemap: ${u}`),
    "",
  ].join("\n");
}
