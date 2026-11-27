import { readFile, writeFile } from 'node:fs/promises';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { wordCategoryTree } from '../word-categories.js';

const TREE_PATH = new URL('../word-categories.js', import.meta.url);
const additionsPath = process.argv[2];

if (additionsPath === undefined) {
    console.error('usage: node tools/merge-word-additions.mjs <additions.json>');
    process.exit(1);
}

const knownWords = new Set(wordlist);
const additions = JSON.parse(await readFile(additionsPath, 'utf8'));

const childrenById = new Map();
for (const group of wordCategoryTree) {
    for (const child of group.children) {
        childrenById.set(group.id + '/' + child.id, child);
    }
}

const unknownKeys = [];
const unknownWords = [];
let addedCount = 0;

for (const [key, words] of Object.entries(additions)) {
    const child = childrenById.get(key);
    if (child === undefined) {
        unknownKeys.push(key);
        continue;
    }
    for (const word of words) {
        if (!knownWords.has(word)) {
            unknownWords.push(key + ': ' + word);
            continue;
        }
        if (child.words.includes(word)) {
            continue;
        }
        child.words.push(word);
        addedCount += 1;
    }
}

function quote(word) {
    return "'" + word + "'";
}

const lines = [];
lines.push('export const wordCategoryTree = [');
for (const group of wordCategoryTree) {
    lines.push('    {');
    lines.push('        id: ' + quote(group.id) + ',');
    lines.push('        title: ' + quote(group.title) + ',');
    lines.push('        children: [');
    for (const child of group.children) {
        lines.push('            {');
        lines.push('                id: ' + quote(child.id) + ',');
        lines.push('                title: ' + quote(child.title) + ',');
        lines.push('                words: [' + child.words.map(quote).join(', ') + '],');
        lines.push('            },');
    }
    lines.push('        ],');
    lines.push('    },');
}
lines.push('];');
lines.push('');

await writeFile(TREE_PATH, lines.join('\n'), 'utf8');

const covered = new Set();
for (const group of wordCategoryTree) {
    for (const child of group.children) {
        for (const word of child.words) {
            covered.add(word);
        }
    }
}
const uncovered = wordlist.filter((word) => !covered.has(word));

console.log('added word references:', addedCount);
console.log('unknown subcategory keys:', unknownKeys.length, unknownKeys.join(' '));
console.log('words not in the BIP39 list:', unknownWords.length, unknownWords.join(' '));
console.log('coverage:', covered.size, 'of', wordlist.length, 'uncovered:', uncovered.length);
console.log('uncovered words:', uncovered.join(' '));
