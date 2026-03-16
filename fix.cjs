const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.vue'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Replace size="XX" with :size="XX"
  content = content.replace(/size="(\d+)"/g, ':size="$1"');
  
  if (file === 'TopBar.vue') {
    content = content.replace(/MonitorSquare/g, 'Monitor');
  }
  
  if (file === 'NodeCard.vue') {
    content = content.replace(/,\s*CloudUp\s*/g, '');
  }
  
  fs.writeFileSync(filePath, content);
}

// Ensure style.css removes body margins and app container margins that might be left over in index.html or default Vite template
let styleContent = fs.readFileSync(path.join(__dirname, 'src', 'style.css'), 'utf-8');
if (!styleContent.includes('#app {')) {
  styleContent += `\n\n#app {\n  width: 100vw;\n  height: 100vh;\n  margin: 0;\n  padding: 0;\n  max-width: none;\n  text-align: left;\n}\n`;
}
fs.writeFileSync(path.join(__dirname, 'src', 'style.css'), styleContent);

console.log('Fixes applied.');
