const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '..');

function isUtf8(buf) {
  let i = 0;
  while (i < buf.length) {
    if (buf[i] <= 0x7F) { // 0xxxxxxx
      i++;
    } else if ((buf[i] >= 0xC2) && (buf[i] <= 0xDF)) { // 110xxxxx 10xxxxxx
      if (i + 1 >= buf.length || buf[i + 1] < 0x80 || buf[i + 1] > 0xBF) return false;
      i += 2;
    } else if ((buf[i] >= 0xE0) && (buf[i] <= 0xEF)) { // 1110xxxx 10xxxxxx 10xxxxxx
      if (i + 2 >= buf.length) return false;
      if (buf[i + 1] < 0x80 || buf[i + 1] > 0xBF) return false;
      if (buf[i + 2] < 0x80 || buf[i + 2] > 0xBF) return false;
      i += 3;
    } else if ((buf[i] >= 0xF0) && (buf[i] <= 0xF4)) { // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      if (i + 3 >= buf.length) return false;
      if (buf[i + 1] < 0x80 || buf[i + 1] > 0xBF) return false;
      if (buf[i + 2] < 0x80 || buf[i + 2] > 0xBF) return false;
      if (buf[i + 3] < 0x80 || buf[i + 3] > 0xBF) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

function checkBOM(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return 'UTF-8 BOM';
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return 'UTF-16 BE BOM';
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return 'UTF-16 LE BOM';
  }
  return null;
}

function scanDirectory(dir, nonUtf8Files = [], bomFiles = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git' && file !== 'dist') {
        scanDirectory(fullPath, nonUtf8Files, bomFiles);
      }
    } else if (stat.isFile()) {
      const ext = path.extname(file);
      if (['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.md'].includes(ext)) {
        try {
          const buf = fs.readFileSync(fullPath);
          const bom = checkBOM(buf);
          if (bom) {
            bomFiles.push({ path: fullPath, type: bom });
          }
          if (!isUtf8(buf)) {
            nonUtf8Files.push({ path: fullPath });
          }
        } catch (err) {
          // Ignore read errors
        }
      }
    }
  }
  return { nonUtf8Files, bomFiles };
}

console.log('Scanning entire workspace for non-UTF8 or BOM files...');
const result = scanDirectory(TARGET_DIR);
console.log(`Scan complete.\n`);
console.log(`Found ${result.nonUtf8Files.length} non-UTF-8 files:`);
console.log(JSON.stringify(result.nonUtf8Files, null, 2));
console.log(`\nFound ${result.bomFiles.length} files with BOM:`);
console.log(JSON.stringify(result.bomFiles, null, 2));
