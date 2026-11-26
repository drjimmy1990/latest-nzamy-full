import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { explainGreeting, explainSubtitle } from "./_explain-greeting.ts";

test("N02-5: an untitled article is named by its law — never an empty pair of quotes", () => {
  const text = explainGreeting({ num: "المادة الثمانون", articleTitle: "", lawName: "نظام العمل", isRTL: true });
  assert.match(text, /أشرح لك المادة الثمانون من «نظام العمل» أم لديك/);
  assert.doesNotMatch(text, /""|«»/);
});

test("a titled article keeps its title", () => {
  const text = explainGreeting({ num: "المادة الأولى", articleTitle: " التعريفات ", lawName: "نظام العمل", isRTL: true });
  assert.match(text, /المادة الأولى المتضمنة لـ «التعريفات» أم/);
});

test("no title and no law name → the article number alone", () => {
  const text = explainGreeting({ num: "المادة ٥", articleTitle: null, lawName: undefined, isRTL: true });
  assert.match(text, /أشرح لك المادة ٥ أم لديك/);
  assert.doesNotMatch(text, /""|«»|المتضمنة/);
  const en = explainGreeting({ num: "Article 5", articleTitle: "", lawName: "", isRTL: false });
  assert.match(en, /explanation of Article 5, or/);
  assert.doesNotMatch(en, /\(\)/);
});

test("the subtitle falls back the same way", () => {
  assert.equal(explainSubtitle("", "نظام العمل"), "نظام العمل");
  assert.equal(explainSubtitle("التعريفات", "نظام العمل"), "التعريفات");
  assert.equal(explainSubtitle("  ", null), "");
});

test("the modal sends the explanation request and the reader passes the law's title", () => {
  const modal = readFileSync(join(import.meta.dirname, "_ai-components.tsx"), "utf8");
  // Batch l16 (B-16 / E-20): the window sends the explanation request itself, no greeting.
  assert.match(modal, /void handleSend\(explainRequest\(\{ num: article\.num, articleTitle: article\.title, lawName, isRTL \}\)\);/);
  assert.doesNotMatch(modal, /explainGreeting\(/);
  assert.doesNotMatch(modal, /المتضمنة لـ "\$\{article\.title\}"/);
  const page = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");
  assert.match(page, /<ArticleExplainModal\s+article=\{explainArticle\}\s+lawName=\{law\?\.title\}/);
});

test("B-17 (batch l16): a bare ordinal or number reads «المادة …»; a unit, a position or a heading is kept", async () => {
  const { spokenArticle } = await import("./_explain-greeting.ts");
  assert.equal(spokenArticle("الأولى"), "المادة الأولى");
  assert.equal(spokenArticle("الحادية عشرة"), "المادة الحادية عشرة");
  assert.equal(spokenArticle("الثمانون"), "المادة الثمانون");
  assert.equal(spokenArticle("٥"), "المادة ٥");
  assert.equal(spokenArticle("المادة الأولى"), "المادة الأولى");
  assert.equal(spokenArticle("البند الثالث"), "البند الثالث");
  assert.equal(spokenArticle("(3)"), "(3)");
  assert.equal(spokenArticle("التعريفات"), "التعريفات");
  assert.equal(spokenArticle(""), "المادة");
  assert.match(explainGreeting({ num: "الأولى", articleTitle: "", lawName: "نظام القضاء", isRTL: true }), /أشرح لك المادة الأولى من «نظام القضاء»/);
});

test("B-16 / E-20 (batch l16): the request «اشرح لي» sends by itself names the article and its law", async () => {
  const { explainRequest } = await import("./_explain-greeting.ts");
  assert.equal(
    explainRequest({ num: "الأولى", articleTitle: "", lawName: "نظام القضاء", isRTL: true }),
    "اشرح لي المادة الأولى من «نظام القضاء» بلغة واضحة، مع بيان ما يترتب عليها.",
  );
  assert.match(explainRequest({ num: "المادة ٧٧", articleTitle: "إنهاء العقد", lawName: "نظام العمل", isRTL: true }), /^اشرح لي المادة ٧٧ المتضمنة لـ «إنهاء العقد» من «نظام العمل» /);
  assert.doesNotMatch(explainRequest({ num: "٥", articleTitle: null, lawName: null, isRTL: true }), /«»|من «/);
  assert.match(explainRequest({ num: "Article 5", lawName: "Labour Law", isRTL: false }), /^Explain Article 5 of Labour Law/);
});

test("B-16 / E-20 (batch l16): sent once per opening, never for a guest or a switched-off tool, one question at a time", () => {
  const modal = readFileSync(join(import.meta.dirname, "_ai-components.tsx"), "utf8").replace(/\r\n/g, "\n");
  const start = modal.indexOf("export function ArticleExplainModal");
  const body = modal.slice(start, modal.indexOf("// ─── Community Question Modal", start));
  const effect = body.slice(body.indexOf("useEffect(() => {\n    if (autoSentRef.current"), body.indexOf("}, [user.loading, user.isLoggedIn, usable]);"));
  assert.ok(effect.length > 0, "the auto-send effect is found");
  // The guard is set at the moment it fires — every branch, before anything is sent.
  assert.match(effect, /if \(autoSentRef\.current \|\| user\.loading\) return;/);
  assert.match(effect, /if \(!user\.isLoggedIn\) \{\n\s*autoSentRef\.current = true;\n\s*const refusal = libraryAiRefusal\(401,/);
  assert.match(effect, /if \(usable === null\) return;\n\s*autoSentRef\.current = true;\n\s*if \(!usable\) \{\n\s*setMsgs\(\[\{ role: "ai", text: LIBRARY_AI_SOON \}\]\);\n\s*return;/);
  assert.equal((effect.match(/handleSend\(/g) ?? []).length, 1);
  // A guest's window never asks the server (the gate mounts only when signed in).
  assert.match(body, /\{signedIn && <ExplainToolGate onAnswer=\{onGate\} \/>\}/);
  assert.match(body, /const signedIn = !user\.loading && user\.isLoggedIn;/);
  // In-flight guard: a second Enter while a question runs is not a second charge.
  assert.match(body, /if \(!query \|\| sendingRef\.current\) return;\n\s*sendingRef\.current = true;/);
  assert.match(body, /finally \{\n\s*sendingRef\.current = false;/);
  // No greeting any more; the price is in the window's header.
  assert.doesNotMatch(body, /explainGreeting/);
  assert.match(body, /aiToolPriceText\(EXPLAIN_TOOL, "ar"\)\} لكل سؤال/);
  // …and on the button that opens it.
  const reader = readFileSync(join(import.meta.dirname, "_article-components.tsx"), "utf8");
  assert.match(reader, /aiToolPriceText\("library-assistant", isRTL \? "ar" : "en"\)/);
  assert.match(reader, /\{isRTL \? "اشرح لي" : "Explain"\}\s*<span className="font-semibold opacity-80">· \{explainPrice\}<\/span>/);
});
