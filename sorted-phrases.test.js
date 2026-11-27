import assert from 'node:assert/strict';
import test from 'node:test';
import { insertPhraseInOrder } from './sorted-phrases.js';

function compareByLengthThenAlphabet(left, right) {
    if (left.length !== right.length) {
        return left.length - right.length;
    }
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}

test('inserting phrases one by one gives the same order as sorting by length then alphabet', () => {
    const phrases = [];
    const lengths = [5, 9, 4, 11, 6, 7, 5, 8, 3, 4];
    for (const length of lengths) {
        insertPhraseInOrder(phrases, 'x'.repeat(length));
    }
    assert.deepEqual(
        phrases.map((phrase) => phrase.length),
        [...lengths].sort((left, right) => left - right)
    );
});

test('phrases of equal length are ordered alphabetically whatever the insertion order', () => {
    const phrases = [];
    for (const phrase of ['aaa-c', 'aaa-a', 'aaa-d', 'aaa-b']) {
        insertPhraseInOrder(phrases, phrase);
    }
    assert.deepEqual(phrases, ['aaa-a', 'aaa-b', 'aaa-c', 'aaa-d']);

    insertPhraseInOrder(phrases, 'aaa-b');
    assert.deepEqual(phrases, ['aaa-a', 'aaa-b', 'aaa-b', 'aaa-c', 'aaa-d']);
});

test('inserting 1024 phrases matches a full sort and reports the insertion index', () => {
    const phrases = [];
    const generated = [];
    for (let index = 0; index < 1024; index++) {
        const phrase = ('word '.repeat(index % 30) + 'end' + index).trim();
        generated.push(phrase);
        const insertionIndex = insertPhraseInOrder(phrases, phrase);
        assert.ok(insertionIndex >= 0 && insertionIndex < phrases.length);
    }
    const expected = [...generated].sort(compareByLengthThenAlphabet);
    assert.deepEqual(phrases, expected);
    for (let index = 1; index < phrases.length; index++) {
        assert.ok(compareByLengthThenAlphabet(phrases[index - 1], phrases[index]) <= 0);
    }
});
