import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const REPLACEMENTS = [
    { target: '₹', replacement: '₹' },  // Rupee
    { target: '–', replacement: '–' },  // En Dash
    { target: '—', replacement: '—' },  // Em Dash
    { target: ''', replacement: "'" },  // Smart Quote
    { target: '"', replacement: '"' },  // Smart Quote Open
    { target: '"', replacement: '"' },  // Smart Quote Close
    { target: '✔', replacement: '✔' },  // Check mark
    { target: '•', replacement: '•' },  // Bullet
    { target: '"¦', replacement: '...' }, // Ellipsis
    { target: '─', replacement: '─' },  // Box drawing
    { target: '🌐', replacement: '🌐' }, // Globe emoji
];

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            if (f !== 'node_modules' && f !== '.git' && f !== '.next' && f !== 'dist' && f !== 'build') {
                walkDir(dirPath, callback);
            }
        } else {
            callback(path.join(dir, f));
        }
    });
}

function fixFile(filePath) {
    const ext = path.extname(filePath);
    if (!['.js', '.jsx', '.ts', '.tsx', '.json', '.md'].includes(ext)) return;

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        for (const { target, replacement } of REPLACEMENTS) {
            if (content.includes(target)) {
                content = content.split(target).join(replacement);
                modified = true;
            }
        }

        if (modified) {
            console.log(`Fixing: ${filePath}`);
            fs.writeFileSync(filePath, content, 'utf8');
        }
    } catch (err) {
        console.error(`Error processing ${filePath}: ${err.message}`);
    }
}

console.log(`Starting global fix for multiple broken UTF-8 sequences (V3)...`);
walkDir(ROOT_DIR, fixFile);
console.log('Finished global fix.');
