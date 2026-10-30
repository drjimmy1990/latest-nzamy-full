"use client";

import { useState, useEffect, useCallback, useId, useRef } from "react";
import { motion } from "framer-motion";
import { CheckCircle, ArrowClockwise } from "@phosphor-icons/react";
import ModalShell from "@/components/ui/ModalShell";
import { createWorkflowRequest } from "@/lib/services/workflowService";
import { apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createWorkflowId, type WorkflowRequest } from "@/lib/workflowStore";
import { createLawyerClient, getLawyerClients, type ClientType, type LawyerClient } from "@/lib/services/lawyerClientsService";
import type { UserType, UserTier } from "@/hooks/useUser";
import { COURT_CHOICES, COURT_OTHER, COURT_OTHER_LABEL, resolveCourt } from "./courtTypes";
import { caseSavedStatusLine, cardNamed, isAddCaseDirty } from "./addCaseForm";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /**
   * Current user context from the parent page (useUser()).
   *
   * REQUIRED — it used to be optional, and a caller that omitted it saved
   * `assigned_to: null`. That is not a cosmetic default: /dashboard/lawyer and
   * every «قضاياي» filter select on the lawyer's own id, so an unowned case
   * disappeared from the board it was created on, and the row's shape
   * (`assigned_to IS NULL` + `status='pending_assignment'` + receiver='lawyer')
   * is exactly what the marketplace browse policy opens to every OTHER verified
   * lawyer. Making the prop required turns that into a compile error at the call
   * site instead of a lost case; `userId` is re-checked at save time because the
   * session can still be resolving when the modal opens.
   */
  user: { userId?: string; name: string; userType: UserType; tier: UserTier };
}

type Priority = "critical" | "high" | "normal";

