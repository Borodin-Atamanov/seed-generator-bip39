import assert from 'node:assert/strict';
import test from 'node:test';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { wordCategoryTree } from './word-categories.js';

const knownWords = new Set(wordlist);

test('every word in the category tree exists in the BIP39 list', () => {
    const unknownWords = [];
    for (const group of wordCategoryTree) {
        for (const child of group.children) {
            for (const word of child.words) {
                if (!knownWords.has(word)) {
                    unknownWords.push(group.id + '/' + child.id + ': ' + word);
                }
            }
        }
    }
    assert.deepEqual(unknownWords, []);
});

test('no subcategory lists the same word twice', () => {
    for (const group of wordCategoryTree) {
        for (const child of group.children) {
            assert.equal(new Set(child.words).size, child.words.length, 'duplicate word in ' + child.id);
        }
    }
});

test('every group and subcategory has a unique id, a title and at least one word', () => {
    const groupIds = new Set();
    for (const group of wordCategoryTree) {
        assert.ok(group.title.length > 0);
        assert.ok(!groupIds.has(group.id), 'duplicate group id: ' + group.id);
        groupIds.add(group.id);
        assert.ok(group.children.length > 0, 'group without subcategories: ' + group.id);
        const childIds = new Set();
        for (const child of group.children) {
            assert.ok(child.title.length > 0);
            assert.ok(!childIds.has(child.id), 'duplicate subcategory id: ' + child.id);
            childIds.add(child.id);
            assert.ok(child.words.length > 0, 'subcategory without words: ' + child.id);
        }
    }
});

test('the tree covers enough words to be useful', () => {
    const coveredWords = new Set();
    for (const group of wordCategoryTree) {
        for (const child of group.children) {
            for (const word of child.words) {
                coveredWords.add(word);
            }
        }
    }
    const uncoveredWords = wordlist.filter((word) => !coveredWords.has(word));
    console.log('covered ' + coveredWords.size + ' of ' + wordlist.length + ' words, uncovered ' + uncoveredWords.length);
    console.log('uncovered: ' + uncoveredWords.join(' '));
    assert.ok(coveredWords.size >= 1500, 'coverage is only ' + coveredWords.size);
});
