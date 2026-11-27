import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Owner ٢٣٤ (27-Nov decisions): no consultation screen may say the fee is
// arranged directly with the lawyer; the fee is collected by Nezamy first.
const OWNER_TEXT =
  "يتواصل معك فريق نظامي لتأكيد الموعد وإرسال رابط السداد عبر منصة نظامي (تُحصَّل الأتعاب للمنصة أولاً ثم تُحوَّل للمحامي)، ولا يُدفع أي مبلغ مباشرة خارج منصة نظامي.";

const SCREENS = [
  "src/app/book/consultation/page.tsx",
  "src/app/dashboard/client/consultation/new/page.tsx",
];

for (const rel of SCREENS) {
  test(`٢٣٤: ${rel} carries the owner's payment text and no direct-coordination line`, () => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.ok(src.includes(OWNER_TEXT), "owner's exact text is present");
    assert.ok(!src.includes("التنسيق المباشر"), "no «التنسيق المباشر» line");
    assert.ok(!/arranged directly with the lawyer/i.test(src), "no English direct-coordination line");
    assert.ok(!src.includes("لا يُخصم أي مبلغ في المنصة"), "no «not charged on the platform» line");
  });
}

test("٢٣٤: the provider's pricing tab says the platform collects the consultation fee", () => {
  const src = readFileSync(join(process.cwd(), "src/app/dashboard/provider/profile/page.tsx"), "utf8");
  assert.ok(src.includes("تُحصَّل أتعاب الاستشارة للمنصة أولاً ثم تُحوَّل إليك"), "platform-collects line present");
  assert.ok(!src.includes("بينك وبين العميل مباشرة خارج المنصة"), "no direct-settlement line");
});
