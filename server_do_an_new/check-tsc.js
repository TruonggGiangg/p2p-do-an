const { execSync } = require('child_process');

try {
  execSync('npx tsc --noEmit', { stdio: 'pipe' });
  console.log('No Type Errors!');
} catch (error) {
  const output = error.stdout.toString();
  const lines = output.split('\n');
  
  // Show all errors from src instead of filtering admin-loan
  const srcErrors = lines.filter(l => l.includes('src/'));
  console.log(srcErrors.join('\n'));
}
