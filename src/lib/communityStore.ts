"use client";

export type CommunityTab = "public" | "lawyers";
export type CommunityCategory = "all" | "labor" | "commercial" | "civil" | "criminal" | "family" | "real-estate";

export type StoredCommunityAnswer = {
  id: number;
  author: string;
  authorType: "lawyer" | "user";
  authorRating: number;
  authorYears?: number;
  content: string;
  votes: number;
  isAccepted: boolean;
  ago: string;
};

export type StoredCommunityQuestion = {
  id: number;
  tab: CommunityTab;
  category: Exclude<CommunityCategory, "all">;
  title: string;
  body?: string;
  asker: string;
  askerType: "guest" | "user" | "lawyer";
  answers: StoredCommunityAnswer[];
  views: number;
  votes: number;
  isAnswered: boolean;
  ago: string;
  tags: string[];
};

export type CommunityQuestionInput = {
  title: string;
  body?: string;
  category: Exclude<CommunityCategory, "all">;
  asker: string;
  askerType: "guest" | "user" | "lawyer";
  isAnonymous?: boolean;
};

export const COMMUNITY_STORAGE_KEY = "nzamy_community_questions_v1";
export const COMMUNITY_UPDATED_EVENT = "nzamy-community-updated";

export function readCommunityQuestionsLocal(): StoredCommunityQuestion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COMMUNITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCommunityQuestionsLocal(questions: StoredCommunityQuestion[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(questions));
  window.dispatchEvent(new CustomEvent(COMMUNITY_UPDATED_EVENT));
}

export function createCommunityQuestion(input: CommunityQuestionInput): StoredCommunityQuestion {
  const question: StoredCommunityQuestion = {
    id: Date.now(),
    tab: "public",
    category: input.category,
    title: input.title.trim(),
    body: input.body?.trim() || undefined,
    asker: input.isAnonymous ? "مستخدم مجهول" : input.asker,
    askerType: input.askerType,
    answers: [],
    views: 0,
    votes: 0,
    isAnswered: false,
    ago: "الآن",
    tags: [],
  };
  writeCommunityQuestionsLocal([question, ...readCommunityQuestionsLocal()]);
  return question;
}

export function findCommunityQuestionLocal(id: number) {
  return readCommunityQuestionsLocal().find((question) => question.id === id) ?? null;
}

/**
 * A demo-mode question by id: this browser's saved questions first, then the
 * seed list the demo feed shows beside them (ALL_QUESTIONS in
 * src/constants/communityData.ts). The lookup read the saved list only, so
 * every seed card on /community opened «هذا السؤال غير موجود» (N19, fix plan
 * 2026-10-16). The seed is an argument: communityData.ts loads icons, and
 * `node --test` loads this file.
 */
export function findDemoCommunityQuestion<T extends { id: number }>(
  id: number,
  saved: readonly T[],
  seed: readonly T[],
): T | null {
  if (!Number.isFinite(id)) return null;
  return saved.find((question) => question.id === id) ?? seed.find((question) => question.id === id) ?? null;
}

/**
 * The demo feed: this browser's questions first, then every seed question this
 * browser has not already saved a copy of (a seed question that was answered
 * here is stored with its new answer, and that copy wins). Without the
 * de-duplication an answered seed card would appear twice.
 */
export function mergeDemoFeed<T extends { id: number }>(saved: readonly T[], seed: readonly T[]): T[] {
  const savedIds = new Set(saved.map((question) => question.id));
  return [...saved, ...seed.filter((question) => !savedIds.has(question.id))];
}

/**
 * Pure core of `addCommunityAnswerLocal`: the saved list after `answer` is added
 * to question `questionId`, plus the answer as stored. Owner decision ١١٥ (demo
 * self-consistent and local only): a SEED question — one the demo feed shows but
 * this browser never saved — used to be unanswerable («تعذّر حفظ الإجابة: السؤال
 * غير موجود», N19), because only the saved list was searched. It is now copied
 * into the saved list together with the answer. `null` only when the id is in
 * neither list.
 */
export function withDemoAnswer(
  saved: readonly StoredCommunityQuestion[],
  seed: readonly StoredCommunityQuestion[],
  questionId: number,
  answer: Omit<StoredCommunityAnswer, "id" | "votes" | "isAccepted" | "ago">,
  now: number,
): { next: StoredCommunityQuestion[]; savedAnswer: StoredCommunityAnswer } | null {
  const stored: StoredCommunityAnswer = { ...answer, id: now, votes: 0, isAccepted: false, ago: "الآن" };
  const answered = (question: StoredCommunityQuestion): StoredCommunityQuestion => ({
    ...question,
    isAnswered: true,
    answers: [...(question.answers ?? []), stored],
  });
  if (saved.some((question) => question.id === questionId)) {
    return {
      next: saved.map((question) => (question.id === questionId ? answered(question) : question)),
      savedAnswer: stored,
    };
  }
  const fromSeed = seed.find((question) => question.id === questionId);
  if (!fromSeed) return null;
  return { next: [answered(fromSeed), ...saved], savedAnswer: stored };
}

export function addCommunityAnswerLocal(
  questionId: number,
  answer: Omit<StoredCommunityAnswer, "id" | "votes" | "isAccepted" | "ago">,
  seed: readonly StoredCommunityQuestion[] = [],
) {
  const result = withDemoAnswer(readCommunityQuestionsLocal(), seed, questionId, answer, Date.now());
  if (!result) return null;
  writeCommunityQuestionsLocal(result.next);
  return result.savedAnswer;
}
