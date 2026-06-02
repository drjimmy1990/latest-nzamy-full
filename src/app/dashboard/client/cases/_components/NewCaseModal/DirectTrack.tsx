"use client";

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Layout, Warning, CheckCircle, Microphone, Stop, PaperclipHorizontal, X, CaretLeft, ArrowRight, Users } from '@phosphor-icons/react';
import { CASE_TYPES, LEGAL_DOMAINS, CASE_STATUS_OPTIONS, OPPOSING_ENTITY_OPTIONS, REQUIRES_DOCS_TYPES, DirectStep, ConsultSubStep, CONSULT_DOMAINS, Track, NewCaseModalProps } from './_data';

export function DirectTrack({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<DirectStep>('type');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  // NEW: client role & case status
  const [clientRole, setClientRole] = useState<'plaintiff' | 'defendant' | null>(null);
  const [caseStatus, setCaseStatus] = useState<'new' | 'ongoing' | 'judgment' | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  // NEW: opposing party
  const [opposingName, setOpposingName] = useState('');
  const [opposingType, setOpposingType] = useState<'individual' | 'company' | 'government' | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [hasVoice, setHasVoice] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const steps: DirectStep[] = ['type', 'role', 'domain', 'details', 'done'];
  const stepLabels: Record<DirectStep, string> = {
    type: 'نوع القضية',
    role: 'صفتك',
    domain: 'الفرع القانوني',
    details: 'التفاصيل',
    done: 'تم',
  };

  const needsDocs = selectedType ? REQUIRES_DOCS_TYPES.includes(selectedType) : false;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAttachments(prev => [...prev, ...files.map(f => f.name)]);
  }

  const canNext =
    (step === 'type' && selectedType) ||
    (step === 'role' && clientRole && caseStatus) ||
    (step === 'domain' && selectedDomain) ||
    (step === 'details' && description.trim().length > 20);

  function nextStep() {
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  }
  function prevStep() {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  }

  if (step === 'done') {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center py-6 gap-4 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check size={28} className="text-emerald-600" weight="bold" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-lg mb-1">تم تسجيل القضية!</h3>
          <p className="text-sm text-gray-500">قضيتك الآن في انتظار المراجعة من قِبل المحامي المختص.</p>
        </div>
        {/* What happens next */}
        <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-right space-y-2">
          <p className="text-xs font-bold text-gray-700 mb-1">ماذا يحدث الآن؟</p>
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] flex items-center justify-center text-[10px] font-bold flex-shrink-0">١</span>
            <span>سيراجع أحد محامينا المختصين تفاصيل القضية خلال ٢٤–٤٨ ساعة.</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] flex items-center justify-center text-[10px] font-bold flex-shrink-0">٢</span>
            <span>ستصلك رسالة واتساب بعرض الأتعاب وتأكيد القبول.</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] flex items-center justify-center text-[10px] font-bold flex-shrink-0">٣</span>
            <span>بعد موافقتك تُفعَّل القضية وتجد تفاصيلها في لوحة التحكم.</span>
          </div>
        </div>
        <div className="w-full flex flex-col gap-2">
          <a
            href="/dashboard/client/cases"
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] transition-colors"
          >
            <Layout size={15} />
            متابعة قضاياي
          </a>
          <button
            onClick={onClose}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-6">
        {(['type', 'role', 'domain', 'details'] as DirectStep[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              steps.indexOf(step) > i ? 'bg-[#0B3D2E]' : steps.indexOf(step) === i ? 'bg-[#0B3D2E]/40' : 'bg-gray-100'
            }`} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mb-4 font-medium tracking-wider uppercase">{stepLabels[step]}</p>

      <AnimatePresence mode="wait">
        {/* Step 1: Case type */}
        {step === 'type' && (
          <motion.div key="type" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="grid grid-cols-2 gap-2">
              {CASE_TYPES.map(ct => {
                const Icon = ct.icon;
                const isUrgent = ['appeal', 'cassation'].includes(ct.id);
                return (
                  <button
                    key={ct.id}
                    onClick={() => setSelectedType(ct.id)}
                    className={`p-3 rounded-xl border text-right transition-all relative ${
                      selectedType === ct.id
                        ? 'border-[#0B3D2E] bg-[#0B3D2E]/5 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {isUrgent && (
                      <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">⏰ مواعيد</span>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={15} className={selectedType === ct.id ? 'text-[#0B3D2E]' : 'text-gray-400'} />
                      <span className={`text-sm font-bold ${selectedType === ct.id ? 'text-[#0B3D2E]' : 'text-gray-800'}`}>
                        {ct.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-snug">{ct.desc}</p>
                  </button>
                );
              })}
            </div>
            {/* Smart warning for types needing prior docs */}
            {needsDocs && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200"
              >
                <Warning size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-amber-700 leading-snug">
                  هذا النوع يستلزم <strong>مستندات سابقة</strong> — ستحتاج لرفع: ضبوط الجلسات / المذكرات السابقة / صورة الحكم في خطوة التفاصيل.
                </p>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Step 1.5: Client role & case status — NEW */}
        {step === 'role' && (
          <motion.div key="role" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
            {/* Client role: plaintiff vs defendant */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-3">أنت في هذه القضية:</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setClientRole('plaintiff')}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    clientRole === 'plaintiff' ? 'border-[#0B3D2E] bg-[#0B3D2E]/5 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`text-base font-bold mb-1 ${clientRole === 'plaintiff' ? 'text-[#0B3D2E]' : 'text-gray-800'}`}>مُدَّعٍ</p>
                  <p className="text-[10px] text-gray-500">أنت ترفع الدعوى</p>
                </button>
                <button
                  onClick={() => setClientRole('defendant')}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    clientRole === 'defendant' ? 'border-[#0B3D2E] bg-[#0B3D2E]/5 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`text-base font-bold mb-1 ${clientRole === 'defendant' ? 'text-[#0B3D2E]' : 'text-gray-800'}`}>مُدَّعى عليه</p>
                  <p className="text-[10px] text-gray-500">دعوى مرفوعة ضدّك</p>
                </button>
              </div>
            </div>
            {/* Case status */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-3">حالة القضية:</p>
              <div className="flex flex-col gap-2">
                {CASE_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setCaseStatus(opt.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${
                      caseStatus === opt.id ? 'border-[#0B3D2E] bg-[#0B3D2E]/5' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${caseStatus === opt.id ? 'text-[#0B3D2E]' : 'text-gray-800'}`}>{opt.label}</p>
                      <p className="text-[10px] text-gray-500">{opt.desc}</p>
                    </div>
                    {caseStatus === opt.id && <CheckCircle size={16} weight="fill" className="text-[#0B3D2E] flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: Legal domain */}
        {step === 'domain' && (
          <motion.div key="domain" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="grid grid-cols-4 gap-2">
              {LEGAL_DOMAINS.map(ld => {
                const Icon = ld.icon;
                return (
                  <button
                    key={ld.id}
                    onClick={() => setSelectedDomain(ld.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                      selectedDomain === ld.id
                        ? 'border-[#0B3D2E] bg-[#0B3D2E]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={20} className={selectedDomain === ld.id ? 'text-[#0B3D2E]' : 'text-gray-400'} />
                    <span className={`text-xs font-semibold ${selectedDomain === ld.id ? 'text-[#0B3D2E]' : 'text-gray-700'}`}>
                      {ld.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Step 3: Details */}
        {step === 'details' && (
          <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            {/* Smart warning if type needs docs */}
            {needsDocs && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <Warning size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-amber-700 leading-snug">
                  ⚠️ <strong>هذا النوع يستلزم مستندات سابقة</strong> — ارفع: ضبوط الجلسات / المذكرات السابقة / صورة الحكم
                </p>
              </div>
            )}

            {/* Opposing party — NEW */}
            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 space-y-3">
              <p className="text-xs font-semibold text-gray-700">الطرف الآخر (اختياري)</p>
              <input
                type="text"
                value={opposingName}
                onChange={e => setOpposingName(e.target.value)}
                placeholder="اسم الطرف الآخر (الخصم)"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#0B3D2E]/20"
              />
              <div className="flex gap-2">
                {OPPOSING_ENTITY_OPTIONS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setOpposingType(t.id)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      opposingType === t.id ? 'border-[#0B3D2E] bg-[#0B3D2E]/5 text-[#0B3D2E]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">وصف موجز للقضية <span className="text-red-500">*</span></label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="اشرح قضيتك بإيجاز — ما هي المشكلة؟ ما الذي تطمح إليه؟ هل هناك حكم سابق؟"
                rows={4}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 resize-none"
              />
              <p className={`text-[10px] mt-1 ${description.length < 20 ? 'text-red-400' : 'text-gray-400'}`}>
                {description.length < 20 ? `${20 - description.length} حرف على الأقل` : 'ممتاز ✓'}
              </p>
            </div>

            {/* Voice memo */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">تسجيل صوتي (اختياري)</label>
              {hasVoice ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                  <Microphone size={16} className="text-emerald-600" />
                  <span className="text-xs text-emerald-700 font-medium flex-1">تم تسجيل ملاحظة صوتية</span>
                  <button onClick={() => setHasVoice(false)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                </div>
              ) : (
                <button
                  onClick={() => { setRecording(r => !r); setTimeout(() => { setRecording(false); setHasVoice(true); }, 2000); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    recording
                      ? 'border-red-300 bg-red-50 text-red-600 animate-pulse'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {recording ? <Stop size={14} weight="fill" /> : <Microphone size={14} />}
                  {recording ? 'جارٍ التسجيل...' : 'سجّل ملاحظة صوتية'}
                </button>
              )}
            </div>

            {/* Attachments */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">المرفقات (اختيارية)</label>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 hover:border-[#0B3D2E] hover:text-[#0B3D2E] transition-colors w-full justify-center"
              >
                <PaperclipHorizontal size={14} />
                أضف مستندات أو صور
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileChange} />
              {attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {attachments.map((name, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                      <CheckCircle size={12} className="text-emerald-500" weight="fill" />
                      <span className="truncate flex-1">{name}</span>
                      <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary chip — enhanced */}
            <div className="p-3 rounded-xl bg-[#0B3D2E]/4 border border-[#0B3D2E]/10 flex flex-wrap gap-2">
              <span className="text-[11px] text-[#0B3D2E] font-semibold px-2 py-0.5 bg-[#0B3D2E]/10 rounded-full">
                {CASE_TYPES.find(c => c.id === selectedType)?.label}
              </span>
              <span className="text-[11px] text-[#0B3D2E] font-semibold px-2 py-0.5 bg-[#0B3D2E]/10 rounded-full">
                {LEGAL_DOMAINS.find(d => d.id === selectedDomain)?.label}
              </span>
              {clientRole && (
                <span className="text-[11px] text-purple-700 font-semibold px-2 py-0.5 bg-purple-100 rounded-full">
                  {clientRole === 'plaintiff' ? 'مُدَّعٍ' : 'مُدَّعى عليه'}
                </span>
              )}
              {opposingName && (
                <span className="text-[11px] text-blue-700 font-semibold px-2 py-0.5 bg-blue-100 rounded-full">
                  خصمك: {opposingName}
                </span>
              )}
              {hasVoice && <span className="text-[11px] text-emerald-700 font-semibold px-2 py-0.5 bg-emerald-100 rounded-full">🎙 صوتي</span>}
              {attachments.length > 0 && <span className="text-[11px] text-blue-700 font-semibold px-2 py-0.5 bg-blue-100 rounded-full">📎 {attachments.length} مرفق</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100">
        {step !== 'type' ? (
          <button onClick={prevStep} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <CaretLeft size={14} />
            السابق
          </button>
        ) : <div />}
        <button
          onClick={nextStep}
          disabled={!canNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {step === 'details' ? 'إرسال القضية' : 'التالي'}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}