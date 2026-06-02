const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '..', 'src');

// Common Arabic Mojibake character patterns
// Arabic characters decoded as Windows-1252/ISO-8859-1 and re-encoded or written literally.
// Examples:
// ال -> ط§ظ„
// لوحة التحكم -> ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ… (or ظ„ظˆط**ط© ط§ظ„طھط**ظƒظ…)
// الخدمات -> ط§ظ„ط®ط¯ظ…ط§طھ
// قضاياي -> ظ‚ط¶ط§ظٹط§ظٹ
// المستندات -> ط§ظ„ظ…ط³طھظ†ط¯ط§طھ
// نشاطي -> ظ†ط´ط§ط·ظٹ
const MOJIBAKE_PATTERNS = [
  'ط§ظ„',
  'ط·ط§',
  'ظ„ظˆط­ط©',
  'ظ„ظˆط**ط©',
  'ط§ظ„طھط­',
  'ط§ظ„طھط**',
  'ط§ظ„ط®ط¯ظ',
  'ظ‚ط¶ط§ظ',
  'ط§ظ„ظ…ط³طھ',
  'ظ†ط´ط§ط·',
  'ط·ط±ط­',
  'ط§ظ„ظ…ط¬طھ',
  'ط§ظ„ظ‚ط§ظ†',
  'ظ…ط¬طھظ',
  'ط·ظ„ظ‚ط©'
];

function scanDirectory(dir, results = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== 'dist') {
        scanDirectory(fullPath, results);
      }
    } else if (stat.isFile()) {
      const ext = path.extname(file);
      if (['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.md'].includes(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const found = [];
          for (const pattern of MOJIBAKE_PATTERNS) {
            if (content.includes(pattern)) {
              found.push(pattern);
            }
          }
          if (found.length > 0) {
            results.push({
              path: fullPath,
              patterns: found
            });
          }
        } catch (err) {
          // Ignore read errors
        }
      }
    }
  }
  return results;
}

console.log('Scanning src directory for Mojibake...');
const results = scanDirectory(TARGET_DIR);
console.log(`Scan complete. Found ${results.length} files with Mojibake:`);
console.log(JSON.stringify(results, null, 2));
