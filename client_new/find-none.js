const fs = require('fs');
const path = require('path');
const results = [];

const PATTERNS = ['["NONE"]', '.NONE =', "['NONE']"];

function search(dir, depth) {
  if (depth > 4) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) {
        search(fp, depth + 1);
      } else if ((e.name.endsWith('.js') || e.name.endsWith('.cjs')) && !e.name.endsWith('.min.js')) {
        try {
          const src = fs.readFileSync(fp, 'utf8');
          for (const p of PATTERNS) {
            if (src.includes(p)) {
              const lines = src.split('\n');
              lines.forEach((line, i) => {
                if (line.includes(p)) {
                  results.push({ file: fp.replace(process.cwd() + path.sep, ''), line: i + 1, content: line.trim().slice(0, 100) });
                }
              });
              break;
            }
          }
        } catch {}
      }
    }
  } catch {}
}

search(path.join(process.cwd(), 'node_modules'), 0);
console.log('Results:');
results.slice(0, 30).forEach(r => console.log(`  ${r.file}:${r.line} => ${r.content}`));
