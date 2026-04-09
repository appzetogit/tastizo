import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrc = path.join(__dirname, 'frontend', 'src');

// Removes top-level console.log calls while preserving surrounding code.
function removeConsoleLogs(content) {
  let result = '';
  let i = 0;
  while (i < content.length) {
    const rest = content.slice(i);
    const match = rest.match(/^\s*console\.log\s*\(/);
    if (match) {
      i += match[0].length;
      let depth = 1;
      let j = i;
      let inString = null;
      let escape = false;
      while (j < content.length && depth > 0) {
        const c = content[j];
        if (escape) {
          escape = false;
          j++;
          continue;
        }
        if (c === '\\' && inString) {
          escape = true;
          j++;
          continue;
        }
        if (!inString) {
          if (c === '"' || c === "'" || c === '`') {
            inString = c;
          } else if (c === '(' || c === '[' || c === '{') {
            depth++;
          } else if (c === ')' || c === ']' || c === '}') {
            depth--;
          }
        } else if (c === inString) {
          inString = null;
        }
        j++;
      }
      // Skip trailing semicolon and whitespace
      while (j < content.length && /[\s;]/.test(content[j])) j++;
      i = j;
      continue;
    }
    result += content[i];
    i++;
  }
  return result;
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const newContent = removeConsoleLogs(content);
  if (newContent !== original) {
    fs.writeFileSync(filePath, newContent);
    return true;
  }
  return false;
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let count = 0;
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      count += walkDir(full);
    } else if (e.isFile() && /\.(jsx?|tsx?)$/.test(e.name)) {
      if (processFile(full)) count++;
    }
  }
  return count;
}

const modified = walkDir(frontendSrc);
console.log('Modified', modified, 'files');