export default function AddCaseModal({ onClose, isDark, user }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CODE-F19: the status the server actually saved, for the success screen.
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const fieldId = useId();

  // Controlled inputs
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  // CODE-F30: no court until the lawyer picks one — it used to start on
  // «المحكمة التجارية», so an untouched field filed every case as commercial.
  const [courtChoice, setCourtChoice] = useState("");
  const [courtOther, setCourtOther] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [description, setDescription] = useState("");

  // Client picker (Phase 2 — public.lawyer_clients). Only cards
  // ("source: 'card'") are offered: a "profile" row has no id in
  // lawyer_clients yet, so it cannot be linked via lawyerClientId.
  //
  // UAT-LIVE-CASE-001 — the free-text name is no longer a "fallback path".
  // It used to mean «no card», and the case was then saved with the typed
  // name dropped into the `requester` jsonb and `lawyer_client_id` left null:
  // a موكل the platform has no record of, invisible to /dashboard/lawyer/
  // clients, to the client file, and to every count that joins on that
  // column. Typing a name now MAKES a card (handleSave below), so a case
  // always names a موكل that exists. `clientType` is what the cards API
  // requires to create one (api/v1/lawyer/clients/route.ts:377-379).
  const [clientCards, setClientCards] = useState<LawyerClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsUnreadable, setClientsUnreadable] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientType, setClientType] = useState<ClientType>("individual");
  // Set when this save created the card, so the success screen can say so
  // rather than letting a new row appear in «الموكّلون» unannounced.
  const [createdCardName, setCreatedCardName] = useState<string | null>(null);

  // CODE-F30: a failed read used to make the picker vanish without a word, and
  // the lawyer then typed a name that silently became a second card. The read
  // is a callback now so the error line can offer «إعادة المحاولة».
  const mountedRef = useRef(true);
  // LAW-DETAIL-005: ONE id for this case, made once per modal and reused by
  // every retry. A save whose answer was lost and is pressed again then names
  // the same row, which the route answers with the case already saved
  // (`replayed`) instead of creating a second one.
  const caseIdRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsUnreadable(false);
    const read = await getLawyerClients();
    if (!mountedRef.current) return;
    if (!read.ok) {
      setClientsUnreadable(true);
      setClientsLoading(false);
      return;
    }
    setClientCards(read.items.filter((c) => c.source === "card"));
    setClientsLoading(false);
  }, []);
  useEffect(() => { void loadClients(); }, [loadClients]);

  function handleClientPick(id: string) {
    setSelectedClientId(id);
    const picked = clientCards.find((c) => c.id === id);
    // «موكّل جديد» clears the picked card's name too — leaving it would make a
    // second card with the same name on save.
    setClientName(picked ? picked.name : "");
  }

  const courtResolved = resolveCourt(courtChoice, courtOther);
  const matchingCard = selectedClientId ? null : cardNamed(clientCards, clientName);
  const dirty = !done && isAddCaseDirty({
    selectedClientId, clientName, title, courtChoice, courtOther, priority, description,
  });

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200"
      : "border-zinc-200 bg-zinc-50 text-zinc-800"
  }`;
  const labelCls = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const hintCls = `text-[11px] mt-1.5 ${isDark ? "text-zinc-500" : "text-zinc-500"}`;

  const priorityBtn = (key: Priority, label: string, activeCls: string) => (
    <button
      type="button"
      onClick={() => setPriority(key)}
      aria-pressed={priority === key}
      className={`rounded-xl border py-2 text-[12px] font-bold transition-all ${priority === key ? activeCls : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-500" : "border-slate-200 bg-slate-50 text-slate-500"}`}
    >
      {label}
    </button>
  );

  /** True when step 1 is answerable — the same rule «التالي» and Save both use. */
  const step1Complete = Boolean(clientName.trim()) && Boolean(title.trim()) && courtResolved.ok;
  const step1Hint = !clientName.trim() || !title.trim()
    ? "أدخل اسم الموكل وعنوان القضية للمتابعة"
    : !courtResolved.ok ? courtResolved.error : undefined;

  async function handleSave() {
    // See the `user` prop doc: an unowned row is a lost case AND a row other
    // lawyers can read. Refuse rather than write one.
    if (!user.userId) {
      setError("تعذّر تحديد حسابك. أعد تحميل الصفحة ثم حاول مرة أخرى.");
      return;
    }
    // UAT-LIVE-CASE-001 — re-checked at submit, not only at step 1. The step-1
    // gate is one `disabled` attribute on one button; this is the state the row
    // is actually built from. The two used to disagree and the payload settled
    // it by inventing values.
    const clientNameTrimmed = clientName.trim();
    const titleTrimmed = title.trim();
    if (!clientNameTrimmed || !titleTrimmed) {
      setError("يرجى إدخال اسم الموكل وعنوان القضية قبل الحفظ.");
      setStep(1);
      return;
    }
    if (!courtResolved.ok) {
      setError(courtResolved.error);
      setStep(1);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // A case must name a موكل the platform has a record of. When the lawyer
      // typed a name instead of picking a card, the card is created first and
      // the case is linked to it — so `lawyer_client_id` is always set and
      // «الموكّلون», the client file and every linked count see this case.
      //
      // Demo mode is excluded because there is no cards API there at all
      // (createLawyerClient throws by design, lawyerClientsService.ts:146-147);
      // that branch keeps the local store, which is its real backend.
      let lawyerClientId = selectedClientId;
      if (!lawyerClientId && isSupabaseMode) {
        try {
          const card = await createLawyerClient({ name: clientNameTrimmed, clientType });
          lawyerClientId = card.id;
          // Reflect it locally so going «رجوع» shows the card selected rather
          // than offering to create a second one with the same name.
          setClientCards((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]));
          setSelectedClientId(card.id);
          setCreatedCardName(card.name);
        } catch (cardErr) {
          console.error("[AddCaseModal] client card creation failed:", cardErr);
          setError(
            cardErr instanceof Error && cardErr.message
              ? `تعذّر إنشاء بطاقة الموكّل: ${cardErr.message}`
              : "تعذّر إنشاء بطاقة الموكّل. تحقّق من الاتصال ثم أعد المحاولة.",
          );
          setSaving(false);
          return;
        }
      }

      if (!caseIdRef.current) caseIdRef.current = createWorkflowId();
      const id = caseIdRef.current;
      const payload = {
        id,
        type: "service" as const,
        title: titleTrimmed,
        description: description.trim(),
        receiver: "lawyer" as const,
        // LIVE-F14 / LAW-DETAIL-006: the lawyer's own case is his from birth
        // — «نشطة», counted in «القضايا النشطة». The route accepts `assigned`
        // only for a self-assigned lawyer/firm case and answers with the
        // status it actually saved, which the success screen prints.
        status: "assigned" as const,
        requester: {
          userId: user.userId,
          // The موكل's own name, and now always one that a `lawyer_clients`
          // row carries too — never `user.name` (the LAWYER) or the literal
          // «عميل نظامي», which is what this line used to fall back to.
          name: clientNameTrimmed,
          role: user.userType ?? "lawyer",
          tier: user.tier ?? "free",
        },
        payment: { amount: 0, status: "not_required" as const },
        sourcePath: "",
        // CODE-F19: no `assignee` — the «فريق العمل» choice it carried was read
        // by nothing; the case is the current user's (`assignedTo` below).
        // CODE-F30: no court chosen = no court saved, not a guessed one.
        metadata: { ...(courtResolved.court ? { court: courtResolved.court } : {}), priority },
        assignedTo: user.userId,
        ...(lawyerClientId ? { lawyerClientId } : {}),
      };

      // Same reason as AddHearingModal: createWorkflowRequest() swallows a
      // failed POST and writes to localStorage instead
      // (workflowService.ts:54-57), so it resolves on a 401/500/RLS refusal and
      // this catch could never fire — the lawyer read «تم إضافة القضية بنجاح»
      // over a case that reached no database. Go straight to the API in supabase
      // mode so a non-2xx throws; demo mode keeps the local store, which there
      // is the real backend and genuinely reads back.
      const saved: WorkflowRequest | undefined = isSupabaseMode
        ? (await apiMutate<{ data?: WorkflowRequest }>("/api/v1/service-requests", "POST", payload))?.data
        : await createWorkflowRequest(payload);
      setSavedStatus(saved?.status ?? null);
      setDone(true);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (err) {
      console.error("[AddCaseModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّر إضافة القضية: ${err.message}`
          : "تعذّر إضافة القضية. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  // CODE-F34: the shell blocks every exit while `saving` and asks first when
  // the draft holds anything — this form used to close mid-save on a backdrop
  // click and lose a typed case without a word.
  return (
    <ModalShell title="إضافة قضية جديدة" onClose={onClose} isDark={isDark} busy={saving} dirty={dirty}>
        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم إضافة القضية بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              {caseSavedStatusLine(savedStatus)}
              {createdCardName && ` وأُنشئت بطاقة موكّل باسم «${createdCardName}» وربطت بها القضية.`}
            </p>
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2 text-[13px] font-bold bg-[#0B3D2E] text-white">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div role="alert" className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {error}
              </div>
            )}
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                {clientsUnreadable ? (
                  <div role="alert" className={`rounded-xl border px-3 py-2.5 text-[12px] ${isDark ? "border-amber-500/20 bg-amber-900/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    <p className="font-semibold">تعذّر تحميل قائمة الموكّلين، فلا يمكن اختيار موكّل مسجّل الآن.</p>
                    <p className="mt-0.5">إن كان الموكّل مسجّلاً فأعد المحاولة قبل كتابة اسمه، وإلا ستُنشأ له بطاقة جديدة.</p>
                    <button
                      type="button"
                      onClick={() => { void loadClients(); }}
                      className="mt-1.5 inline-flex items-center gap-1 font-bold hover:underline"
                    >
                      <ArrowClockwise size={13} aria-hidden="true" /> إعادة المحاولة
                    </button>
                  </div>
                ) : (clientsLoading || clientCards.length > 0) && (
                  <div>
                    <label htmlFor={`${fieldId}-card`} className={labelCls}>اختيار من قائمة الموكّلين</label>
                    <select
                      id={`${fieldId}-card`}
                      value={selectedClientId}
                      onChange={e => handleClientPick(e.target.value)}
                      disabled={clientsLoading}
                      className={inputCls}
                    >
                      <option value="">
                        {clientsLoading ? "جارٍ تحميل الموكّلين..." : "— موكّل جديد (اكتب الاسم أدناه) —"}
                      </option>
                      {clientCards.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor={`${fieldId}-name`} className={labelCls}>اسم الموكل</label>
                  {/*
                    CODE-F30: a picked card's name is read-only here. Editing it
                    used to drop the link and — on save — create a NEW card with
                    the edited name, so «correcting a typo» quietly split one
                    موكّل into two. Changing the client and creating a new one
                    are now explicit choices; renaming a card is done on the card.
                  */}
                  <input
                    id={`${fieldId}-name`}
                    type="text"
                    value={clientName}
                    readOnly={Boolean(selectedClientId)}
                    aria-describedby={selectedClientId ? `${fieldId}-name-hint` : undefined}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="اختر الموكل أو أضف موكلاً جديداً..."
                    className={`${inputCls} ${selectedClientId ? "opacity-80 cursor-default" : ""}`}
                  />
                  {selectedClientId && (
                    <div id={`${fieldId}-name-hint`} className={`${hintCls} flex flex-wrap items-center gap-x-2 gap-y-1`}>
                      <span>مرتبط ببطاقة موكّل مسجّلة. تعديل اسمه يكون من بطاقته في «الموكّلون».</span>
                      <button
                        type="button"
                        onClick={() => handleClientPick("")}
                        className={`font-bold underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                      >
                        موكّل آخر أو جديد
                      </button>
                    </div>
                  )}
                  {matchingCard && (
                    <div className={`${hintCls} flex flex-wrap items-center gap-x-2 gap-y-1`}>
                      <span>في قائمتك موكّل بهذا الاسم.</span>
                      <button
                        type="button"
                        onClick={() => handleClientPick(matchingCard.id)}
                        className={`font-bold underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
                      >
                        اختياره بدل إنشاء بطاقة جديدة
                      </button>
                    </div>
                  )}
                </div>
                {/*
                  Only when the lawyer is naming a NEW موكل: the card that will
                  be created needs a type, because `lawyer_clients.client_type`
                  is `not null check (client_type in ('individual','company'))`
                  (20260903_phase2…:139-140) and the route requires it. Hidden
                  once a card is picked — that card already has its own type.
                  Hidden in demo mode too, where no card is created at all.
                */}
                {isSupabaseMode && !selectedClientId && clientName.trim() !== "" && (
                  <div>
                    <label htmlFor={`${fieldId}-type`} className={labelCls}>نوع الموكّل</label>
                    <select id={`${fieldId}-type`} value={clientType} onChange={e => setClientType(e.target.value as ClientType)} className={inputCls}>
                      <option value="individual">فرد</option>
                      <option value="company">شركة</option>
                    </select>
                    <p className={hintCls}>
                      ستُنشأ بطاقة موكّل بهذا الاسم عند الحفظ، وتُربط بها القضية.
                    </p>
                  </div>
                )}
                <div>
                  <label htmlFor={`${fieldId}-title`} className={labelCls}>عنوان القضية</label>
                  <input id={`${fieldId}-title`} type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: مطالبة مالية - مؤسسة العليان" className={inputCls} />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-court`} className={labelCls}>المحكمة المختصة</label>
                  <select id={`${fieldId}-court`} value={courtChoice} onChange={e => setCourtChoice(e.target.value)} className={inputCls}>
                    <option value="">— لم تُحدَّد بعد —</option>
                    {COURT_CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value={COURT_OTHER}>{COURT_OTHER_LABEL}</option>
                  </select>
                  {courtChoice === COURT_OTHER && (
                    <input
                      type="text"
                      aria-label="اسم المحكمة أو الجهة"
                      value={courtOther}
                      onChange={e => setCourtOther(e.target.value)}
                      placeholder="اكتب اسم المحكمة أو الجهة..."
                      className={`${inputCls} mt-2`}
                    />
                  )}
                  {!courtChoice && (
                    <p className={hintCls}>يمكن تركها الآن؛ تظهر القضية «بانتظار تحديد الجهة» حتى تُحدَّد.</p>
                  )}
                </div>
                {/*
                  UAT-LIVE-CASE-001 — a REAL `disabled`, not only the disabled
                  LOOK. This button was styled grey and unclickable-looking
                  while staying fully clickable; the click handler set an error
                  and returned, so the form read as broken rather than as
                  incomplete, and keyboard/Enter submission bypassed the
                  styling entirely. The error line is kept for the case the
                  attribute cannot cover — a submit triggered any other way —
                  but it is no longer the only thing standing between an empty
                  field and step 2.
                */}
                <button
                  type="button"
                  disabled={!step1Complete}
                  aria-disabled={!step1Complete}
                  title={step1Hint}
                  onClick={() => {
                    if (!step1Complete) {
                      setError(step1Hint ?? "يرجى إدخال اسم الموكل وعنوان القضية للمتابعة.");
                      return;
                    }
                    setError(null);
                    setStep(2);
                  }}
                  className={`w-full rounded-xl py-2.5 text-[13px] font-bold text-white mt-2 transition-colors ${
                    !step1Complete
                      ? "bg-zinc-600/70 cursor-not-allowed text-zinc-300"
                      : "bg-[#0B3D2E] hover:bg-[#0B3D2E]/90"
                  }`}
                >
                  التالي
                </button>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                {/*
                  CODE-F19: «إسناد إلى المحامي» offered «أنا فقط / فريق العمل»,
                  but the choice was only a metadata label — `assignedTo` was
                  always the current user, and there is no working team model
                  to assign within (firm_members is not written in production).
                  Until the owner decides how assignment should work, the form
                  states the one thing that is true instead of offering a choice
                  that does nothing.
                */}
                <div>
                  <p className={labelCls}>المسؤول عن القضية</p>
                  <p className={`${inputCls} cursor-default`}>أنت — تُسجَّل القضية على حسابك.</p>
                  <p className={hintCls}>إسناد القضية إلى عضو آخر في فريق العمل غير متاح بعد.</p>
                </div>
                <div role="group" aria-labelledby={`${fieldId}-priority`}>
                  <p id={`${fieldId}-priority`} className={labelCls}>مستوى الأهمية / الاستعجال</p>
                  <div className="grid grid-cols-3 gap-2">
                    {priorityBtn("critical", "حرجة", "border-red-500/30 bg-red-500/10 text-red-500")}
                    {priorityBtn("high", "عاجلة", "border-amber-500/30 bg-amber-500/10 text-amber-500")}
                    {priorityBtn("normal", "طبيعية", "border-blue-500/30 bg-blue-500/10 text-blue-500")}
                  </div>
                </div>
                <div>
                  <label htmlFor={`${fieldId}-desc`} className={labelCls}>وصف القضية</label>
                  <textarea id={`${fieldId}-desc`} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="ملخص موجز عن القضية وطلب الموكل..." className={`${inputCls} resize-none`} />
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => setStep(1)} disabled={saving} className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-50 ${isDark ? "bg-white/[0.08] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>رجوع</button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !step1Complete}
                    title={step1Complete ? undefined : "أكمل بيانات الخطوة السابقة"}
                    className="flex-1 rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "جارٍ الحفظ..." : "حفظ واعتماد"}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}
    </ModalShell>
  );
}
