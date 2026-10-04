import { AcademyQuestion, AcademyCategoryId, DifficultyLevel, QuizAttemptPayload, QuizAttemptResult } from '@/types/academy';
import { ACADEMY_QUESTIONS } from '@/data/academy/questions';

/**
 * Filter questions based on selected categories, difficulty, and count
 */
export function getQuizQuestions(
  categories: AcademyCategoryId[] = ['all'],
  count: number = 5,
  difficulty?: DifficultyLevel
): AcademyQuestion[] {
  let pool: AcademyQuestion[] = [];

  const isAll = categories.includes('all');

  if (isAll) {
    pool = [...ACADEMY_QUESTIONS];
  } else {
    pool = ACADEMY_QUESTIONS.filter(q => categories.includes(q.categoryId));
  }

  if (difficulty) {
    pool = pool.filter(q => q.difficulty === difficulty);
  }

  // Shuffle existing authentic pool
  pool = pool.sort(() => Math.random() - 0.5);

  const result: AcademyQuestion[] = [...pool].slice(0, count);

  // A short curated pool stays short. Never invent a legal rule, answer, or
  // citation to satisfy a requested count; the API reports the actual count.
  return result;
}

/**
 * Calculate user performance percentile and grade
 */
export function calculateQuizResult(payload: QuizAttemptPayload): QuizAttemptResult {
  const percentage = Math.round((payload.score / Math.max(1, payload.questionsCount)) * 100);

  let peerPercentile = 50;
  if (percentage === 100) peerPercentile = 98.5;
  else if (percentage >= 80) peerPercentile = 86.0;
  else if (percentage >= 60) peerPercentile = 68.0;
  else if (percentage >= 40) peerPercentile = 42.0;
  else peerPercentile = 20.0;

  const certificateEarned = percentage >= 75 && payload.questionsCount >= 10;

  return {
    ...payload,
    id: `attempt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    percentage,
    completedAt: new Date().toISOString(),
    peerPercentile,
    certificateEarned,
  };
}
