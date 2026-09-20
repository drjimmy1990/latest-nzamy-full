/**
 * Nezamy Academy (أكاديمية نظامي)
 * Comprehensive TypeScript definitions for Questions, Categories, Exams, Attempts, and Certificates.
 * Aligned with the 30 Saudi Legal Library Sections (00-29).
 */

export type QuestionType = 'mcq' | 'tf' | 'match' | 'scenario';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export type AcademyCategoryId =
  | 'all'
  | 'procedural'
  | 'criminal'
  | 'admin'
  | 'civil'
  | 'commercial'
  | 'ip'
  | 'labor'
  | 'real_estate'
  | 'financial'
  | 'tax'
  | 'health'
  | 'environment'
  | 'tech'
  | 'transport'
  | 'energy'
  | 'media'
  | 'industrial'
  | 'constitutional'
  | 'agriculture'
  | 'investment'
  | 'education'
  | 'sports'
  | 'hajj'
  | 'defense'
  | 'social'
  | 'tourism'
  | 'municipal'
  | 'cultural'
  | 'arbitration'
  | 'international';

export interface StatutoryCitation {
  instrument: string;       // e.g. "نظام الشركات", "نظام المعاملات المدنية"
  decreeNo?: string;        // e.g. "م/132", "م/191"
  article: string;          // e.g. "المادة الثامنة والستون", "المادة 15"
  textSnippet?: string;     // Literal quote from the law/regulation
}

export interface MatchPair {
  a: string; // Term / Concept
  b: string; // Definition / Rule
}

export interface AcademyQuestion {
  id: string;
  categoryId: AcademyCategoryId;
  categoryNumber: string;    // "00" to "29"
  categoryName: string;      // Arabic display name
  lawSlug?: string;          // e.g. "companies-law-1443"
  lawName: string;           // e.g. "نظام الشركات لعام 1443هـ"
  articleNumber?: string;    // e.g. "المادة 68"
  type: QuestionType;
  difficulty: DifficultyLevel;
  tags: string[];
  question: string;
  options?: string[];        // 4 choices for mcq & scenario
  correctAnswer: number;     // 0-3 for mcq, 0/1 for tf (0=false, 1=true), or mapped index
  explanation: string;       // Detailed legal rationale
  statutoryCitation: StatutoryCitation;
  pairs?: MatchPair[];       // Required if type === 'match'
}

export interface AcademyCategoryMeta {
  id: AcademyCategoryId;
  categoryNumber: string;
  label: string;
  shortDescription: string;
  iconName?: string;
  colorGradient?: string;
}

export interface QuizAttemptPayload {
  userId?: string;
  categoryIds: AcademyCategoryId[];
  questionsCount: number;
  score: number;
  percentage: number;
  timeSpentSeconds: number;
  answers: {
    questionId: string;
    selectedOption: number;
    isCorrect: boolean;
  }[];
}

export interface QuizAttemptResult extends QuizAttemptPayload {
  id: string;
  completedAt: string;
  peerPercentile: number;
  certificateEarned?: boolean;
}

export interface AcademyCertificate {
  id: string;
  userId: string;
  userName: string;
  courseTitle: string;
  categoryName: string;
  score: number;
  issuedDateHijri: string;
  issuedDateGregorian: string;
  verifyId: string;
  badgeUrl?: string;
}
