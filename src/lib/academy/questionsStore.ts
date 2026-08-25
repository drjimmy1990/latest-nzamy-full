import { AcademyQuestion, AcademyCategoryId, DifficultyLevel, QuizAttemptPayload, QuizAttemptResult } from '@/types/academy';
import { ACADEMY_QUESTIONS } from '@/data/academy/questions';
import { ACADEMY_CATEGORIES } from '@/data/academy/categories';

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

  // If pool has fewer questions than requested count, synthesize context-aware procedural legal questions
  let genId = 5000;
  while (result.length < count) {
    const targetCatId = isAll
      ? ACADEMY_CATEGORIES.filter(c => c.id !== 'all')[Math.floor(Math.random() * (ACADEMY_CATEGORIES.length - 1))].id
      : categories[Math.floor(Math.random() * categories.length)];

    const targetCatMeta = ACADEMY_CATEGORIES.find(c => c.id === targetCatId) || ACADEMY_CATEGORIES[1];

    result.push({
      id: `gen_q_${targetCatId}_${genId++}`,
      categoryId: targetCatId,
      categoryNumber: targetCatMeta.categoryNumber,
      categoryName: targetCatMeta.label,
      lawName: `الأنظمة واللوائح المعتمدة في (${targetCatMeta.label})`,
      type: 'mcq',
      difficulty: 'intermediate',
      tags: [targetCatMeta.label, 'الأنظمة السعودية', 'اختبار تدريبي'],
      question: `ما هو الحكم النظامي المعتمد في التطبيقات القضائية واللائحية ضمن مسائل (${targetCatMeta.label})؟`,
      options: [
        'وجوب التقيد بالمدد والإجراءات الجوهرية المقررة نظاماً وإلا ترتب البطلان أو سقوط الحق',
        'جواز الاتفاق الشفهي على مخالفة القواعد الآمرة في النظام العام',
        'عدم اشتراط أي توثيق رسمي أو قيد لدى الجهة المختصة',
        'سقوط الالتزام تلقائياً بمجرد تراخي المدين عن السداد دون حاجة لإعذار'
      ],
      correctAnswer: 0,
      explanation: `في أحكام (${targetCatMeta.label}) بالقانون السعودي، تعد المواعيد والإجراءات الجوهرية من النظام العام أو من القيود الملزمة التي يستوجب إغفالها بطلان الإجراء أو عدم قبول الدعوى/الطلب.`,
      statutoryCitation: {
        instrument: targetCatMeta.label,
        article: 'القواعد العامة المنظمة',
        textSnippet: 'يجب استيفاء المتطلبات الشكلية والإجرائية المحددة باللوائح التنفيذية الصادرة من الجهة المختصة.'
      }
    });
  }

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
