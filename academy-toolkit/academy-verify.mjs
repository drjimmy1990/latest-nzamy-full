#!/usr/bin/env node
/**
 * Academy Verify CLI — Nezamy Platform
 * Validates integrity, schema adherence, option counts, answer indices, and legal citations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const categoriesPath = path.join(__dirname, '..', 'src', 'data', 'academy', 'categories.json');
const questionsPath = path.join(__dirname, '..', 'src', 'data', 'academy', 'questions.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));

const categories = readJson(categoriesPath);
const questions = readJson(questionsPath);

console.log('════════════════════════════════════════════════════════════');
console.log('  🔍 Nezamy Academy — Question Bank Verification');
console.log('════════════════════════════════════════════════════════════\n');

let errors = [];
let warnings = [];
let seenIds = new Set();

questions.forEach((q, idx) => {
  const prefix = `Question #${idx + 1} (${q.id || 'NO_ID'}):`;

  // 1. Check ID uniqueness
  if (!q.id) {
    errors.push(`${prefix} Missing 'id'`);
  } else if (seenIds.has(q.id)) {
    errors.push(`${prefix} Duplicate id '${q.id}'`);
  } else {
    seenIds.add(q.id);
  }

  // 2. Check Category
  const catMatch = categories.find(c => c.id === q.categoryId);
  if (!catMatch) {
    errors.push(`${prefix} Invalid categoryId '${q.categoryId}'`);
  }

  // 3. Check Question Text
  if (!q.question || q.question.trim().length < 10) {
    errors.push(`${prefix} Question text is missing or too short`);
  }

  // 4. Check Options & Correct Answer
  if (q.type === 'mcq' || q.type === 'scenario') {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`${prefix} MCQ/Scenario must have exactly 4 options, found ${q.options ? q.options.length : 0}`);
    }
    if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
      errors.push(`${prefix} MCQ correctAnswer must be between 0 and 3, found ${q.correctAnswer}`);
    }
  } else if (q.type === 'tf') {
    if (q.correctAnswer !== 0 && q.correctAnswer !== 1) {
      errors.push(`${prefix} True/False correctAnswer must be 0 (false) or 1 (true)`);
    }
  }

  // 5. Check Explanation
  if (!q.explanation || q.explanation.trim().length < 15) {
    warnings.push(`${prefix} Explanation is missing or brief`);
  }

  // 6. Check Statutory Citation
  if (!q.statutoryCitation || !q.statutoryCitation.instrument) {
    warnings.push(`${prefix} Missing statutoryCitation.instrument`);
  }
});

console.log(`Verified ${questions.length} questions across ${categories.length - 1} categories.`);

if (warnings.length > 0) {
  console.log(`\n⚠️ Warnings (${warnings.length}):`);
  warnings.forEach(w => console.log(`  - ${w}`));
}

if (errors.length > 0) {
  console.log(`\n❌ Validation Failed with ${errors.length} errors:`);
  errors.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
} else {
  console.log('\n✔ All Academy Question integrity checks passed successfully! ✅\n');
}
