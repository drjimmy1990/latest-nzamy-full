"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, DownloadSimple, PencilSimple, PaperPlaneTilt,
  WarningCircle, UserCircle, Buildings, Stamp, ArrowRight,
  NotePencil, Printer, X, Warning, FileText,
  Money, HandPalm, Prohibit, IdentificationCard, Megaphone, Scales,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, createWorkflowRequest } from "@/lib/clientWorkflowRepository";
import { toArabicDigits } from "@/lib/services/hijri";
// The office's one grouping of letters by intent (owner item ١٧). Imported,
// never re-declared — see CLIENT_LETTER_TYPES below for why the taxonomy is
// shared while the tiles are not.
import { LETTER_FAMILIES } from "@/app/ai/legal-opinion/_constants";
import {
  buildLetterPrintDocument,
  buildLetterWordDocument,
  composeLetterBlocks,
  dayCountAr,
  isLetterPrintDocumentReady,
  letterDocumentTitle,
  letterFileName,
  letterPlainText,
  type LetterBlock,
} from "@/lib/services/letterExport";

/**
 * «صائغ الخطابات» — the client letter composer.
 *
 * WHAT THIS FILE USED TO CLAIM, AND WHAT IT ACTUALLY DID
 *  1. «تنزيل PDF» / «تنزيل Word» had no onClick at all. The letter could not
 *     leave the screen. Both are now real: Word is a `application/msword` HTML
 *     document downloaded as a Blob, and the PDF path is the browser's own
 *     print pipeline — so the button says «طباعة / حفظ PDF», which is what it
 *     does. (jsPDF is installed and is the wrong tool here: Latin-only fonts,
 *     no bidi, no Arabic letter joining. See letterExport.ts.)
 *  2. «اصنع الخطاب بالذكاء الاصطناعي» slept 1800ms and then filled a hardcoded
 *     template. No model was ever called. The sleep was the only thing that
 *     made it look like work, so the sleep is gone and the button now says what
 *     it does: «كوّن مسودة الخطاب». Owner ruling س٣ (26 August) is the decided
 *     answer for this whole class of tool — «نماذج وقوالب استرشادية فورية» plus
 *     a human-review button — and AdvisoryTemplateNotice says exactly that at
 *     the top of the page.
 *  3. «مساعدة AI» slept 1400ms and then appended the client's own instruction
 *     to the paragraph as «[ملاحظة AI: …]». It pasted the REQUEST into the
 *     letter. Deleting the control was one honest option; keeping it as a real
 *     one is better, because the instruction is genuinely useful — to a human.
 *     A note is now an editorial note: it is shown in its own strip, it is
 *     labelled as not being part of the letter, both export builders take only
 *     `blocks` so it CANNOT reach the document, and it travels to the office in
 *     `metadata.intake.notes` when the client asks for a review. The one thing
 *     it no longer does is pretend to rewrite the paragraph.
 *
 * WHY THE REVIEW BUTTON IS THE PRIMARY ACTION
 * A letter the client downloads is a template nobody has checked. The office is
 * the sole provider (BETA_MONOPOLY_MODE), so the honest escape hatch is a real
 * `service_request` carrying the composed letter — not a link to a blank form
 * that would discard it. `receiver: "ai_workspace"` is load-bearing: the admin
 * fulfilment queue hard-filters on that literal
 * (api/v1/admin/service-orders/route.ts:54) and any other value files the order
 * where nobody sees it.
 */

// ─── Client-specific letter types (consumer language, no legal jargon) ──────────
/**
 * `family` is a LETTER_FAMILIES id — owner item ١٧'s taxonomy, imported above
 * from the AI letter drafter's constants rather than restated here. The office
 * has ONE grouping of letters by intent; a second list living in this file
 * would drift from it the first time a family was renamed, and the client and
 * the lawyer would then be shown two different maps of the same catalogue.
 *
 * WHY A FIELD AND NOT `letterFamilyOf()`. The families' `members` arrays hold
 * LETTER_TYPES ids («warning», «demand», …) and these six ids are not those:
 * this picker speaks the client's language («أطالب بأموال»), the drafter
 * speaks the document's («مطالبة مالية وسداد مستحقات»), and the two lists are
 * deliberately different lengths. What is shared is the classification, so
 * that is what is imported — the family LABELS and their ORDER — while each
 * client tile declares which family it sits in.
 *
 * The ids are untouched and stay untouched. `letterType` selects the template
 * and resolves `selectedType.label`, which is what travels to the office in
 * `metadata.intake.letterType` when a review is requested; renaming one to
 * tidy a family would re-label the historic orders that carry it.
 */
