"use client";

import { useState } from "react";
import type { WaStep, UserCategory } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaFlowState {
  step: WaStep;
  history: WaStep[];
  selections: Record<string, string>;
  detailsTitle: string;
  detailsDesc: string;
  contractNotes: string;
  repDetails: string;
  calDay: string | null;
  calSlot: string | null;
}

export interface WaFlowActions {
  goTo: (next: WaStep) => void;
  goBack: () => void;
  closeAll: () => void;
  select: (key: string, value: string) => void;
  setDetailsTitle: (v: string) => void;
  setDetailsDesc: (v: string) => void;
  setContractNotes: (v: string) => void;
  setRepDetails: (v: string) => void;
  setCalDay: (v: string | null) => void;
  setCalSlot: (v: string | null) => void;
}

// ─── Step Dots Map ────────────────────────────────────────────────────────────

const STEP_DOTS_MAP: Partial<Record<WaStep, { current: number; total: number }>> = {
  "consult-timing":             { current: 0, total: 6 },
  "consult-instant-modality":   { current: 1, total: 5 },
  "consult-instant-provider":   { current: 2, total: 5 },
  "consult-details":            { current: 3, total: 5 },
  "consult-next-details":       { current: 0, total: 4 },
  "consult-next-modality":      { current: 1, total: 4 },
  "consult-specific-details":   { current: 0, total: 4 },
  "consult-specific-modality":  { current: 1, total: 4 },
  "consult-calendar":           { current: 2, total: 4 },
  "contract-type":              { current: 0, total: 4 },
  "contract-service":           { current: 1, total: 4 },
  "contract-details":           { current: 2, total: 4 },
  "representation-sub":         { current: 0, total: 7 },
  "representation-specialty":   { current: 1, total: 7 },
  "representation-city":        { current: 2, total: 7 },
  "representation-role":        { current: 3, total: 7 },
  "representation-stage":       { current: 4, total: 7 },
  "representation-details":     { current: 5, total: 7 },
  "notary-type":                { current: 0, total: 4 },
  "notary-location":            { current: 1, total: 4 },
  "notary-urgency":             { current: 2, total: 4 },
  "payment-summary":            { current: 3, total: 4 },
  "payment-method":             { current: 4, total: 5 },
};

const STEP_HEADERS: Partial<Record<WaStep, string>> = {
  "user-type":                "من أنت؟",
  "service-select":           "ماذا تحتاج؟",
  "consult-timing":           "متى تريد الاستشارة؟",
  "consult-instant-modality": "طريقة الاستشارة الفورية",
  "consult-instant-provider": "من يقدم الاستشارة؟",
  "consult-details":          "تفاصيل طلبك",
  "consult-next-details":     "تفاصيل طلبك",
  "consult-specific-details": "تفاصيل طلبك",
  "consult-next-modality":    "طريقة الاستشارة",
  "consult-specific-modality":"طريقة الاستشارة",
  "consult-calendar":         "اختر الموعد",
  "contract-type":            "نوع العقد",
  "contract-service":         "نوع المراجعة",
  "contract-details":         "ارفع العقد",
  "representation-sub":       "نوع الخدمة",
  "representation-specialty": "التخصص القانوني",
  "representation-city":      "المدينة",
  "representation-role":      "صفتك في القضية",
  "representation-stage":     "مرحلة القضية",
  "representation-details":   "تفاصيل إضافية",
  "notary-type":              "نوع الوثيقة",
  "notary-location":          "طريقة التوثيق",
  "notary-urgency":           "الاستعجال",
  "payment-summary":          "ملخص طلبك",
  "payment-method":           "طريقة الدفع",
  "success":                  "تم استلام طلبك",
  "customer-service":         "خدمة العملاء",
  "ai-chat":                  "المستشار الذكي",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWhatsAppFlow(onClose: () => void) {
  const [step, setStep] = useState<WaStep>("user-type");
  const [history, setHistory] = useState<WaStep[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsDesc, setDetailsDesc] = useState("");
  const [contractNotes, setContractNotes] = useState("");
  const [repDetails, setRepDetails] = useState("");
  const [calDay, setCalDay] = useState<string | null>(null);
  const [calSlot, setCalSlot] = useState<string | null>(null);

  const goTo = (next: WaStep) => {
    setHistory((h) => [...h, step]);
    setStep(next);
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    if (prev) {
      setStep(prev);
      setHistory((h) => h.slice(0, -1));
    }
  };

  const closeAll = () => {
    onClose();
    setTimeout(() => {
      setStep("user-type");
      setHistory([]);
      setSelections({});
      setDetailsTitle("");
      setDetailsDesc("");
      setContractNotes("");
      setRepDetails("");
      setCalDay(null);
      setCalSlot(null);
    }, 300);
  };

  const select = (key: string, value: string) =>
    setSelections((s) => ({ ...s, [key]: value }));

  const getStepDots = () => STEP_DOTS_MAP[step] ?? null;
  const getStepHeader = () => STEP_HEADERS[step] ?? "";
  const showBack = history.length > 0 && step !== "success";

  return {
    // state
    step, history, selections,
    detailsTitle, detailsDesc, contractNotes, repDetails,
    calDay, calSlot,
    // derived
    showBack,
    getStepDots,
    getStepHeader,
    // actions
    goTo, goBack, closeAll, select,
    setDetailsTitle, setDetailsDesc, setContractNotes, setRepDetails,
    setCalDay, setCalSlot,
  };
}
