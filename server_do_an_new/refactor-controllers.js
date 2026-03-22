const fs = require('fs');
const path = require('path');

const fixController = (relativePath) => {
  const targetPath = path.join(__dirname, 'src', 'modules', relativePath);
  let content = fs.readFileSync(targetPath, 'utf8');

  // 1. Remove manual userId checking if already guarded (redundant boilerplate)
  content = content.replace(/[ \t]*if \(!userId\) throw new UnauthorizedException\('Unauthorized'\);\r?\n/g, '');

  // 2. Remove manual { message, data: result } wrapper
  // Regex looks for return {\n  message: ..., \n data: ... \n}
  // This might be tricky because of backticks and variables in message.
  content = content.replace(/return \{\s*message:\s*[^,\n]+,\s*data:\s*([^,}\n]+),?\s*};\s*$/gm, 'return $1;');
  
  // Specific fix for multi-line transfers where variable name might be 'result'
  content = content.replace(/return \{\s*message:[^}]*data:\s*([a-zA-Z0-9_]+),?\s*\};/g, 'return $1;');

  fs.writeFileSync(targetPath, content);
  console.log('Fixed', relativePath);
};

fixController('loan/loan.controller.ts');
fixController('wallets/wallets.controller.ts');