const CLIENT_LETTER_TYPES: {
  id: string; icon: Icon; label: string; sublabel: string; hint: string; family: string;
}[] = [
  {
    id: "demand_money",
    icon: Money,
    label: "أطالب بأموال",
    sublabel: "مستحقات · إيجار · تعويض · دَيْن",
    hint: "مثال: إيجار متأخر، راتب لم يُدفع، ضمان لم يُعد",
    family: "claim",
  },
  {
    id: "stop_harm",
    icon: HandPalm,
    label: "أطلب وقف ضرر",
    sublabel: "ضوضاء · بناء مخالف · تعدٍّ على ملكي",
    hint: "مثال: جار يبني على حدود ملكي، ضجيج ليلي متكرر",
    // «اقتضاء حق» — the drafter's counterpart is «إنذار قانوني» (`warning`),
    // which sits in this same family.
    family: "claim",
  },
  {
    id: "cancel_contract",
    icon: Prohibit,
    label: "أفسخ عقداً",
    sublabel: "عقد إيجار · خدمة · اشتراك",
    hint: "مثال: منشأة لم تُسلِّم الخدمة، متجر لم يُرجع المنتج",
    family: "terminate",
  },
  {
    id: "get_document",
    icon: IdentificationCard,
    label: "أطلب مستنداً",
    sublabel: "صحة وعافية · عمل · تعليم · عقار",
    hint: "مثال: شهادة راتب، خطاب بنك، وثيقة ملكية",
    family: "official",
  },
  {
    id: "complain_entity",
    icon: Megaphone,
    label: "أشكو جهة أو شركة",
    sublabel: "بنك · شركة · خدمة · موظف",
    hint: "مثال: بنك أخطأ في حسابي، شركة اتصالات فصلت خطي",
    family: "official",
  },
  {
    id: "object_decision",
    icon: Scales,
    label: "أعترض على قرار",
    sublabel: "غرامة · مخالفة · رفض طلب",
    hint: "مثال: مخالفة بلدية غير مستحقة، رفض مطالبة تأمينية",
    // The drafter's «تظلم / اعتراض إداري» (`objection`) is in `official` too,
    // so a client and their lawyer classify this the same way.
    family: "official",
  },
];

/**
 * The six tiles laid out under the shared family headings — owner item ١٧
 * applied to the client's copy of the picker, which was still one flat grid.
 *
 * Two rules, both of which exist so grouping cannot lose a tile (the one real
 * risk of grouping, and what _constants.test.ts guards on the drafter's side):
 *
 *  1. A family with no client tile is dropped rather than rendered as an empty
 *     heading. «تسوية ودية» and «توكيلات وإقرارات وإفراجات» have no consumer
 *     equivalent today; a heading over nothing reads as a section that failed
 *     to load.
 *  2. A tile whose `family` matches no family — the state a typo or a renamed
 *     family id would produce — is not dropped. It lands in a trailing
 *     «أنواع أخرى» group, so a mistake shows up as a mislabelled tile instead
 *     of a letter type the client can no longer reach.
 *
 * Computed at module scope: LETTER_FAMILIES and CLIENT_LETTER_TYPES are both
 * constants, so this is the same array on every render.
 */
const CLIENT_LETTER_GROUPS: { id: string; label: string; tiles: typeof CLIENT_LETTER_TYPES }[] = (() => {
  const groups = LETTER_FAMILIES
    .map((family) => ({
      id: family.id,
      label: family.label,
      tiles: CLIENT_LETTER_TYPES.filter((lt) => lt.family === family.id),
    }))
    .filter((group) => group.tiles.length > 0);

  const placed = new Set(groups.flatMap((g) => g.tiles.map((lt) => lt.id)));
  const orphans = CLIENT_LETTER_TYPES.filter((lt) => !placed.has(lt.id));
  return orphans.length > 0
    ? [...groups, { id: "unfiled", label: "أنواع أخرى", tiles: orphans }]
    : groups;
})();

// ─── Recipient presets (consumer-friendly labels) ────────────────────────────────
const RECIPIENT_PRESETS = [
  { id: "landlord",    label: "مالك العقار",        icon: Buildings },
  { id: "company",     label: "شركة أو متجر",        icon: Buildings },
  { id: "employer",    label: "صاحب العمل",          icon: UserCircle },
  { id: "bank",        label: "بنك أو تمويل",        icon: Stamp },
  { id: "individual",  label: "شخص طبيعي",           icon: UserCircle },
  { id: "government",  label: "جهة حكومية",           icon: Stamp },
];

interface ClientLetterWorkflowProps {
  isDark: boolean;
  card: string;
  onBack: () => void;
}

// ─── Block-based Letter Output ───────────────────────────────────────────────
interface BlockOutputProps {
  isDark: boolean; card: string;
  recipientPreset: string; recipientName: string; myName: string;
  story: string; letterTypeLabel: string; recipientTypeLabel: string;
  includeDeadline: boolean; deadlineDays: string;
  /** Clear the answers and start a new letter, staying on this page. */
  onNewLetter: () => void;
  /** Leave the tool entirely. */
  onExit: () => void;
}

