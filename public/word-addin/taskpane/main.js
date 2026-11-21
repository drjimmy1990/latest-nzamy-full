/**
 * Task pane glue: Word adapter (src/office) + tested core (src/core).
 * Not unit-tested (needs a Word host). The token stays in memory only: the real
 * sign-in is OAuth + PKCE (src/core/auth.ts) once the platform has /oauth/*.
 */
import { WordClient } from "../src/core/client.js";
import { planDocumentReview, runFeature } from "../src/core/actions.js";
import { wordToolsVisible } from "../src/core/gate.js";
import { anchorComments, toParagraphRefs } from "../src/core/comments.js";
import { sha256Hex } from "../src/core/hash.js";
import { estimateSummary } from "../src/core/pricing.js";
import { addComment, readParagraphs, readSelection, replaceTracked, selectParagraph } from "../src/office/word.js";
                                                                         

                                                           

const $ =                        (id        ) => document.getElementById(id)     ;
let client                    = null;
let balance                    ;
// before_hash lets "apply" refuse if the paragraph moved or changed after the run.
let pending                                                             = null;
// Client comments already pushed into Word as comments in this session (memory only).
const inserted = new Set        ();

function say(t        , bad = false) {
  const m = $("msg");
  m.textContent = t;
  m.className = bad ? "err" : "mut";
}

async function connect() {
  try {
    const token = $                  ("token").value.trim();
    const c = new WordClient({ baseUrl: $                  ("base").value.trim(), getToken: () => token });
    const s = await c.standing();
    if (!wordToolsVisible(s)) {
      say("هذه الأدوات متاحة للمشرفين فقط في المرحلة الحالية.", true);
      return;
    }
    client = c;
    balance = s.points.balance;
    $("who").textContent = `الرصيد: ${s.points.balance} نقطة`;
    $("tools").hidden = false;
    $("clientSection").hidden = false;
    say("تم الاتصال.");
  } catch (e) {
    say(String((e         ).message), true);
  }
}

async function act(f         ) {
  if (!client) return;
  try {
    const sel = await readSelection();
    const paras = await readParagraphs();
    const text = sel.text.trim() || paras[sel.paragraphIndex] || "";
    const r = await runFeature(
      { client, caseId: $                  ("caseId").value.trim() || undefined },
      f,
      {
        text,
        paragraphIndex: sel.paragraphIndex,
        instruction: $                  ("instr").value || undefined,
        stage: f === "stage" ? ($                   ("stage").value                 ) : undefined,
        nonce: String(Date.now()),
      },
      (q) => confirm(`السعر ${q.price_points} نقطة من رصيدك (${q.balance}). متابعة؟`),
    );
    if (!r) {
      say("أُلغيت العملية قبل أي خصم.");
      return;
    }
    const out = (r.run.output ?? {})                           ;
    $("out").textContent = typeof out.text === "string" ? out.text : JSON.stringify(out, null, 2);
    pending = f === "rewrite" && typeof out.text === "string" && sel.paragraphIndex >= 0
      ? { index: sel.paragraphIndex, text: out.text, beforeHash: await sha256Hex(paras[sel.paragraphIndex] ?? "") }
      : null;
    balance = r.run.charged_points >= 0 && balance !== undefined ? balance - r.run.charged_points : balance;
    $("apply").hidden = !pending;
    say(r.logged ? "نُفّذ وسُجّل على ملف القضية." : r.logError ? `نُفّذ، لكن التسجيل فشل: ${r.logError}` : "نُفّذ.");
  } catch (e) {
    say(String((e         ).message), true);
  }
}

$("connect").addEventListener("click", connect);
document.querySelectorAll                   ("button[data-f]").forEach((b) =>
  b.addEventListener("click", () => act(b.dataset.f           )),
);
$("apply").addEventListener("click", async () => {
  if (!pending) return;
  try {
    const now = (await readParagraphs())[pending.index];
    if (now === undefined || (await sha256Hex(now)) !== pending.beforeHash) {
      say("تغيّرت الفقرة منذ التشغيل؛ لم يُطبَّق شيء. أعد التشغيل على النص الحالي.", true);
      $("apply").hidden = true; pending = null;
      return;
    }
    await replaceTracked(pending.index, pending.text);
    await addComment(pending.index, "أُعيدت صياغته بواسطة نظامي");
    say("طُبّق بتعقب التغييرات.");
    $("apply").hidden = true;
  } catch (e) {
    say(String((e         ).message), true);
  }
});
$("estimate").addEventListener("click", async () => {
  try {
    const paras = await readParagraphs();
    const plan = planDocumentReview(await toParagraphRefs(paras));
    $("estimateOut").textContent = estimateSummary(paras.length, plan, balance).text;
    say("");
  } catch (e) {
    say(String((e         ).message), true);
  }
});

/* ---- client comments. ASSUMPTION: GET /cases/{id}/documents/{docId}/comments is not in the API contract yet. ---- */
function row(parent             , text        , meta        , actions                        ) {
  const d = document.createElement("div"); d.className = "item";
  const b = document.createElement("div"); b.textContent = text; // textContent only: client text is untrusted
  const m = document.createElement("div"); m.className = "mut"; m.textContent = meta;
  d.append(b, m);
  for (const [label, fn] of actions) { const x = document.createElement("button"); x.className = "alt"; x.textContent = label; x.addEventListener("click", fn); d.append(x); }
  parent.append(d);
}

$("loadComments").addEventListener("click", async () => {
  if (!client) return;
  const caseId = $                  ("caseId").value.trim();
  const docId = $                  ("docId").value.trim();
  if (!caseId || !docId) { say("أدخل رقم القضية ورقم المستند أولًا.", true); return; }
  try {
    const { comments } = await client.clientComments(caseId, docId);
    const { anchored, orphans } = anchorComments(comments, await toParagraphRefs(await readParagraphs()));
    const box = $("comments"); box.replaceChildren();
    if (!anchored.length && !orphans.length) box.textContent = "لا توجد تعليقات مفتوحة.";
    const meta = (c               ) => `${c.author} · ${c.at}`;
    for (const a of anchored) {
      row(box, a.comment.body, `${meta(a.comment)} · الفقرة ${a.paragraph_index + 1}`, [
        ["انتقل للفقرة", () => selectParagraph(a.paragraph_index).catch((e) => say(String(e.message), true))],
        [inserted.has(a.comment.id) ? "أُدرج" : "أدرجه تعليقًا في Word", async () => {
          if (inserted.has(a.comment.id)) return;
          try { await addComment(a.paragraph_index, `${a.comment.author}: ${a.comment.body}`); inserted.add(a.comment.id); say("أُدرج التعليق."); }
          catch (e) { say(String((e         ).message), true); }
        }],
      ]);
    }
    if (orphans.length) {
      const h = document.createElement("h2"); h.textContent = `تعليقات يتيمة (${orphans.length})`; box.append(h);
      const p = document.createElement("p"); p.className = "mut";
      p.textContent = "فقراتها عُدّلت أو حُذفت بعد إرسال النسخة للعميل، فلم تُلصق بأي فقرة حتى لا تُنسب للمكان الخطأ. راجعها يدويًا.";
      box.append(p);
      for (const o of orphans) row(box, o.body, `${meta(o)} · كانت على الفقرة ${o.paragraph_index + 1}`, []);
    }
    say(`${anchored.length} مرتبطة، ${orphans.length} يتيمة.`);
  } catch (e) {
    say(String((e         ).message), true);
  }
});
