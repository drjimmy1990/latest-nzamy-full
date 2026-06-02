"use client";

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Layout, Warning, CheckCircle, Microphone, Stop, PaperclipHorizontal, X, CaretLeft, ArrowRight, Users, Lightning, ClockCountdown, CalendarBlank } from '@phosphor-icons/react';
import { CASE_TYPES, LEGAL_DOMAINS, CASE_STATUS_OPTIONS, OPPOSING_ENTITY_OPTIONS, REQUIRES_DOCS_TYPES, DirectStep, ConsultSubStep, CONSULT_DOMAINS, Track, NewCaseModalProps } from './_data';

export function ConsultTrack({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ConsultSubStep>('domain');
  const [domain, setDomain] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<string | null>(null);
  const [timing, setTiming] = useState<string | null>(null);

  const steps: ConsultSubStep[] = ['domain', 'urgency', 'timing', 'done'];

  function nextStep() {
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  }
  function prevStep() {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  }

  const URGENCY_OPTIONS = [
    { id: 'instant', label: 'فوري', desc: 'خلال ١٥–٢٠ دقيقة', icon: Lightning, badge: 'الأسرع', badgeColor: 'bg-orange-100 text-orange-700' },
    { id: 'soonest', label: 'أقرب وقت متاح', desc: 'نُشعرك فور توفر موعد', icon: ClockCountdown, badge: null, badgeColor: '' },
    { id: 'scheduled', label: 'موعد محدد', desc: 'اختر اليوم والوقت بنفسك', icon: CalendarBlank, badge: null, badgeColor: '' },
  ];

  const TIMING_OPTIONS = [
    { id: 'morning', label: 'الصباح', desc: '٩:٠٠ ص – ١٢:٠٠ م' },
    { id: 'afternoon', label: 'الظهر والمساء', desc: '١٢:٠٠ م – ٦:٠٠ م' },
    { id: 'evening', label: 'المساء المتأخر', desc: '٦:٠٠ م – ١٠:٠٠ م' },
  ];

  const canNext =
    (step === 'domain' && domain) ||
    (step === 'urgency' && urgency) ||
    (step === 'timing' && timing);

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
          <h3 className="font-bold text-gray-900 text-lg mb-1">طلب الاستشارة وصل!</h3>
          <p className="text-sm text-gray-500">سنطابقك مع المحامي المناسب وفق تخصصك وتوقيتك المفضل.</p>
        </div>

        <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-right space-y-2">
          <p className="text-xs font-bold text-gray-700 mb-1">ماذا يحدث الآن؟</p>
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] flex items-center justify-center text-[10px] font-bold flex-shrink-0">١</span>
            <span>سنُطابقك مع محامٍ متخصص في {CONSULT_DOMAINS.find(d => d.id === domain)?.label} خلال دقائق.</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] flex items-center justify-center text-[10px] font-bold flex-shrink-0">٢</span>
            <span>ستصلك رسالة واتساب بعرض المحامي وسعر الاستشارة.</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] flex items-center justify-center text-[10px] font-bold flex-shrink-0">٣</span>
            <span>قيمة الاستشارة ستُخصم من أتعاب القضية عند التعاقد.</span>
          </div>
        </div>

        <div className="w-full flex flex-col gap-2">
          <a
            href="/dashboard/client/find-lawyer"
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] transition-colors"
          >
            <Users size={15} />
            تصفح المحامين الآن
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
        {(['domain', 'urgency', 'timing'] as ConsultSubStep[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              steps.indexOf(step) > i ? 'bg-[#0B3D2E]' : steps.indexOf(step) === i ? 'bg-[#0B3D2E]/40' : 'bg-gray-100'
            }`} />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Legal domain */}
        {step === 'domain' && (
          <motion.div key="domain" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <p className="text-[11px] text-gray-400 mb-3 font-medium tracking-wider uppercase">مجال الاستشارة</p>
            <div className="grid grid-cols-4 gap-2">
              {CONSULT_DOMAINS.map(d => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDomain(d.id)}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                      domain === d.id
                        ? 'border-[#0B3D2E] bg-[#0B3D2E]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {d.urgent && (
                      <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-red-500 text-white px-1 py-0.5 rounded-full leading-none">⚡ حساس</span>
                    )}
                    <Icon size={20} className={domain === d.id ? 'text-[#0B3D2E]' : 'text-gray-400'} />
                    <span className={`text-xs font-semibold ${domain === d.id ? 'text-[#0B3D2E]' : 'text-gray-700'}`}>
                      {d.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Step 2: Urgency */}
        {step === 'urgency' && (
          <motion.div key="urgency" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <p className="text-[11px] text-gray-400 mb-3 font-medium tracking-wider uppercase">متى تريد الاستشارة؟</p>
            <div className="flex flex-col gap-2">
              {URGENCY_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setUrgency(opt.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${
                      urgency === opt.id
                        ? 'border-[#0B3D2E] bg-[#0B3D2E]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={18} className={urgency === opt.id ? 'text-[#0B3D2E]' : 'text-gray-400'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${urgency === opt.id ? 'text-[#0B3D2E]' : 'text-gray-800'}`}>{opt.label}</span>
                        {opt.badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.badgeColor}`}>{opt.badge}</span>}
                      </div>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Step 3: Timing preference */}
        {step === 'timing' && (
          <motion.div key="timing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <p className="text-[11px] text-gray-400 mb-3 font-medium tracking-wider uppercase">الوقت المفضل للاستشارة</p>
            <div className="flex flex-col gap-2">
              {TIMING_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setTiming(opt.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${
                    timing === opt.id
                      ? 'border-[#0B3D2E] bg-[#0B3D2E]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${timing === opt.id ? 'text-[#0B3D2E]' : 'text-gray-800'}`}>{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            {/* Summary chip */}
            <div className="mt-3 p-3 rounded-xl bg-[#0B3D2E]/4 border border-[#0B3D2E]/10 flex flex-wrap gap-2">
              <span className="text-[11px] text-[#0B3D2E] font-semibold px-2 py-0.5 bg-[#0B3D2E]/10 rounded-full">
                {CONSULT_DOMAINS.find(d => d.id === domain)?.label}
              </span>
              <span className="text-[11px] text-[#0B3D2E] font-semibold px-2 py-0.5 bg-[#0B3D2E]/10 rounded-full">
                {URGENCY_OPTIONS.find(o => o.id === urgency)?.label}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100">
        {step !== 'domain' ? (
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
          {step === 'timing' ? 'تأكيد الطلب' : 'التالي'}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}