function LetterBlockOutput({
  isDark, card, recipientPreset, recipientName, myName, story,
  letterTypeLabel, recipientTypeLabel, includeDeadline, deadlineDays,
  onNewLetter, onExit,
}: BlockOutputProps) {
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";
  const user = useUser();

  // The composer runs ONCE, at mount, as the initial state. It is a pure
  // synchronous function (composeLetterBlocks) — there is nothing to await and
  // nothing to show a spinner over.
  const [blocks, setBlocks] = useState<LetterBlock[]>(() =>
    composeLetterBlocks({ recipientPreset, recipientName, senderName: myName, story, includeDeadline, deadlineDays }),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  /**
   * Editorial notes, keyed by block id. Deliberately a SEPARATE store from
   * `blocks`: the export builders take `blocks` and nothing else, so there is
   * no code path that can put a note into the letter. That is the property the
   * old «[ملاحظة AI: …]» append violated.
   */
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  /**
   * The print path runs in a hidden frame, so when it fails there is nothing
   * on screen to notice it. Without this the client presses the button and the
   * page simply does nothing — indistinguishable from the dead button this
   * whole pass exists to remove.
   */
  const [printError, setPrintError] = useState<string | null>(null);

  const documentTitle = letterDocumentTitle(letterTypeLabel, recipientName);

  function updateBlock(id: string, content: string) {
    setBlocks(b => b.map(bl => bl.id === id ? { ...bl, content } : bl));
  }

  function saveNote(id: string) {
    const text = noteText.trim();
    if (!text) return;
    setNotes(n => ({ ...n, [id]: text }));
    setNoteId(null);
    setNoteText("");
  }

  function clearNote(id: string) {
    setNotes(n => {
      const next = { ...n };
      delete next[id];
      return next;
    });
  }

  /**
   * Download the letter as a Word-openable document.
   *
   * The revoke is deferred rather than run right after click(): Safari and
   * Firefox read the blob asynchronously once the click returns, and a
   * same-tick revoke hands the user a 0-byte file.
   */
  function downloadWord() {
    const blob = new Blob([buildLetterWordDocument({ title: documentTitle, blocks })], {
      type: "application/msword;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = letterFileName(documentTitle, "doc");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Open the print dialogue on a clean copy of the letter — which is also how
   * the client gets a PDF, through the browser's own "Save as PDF".
   *
   * A hidden same-origin iframe rather than window.open(): a popup is blocked
   * by default in most browsers when it is not the direct result of a
   * navigation, and the popup path was already flaky elsewhere in this repo.
   *
   * WHAT WAS BROKEN HERE, AND WHY «attach onload first» WAS NOT ENOUGH
   * The previous version did attach `onload` before setting `srcdoc` — and it
   * still printed a blank page. An iframe inserted into the document starts on
   * `about:blank` and fires a load event for THAT, before the srcdoc document
   * exists. The handler ran on the empty page, so the client got a real print
   * dialogue over nothing and saved a blank PDF. Measured in Chromium 151 with
   * a harness that captures the frame document at the moment print() is called:
   * the old ordering saw two load events — `about:blank` with an empty body
   * first, `about:srcdoc` with the letter second — and printed on the first.
   *
   * So readiness is now PROVEN, not assumed: isLetterPrintDocumentReady() looks
   * for a marker the print document carries and about:blank cannot have. The
   * srcdoc is also set before the frame is inserted, which makes the very first
   * navigation the right one — but that reordering is the second line of
   * defence, not the first. A load event we do not own firing on an empty
   * document is exactly the class of bug that has now shipped here twice, so
   * the guard stays even though the reordering alone measured clean.
   *
   * `load` and a poll both feed the same guarded function because either can be
   * the one that arrives: WebKit has historically not fired `load` for a srcdoc
   * frame at all, and a poll with no load event would spin forever. Whichever
   * fires first wins; the other is torn down.
   *
   * The rest is unchanged and each line is load-bearing:
   *  - `width:0;height:0` with position:fixed, NOT `display:none`. A display:none
   *    iframe has no layout in WebKit and prints a blank page.
   *  - the frame is removed on `afterprint`, never synchronously after print():
   *    removing it while the dialogue is open cancels the job in Chrome. Safari
   *    does not fire afterprint for an iframe at all, hence the late fallback.
   */
  function printLetter() {
    setPrintError(null);

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", documentTitle);
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";

    // settled = we have either printed or given up. Both exits clear both timers.
    let settled = false;
    let pollId = 0;
    let giveUpId = 0;
    const stopWaiting = () => {
      window.clearInterval(pollId);
      window.clearTimeout(giveUpId);
    };

    const printWhenReady = () => {
      if (settled) return;
      const win = frame.contentWindow;
      // Not ready — and, on the about:blank load event, never will be for THIS
      // document. Returning leaves the poll and the give-up timer running.
      if (!win || !isLetterPrintDocumentReady(win.document)) return;

      settled = true;
      // Before print(), not after: print() blocks on the modal dialogue in
      // several browsers, and a poll still armed would re-enter behind it.
      stopWaiting();

      let removed = false;
      const cleanup = () => { if (removed) return; removed = true; frame.remove(); };
      win.addEventListener("afterprint", cleanup);
      try {
        win.focus();
        win.print();
      } catch (err) {
        // Reached when the browser refuses to open the dialogue at all (some
        // embedded webviews throw). Say so — the alternative is a button that
        // silently does nothing, which is the defect this pass removes.
        console.error("[client letter] print failed:", err);
        cleanup();
        setPrintError("تعذّر فتح نافذة الطباعة في هذا المتصفح. نزّل نسخة Word — النص نفسه، ويمكنك طباعتها منه.");
        return;
      }
      window.setTimeout(cleanup, 60_000);
    };

    frame.onload = printWhenReady;
    pollId = window.setInterval(printWhenReady, 120);
    giveUpId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      stopWaiting();
      frame.remove();
      setPrintError("تعذّر تجهيز نسخة الطباعة. أعد المحاولة، أو نزّل نسخة Word — النص نفسه، ويمكنك طباعتها منه.");
    }, 8_000);

    // srcdoc BEFORE insertion: the frame then navigates straight to the letter
    // when it is attached, instead of loading about:blank and being redirected.
    frame.srcdoc = buildLetterPrintDocument({ title: documentTitle, blocks });
    document.body.appendChild(frame);
  }

  /**
   * Send the composed letter to the office for review and approval — a real
   * `service_request`, not a link to a form that would lose the letter.
   *
   * Every literal below is copied from the pattern in
   * src/app/dashboard/client/requests/new/page.tsx and each one matters:
   *  - `receiver: "ai_workspace"` is the ONLY value the admin fulfilment queue
   *    reads. Anything else saves the order where nobody sees it.
   *  - `payment: { amount: 0, status: "not_required" }` keeps POST
   *    /api/v1/service-requests' 402 gate (it fires on `amount > 0`) from
   *    refusing a submission the client cannot pay for — there is no gateway.
   *  - `metadata.intake` (an OBJECT) is the only thing buildOrderPrompt() reads
   *    for the brief. A flat key here is invisible to the team.
   *
   * Every intake key already has an Arabic label in
   * src/lib/services/intakeValues.ts (the `letter` group, written for the
   * لرأي الفصل letter flow) — chosen for exactly that reason, so the brief
   * cannot print raw English keys. The two picker values are stored as their
   * ARABIC labels rather than as machine ids («أطالب بأموال», not
   * "demand_money"), the same choice AddCaseModal made: valueLabelAr() falls
   * back to the raw value, so an Arabic value needs no INTAKE_VALUE_AR entry
   * and cannot drift from the button the client actually pressed.
   *
   * `service: "ai-letter"` is not one of the four AI ServiceKeys, so
   * checkOrderIntake() passes it through untouched (intakeGuard.ts).
   */
  async function requestOfficeReview() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const noteLines = blocks
        .filter(bl => (notes[bl.id] ?? "").length > 0)
        .map(bl => `${bl.label}: ${notes[bl.id]}`);

      const request = await createWorkflowRequest({
        id: createWorkflowId("REQ"),
        // "service", not "ai_draft": what is being asked for is human review by
        // the office. The queue does not route on this field, but «طلباتي»
        // prints it as the order's category and «مسودة AI» would be a lie on
        // the client's own list.
        type: "service",
        title: `تدقيق واعتماد خطاب — ${letterTypeLabel}`,
        // Deliberately NOT the client's story: buildOrderPrompt() prints this
        // under «## وصف الطلب» and `intake.description` under «الوصف», so
        // putting the story in both would print it twice in the team's brief.
        // This line frames the ask; the story and the letter are in the intake.
        description: `طلب تدقيق واعتماد خطاب رسمي كوّنه العميل من قوالب المنصة، قبل إرساله إلى ${recipientName.trim() || recipientTypeLabel}.`,
        requester: {
          userId: user.userId,
          name: user.name,
          role: user.userType,
          tier: user.tier,
          businessRole: user.businessRole,
        },
        receiver: "ai_workspace",
        status: "pending_assignment",
        payment: { amount: 0, status: "not_required" },
        sourcePath: "/dashboard/client/letters",
        metadata: {
          service: "ai-letter",
          // The catalogue's own label for `ai-letter` is «صياغة خطاب رسمي
          // بالذكاء الاصطناعي», which is not true of this tool and is not what
          // is being ordered here either. The heading says what the team is
          // being asked to do.
          serviceTitleAr: "تدقيق واعتماد خطاب رسمي",
          schemaVersion: 1,
          intake: {
            service: "ai-letter",
            letterType: letterTypeLabel,
            recipientType: recipientTypeLabel,
            // Empty strings are dropped by isEmptyValue() before the brief is
            // rendered, so an unnamed recipient simply has no row — no «—», no
            // invented placeholder.
            recipientName: recipientName.trim(),
            senderName: myName.trim(),
            description: story.trim(),
            responseDeadline: includeDeadline,
            deadlineDays: includeDeadline ? deadlineDays : "",
            // The letter as the client will send it, from the SAME function the
            // .doc and the print document use. Composing it separately here is
            // how the copy the office reviews drifts from the copy the client
            // downloaded.
            fullLetterText: letterPlainText(blocks),
            notes: noteLines.join("\n"),
          },
        },
        auditEvent: "client_letter_review_requested",
      });
      setSubmittedId(request.id);
    } catch (err) {
      console.error("[client letter] review request failed:", err);
      setSubmitError("تعذّر إرسال الخطاب للتدقيق — تحقق من اتصالك وحاول مجدداً. لم يُطلب منك أي دفع.");
    } finally {
      setSubmitting(false);
    }
  }

  const ghost = isDark
    ? "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white"
    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900";

  return (
    <motion.div key="cs4-blocks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Success banner. It says the draft is ready — it does NOT say the letter
          is approved, checked, or fit to send, because nobody has looked at it. */}
      <div className={`rounded-[1.5rem] p-5 border flex items-center gap-4 ${isDark ? "border-emerald-500/20 bg-emerald-500/5 backdrop-blur-xl" : "border-emerald-200 bg-emerald-50 shadow-sm"}`}>
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <CheckCircle size={22} weight="fill" className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <p className={`font-black text-[15px] ${isDark ? "text-emerald-400" : "text-emerald-800"}`}>مسودة خطابك جاهزة — كلّ فقرة قابلة للتعديل</p>
          <p className={`text-[13px] mt-1 font-medium ${isDark ? "text-emerald-500/70" : "text-emerald-600"}`}>{letterTypeLabel} — من {myName.trim() || "المرسِل"} إلى {recipientName.trim() || recipientTypeLabel}</p>
        </div>
        <span className={`text-[11px] px-3 py-1 rounded-full border font-bold ${isDark ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-emerald-200 text-emerald-700 bg-white"}`}>انقر أي فقرة للتعديل</span>
      </div>

      {/* Blocks */}
      <div className={`${card} p-6 space-y-3 shadow-lg`} dir="rtl">
        {blocks.map(bl => (
          <motion.div key={bl.id} layout className={`group relative rounded-[1.25rem] border transition-all duration-300 ${
            editingId === bl.id
              ? isDark ? "border-blue-500/40 bg-blue-900/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "border-blue-300 bg-blue-50/50 shadow-sm"
              : isDark ? "border-white/5 hover:border-white/10 hover:bg-white/[0.02]" : "border-transparent hover:border-zinc-200 hover:bg-zinc-50"
          }`}>
            {/* Block label + actions */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${ts}`}>{bl.label}</span>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(editingId === bl.id ? null : bl.id); setNoteId(null); }}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all ${ghost}`}>
                  <PencilSimple size={12} weight="bold" /> {editingId === bl.id ? "حفظ" : "تعديل"}
                </button>
                <button onClick={() => { setNoteId(noteId === bl.id ? null : bl.id); setEditingId(null); setNoteText(notes[bl.id] ?? ""); }}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all ${ghost}`}>
                  <NotePencil size={14} weight="duotone" className="text-amber-500" /> ملاحظة للمحامي
                </button>
              </div>
            </div>

            {/* Content: view or edit */}
            <div className="px-5 pb-5">
              {editingId === bl.id ? (
                <textarea
                  autoFocus
                  value={bl.content}
                  onChange={e => updateBlock(bl.id, e.target.value)}
                  rows={bl.content.split("\n").length + 1}
                  className={`w-full resize-none rounded-[1rem] border px-4 py-3 text-[14px] outline-none leading-relaxed transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-800"}`}
                />
              ) : (
                <p
                  onClick={() => setEditingId(bl.id)}
                  className={`text-[15px] leading-relaxed whitespace-pre-line cursor-text transition-colors ${bl.isBold ? "font-bold" : "font-medium"} ${bl.isCenter ? "text-center" : ""} ${tp}`}
                >
                  {bl.content}
                </p>
              )}
            </div>

            {/* Saved editorial note. Visibly OUTSIDE the paragraph, in its own
                colour, and it says outright that it is not part of the letter —
                a strip that merely sat under the text would still read as part
                of it. Nothing here reaches the export builders. */}
            {notes[bl.id] && (
              <div className={`mx-5 mb-5 rounded-[1rem] border px-4 py-3 ${isDark ? "border-amber-500/25 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-[11px] font-black mb-1 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                      ملاحظة لمحامي المكتب — لا تظهر في نص الخطاب ولا في الملف المُنزَّل
                    </p>
                    <p className={`text-[13px] font-medium leading-relaxed whitespace-pre-line ${isDark ? "text-amber-300/90" : "text-amber-800"}`}>
                      {notes[bl.id]}
                    </p>
                  </div>
                  <button onClick={() => clearNote(bl.id)} aria-label={`حذف الملاحظة على ${bl.label}`}
                    className={`flex-shrink-0 rounded-lg p-1.5 ${isDark ? "text-amber-400 hover:bg-amber-500/10" : "text-amber-700 hover:bg-amber-100"}`}>
                    <X size={13} weight="bold" />
                  </button>
                </div>
              </div>
            )}

            {/* Note editor */}
            <AnimatePresence>
              {noteId === bl.id && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className={`overflow-hidden border-t px-5 pb-5 ${isDark ? "border-white/10 bg-amber-900/5" : "border-zinc-100 bg-amber-50/40"}`}>
                  <p className={`text-[12px] font-black mt-4 mb-2 flex items-center gap-2 ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                    <NotePencil size={16} weight="duotone" />
                    ملاحظتك على هذه الفقرة — تصل لمحامي المكتب مع طلب التدقيق، ولا تُكتب داخل الخطاب
                  </p>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 relative">
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="مثال: أرجو تشديد نبرة هذه الفقرة، أو إضافة رقم العقد إن لزم."
                        rows={2}
                        className={`w-full resize-none rounded-[1rem] border px-4 py-3 text-[13px] outline-none pb-12 transition-all focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}
                      />
                      <div className="absolute bottom-3 start-3">
                        <VoiceInput onTranscript={t => setNoteText(p => p ? p + " " + t : t)} compact />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => saveNote(bl.id)} disabled={!noteText.trim()}
                        className="rounded-[1rem] bg-amber-600 px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-40 shadow-sm">حفظ الملاحظة</motion.button>
                      <button onClick={() => { setNoteId(null); setNoteText(""); }} aria-label="إلغاء"
                        className={`rounded-[1rem] border px-4 py-2.5 text-[12px] font-bold ${ghost}`}><X size={14} weight="bold" /></button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* ── The human path ──────────────────────────────────────────────────
          Owner ruling س٣: an instant template must put «طلب التدقيق والاعتماد
          من محامي المكتب» one click away. Here it carries the letter itself,
          so nothing the client wrote has to be retyped. */}
      <div className={`rounded-[1.5rem] border p-5 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-zinc-200 bg-zinc-50"}`}>
        {submittedId ? (
          <div className="flex items-start gap-3">
            <CheckCircle size={20} weight="fill" className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className={`text-[14px] font-black ${isDark ? "text-emerald-400" : "text-emerald-800"}`}>
                وصل خطابك إلى فريق نظامي — رقم الطلب {submittedId}
              </p>
              {/* No turnaround figure: nothing in this codebase measures one, so
                  «خلال ٢٤ ساعة» would be a number nobody can honour. */}
              <p className={`text-[12px] mt-1 font-medium leading-relaxed ${ts}`}>
                يراجع الفريق الخطاب ويتواصل معك. تابع حالة الطلب من{" "}
                <Link href="/dashboard/client/requests" className="font-bold underline">طلباتي</Link>.
                نسخة الخطاب محفوظة مع الطلب، ويمكنك تنزيلها من هنا الآن.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <FileText size={20} weight="duotone" className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-300" : "text-zinc-600"}`} />
              <div>
                <p className={`text-[14px] font-black ${tp}`}>هذا نموذج استرشادي لم يراجعه محامٍ بعد</p>
                <p className={`text-[12px] mt-1 font-medium leading-relaxed ${ts}`}>
                  لاعتماده للاستخدام الرسمي، أرسله لمحامي المكتب — يصل نص الخطاب وملاحظاتك كما هي، دون إعادة كتابة. الإرسال مجاني ولا يُطلب منك دفع في هذه الخطوة.
                </p>
              </div>
            </div>
            {submitError && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold leading-relaxed text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
                {submitError}
              </div>
            )}
            {user.isLoggedIn ? (
              <motion.button whileHover={submitting ? {} : { scale: 1.02 }} whileTap={submitting ? {} : { scale: 0.97 }}
                onClick={requestOfficeReview} disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_0_rgba(11,61,46,0.25)] hover:bg-[#0a3328] transition-colors disabled:opacity-60">
                {submitting ? (
                  <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />جارٍ الإرسال...</>
                ) : (
                  <><PaperPlaneTilt size={16} weight="fill" /> طلب التدقيق والاعتماد من محامي المكتب</>
                )}
              </motion.button>
            ) : (
              /* An unauthenticated createWorkflowRequest gets a 401 back. A
                 button that always fails is the defect this pass removes, so
                 the state is stated instead. */
              <p className={`text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                سجّل الدخول لإرسال الخطاب إلى محامي المكتب. يمكنك تنزيله الآن دون تسجيل.
              </p>
            )}
          </>
        )}
      </div>

      {/* Print failure. `zinc`/`red` only — globals.css redefines gray-50/100/200
          as dark SURFACES, so a dark:text-gray-100 message is invisible text. */}
      {printError && (
        <div role="alert" className={`rounded-[1rem] border px-4 py-3 text-[12px] font-semibold leading-relaxed ${isDark ? "border-red-800/40 bg-red-900/20 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
          {printError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {/* «طباعة / حفظ PDF», not «تنزيل PDF»: this opens the browser's print
            dialogue, from which the user chooses "حفظ كـ PDF". Promising a
            downloaded file would be the same dead-button lie in new clothes. */}
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={printLetter}
          className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_0_rgba(11,61,46,0.2)] hover:bg-[#0a3328] transition-colors">
          <Printer size={16} weight="bold" /> طباعة / حفظ PDF
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={downloadWord}
          className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm"}`}>
          <DownloadSimple size={16} weight="bold" /> تنزيل Word
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onNewLetter}
          className={`ms-auto flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"}`}>
          خطاب جديد
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onExit}
          className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"}`}>
          <ArrowRight size={14} weight="bold" /> خروج
        </motion.button>
      </div>
    </motion.div>
  );
}

export function ClientLetterWorkflow({ isDark, card, onBack }: ClientLetterWorkflowProps) {
  const [step, setStep] = useState(1);
  const [letterType, setLetterType] = useState("");
  const [recipientPreset, setRecipientPreset] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [myName, setMyName] = useState("");
  const [story, setStory] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("7");
  const [includeDeadline, setIncludeDeadline] = useState(false);
  const [done, setDone] = useState(false);

  const selectedType = CLIENT_LETTER_TYPES.find(t => t.id === letterType);
  const selectedRecipient = RECIPIENT_PRESETS.find(r => r.id === recipientPreset);

  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  /**
   * «خطاب جديد» used to call onBack(), which on this page is
   * `window.history.back()` — so the button that says "new letter" navigated
   * off the tool. Starting a new letter and leaving are two different
   * intentions and now have two different buttons.
   */
  function startNewLetter() {
    setStep(1); setLetterType(""); setRecipientPreset(""); setRecipientName("");
    setMyName(""); setStory(""); setIncludeDeadline(false); setDeadlineDays("7"); setDone(false);
  }

  // ── Step indicator ─────────────────────────────────────────────────────────────
  const steps = ["نوع الخطاب", "الطرف الآخر", "قصتك", "الخطاب"];
  const currentStep = done ? 4 : step;

  return (
    <AnimatePresence mode="wait">

      {/* Progress Bar */}
      {!done && (
        <div className={`${card} p-4 mb-6 shadow-sm`}>
          <div className="flex items-center gap-2">
            {steps.map((label, i) => {
              const n = i + 1;
              const isActive = currentStep === n;
              const isDone = currentStep > n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => isDone && setStep(n)}
                  disabled={!isDone}
                  className={`flex items-center gap-2 flex-1 ${isDone ? 'cursor-pointer hover:opacity-80 active:scale-95 transition-all' : 'cursor-default'}`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-black flex-shrink-0 transition-all duration-300 ${
                    isDone ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]" : isActive ? "bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.3)]" : isDark ? "bg-zinc-800 text-zinc-500 border border-white/5" : "bg-zinc-100 text-zinc-400 border border-zinc-200"
                  }`}>
                    {isDone ? <CheckCircle size={16} weight="bold" /> : toArabicDigits(n)}
                  </div>
                  <span className={`text-[11px] hidden sm:block truncate font-bold transition-colors duration-300 ${isActive ? tp : ts}`}>{label}</span>
                  {i < 3 && <div className={`flex-1 h-[2px] mx-2 rounded-full transition-colors duration-300 ${isDone ? "bg-emerald-500/50" : isDark ? "bg-white/10" : "bg-zinc-200"}`} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 1: نوع الخطاب ──────────────────────────────────────────────────── */}
      {step === 1 && !done && (
        <motion.div key="cs1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-8 space-y-8 shadow-lg`}>
          <div>
            <p className={`text-[12px] font-black uppercase tracking-widest mb-2 ${ts}`}>ماذا تريد من الخطاب؟</p>
            <p className={`text-[15px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>اختر الأقرب لوضعك ليُختار القالب المناسب</p>
          </div>

          {/* Owner item ١٧, applied to the client picker. The six tiles used to
              sit in one undifferentiated grid: a client who knew what they
              wanted but not which tile carried it had to read all six. They are
              now under the same intent headings the لوحة المحامي drafter uses,
              so the two screens classify letters identically. Every tile still
              renders and no id changed — the grouping is purely layout. */}
          <div className="space-y-7">
            {CLIENT_LETTER_GROUPS.map(group => (
              <div key={group.id} className="space-y-3">
                <p className={`text-[11px] font-black tracking-wide ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{group.label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {group.tiles.map(lt => {
                    const TileIcon = lt.icon;
                    return (
                    <motion.button key={lt.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={() => setLetterType(lt.id)}
                      className={`flex items-start gap-4 rounded-[1.5rem] border p-5 text-right transition-all duration-300 ${
                        letterType === lt.id
                          ? isDark ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-blue-400 bg-blue-50 shadow-sm"
                          : isDark ? "border-white/10 hover:border-white/20 hover:bg-white/5" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                      }`}>
                      <TileIcon size={28} weight="duotone" className={`flex-shrink-0 mt-1 ${letterType === lt.id ? "text-blue-500" : ts}`} />
                      <div>
                        <p className={`text-[15px] font-black mb-1 transition-colors ${letterType === lt.id ? isDark ? "text-blue-400" : "text-blue-700" : tp}`}>{lt.label}</p>
                        <p className={`text-[12px] font-medium leading-relaxed ${isDark ? (letterType === lt.id ? "text-blue-400/70" : "text-zinc-500") : (letterType === lt.id ? "text-blue-600/70" : "text-zinc-500")}`}>{lt.sublabel}</p>
                      </div>
                    </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {selectedType && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
              <div className={`flex items-start gap-3 px-5 py-4 rounded-[1.25rem] ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                <WarningCircle size={18} weight="duotone" className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className={`text-[13px] font-medium leading-relaxed ${isDark ? "text-blue-300" : "text-blue-800"}`}>{selectedType.hint}</p>
              </div>
            </motion.div>
          )}

          {/* «إلغاء», not «رجوع». This is step 1 and there IS no previous
              step — `onBack` leaves the wizard. A button labelled «رجوع» on the
              first screen tells the user there is something behind them, and
              then takes them out of the flow instead. The later steps keep
              «رجوع» because there they really do go back one step. */}
          <div className="flex justify-between pt-4">
            <button onClick={onBack} className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}>
              <ArrowRight size={14} weight="bold" /> إلغاء
            </button>
            <div className="flex flex-col items-end gap-1.5">
              <motion.button whileHover={letterType ? { scale: 1.02 } : {}} whileTap={letterType ? { scale: 0.98 } : {}}
                onClick={() => setStep(2)} disabled={!letterType}
                className={`flex items-center gap-2 rounded-xl px-8 py-3 text-[14px] font-bold transition-all ${letterType ? "bg-blue-600 text-white shadow-md hover:bg-blue-700" : isDark ? "bg-white/5 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
                التالي
              </motion.button>
              {/* A disabled button with no explanation is a dead end: the user
                  can see it is off and cannot see what turns it on. */}
              {!letterType && (
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  اختر نوع الخطاب أولاً
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Step 2: الطرف الآخر ─────────────────────────────────────────────────── */}
      {step === 2 && !done && (
        <motion.div key="cs2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-8 space-y-8 shadow-lg`}>
          <div>
            <p className={`text-[12px] font-black uppercase tracking-widest mb-2 ${ts}`}>من الطرف الآخر؟</p>
            <p className={`text-[15px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>الشخص أو الجهة التي ستُرسَل إليها الخطاب</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {RECIPIENT_PRESETS.map(r => {
              const Icon = r.icon;
              return (
                <button key={r.id} onClick={() => setRecipientPreset(r.id)}
                  className={`flex flex-col items-center justify-center gap-3 rounded-[1.5rem] border p-5 transition-all duration-300 ${
                    recipientPreset === r.id
                      ? isDark ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]" : "border-blue-400 bg-blue-50 shadow-sm"
                      : isDark ? "border-white/10 hover:border-white/20 hover:bg-white/5" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}>
                  <Icon size={28} weight={recipientPreset === r.id ? "duotone" : "regular"} className={recipientPreset === r.id ? "text-blue-500" : ts} />
                  <span className={`text-[13px] font-bold ${recipientPreset === r.id ? isDark ? "text-blue-400" : "text-blue-700" : tp}`}>{r.label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-5 bg-zinc-50/50 dark:bg-white/[0.02] p-6 rounded-[1.5rem] border border-zinc-200 dark:border-white/10">
            <div>
              <label className={`block text-[13px] font-bold mb-2 ${tp}`}>اسم الطرف الآخر <span className="opacity-50 font-normal">(اختياري)</span></label>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
                placeholder="مثال: شركة الوطني العقارية — أحمد العنزي"
                className={`w-full rounded-xl border px-4 py-3 text-[14px] outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
            </div>
            <div>
              {/* A corporate account now reaches these three client prefixes
                  (routeAccess.ts, owner ruling س٢), so the sender is not
                  necessarily a natural person. «اسمك أنت» / «اسمك الكامل» would
                  send a company looking for a field that does not apply to it. */}
              <label className={`block text-[13px] font-bold mb-2 ${tp}`}>اسمك أو اسم المنشأة <span className="opacity-50 font-normal">(كما يظهر في الخطاب)</span></label>
              <input value={myName} onChange={e => setMyName(e.target.value)}
                placeholder="مثال: خالد الغامدي — أو: مؤسسة الأفق للتجارة"
                className={`w-full rounded-xl border px-4 py-3 text-[14px] outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(1)} className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}><ArrowRight size={14} weight="bold" /> رجوع</button>
            <motion.button whileHover={recipientPreset && myName.trim() ? { scale: 1.02 } : {}} whileTap={recipientPreset && myName.trim() ? { scale: 0.98 } : {}}
              onClick={() => setStep(3)} disabled={!recipientPreset || !myName.trim()}
              className={`flex items-center gap-2 rounded-xl px-8 py-3 text-[14px] font-bold transition-all ${recipientPreset && myName.trim() ? "bg-blue-600 text-white shadow-md hover:bg-blue-700" : isDark ? "bg-white/5 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
              التالي
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Step 3: قصتك ────────────────────────────────────────────────────────── */}
      {step === 3 && !done && (
        <motion.div key="cs3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-8 space-y-8 shadow-lg`}>
          <div>
            <p className={`text-[12px] font-black uppercase tracking-widest mb-2 ${ts}`}>ماذا حدث؟</p>
            {/* It used to say «الذكاء الاصطناعي سيصيغه بأسلوب رسمي قانوني». No
                model is called anywhere in this tool; the text is placed inside
                a template as written. */}
            <p className={`text-[15px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>اكتب بكلامك العادي — يُدرَج نصّك داخل قالب خطاب رسمي، ثم تعدّل كل فقرة كما تريد</p>
          </div>

          <div className="relative">
            <textarea value={story} onChange={e => setStory(e.target.value)}
              rows={6}
              placeholder={`مثال:\nدفعت إيجار السنة كاملاً لكن المالك طردني قبل انتهاء العقد ورفض إرجاع الضمان (٥٠٠٠ ريال). تواصلت معه أكثر من ٥ مرات ولم يرد.`}
              className={`w-full resize-none rounded-[1.5rem] border p-5 text-[14px] outline-none leading-relaxed pb-16 transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`} />
            <div className="absolute bottom-4 start-4 bg-inherit rounded-full">
              <VoiceInput onTranscript={t => setStory(prev => prev ? prev + " " + t : t)} />
            </div>
          </div>

          {/* Optional deadline — hidden for government entities */}
          {recipientPreset !== "government" && (
            <div className={`rounded-[1.5rem] border p-6 transition-colors ${isDark ? "border-white/10 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[14px] font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                    هل تريد تحديد موعد للرد؟ <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isDark ? "bg-white/10 text-zinc-400" : "bg-zinc-200 text-zinc-600"}`}>اختياري</span>
                  </p>
                  <p className={`text-[12px] font-medium mt-1.5 ${ts}`}>تُضاف فقرة تمهل الطرف الآخر للرد قبل اتخاذ أي إجراء نظامي</p>
                </div>
                <button onClick={() => setIncludeDeadline(p => !p)} aria-pressed={includeDeadline}
                  className={`w-12 h-7 rounded-full transition-colors relative flex-shrink-0 shadow-inner ${includeDeadline ? "bg-blue-600" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all ${includeDeadline ? "start-[calc(100%-24px)]" : "start-1"}`} />
                </button>
              </div>
              <AnimatePresence>
                {includeDeadline && (
                  <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 20 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} className="overflow-hidden">
                    <div className="flex gap-2">
                      {/* dayCountAr, not `${d} أيام`: the buttons used to read
                          «14 أيام» — western digits and the wrong Arabic plural
                          — and the letter body must say the same thing. */}
                      {["3", "7", "14", "30"].map(d => (
                        <button key={d} onClick={() => setDeadlineDays(d)}
                          className={`flex-1 py-2.5 rounded-xl border text-[13px] font-bold transition-all ${
                            deadlineDays === d ? "bg-blue-600 border-blue-600 text-white shadow-md" : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                          }`}>{dayCountAr(d)}</button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {recipientPreset === "government" && (
            <div className={`rounded-[1.5rem] border p-5 flex items-center gap-3 text-[13px] font-medium ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              <Warning size={20} weight="duotone" className="flex-shrink-0 text-amber-500" />
              تحديد موعد الرد لا ينطبق على الجهات الحكومية — لكل جهة مهلها النظامية المحددة في النظام الموحد
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(2)} className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}><ArrowRight size={14} weight="bold" /> رجوع</button>
            {/* No await, no spinner, no «جارٍ الصياغة». The composition is a
                synchronous string build; an animation over it was the only
                thing that made a template look like a model. */}
            <motion.button whileHover={story.trim().length >= 15 ? { scale: 1.02 } : {}} whileTap={story.trim().length >= 15 ? { scale: 0.98 } : {}}
              onClick={() => setDone(true)} disabled={story.trim().length < 15}
              className={`flex items-center gap-2 rounded-xl px-8 py-3 text-[14px] font-bold transition-all ${story.trim().length >= 15 ? "bg-blue-600 text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] hover:bg-blue-700 hover:shadow-[0_6px_20px_rgba(37,99,235,0.23)]" : isDark ? "bg-white/5 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
              <FileText size={18} weight="duotone" />كوّن مسودة الخطاب
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Step 4: Block-based editable output ─────────────────────────────────── */}
      {done && (
        <LetterBlockOutput
          isDark={isDark} card={card}
          recipientPreset={recipientPreset}
          recipientName={recipientName}
          myName={myName}
          story={story}
          letterTypeLabel={selectedType?.label ?? "خطاب رسمي"}
          recipientTypeLabel={selectedRecipient?.label ?? "الطرف المعني"}
          includeDeadline={includeDeadline && recipientPreset !== "government"}
          deadlineDays={deadlineDays}
          onNewLetter={startNewLetter}
          onExit={onBack}
        />
      )}
    </AnimatePresence>
  );
}
