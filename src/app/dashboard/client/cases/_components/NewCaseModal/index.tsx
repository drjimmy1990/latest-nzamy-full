"use client";

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Layout, Warning, CheckCircle, Microphone, Stop, PaperclipHorizontal, X, CaretLeft, ArrowRight, Users } from '@phosphor-icons/react';
import { CASE_TYPES, LEGAL_DOMAINS, CASE_STATUS_OPTIONS, OPPOSING_ENTITY_OPTIONS, REQUIRES_DOCS_TYPES, DirectStep, ConsultSubStep, CONSULT_DOMAINS, Track, NewCaseModalProps } from './_data';

import { DirectTrack } from './DirectTrack';
import { ConsultTrack } from './ConsultTrack';
import { ChatCircle, FileText } from '@phosphor-icons/react';

export function NewCaseModal({ onClose }: NewCaseModalProps) {
  const [track, setTrack] = useState<Track>('choose');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 16 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">قضية جديدة</h2>
            {track !== 'choose' && (
              <button onClick={() => setTrack('choose')} className="text-xs text-[#0B3D2E] hover:underline mt-0.5">
                ← تغيير المسار
              </button>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          <AnimatePresence mode="wait">
            {/* Track chooser */}
            {track === 'choose' && (
              <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-sm text-gray-500 mb-5">كيف تريد المضي قُدُماً؟</p>

                <div className="space-y-3">
                  {/* Option A: consult first */}
                  <button
                    onClick={() => setTrack('consult')}
                    className="w-full flex items-start gap-4 p-4 rounded-2xl border border-royal/20 bg-royal/3 hover:bg-royal/6 hover:border-royal/35 transition-all text-right group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#0B3D2E]/15">
                      <ChatCircle size={20} className="text-[#0B3D2E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm mb-0.5">احجز استشارة أولاً</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        تحدث مع محامي مختص قبل تقديم القضية — قيمة الاستشارة <span className="font-semibold text-[#0B3D2E]">تُخصم من أتعاب القضية لاحقاً</span>.
                      </p>
                      <span className="inline-block mt-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        موصى به للقضايا المعقدة
                      </span>
                    </div>
                  </button>

                  {/* Option B: direct intake */}
                  <button
                    onClick={() => setTrack('direct')}
                    className="w-full flex items-start gap-4 p-4 rounded-2xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 transition-all text-right group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200">
                      <FileText size={20} className="text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm mb-0.5">أعرف ما أريد — قدّم القضية مباشرة</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        اختر نوع القضية والفرع القانوني، أضف التفاصيل والمرفقات، وتسجيل صوتي إن أردت.
                      </p>
                    </div>
                  </button>
                </div>

                <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                  <Warning size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-amber-700 leading-snug">
                    نُنصح دائماً بالاستشارة القانونية قبل اتخاذ أي خطوة رسمية. المنصة تيسّر وصولك للمحامي المناسب.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Consult track — full booking sub-flow */}
            {track === 'consult' && (
              <motion.div key="consult" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <ConsultTrack onClose={onClose} />
              </motion.div>
            )}

            {/* Direct track */}
            {track === 'direct' && (
              <motion.div key="direct" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <DirectTrack onClose={onClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}