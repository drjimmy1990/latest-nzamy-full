/**
 * _preamble.test.ts — owner file 16 §5 (screenshot 05): a «الديباجة» section
 * with headings and an empty toggle over no prose is hidden; any real prose,
 * a toggle with a body included, keeps it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPreambleEmpty } from "./_preamble.ts";

test("screenshot 05: title, «ديباجة النظام», an empty «(سابق)» toggle and «المواد» — empty", () => {
  const shot = [
    "# نظام القضاء",
    "",
    "## ديباجة النظام",
    "",
    "<details><summary>📜 ديباجة نظام القضاء (سابق)</summary>",
    "",
    "</details>",
    "",
    "## المواد",
  ].join("\r\n");
  assert.equal(isPreambleEmpty(shot), true);
});

test("heading-only text, separators, quote marks and the placeholder are empty", () => {
  assert.equal(isPreambleEmpty(undefined), true);
  assert.equal(isPreambleEmpty(""), true);
  assert.equal(isPreambleEmpty("# نظام العمل\n\n---\n\n## ديباجة النظام\n>\n> \n"), true);
  assert.equal(isPreambleEmpty("<details>\n<summary>ديباجة</summary>\nلم تتوفر ديباجة\n</details>"), true);
  assert.equal(isPreambleEmpty("<details><summary>ديباجة</summary></details>"), true);
});

test("prose keeps the section — the decree text, or a toggle with a body", () => {
  assert.equal(isPreambleEmpty("# نظام القضاء\n\nبعون الله تعالى، نحن عبدالله بن عبدالعزيز آل سعود …"), false);
  assert.equal(
    isPreambleEmpty("# نظام القضاء\n<details><summary>ديباجة نظام القضاء (سابق)</summary>\n\n> بعون الله تعالى …\n</details>"),
    false,
    "a previous preamble with text is content",
  );
  assert.equal(isPreambleEmpty("لم تتوفر ديباجة، وصدرت اللائحة بقرار مجلس الوزراء رقم (١)"), false);
});

test("the reader's PreambleBlock uses this rule for both the law's and the regulation's preamble", () => {
  const src = readFileSync(new URL("./_article-components.tsx", import.meta.url), "utf8");
  assert.match(src, /import \{ isPreambleEmpty \} from "\.\/_preamble";/);
  assert.match(src, /text && !isPreambleEmpty\(text\)/);
  assert.match(src, /regulationPreamble && !isPreambleEmpty\(regulationPreamble\)/);
  assert.doesNotMatch(src, /function isPreambleEmpty/);
});

test("file 03 L4: the title and an empty «📜 ديباجة» toggle hide the section; a toggle with prose keeps it", () => {
  const empty = "# نظام المرور\n\n<details>\n<summary>📜 ديباجة نظام المرور</summary>\n\n</details>";
  assert.equal(isPreambleEmpty(empty), true);
  assert.equal(isPreambleEmpty("# نظام المرور"), true);
  const full = "# نظام المرور\n\n<details>\n<summary>📜 ديباجة نظام المرور</summary>\n\nبعون الله تعالى، نحن ملك المملكة العربية السعودية، بعد الاطلاع على المادة …\n</details>";
  assert.equal(isPreambleEmpty(full), false);
});
