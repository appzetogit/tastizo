const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend/src/module/user/hooks/useLocation.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Remove console.log - match from console.log to the closing ); or })
// Handle nested parens by counting
function removeConsoleLogs(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    const match = str.slice(i).match(/^\s*console\.log\s*\(/);
    if (match) {
      i += match[0].length;
      let depth = 1;
      let j = i;
      while (j < str.length && depth > 0) {
        const c = str[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        j++;
      }
      const end = str.slice(i, j).trimEnd();
      if (end.endsWith(';')) {
        // already has semicolon
      } else if (str.slice(j).match(/^\s*;/)) {
        j = str.slice(j).search(/\S/) + j;
        if (str[j] === ';') j++;
      }
      i = j;
      // Skip trailing newline/whitespace for cleanliness
      while (i < str.length && /[\s\n]/.test(str[i])) i++;
      continue;
    }
    result += str[i];
    i++;
  }
  return result;
}

content = removeConsoleLogs(content);
fs.writeFileSync(filePath, content);
console.log('Done');
