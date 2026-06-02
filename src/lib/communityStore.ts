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

export function addCommunityAnswerLocal(
  questionId: number,
  answer: Omit<StoredCommunityAnswer, "id" | "votes" | "isAccepted" | "ago">,
) {
  const questions = readCommunityQuestionsLocal();
  let savedAnswer: StoredCommunityAnswer | null = null;
  const next = questions.map((question) => {
    if (question.id !== questionId) return question;
    savedAnswer = {
      ...answer,
      id: Date.now(),
      votes: 0,
      isAccepted: false,
      ago: "الآن",
    };
    return {
      ...question,
      isAnswered: true,
      answers: [...question.answers, savedAnswer],
    };
  });
  if (savedAnswer) writeCommunityQuestionsLocal(next);
  return savedAnswer;
}
