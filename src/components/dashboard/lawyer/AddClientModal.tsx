import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Buildings, Star, Check, X, Warning
} from "@phosphor-icons/react";
import {
  type ClientFlag, type ClientType,
  CLIENT_FLAGS,
  isValidNationalId, isValidCommercialRegister, isValidTaxNumber, isValidUnifiedNumber700,
  feePairIssue,
} from "@/lib/services/clientIdentityRules";
import { FLAG_CONFIG } from "@/constants/lawyerClientsData";
import {
  type LawyerClient, type CreateLawyerClientInput,
  createLawyerClient,
} from "@/lib/services/lawyerClientsService";

/**
 * A fee input the lawyer left alone must send NOTHING, not 0.
 *
 * This used to be `Number(total) || 0`, and the fee step is optional — `canNext`
 * only asks for a name and a phone on step 0 — so every lawyer who clicked
 * «التالي» past the fees without typing anything wrote a hard 0 into the row.
 * The API stored it, read it back as a real figure, and the client's page printed
 * «إجمالي الأتعاب ٠ ﷼ / مسدّدة بالكامل»: an account settled in full, invented
 * out of a form step nobody filled in.
 *
 * `undefined` is dropped by JSON.stringify, so an untouched field never reaches
 * the request body and the row simply carries no fee agreement. A typed `0`
 * TOTAL is still sent as 0 — that is a thing the lawyer did, and it is kept on
 * record even though no screen can tell it apart from this blank and so shows
 * neither. That is a deliberate call, not an oversight, and the hint under the
 * fee fields says so on screen.
 *
 * A negative or non-numeric entry returns undefined for the same reason the
 * API's read guard rejects it: it is not a fee. Nothing relies on that silent
 * drop any more — validateFees below stops such an entry at the button, so the
 * lawyer is told instead of having it quietly removed. This stays as the last
 * line of defence, not as the behaviour anyone sees.
 */
