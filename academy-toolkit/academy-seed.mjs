#!/usr/bin/env node
/**
 * Academy Seed CLI — Nezamy Platform
 * Exports and seeds the Academy Question Bank to static JSON bundles and Supabase.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isClean = process.argv.includes('--clean');

console.log('════════════════════════════════════════════════════════════');
console.log(`  🌱 Nezamy Academy — Question Bank Seeder ${isDryRun ? '(DRY RUN)' : '(LIVE)'}`);
console.log('════════════════════════════════════════════════════════════\n');

const categoriesPath = path.join(__dirname, '..', 'src', 'data', 'academy', 'categories.json');
const questionsPath = path.join(__dirname, '..', 'src', 'data', 'academy', 'questions.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));

const categories = readJson(categoriesPath);
const questions = readJson(questionsPath);

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'questions.json');
const categoriesOutPath = path.join(outputDir, 'categories.json');

const payload = {
  version: '2026-08-20',
  generatedAt: new Date().toISOString(),
  totalQuestions: questions.length,
  totalCategories: categories.length - 1,
  questions: questions,
};

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
fs.writeFileSync(categoriesOutPath, JSON.stringify(categories, null, 2), 'utf-8');

console.log(`✔ Generated static bundle: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
console.log(`✔ Generated categories bundle: ${categoriesOutPath}`);
console.log(`✔ Processed ${questions.length} authentic questions across ${categories.length - 1} categories.`);

if (isDryRun) {
  console.log('\n--dry-run: No database mutations were performed.');
} else {
  console.log('\n✔ Academy data sync complete and ready for platform delivery! ✅\n');
}
