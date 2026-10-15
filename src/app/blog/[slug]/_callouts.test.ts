import test from "node:test";
import assert from "node:assert/strict";
import { classifyBlockquote, CALLOUT_CLASSES, CALLOUT_LABELS } from "./_callouts.ts";

test("GitHub alerts: IMPORTANT/NOTE are royal-green notes, WARNING amber, CAUTION red", () => {
  assert.deepEqual(classifyBlockquote(["[!IMPORTANT]", "**نص** مهم"]), { kind: "important", label: "هام", body: ["**نص** مهم"] });
  assert.equal(classifyBlockquote(["[!NOTE]", "x"])?.kind, "note");
  assert.equal(classifyBlockquote(["[!TIP]", "x"])?.kind, "tip");
  assert.equal(classifyBlockquote(["[!WARNING]", "x"])?.kind, "warning");
  assert.equal(classifyBlockquote(["[!CAUTION]", "x"])?.kind, "critical");
  assert.match(CALLOUT_CLASSES.important, /royal/);
  assert.doesNotMatch(CALLOUT_CLASSES.important, /red-/, "IMPORTANT is no longer red");
  assert.match(CALLOUT_CLASSES.warning, /amber/);
  assert.match(CALLOUT_CLASSES.critical, /red/);
});

test("emoji callouts: alone on the first line, with or without U+FE0F, CR tolerated", () => {
  assert.deepEqual(classifyBlockquote(["⚠️ \r", "**مخاطر التوقيع:** نص"]), {
    kind: "warning", label: "تنبيه", body: ["**مخاطر التوقيع:** نص"],
  });
  assert.equal(classifyBlockquote(["⚠ ", "x"])?.kind, "warning");
  assert.equal(classifyBlockquote(["🚫", "x"])?.kind, "critical");
  assert.equal(classifyBlockquote(["📢 ", "x"])?.kind, "important");
  assert.equal(classifyBlockquote(["📌", "x"])?.kind, "note");
  assert.equal(classifyBlockquote(["💡 ", "x"])?.kind, "tip");
  assert.deepEqual(classifyBlockquote(["💡 **وثّق العقد:** نص"]), { kind: "tip", label: "نصيحة", body: ["**وثّق العقد:** نص"] });
});

test("⚖️ «مرجعية المقال» gets the legal card without a second heading", () => {
  const c = classifyBlockquote(["⚖️ **مرجعية المقال:** هذا المقال مدعوم فقهياً بـ **المغني**."]);
  assert.equal(c?.kind, "legal");
  assert.equal(c?.label, "");
  assert.deepEqual(c?.body, ["**مرجعية المقال:** هذا المقال مدعوم فقهياً بـ **المغني**."]);
});

test("a statute quote becomes «السند النظامي», its text kept verbatim", () => {
  const text = '"لا يجوز التنفيذ الجبري إلا بسندٍ تنفيذيٍّ لحقٍّ محدد المقدار حالِّ الأداء..."';
  assert.deepEqual(classifyBlockquote([`*${text}*`]), { kind: "legal", label: CALLOUT_LABELS.legal, body: [text] });
  assert.deepEqual(classifyBlockquote([text]), { kind: "legal", label: "السند النظامي", body: [text] });
  // multi-line, one italic pair around the whole quote
  assert.deepEqual(classifyBlockquote(['*"1 - الأحكام،', '2 - أحكام المحكمين."*']), {
    kind: "legal", label: "السند النظامي", body: ['"1 - الأحكام،', '2 - أحكام المحكمين."'],
  });
  assert.equal(classifyBlockquote(["«يلتزم المودع لديه …»"])?.kind, "legal");
  // the quote and its italic pair close after the block (a list follows)
  assert.deepEqual(classifyBlockquote(['*"يجوز للخصم أن يطلب في الحالات الآتية:\r']), {
    kind: "legal", label: "السند النظامي", body: ['"يجوز للخصم أن يطلب في الحالات الآتية:'],
  });
});

test("anything else stays a plain quote — promos included", () => {
  assert.equal(classifyBlockquote(["في **شركة [نظامي (nezamy.sa)](https://nezamy.sa) للمحاماة** نساعدك"]), null);
  assert.equal(classifyBlockquote(['"في شركة نظامي للمحاماة نساعدك"']), null);
  assert.equal(classifyBlockquote(["**هل تحتاج شركتك لصياغة اتفاقية؟**", "تواصل معنا"]), null);
  assert.equal(classifyBlockquote(["*يلتزم المودع لديه بأن يبذل العناية*"]), null);
  assert.equal(classifyBlockquote([]), null);
});