function parseFee(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * The fee step's rules, in Arabic, stated once so the button and the message
 * can never disagree. Returns the sentence to show the lawyer, or null when
 * there is nothing to say.
 *
 * The "is this even a number" check stays local (the shared rule only judges a
 * pair of already-parsed numbers); the pair rule itself — advance needs a
 * positive total, and cannot exceed it — is `feePairIssue` from
 * clientIdentityRules, the same function the API route validates against, so
 * the modal can never accept a pair the route would then reject.
 */
function validateFees(total: string, paid: string): string | null {
  const t = total.trim();
  const p = paid.trim();
  const tNum = parseFee(t);
  const pNum = parseFee(p);

  if (t && tNum === undefined) {
    return "أدخل رقمًا غير سالب لإجمالي الأتعاب، أو اترك الحقل فارغًا.";
  }
  if (p && pNum === undefined) {
    return "أدخل رقمًا غير سالب للمبلغ المقدّم، أو اترك الحقل فارغًا.";
  }
  return feePairIssue(tNum ?? null, pNum ?? null);
}

/**
 * Step 0's identity fields (item 80), validated only when the lawyer actually
 * types something in them — every one of these is optional. Which fields
 * apply depends on the type toggle right above them on the same step: an
 * individual gets a national ID / iqama, a company gets a commercial
 * register, a tax number and a unified-700 number. City is asked either way.
 */
function step0Issue(
  type: ClientType,
  nationalId: string,
  commercialRegisterNo: string,
  taxNumber: string,
  unifiedNumber700: string,
): string | null {
  if (type === "individual") {
    if (nationalId.trim() && !isValidNationalId(nationalId)) {
      return "أدخل رقم هوية/إقامة صحيحًا (10 أرقام، يبدأ بـ 1 أو 2)، أو اترك الحقل فارغًا.";
    }
    return null;
  }
  if (commercialRegisterNo.trim() && !isValidCommercialRegister(commercialRegisterNo)) {
    return "أدخل رقم سجل تجاري صحيحًا (10 أرقام)، أو اترك الحقل فارغًا.";
  }
  if (taxNumber.trim() && !isValidTaxNumber(taxNumber)) {
    return "أدخل رقمًا ضريبيًا صحيحًا (15 رقمًا، يبدأ بـ 3)، أو اترك الحقل فارغًا.";
  }
  if (unifiedNumber700.trim() && !isValidUnifiedNumber700(unifiedNumber700)) {
    return "أدخل رقمًا موحدًا صحيحًا (10 أرقام، يبدأ بـ 7)، أو اترك الحقل فارغًا.";
  }
  return null;
}

// Only the six flags the table's CHECK constraint actually admits
// (`CLIENT_FLAGS` in clientIdentityRules, migration 20260903_phase2,
// DECISION 2). FLAG_CONFIG in constants/lawyerClientsData still carries a
// couple of retired labels for old cards that still wear them; this modal
// must never let a lawyer attach one to a new client.
const OFFERABLE_FLAGS = CLIENT_FLAGS.filter(f => f !== "corporate");

export default function AddClientModal({ isDark, onClose, onCreated }: {
  isDark: boolean;
  onClose: () => void;
  onCreated: (client: LawyerClient) => void;
}) {
  const [step, setStep] = useState(0); // 0=basic 1=fees 2=flags
  const [name,     setName]     = useState("");
  const [type,     setType]     = useState<ClientType>("individual");
  const [phone,    setPhone]    = useState("");
  const [email,    setEmail]    = useState("");
  const [city,     setCity]     = useState("");
  // Individual-only identity fields.
  const [nationalId,        setNationalId]        = useState("");
  const [powerOfAttorneyNo, setPowerOfAttorneyNo]  = useState("");
  // Company-only identity fields.
  const [commercialRegisterNo, setCommercialRegisterNo] = useState("");
  const [taxNumber,            setTaxNumber]            = useState("");
  const [unifiedNumber700,     setUnifiedNumber700]      = useState("");
  const [total,    setTotal]    = useState("");
  const [paid,     setPaid]     = useState("");
  const [firstEngagementOn, setFirstEngagementOn] = useState("");
  const [flags,    setFlags]    = useState<Set<ClientFlag>>(new Set());
  /**
   * `null` = this lawyer has not rated this client. It is the state the form
   * opens in, and «مسح التقييم» gets back to it.
   *
   * Unrated means the key is dropped from the request body entirely, so the
   * row carries no rating and every screen omits the stars. When a rating IS
   * chosen the star widget shows it filled — a deliberate rating and an
   * untouched widget must never collapse onto the same stored value.
   */
  const [rating,   setRating]   = useState<1|2|3|4|5|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // A save that fails after a three-step wizard has to arrive. If the modal
  // body happens to be scrolled, the banner can still mount out of frame.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  const toggleFlag = (f: ClientFlag) => setFlags(prev => {
    const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s;
  });

  // Recomputed every keystroke, so the message under each step's fields and
  // the «التالي» button are always answering the same question.
  const idIssue = step0Issue(type, nationalId, commercialRegisterNo, taxNumber, unifiedNumber700);
  const feeIssue = validateFees(total, paid);

  const canNext =
    step === 0 ? name.trim().length > 0 && phone.trim().length > 0 && idIssue === null
    : step === 1 ? feeIssue === null
    : true;

  // One answer for one question: the step-0 toggle is the only place the
  // lawyer says whether the client is a company, and the tag follows it.
  const submittedFlags = (): ClientFlag[] => {
    const out = new Set<ClientFlag>(flags);
    if (type === "company") out.add("corporate");
    else out.delete("corporate");
    return [...out];
  };

  const handleSubmit = async () => {
    // Backstop, not the path the lawyer takes: step 2 is only reachable through
    // clean steps 0 and 1, so this cannot fire today. It guards the actual
    // write, so it stays true if the step gating is ever changed. No setError —
    // sending the lawyer back shows the same sentence in place, and printing it
    // twice in two boxes would read as two different problems.
    if (idIssue) {
      setStep(0);
      return;
    }
    if (feeIssue) {
      setStep(1);
      return;
    }

    setError(null);
    setSubmitting(true);

    const totalFees = parseFee(total);
    const paidFees = parseFee(paid);

    const input: CreateLawyerClientInput = {
      name: name.trim(),
      clientType: type,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      city: city.trim() || undefined,
      nationalId: type === "individual" && nationalId.trim() ? nationalId.trim() : undefined,
      powerOfAttorneyNo: type === "individual" && powerOfAttorneyNo.trim() ? powerOfAttorneyNo.trim() : undefined,
      commercialRegisterNo: type === "company" && commercialRegisterNo.trim() ? commercialRegisterNo.trim() : undefined,
      taxNumber: type === "company" && taxNumber.trim() ? taxNumber.trim() : undefined,
      unifiedNumber700: type === "company" && unifiedNumber700.trim() ? unifiedNumber700.trim() : undefined,
      flags: submittedFlags(),
      // Dropped from the request when no star was clicked, exactly like the
      // two fee keys: an untouched widget must reach the API as silence, not
      // as a number.
      rating: rating ?? undefined,
      // Both keys are omitted from the body when the lawyer typed nothing.
      feeTotalSar: totalFees,
      feePaidSar: paidFees,
      firstEngagementOn: firstEngagementOn || undefined,
    };

    try {
      // Render the new card from the SERVER's answer, never from the local
      // form state. Anything the server did not persist must not appear on
      // the card for even one render.
      //
      // There used to be a second, "demo mode" branch here that fabricated
      // this same LawyerClient object in memory and handed it to onCreated
      // without ever calling the API — on the theory that the mode check was
      // a build-time constant that could never run in production. It isn't:
      // isSupabaseMode resolves at runtime from an env var whose fallback is
      // "demo", so an unset var on a real deploy made every save silently
      // fake. createLawyerClient is now the only path, matching what
      // lawyerClientsService itself already assumes.
      const client = await createLawyerClient(input);
      onCreated(client);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
      setSubmitting(false);
      onClose();
    } catch (e: any) {
      console.error("[AddClientModal] create failed:", e);
      setError(e?.message || "تعذّر حفظ الموكّل. حاول مرة أخرى.");
      setSubmitting(false);
    }
  };

  const overlay = isDark
    ? "bg-zinc-900 border-white/[0.08]"
    : "bg-white border-slate-200";
  const inputCls = isDark
    ? "border-white/[0.06] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600"
    : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400";
  const labelCls = isDark ? "text-zinc-500" : "text-slate-400";

  const STEP_LABELS = ["البيانات الأساسية", "الأتعاب", "التصنيفات"];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className={`w-full max-w-md rounded-3xl border shadow-2xl ${overlay} overflow-hidden max-h-[92vh] flex flex-col`}
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <div>
              <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                إضافة موكّل جديد
              </h2>
              <p className={`text-[11px] ${labelCls}`}>
                الخطوة {step + 1} من 3 — {STEP_LABELS[step]}
              </p>
            </div>
            <button onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
              <X size={16} />
            </button>
          </div>

          {/* Step progress */}
          <div className={`flex gap-1 px-5 pt-4`}>
            {[0, 1, 2].map(i => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-800" : "bg-slate-100"}`} />
            ))}
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 min-h-[240px] overflow-y-auto">
            {/* Step 0: Basic info */}
            {step === 0 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>الاسم الكامل *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: أحمد محمد العتيبي"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>نوع الموكّل</label>
                  <div className="flex gap-2">
                    {(["individual", "company"] as const).map(t => (
                      <button key={t} onClick={() => setType(t)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold border transition-all ${type === t ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12]" : "border-slate-200 text-slate-500 hover:border-[#0B3D2E]/30"}`}>
                        {t === "company" ? <Buildings size={14} /> : <User size={14} />}
                        {t === "individual" ? "فرد" : "شركة"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>رقم الهاتف *</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+966 5X XXX XXXX" dir="ltr"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>البريد الإلكتروني (اختياري)</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                </div>

                {/* item 80: identity fields, shown by the type toggle above.
                    Every one of these is optional; a validation message only
                    ever appears once something has actually been typed. */}
                {type === "individual" ? (
                  <>
                    <div>
                      <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>رقم الهوية / الإقامة (اختياري)</label>
                      <input value={nationalId} onChange={e => setNationalId(e.target.value)} placeholder="١٠ أرقام" dir="ltr"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                      <p className={`text-[10px] leading-relaxed mt-1 ${labelCls}`}>
                        يُحفظ كبصمة تعريفية فقط، ولا يُخزَّن الرقم نفسه ولا يظهر لاحقًا في أي شاشة.
                      </p>
                    </div>
                    <div>
                      <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>رقم الوكالة (اختياري)</label>
                      <input value={powerOfAttorneyNo} onChange={e => setPowerOfAttorneyNo(e.target.value)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>السجل التجاري (اختياري)</label>
                      <input value={commercialRegisterNo} onChange={e => setCommercialRegisterNo(e.target.value)} placeholder="١٠ أرقام" dir="ltr"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                    </div>
                    <div>
                      <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>الرقم الضريبي (اختياري)</label>
                      <input value={taxNumber} onChange={e => setTaxNumber(e.target.value)} placeholder="١٥ رقمًا، يبدأ بـ 3" dir="ltr"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                    </div>
                    <div>
                      <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>الرقم الموحد 700 (اختياري)</label>
                      <input value={unifiedNumber700} onChange={e => setUnifiedNumber700(e.target.value)} placeholder="١٠ أرقام، يبدأ بـ 7" dir="ltr"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                    </div>
                  </>
                )}
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>المدينة (اختياري)</label>
                  <input value={city} onChange={e => setCity(e.target.value)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                </div>

                {idIssue && (
                  <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] font-semibold leading-relaxed ${isDark ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                    <Warning size={13} weight="fill" className="flex-shrink-0 mt-0.5" />
                    <span>{idIssue}</span>
                  </div>
                )}
              </motion.div>
            )}
            {/* Step 1: Fees */}
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>إجمالي الأتعاب (ريال)</label>
                  {/* Placeholder was "0", which showed a greyed-out zero in an
                      empty box — the field reading as though it would save 0.
                      It no longer saves anything at all when left blank. */}
                  <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="اختياري"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>المدفوع مقدمًا (ريال)</label>
                  <input type="number" value={paid} onChange={e => setPaid(e.target.value)} placeholder="اختياري"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${labelCls}`}>تاريخ أول تعامل (اختياري)</label>
                  <input type="date" value={firstEngagementOn} onChange={e => setFirstEngagementOn(e.target.value)} dir="ltr"
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${inputCls}`} />
                </div>
                {/* A blank fee step no longer records a 0, so say what a blank
                    now means — and say plainly that a total of zero shows
                    nothing either, rather than letting it look like it saved.
                    The last clause is the rule feePairIssue enforces: it is
                    stated before the lawyer types, not only after. */}
                <p className={`text-[10px] leading-relaxed ${labelCls}`}>
                  اترك الحقلين فارغين إن لم يُتّفق على أتعاب بعد. لا تظهر بطاقة الأتعاب في ملف الموكّل إلا إذا كان الإجمالي أكبر من صفر، ولا يُحفظ المبلغ المقدّم إلا مع إجمالي أكبر من صفر ولا يتجاوزه.
                </p>
                {/* Why «التالي» is disabled. Without this the lawyer sees a dead
                    button and no reason for it — which is the silent discard in
                    a new costume. dark:text-* on gray-100/200 would be invisible
                    (globals.css turns those into dark surfaces), hence red-400. */}
                {feeIssue && (
                  <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] font-semibold leading-relaxed ${isDark ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                    <Warning size={13} weight="fill" className="flex-shrink-0 mt-0.5" />
                    <span>{feeIssue}</span>
                  </div>
                )}
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider mb-2 block ${labelCls}`}>التقييم (اختياري)</label>
                  {/* Five stars that SET a rating and one control that clears
                      it. Clicking the lit star does NOT toggle it off: a lawyer
                      who wants exactly three would click the third star, see it
                      unset, and have no idea why. Setting and clearing are two
                      different gestures, and both are on screen. */}
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {([1,2,3,4,5] as const).map(s => (
                        <button key={s} type="button" onClick={() => setRating(s)}
                          aria-label={`تقييم ${s} من 5`}
                          aria-pressed={rating !== null && s <= rating}>
                          {/* Both attributes need the null check, not just one:
                              `s <= null` is false for every star, which would
                              render five empty stars — the right picture by
                              accident, off a comparison that is not asking
                              anything. */}
                          <Star size={22} weight={rating !== null && s <= rating ? "fill" : "regular"}
                            className={rating !== null && s <= rating ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-300"} />
                        </button>
                      ))}
                    </div>
                    {rating === null ? (
                      <span className={`text-[11px] font-bold ${labelCls}`}>لم يُقيَّم</span>
                    ) : (
                      <button type="button" onClick={() => setRating(null)}
                        className={`text-[11px] font-bold underline ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"}`}>
                        مسح التقييم
                      </button>
                    )}
                  </div>
                  {/* Says what an untouched widget now means, before the lawyer
                      wonders — the same job the fee hint above does. zinc-*,
                      never gray-100/200: globals.css redefines those as dark
                      surfaces and the line would vanish in dark mode. */}
                  <p className={`text-[10px] leading-relaxed mt-2 ${labelCls}`}>
                    اترك التقييم فارغًا إن لم تُقيّم الموكّل بعد. لا تظهر النجوم في بطاقة الموكّل ولا في ملفه إلا إذا اخترت تقييمًا.
                  </p>
                </div>
              </motion.div>
            )}
            {/* Step 2: Flags */}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <p className={`text-[11px] ${labelCls}`}>اختر التصنيفات المناسبة للموكّل:</p>
                {/* `corporate` is NOT offered here. Its label is «شركة» — the
                    same word as the «فرد / شركة» toggle in step 0, so the same
                    fact was captured twice, three steps apart, with nothing
                    coupling the two. A lawyer could set the type to «فرد» and
                    then tag the client «🏢 شركة», and the record would carry
                    both. It is derived from the toggle on submit instead, so
                    there is one answer and it is the one the lawyer gave.
                    Only the six flags the table's CHECK constraint admits are
                    offered — see OFFERABLE_FLAGS above. */}
                <div className="flex flex-wrap gap-2">
                  {OFFERABLE_FLAGS.map(flag => {
                    const conf = FLAG_CONFIG[flag];
                    if (!conf) return null;
                    return (
                      <button key={flag} onClick={() => toggleFlag(flag)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                          flags.has(flag) ? conf.bg + " " + conf.color + " border-current/30" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500"
                        }`}>
                        {conf.emoji} {conf.label}
                        {flags.has(flag) && <Check size={10} weight="bold" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>

          {/* The failure notice sits ABOVE the action row, not under it.
              It used to render as the LAST child of the modal, below the
              buttons — so on the tallest step the lawyer pressed «إضافة
              الموكّل», the modal stayed open, and the reason was off the
              bottom edge. A save that failed and a screen that says nothing.
              Nothing was wrong with the message; it was in a place the eye
              never goes.
              `role="alert"` + `aria-live="assertive"` announce it, and the ref
              scrolls it into view for the case where the body is scrolled. */}
          {error && (
            <div
              ref={errorRef}
              role="alert"
              aria-live="assertive"
              className={`mx-5 mb-3 p-3 rounded-xl flex items-center gap-2 text-[11px] font-semibold ${isDark ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
              <Warning size={14} weight="fill" className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className={`flex items-center justify-between px-5 py-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <button onClick={() => step > 0 ? setStep(s => s - 1) : onClose()} disabled={submitting}
              className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"} disabled:opacity-40`}>
              {step === 0 ? "إلغاء" : "السابق"}
            </button>
            {step < 2 ? (
              <div className="flex flex-col items-end gap-1.5">
                <button onClick={() => canNext && setStep(s => s + 1)} disabled={!canNext}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] disabled:opacity-40 transition-opacity">
                  التالي
                </button>
                {/* Step 1 already prints its own message under the fee fields,
                    and step 0 does the same above for the identity fields
                    (idIssue); this line covers the one gap neither of those
                    touches — the required name/phone pair — so a washed-out
                    «التالي» is never the only signal. */}
                {step === 0 && !canNext && !idIssue && (
                  <p className={`text-[11px] ${labelCls}`}>
                    {!name.trim() && !phone.trim()
                      ? "أدخل اسم الموكّل ورقم جواله للمتابعة"
                      : !name.trim()
                        ? "أدخل اسم الموكّل للمتابعة"
                        : "أدخل رقم جوال الموكّل للمتابعة"}
                  </p>
                )}
              </div>
            ) : (
              /* `bg-[#0B3D2E]`, not `bg-emerald-600`. Every other primary control
                 in this modal — and the «فرد» toggle inside it — is the dark
                 forest green; the final CTA was a brighter emerald, so one modal
                 shipped two brand greens and the last button looked like it came
                 from somewhere else. */
              <button onClick={handleSubmit} disabled={submitting}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-bold transition-colors ${
                  submitting
                    ? isDark
                      ? "bg-zinc-800 text-zinc-500 cursor-wait"
                      : "bg-slate-100 text-slate-400 cursor-wait"
                    : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
                }`}>
                <Check size={13} weight="bold" /> {submitting ? "جارٍ الحفظ..." : "إضافة الموكّل"}
              </button>
            )}
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
