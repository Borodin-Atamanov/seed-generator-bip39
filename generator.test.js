import assert from 'node:assert/strict';
import test from 'node:test';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { generateSplitPhrase } from './generator.js';

const ALL_INDICES = new Set(wordlist.map((word, index) => index));

function indicesOfEveryStep(step) {
    const indices = new Set();
    for (let index = 0; index < wordlist.length; index += step) {
        indices.add(index);
    }
    return indices;
}

function assertPhraseUsesOnly(allowedIndices, phrase) {
    for (const word of phrase.split(' ')) {
        assert.ok(allowedIndices.has(wordlist.indexOf(word)), 'word outside the allowed set: ' + word);
    }
}

function assertSplitPhraseIsValid(phrase) {
    const fullWords = phrase.fullPhrase.split(' ');
    assert.equal(fullWords.length, 24);
    assert.equal(phrase.fullPhrase, phrase.firstHalf + ' ' + phrase.secondHalf);
    assert.ok(validateMnemonic(phrase.fullPhrase, wordlist));
    assert.ok(validateMnemonic(phrase.firstHalf, wordlist));
    assert.ok(validateMnemonic(phrase.secondHalf, wordlist));
}

test('every generated phrase from the full wordlist is valid and unique', () => {
    const seenPhrases = new Set();
    for (let index = 0; index < 60; index++) {
        const phrase = generateSplitPhrase(ALL_INDICES);
        assertSplitPhraseIsValid(phrase);
        assertPhraseUsesOnly(ALL_INDICES, phrase.fullPhrase);
        seenPhrases.add(phrase.fullPhrase);
    }
    assert.equal(seenPhrases.size, 60);
});

test('a restricted wordlist is respected and still yields valid phrases', () => {
    const allowedIndices = indicesOfEveryStep(10);
    assert.ok(allowedIndices.size >= 200);
    for (let index = 0; index < 10; index++) {
        const phrase = generateSplitPhrase(allowedIndices);
        assertSplitPhraseIsValid(phrase);
        assertPhraseUsesOnly(allowedIndices, phrase.fullPhrase);
    }
});

test('a small wordlist is respected and still yields valid phrases', () => {
    const allowedIndices = indicesOfEveryStep(128);
    assert.ok(allowedIndices.size >= 16);
    for (let index = 0; index < 3; index++) {
        const phrase = generateSplitPhrase(allowedIndices);
        assertSplitPhraseIsValid(phrase);
        assertPhraseUsesOnly(allowedIndices, phrase.fullPhrase);
    }
});

test('an empty wordlist is refused', () => {
    assert.throws(() => generateSplitPhrase(new Set()), /no word from the BIP39 list/);
});

test('a single word set with no valid phrase is reported instead of producing a wrong phrase', () => {
    assert.throws(() => generateSplitPhrase(new Set([0])), /too small/);
});

test('each half round-trips through its own 128-bit entropy independently', () => {
    for (let index = 0; index < 30; index++) {
        const phrase = generateSplitPhrase(ALL_INDICES);
        for (const half of [phrase.firstHalf, phrase.secondHalf]) {
            const entropy = mnemonicToEntropy(half, wordlist);
            assert.equal(entropy.length, 16);
            assert.equal(entropyToMnemonic(entropy, wordlist), half);
        }
    }
});

test('the 32-byte entropy of the whole phrase carries the halves as the construction requires', () => {
    for (let index = 0; index < 30; index++) {
        const phrase = generateSplitPhrase(ALL_INDICES);
        const fullEntropy = mnemonicToEntropy(phrase.fullPhrase, wordlist);
        const firstEntropy = mnemonicToEntropy(phrase.firstHalf, wordlist);
        const secondEntropy = mnemonicToEntropy(phrase.secondHalf, wordlist);
        assert.equal(fullEntropy.length, 32);
        assert.deepEqual(fullEntropy.slice(0, 16), firstEntropy);

        const firstChecksumNibble = sha256(firstEntropy)[0] >> 4;
        const expectedSecondHalfOfFullEntropy = prependNibble(firstChecksumNibble, secondEntropy);
        assert.deepEqual(fullEntropy.slice(16), expectedSecondHalfOfFullEntropy);
    }
});

function prependNibble(nibble, bytes) {
    let value = 0n;
    for (const byte of bytes) {
        value = (value << 8n) | BigInt(byte);
    }
    const combined = (BigInt(nibble) << 124n) | (value >> 4n);
    const result = new Uint8Array(16);
    for (let index = 15; index >= 0; index--) {
        result[index] = Number((combined >> BigInt((15 - index) * 8)) & 0xffn);
    }
    return result;
}
