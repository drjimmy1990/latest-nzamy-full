import assert from "node:assert/strict";
import test from "node:test";
import { ACADEMY_QUESTIONS } from "../src/data/academy/questions";
import { getQuizQuestions } from "../src/lib/academy/questionsStore";

test("requesting more questions never fabricates a legal answer or citation", () => {
  const requested = ACADEMY_QUESTIONS.length + 100;
  const result = getQuizQuestions(["all"], requested);
  const approvedIds = new Set(ACADEMY_QUESTIONS.map((question) => question.id));
  assert.equal(result.length, ACADEMY_QUESTIONS.length);
  assert.ok(result.every((question) => approvedIds.has(question.id)));
  assert.ok(result.every((question) => !question.id.startsWith("gen_q_")));
});

test("an empty filter returns no question rather than an invented one", () => {
  assert.deepEqual(getQuizQuestions(["international"], 0), []);
});
