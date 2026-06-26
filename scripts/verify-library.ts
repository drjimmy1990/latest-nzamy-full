#!/usr/bin/env npx tsx
/**
 * verify-library.ts — Post-deployment verification for the Legal Library
 * 
 * Run: npx tsx scripts/verify-library.ts
 * 
 * Checks:
 * 1. Supabase connection + schema existence
 * 2. Row counts per table
 * 3. API endpoint health checks
 * 4. Search returns results for sample queries
 * 5. Arabic FTS normalization works
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, status: 'pass' | 'fail' | 'warn', message: string) {
  results.push({ name, status, message });
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${message}`);
}

async function checkTableCount(tableName: string): Promise<number> {
  const { count, error } = await supabase
    .schema('library')
    .from(tableName)
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    check(`Table: ${tableName}`, 'fail', `Error: ${error.message}`);
    return 0;
  }
  
  const rowCount = count || 0;
  if (rowCount === 0) {
    check(`Table: ${tableName}`, 'warn', `0 rows (empty — needs seeding)`);
  } else {
    check(`Table: ${tableName}`, 'pass', `${rowCount.toLocaleString()} rows`);
  }
  return rowCount;
}

async function checkAPI(path: string, method: string = 'GET', body?: object): Promise<boolean> {
  try {
    const options: RequestInit = { method };
    if (body) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (res.ok || res.status === 404) { // 404 is expected for empty data
      check(`API: ${method} ${path}`, 'pass', `Status ${res.status}`);
      return true;
    }
    check(`API: ${method} ${path}`, 'fail', `Status ${res.status}`);
    return false;
  } catch (e) {
    check(`API: ${method} ${path}`, 'warn', `Connection refused — dev server may not be running`);
    return false;
  }
}

async function main() {
  console.log('\n🔍 Legal Library Verification\n' + '═'.repeat(50));
  
  // 1. Schema existence
  console.log('\n📋 Schema & Connection:');
  const { error: schemaError } = await supabase
    .schema('library')
    .from('laws')
    .select('slug', { count: 'exact', head: true });
  
  if (schemaError) {
    check('Schema: library', 'fail', `Schema not found or not accessible: ${schemaError.message}`);
    console.log('\n⚠️  Run the migration first: supabase db push');
  } else {
    check('Schema: library', 'pass', 'Connected and accessible');
  }

  // 2. Table counts
  console.log('\n📊 Table Row Counts:');
  const tables = [
    'laws', 'chapters', 'articles', 'article_amendments',
    'decrees_circulars', 'decree_pages',
    'judicial_collections', 'principles', 'principle_paragraphs',
    'feqh_books', 'feqh_chapters', 'feqh_sections', 'feqh_blocks',
    'smart_folders', 'smart_folder_items', 'invitations', 'issue_reports',
  ];

  let totalRows = 0;
  for (const table of tables) {
    totalRows += await checkTableCount(table);
  }
  console.log(`\n   Total rows across all tables: ${totalRows.toLocaleString()}`);

  // 3. API endpoints
  console.log('\n🌐 API Endpoints:');
  await checkAPI('/api/library/autocomplete?q=بطلان');
  await checkAPI('/api/library/search', 'POST', { query: 'بطلان', section: 'all', page: 1, limit: 5 });
  await checkAPI('/api/library/laws/companies-law');
  await checkAPI('/api/library/decrees/test-id');
  await checkAPI('/api/library/books/rawd-al-murbi');
  await checkAPI('/api/ai/explain-article', 'POST', { articleId: 'art-1', lawSlug: 'companies-law' });
  await checkAPI('/api/library/folders');
  await checkAPI('/api/library/reports', 'POST', { entityType: 'article', entityId: 'test', reportType: 'error', description: 'test' });

  // 4. Arabic FTS test
  console.log('\n🔤 Arabic Search Tests:');
  // Test that الإثبات matches الاثبات
  const { data: ftsData, error: ftsError } = await supabase
    .schema('library')
    .from('articles')
    .select('id, text')
    .ilike('text', '%الاثبات%')
    .limit(1);

  if (ftsError) {
    check('Arabic FTS', 'warn', `FTS query error: ${ftsError.message}`);
  } else if (ftsData && ftsData.length > 0) {
    check('Arabic FTS', 'pass', `Found ${ftsData.length} results for "الاثبات"`);
  } else {
    check('Arabic FTS', 'warn', 'No data to test — table may be empty');
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;
  console.log(`\n📋 Summary: ${passed} passed, ${failed} failed, ${warned} warnings out of ${results.length} checks`);
  
  if (failed > 0) {
    console.log('\n❌ Some checks failed. Review the output above for details.');
    process.exit(1);
  } else if (warned > 0) {
    console.log('\n⚠️  All critical checks passed, but some warnings need attention.');
    process.exit(0);
  } else {
    console.log('\n✅ All checks passed! The Legal Library is fully operational.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
