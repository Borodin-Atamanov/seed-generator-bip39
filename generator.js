import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sha256 } from '@noble/hashes/sha2.js';

const FREE_TAIL_VALUE_COUNT = 128;
const WORDS_PER_HALF_WITHOUT_LAST = 11;
const FREE_SECOND_HALF_VALUE_COUNT = 8;
const MAXIMUM_FIRST_HALF_ATTEMPTS = 50000;
const MAXIMUM_SECOND_HALF_ATTEMPTS = 50000;

export function generateSplitPhrase(allowedIndices) {
    if (allowedIndices.size === 0) {
        throw new Error('The set has no word from the BIP39 list');
    }
    const randomBelow = createRandomBelow();
    const firstHalf = buildFirstHalf(allowedIndices, randomBelow);
    const secondHalf = buildSecondHalf(firstHalf, allowedIndices, randomBelow);

    const firstHalfPhrase = firstHalf.indices.map((index) => wordlist[index]).join(' ');
    const secondHalfPhrase = secondHalf.indices.map((index) => wordlist[index]).join(' ');
    const fullPhrase = firstHalfPhrase + ' ' + secondHalfPhrase;
    assertPhraseIsValid(fullPhrase, firstHalfPhrase, secondHalfPhrase, allowedIndices);
    return { fullPhrase, firstHalf: firstHalfPhrase, secondHalf: secondHalfPhrase };
}

function buildFirstHalf(allowedIndices, randomBelow) {
    const allowedList = [...allowedIndices];
    for (let attempt = 0; attempt < MAXIMUM_FIRST_HALF_ATTEMPTS; attempt++) {
        const indices = [];
        let entropyPrefixBits = '';
        for (let position = 0; position < WORDS_PER_HALF_WITHOUT_LAST; position++) {
            const index = allowedList[randomBelow(allowedList.length)];
            indices.push(index);
            entropyPrefixBits += toBits(index, 11);
        }
        const tailValue = randomBelow(FREE_TAIL_VALUE_COUNT);
        const entropyBits = entropyPrefixBits + toBits(tailValue, 7);
        const checksum = sha256(bitsToBytes(entropyBits))[0] >> 4;
        const lastIndex = tailValue * 16 + checksum;
        if (!allowedIndices.has(lastIndex)) {
            continue;
        }
        indices.push(lastIndex);
        return { indices, bits: entropyBits + toBits(checksum, 4) };
    }
    throw new Error('Could not build the first half: the word set is too small');
}

function buildSecondHalf(firstHalf, allowedIndices, randomBelow) {
    const allowedList = [...allowedIndices];
    for (let attempt = 0; attempt < MAXIMUM_SECOND_HALF_ATTEMPTS; attempt++) {
        const indices = [];
        let entropyPrefixBits = '';
        for (let position = 0; position < WORDS_PER_HALF_WITHOUT_LAST; position++) {
            const index = allowedList[randomBelow(allowedList.length)];
            indices.push(index);
            entropyPrefixBits += toBits(index, 11);
        }
        for (const freeValue of shuffledValues(FREE_SECOND_HALF_VALUE_COUNT, randomBelow)) {
            const fullEntropyBits = firstHalf.bits + entropyPrefixBits + toBits(freeValue, 3);
            const fullChecksumByte = sha256(bitsToBytes(fullEntropyBits))[0];
            const tailValue = freeValue * 16 + (fullChecksumByte >> 4);
            const halfEntropyBits = entropyPrefixBits + toBits(tailValue, 7);
            const halfChecksum = sha256(bitsToBytes(halfEntropyBits))[0] >> 4;
            if (halfChecksum !== (fullChecksumByte & 0x0f)) {
                continue;
            }
            const lastIndex = tailValue * 16 + halfChecksum;
            if (!allowedIndices.has(lastIndex)) {
                continue;
            }
            indices.push(lastIndex);
            return { indices, bits: halfEntropyBits + toBits(halfChecksum, 4) };
        }
    }
    throw new Error('Could not build the second half: the word set is too small');
}

function assertPhraseIsValid(fullPhrase, firstHalf, secondHalf, allowedIndices) {
    const everyWordIsAllowed = fullPhrase
        .split(' ')
        .every((word) => allowedIndices.has(wordlist.indexOf(word)));
    const halvesRebuildFullPhrase = fullPhrase === firstHalf + ' ' + secondHalf;
    const everyPhraseIsValid = validateMnemonic(fullPhrase, wordlist) &&
        validateMnemonic(firstHalf, wordlist) &&
        validateMnemonic(secondHalf, wordlist);
    if (!everyWordIsAllowed || !halvesRebuildFullPhrase || !everyPhraseIsValid) {
        throw new Error('The generated phrase did not pass the BIP39 check');
    }
}

function createRandomBelow() {
    const pool = new Uint32Array(256);
    let remaining = 0;
    return function randomBelow(maximum) {
        if (remaining === 0) {
            crypto.getRandomValues(pool);
            remaining = pool.length;
        }
        remaining -= 1;
        return Math.floor((pool[remaining] / 4294967296) * maximum);
    };
}

function shuffledValues(count, randomBelow) {
    const values = [];
    for (let value = 0; value < count; value++) {
        values.push(value);
    }
    for (let index = values.length - 1; index > 0; index--) {
        const swapIndex = randomBelow(index + 1);
        const savedValue = values[index];
        values[index] = values[swapIndex];
        values[swapIndex] = savedValue;
    }
    return values;
}

function toBits(value, width) {
    return value.toString(2).padStart(width, '0');
}

function bitsToBytes(bits) {
    const bytes = new Uint8Array(bits.length / 8);
    for (let index = 0; index < bytes.length; index++) {
        bytes[index] = parseInt(bits.slice(index * 8, index * 8 + 8), 2);
    }
    return bytes;
}
