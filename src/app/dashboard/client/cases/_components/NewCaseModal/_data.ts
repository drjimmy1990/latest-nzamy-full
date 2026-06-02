"use client";

import { ArrowRight, BookOpen, Buildings, FileText, Gavel, HouseLine, Lightning, Scales, ShieldCheck, Users, ClockCountdown, CalendarBlank, Briefcase } from "@phosphor-icons/react";

export interface NewCaseModalProps {
  onClose: () => void;
}

export type Track = 'choose' | 'consult' | 'direct';
export type DirectStep = 'type' | 'role' | 'domain' | 'details' | 'done';
export type ConsultSubStep = 'domain' | 'urgency' | 'timing' | 'done';

export const CASE_TYPES = [
  { id: 'appeal', label: 'استئناف', icon: ArrowRight, desc: 'الطعن في حكم ابتدائي أمام محكمة الاستئناف' },
  { id: 'cassation', label: 'نقض', icon: Gavel, desc: 'الطعن في حكم استئنافي أمام المحكمة العليا' },
  { id: 'review', label: 'التماس إعادة النظر', icon: BookOpen, desc: 'طلب إعادة النظر في حكم نهائي' },
  { id: 'response_memo', label: 'مذكرة رد', icon: FileText, desc: 'الرد على مذكرة الخصم في قضية قائمة' },
  { id: 'new_case', label: 'قضية جديدة (تحرير دعوى)', icon: Scales, desc: 'رفع دعوى ابتدائية أمام المحكمة المختصة' },
  { id: 'execution', label: 'تنفيذ حكم', icon: ShieldCheck, desc: 'طلب تنفيذ حكم صادر لصالحك' },
];

export const LEGAL_DOMAINS = [
  { id: 'labor', label: 'عمالي', icon: Users },
  { id: 'commercial', label: 'تجاري', icon: Buildings },
  { id: 'real_estate', label: 'عقاري', icon: HouseLine },
  { id: 'family', label: 'أسرة', icon: Users },
  { id: 'civil', label: 'مدني', icon: Briefcase },
  { id: 'criminal', label: 'جزائي', icon: Gavel },
  { id: 'administrative', label: 'إداري', icon: ShieldCheck },
  { id: 'other', label: 'أخرى', icon: BookOpen },
];

export const REQUIRES_DOCS_TYPES = ['appeal', 'cassation', 'review', 'response_memo'];

export const CASE_STATUS_OPTIONS: { id: 'new' | 'ongoing' | 'judgment'; label: string; desc: string }[] = [
  { id: 'new', label: 'جديدة', desc: 'لم تُرفع بعد' },
  { id: 'ongoing', label: 'قائمة', desc: 'لديك قضية وتحتاج مذكرة رد' },
  { id: 'judgment', label: 'صدر حكم', desc: 'تريد استئنافاً أو طعناً' },
];

export const OPPOSING_ENTITY_OPTIONS: { id: 'individual' | 'company' | 'government'; label: string }[] = [
  { id: 'individual', label: 'فرد' },
  { id: 'company', label: 'شركة' },
  { id: 'government', label: 'جهة حكومية' },
];

export const CONSULT_DOMAINS = [
  { id: 'labor', label: 'عمالي', icon: Users, urgent: false },
  { id: 'family', label: 'أسرة', icon: HouseLine, urgent: false },
  { id: 'commercial', label: 'تجاري', icon: Buildings, urgent: false },
  { id: 'real_estate', label: 'عقاري', icon: Briefcase, urgent: false },
  { id: 'criminal', label: 'جزائي', icon: Gavel, urgent: true },
  { id: 'administrative', label: 'إداري', icon: ShieldCheck, urgent: false },
  { id: 'civil', label: 'مدني', icon: Scales, urgent: false },
  { id: 'other', label: 'أخرى', icon: BookOpen, urgent: false },
];
