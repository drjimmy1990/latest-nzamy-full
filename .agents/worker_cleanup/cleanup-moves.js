const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../..');
const oldDir = path.join(rootDir, 'OLD');

const filesToMove = [
  'ORIGINAL_REQUEST.md',
  'PRODUCTION_FIX_IMPLEMENTATION.md',
  'PRODUCTION_FIX_PLAN.md',
  'PRODUCT_COMPLETENESS_BACKLOG.md',
  'TEST_REVIEW_FIX_PLAN.md',
  'TEST_REVIEW_RECONCILIATION.md',
  'blog-system-newblog-migration.md',
  'client_dashboard_audit.md',
  'client_lawyer_functional_audit.md',
  'client_lawyer_testing_arabic (1).md',
  'comprehensive_review_09072026.md',
  'library_testing_arabic.md',
  'manual_seeding_guide.md',
  'master_checklist.md',
  'master_checklist2.md',
  'n8n_BUILD_LOG_AND_TEST_GUIDE.md',
  'n8n_FINAL_MASTER_PLAN.md',
  'n8n_workflows.md',
  'n8n_workflows_list.md',
  'nzamy-audit-fix-status.md',
  'payments-gateway-admin-gate.md',
  'production_readiness_audit.md',
  'project_reference.md',
  'search_implementation_guide.md',
  'workflows_roadmap.md',
  'ENTITLEMENTS_AND_WIRING_BUILD_LOG.md',
  'legal_library_guide.md',
  'project_guide.md',
  'old/BLOG_SEEDING_GUIDE.md',
  'NEXT_STEPS.md'
];

// Ensure OLD directory exists on disk (if Windows already created it due to case-insensitivity of 'old', that's fine)
if (!fs.existsSync(oldDir)) {
  fs.mkdirSync(oldDir);
  console.log(`Created directory: ${oldDir}`);
}

// Modify git config core.ignorecase temporarily to false
const gitConfigPath = path.join(rootDir, '.git/config');
let gitConfigContent = fs.readFileSync(gitConfigPath, 'utf8');
if (gitConfigContent.includes('ignorecase = true')) {
  gitConfigContent = gitConfigContent.replace('ignorecase = true', 'ignorecase = false');
  fs.writeFileSync(gitConfigPath, gitConfigContent, 'utf8');
  console.log('Temporarily disabled git core.ignorecase');
}

try {
  for (const file of filesToMove) {
    const srcPath = path.join(rootDir, file);
    if (!fs.existsSync(srcPath)) {
      console.log(`Warning: File does not exist on disk: ${srcPath}`);
      continue;
    }

    const destFileName = path.basename(file);
    const destPath = path.join(oldDir, destFileName);

    if (file === 'old/BLOG_SEEDING_GUIDE.md') {
      // Use two-step rename in git to prevent Windows casing collision
      console.log(`Moving old/BLOG_SEEDING_GUIDE.md to OLD/BLOG_SEEDING_GUIDE.md...`);
      try {
        execSync(`git mv old/BLOG_SEEDING_GUIDE.md temp_seeding_guide.md`, { cwd: rootDir, stdio: 'inherit' });
        execSync(`git mv temp_seeding_guide.md OLD/BLOG_SEEDING_GUIDE.md`, { cwd: rootDir, stdio: 'inherit' });
      } catch (err) {
        console.error(`Failed to git mv old/BLOG_SEEDING_GUIDE.md: ${err.message}`);
        // Fallback: move manually
        fs.renameSync(srcPath, destPath);
        execSync(`git add OLD/BLOG_SEEDING_GUIDE.md`, { cwd: rootDir, stdio: 'inherit' });
      }
    } else {
      console.log(`Moving ${file} to OLD/ ...`);
      // First, git add if it's untracked so git knows about it
      try {
        execSync(`git add "${file}"`, { cwd: rootDir, stdio: 'ignore' });
      } catch (e) {}

      try {
        execSync(`git mv "${file}" OLD/`, { cwd: rootDir, stdio: 'inherit' });
      } catch (err) {
        console.log(`git mv failed for ${file}, trying manual move and git add...`);
        fs.renameSync(srcPath, destPath);
        execSync(`git add "OLD/${destFileName}"`, { cwd: rootDir, stdio: 'inherit' });
        try {
          execSync(`git rm --cached "${file}"`, { cwd: rootDir, stdio: 'inherit' });
        } catch (e) {}
      }
    }
  }
} finally {
  // Restore git ignorecase = true
  gitConfigContent = fs.readFileSync(gitConfigPath, 'utf8');
  if (gitConfigContent.includes('ignorecase = false')) {
    gitConfigContent = gitConfigContent.replace('ignorecase = false', 'ignorecase = true');
    fs.writeFileSync(gitConfigPath, gitConfigContent, 'utf8');
    console.log('Restored git core.ignorecase to true');
  }
}

console.log('Moves completed.');
