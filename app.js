import { wordlist } from '@scure/bip39/wordlists/english.js';
import { generateSplitPhrase } from './generator.js';
import { insertPhraseInOrder } from './sorted-phrases.js';
import { wordCategoryTree } from './word-categories.js';

const MAXIMUM_PHRASE_COUNT = 100000;
const PHRASES_PER_TICK = 16;
const MINIMUM_RENDER_INTERVAL_MILLISECONDS = 500;

const phraseListField = document.getElementById('phrase-list');
const phraseCountField = document.getElementById('phrase-count');
const wordsField = document.getElementById('words-field');
const wordsSummaryLine = document.getElementById('words-summary');
const categoriesContainer = document.getElementById('word-categories');
const counterLine = document.getElementById('counter');
const statusLine = document.getElementById('status');
const generateButton = document.getElementById('generate');
const copyButton = document.getElementById('copy-all');
const pauseButton = document.getElementById('pause');

let generationRunId = 0;
let generationIsPaused = false;
let pausedMilliseconds = 0;

const wordIndexByWord = new Map(wordlist.map((word, index) => [word, index]));

const wordCategories = [
    buildWordLengthCategoryGroup(wordlist),
    ...buildSemanticCategoryGroups(wordCategoryTree),
    ...buildLetterCategoryGroups(wordlist),
];
const categoryButtons = [];

function buildLetterCategoryGroups(words) {
    return [
        buildLetterCategoryGroup(words, 'first'),
        buildLetterCategoryGroup(words, 'last'),
    ];
}

function buildLetterCategoryGroup(words, letterPosition) {
    const indicesByLetter = new Map();
    words.forEach((word, index) => {
        const letter = letterPosition === 'first' ? word[0] : word[word.length - 1];
        if (!indicesByLetter.has(letter)) {
            indicesByLetter.set(letter, []);
        }
        indicesByLetter.get(letter).push(index);
    });
    const letters = [...indicesByLetter.keys()].sort();
    const prefix = letterPosition === 'first' ? 'starts-with/' : 'ends-with/';
    const children = letters.map((letter) => ({
        id: prefix + letter,
        title: letterPosition === 'first' ? letter + '*' : '*' + letter,
        name: letterPosition === 'first'
            ? 'words starting with the letter ' + letter
            : 'words ending with the letter ' + letter,
        indices: new Set(indicesByLetter.get(letter)),
    }));
    const allIndices = new Set();
    for (const child of children) {
        for (const index of child.indices) {
            allIndices.add(index);
        }
    }
    return {
        id: letterPosition === 'first' ? 'starts-with' : 'ends-with',
        title: letterPosition === 'first' ? 'First letter' : 'Last letter',
        name: letterPosition === 'first' ? 'words by first letter' : 'words by last letter',
        indices: allIndices,
        children,
    };
}

function buildSemanticCategoryGroups(tree) {
    return tree.map((group) => {
        const children = group.children.map((child) => {
            const indices = new Set();
            for (const word of child.words) {
                const index = wordIndexByWord.get(word);
                if (index !== undefined) {
                    indices.add(index);
                }
            }
            return {
                id: group.id + '/' + child.id,
                title: child.title,
                name: child.title,
                indices,
            };
        });
        const allIndices = new Set();
        for (const child of children) {
            for (const index of child.indices) {
                allIndices.add(index);
            }
        }
        return {
            id: group.id,
            title: group.title,
            name: group.title,
            indices: allIndices,
            children,
        };
    });
}

function buildWordLengthCategoryGroup(words) {
    const indicesByLength = new Map();
    words.forEach((word, index) => {
        if (!indicesByLength.has(word.length)) {
            indicesByLength.set(word.length, []);
        }
        indicesByLength.get(word.length).push(index);
    });
    const lengths = [...indicesByLength.keys()].sort((left, right) => left - right);
    const children = lengths.map((length) => ({
        id: 'word-length-' + length,
        title: String(length),
        name: length + '-letter words',
        indices: new Set(indicesByLength.get(length)),
    }));
    const allIndices = new Set();
    for (const child of children) {
        for (const index of child.indices) {
            allIndices.add(index);
        }
    }
    return {
        id: 'word-length',
        title: 'Word length',
        name: 'words of any length',
        indices: allIndices,
        children,
    };
}

function renderWordCategories() {
    categoriesContainer.replaceChildren();
    for (const category of wordCategories) {
        const groupElement = document.createElement('div');
        groupElement.className = 'category-group';
        groupElement.appendChild(createCategoryButton(category, 'category-group-button'));

        const buttonRow = document.createElement('div');
        buttonRow.className = 'category-buttons';
        for (const child of category.children) {
            buttonRow.appendChild(createCategoryButton(child));
        }
        groupElement.appendChild(buttonRow);
        categoriesContainer.appendChild(groupElement);
    }
}

function createCategoryButton(category, extraClassName = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ('category-button ' + extraClassName).trim();
    button.textContent = category.title;
    button.title = category.name;
    button.dataset.categoryId = category.id;
    button.dataset.state = 'all';
    button.addEventListener('click', () => addCategoryWords(category));
    button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        removeCategoryWords(category);
    });
    categoryButtons.push({ button, category, baseClassName: button.className });
    return button;
}

function updateCategoryButtonStates() {
    const allowedIndices = readAllowedIndices();
    for (const { button, category, baseClassName } of categoryButtons) {
        let presentCount = 0;
        for (const index of category.indices) {
            if (allowedIndices.has(index)) {
                presentCount += 1;
            }
        }
        const state = presentCount === 0
            ? 'none'
            : (presentCount === category.indices.size ? 'all' : 'partial');
        button.className = baseClassName + ' state-' + state;
        button.dataset.state = state;
        button.title = presentCount + '/' + category.indices.size;
        const fillPercent = presentCount === 0
            ? '0'
            : (100 * presentCount / category.indices.size).toFixed(2);
        button.style.setProperty('--fill', fillPercent + '%');
    }
}

function removeCategoryWords(category) {
    const allowedIndices = readAllowedIndices();
    const hasPresentWord = [...category.indices].some((index) => allowedIndices.has(index));
    if (hasPresentWord === false) {
        return;
    }
    removeWordsFromField(category.indices);
    normalizeWordsFieldOrder();
    updateWordsSummary();
}

function addCategoryWords(category) {
    const allowedIndices = readAllowedIndices();
    const missingIndices = [...category.indices].filter((index) => !allowedIndices.has(index));
    if (missingIndices.length === 0) {
        return;
    }
    addWordsToField(missingIndices);
    normalizeWordsFieldOrder();
    updateWordsSummary();
}

function normalizeWordsFieldOrder() {
    const uniqueWords = [...new Set(wordsField.value.split(/\s+/).filter((word) => word.length > 0))];
    wordsField.value = orderWordsForDisplay(uniqueWords).join(' ');
}

function addWordsToField(indicesToAdd) {
    const presentWords = new Set(wordsField.value.split(/\s+/).filter((word) => word.length > 0));
    const wordsToAdd = orderWordsForDisplay(indicesToAdd.map((index) => wordlist[index]))
        .filter((word) => !presentWords.has(word));
    if (wordsToAdd.length === 0) {
        return;
    }
    const currentText = wordsField.value.trim();
    wordsField.value = currentText.length === 0
        ? wordsToAdd.join(' ')
        : currentText + ' ' + wordsToAdd.join(' ');
}

function removeWordsFromField(indicesToRemove) {
    const remainingWords = wordsField.value
        .split(/\s+/)
        .filter((word) => word.length > 0 && !indicesToRemove.has(wordIndexByWord.get(word)));
    wordsField.value = remainingWords.join(' ');
}

async function generateAllPhrases(requestedCount, allowedIndices) {
    const runId = ++generationRunId;
    const sortedPhrases = [];
    phraseListField.value = '';
    setStatus('', false);
    setProgress(0, requestedCount, 0);
    setPaused(false);
    pauseButton.disabled = false;
    pausedMilliseconds = 0;

    const startedAt = performance.now();
    let lastRenderAt = startedAt;
    let generatedCount = 0;
    try {
        while (generatedCount < requestedCount) {
            if (generationIsPaused) {
                const pauseStartedAt = performance.now();
                await waitUntilResumed(runId);
                pausedMilliseconds += performance.now() - pauseStartedAt;
            }
            if (runId !== generationRunId) {
                return;
            }
            const generatedLines = [];
            while (generatedLines.length < PHRASES_PER_TICK && generatedCount < requestedCount) {
                generatedLines.push(generateSplitPhrase(allowedIndices).fullPhrase);
                generatedCount++;
            }
            if (runId !== generationRunId) {
                return;
            }
            for (const line of generatedLines) {
                insertPhraseInOrder(sortedPhrases, line);
            }
            const renderStartedAt = performance.now();
            if (generatedCount >= requestedCount || renderStartedAt - lastRenderAt >= MINIMUM_RENDER_INTERVAL_MILLISECONDS) {
                phraseListField.value = sortedPhrases.join('\n') + '\n';
                lastRenderAt = renderStartedAt;
                setProgress(generatedCount, requestedCount, renderStartedAt - startedAt - pausedMilliseconds);
            }
            await yieldToBrowser();
        }
    } finally {
        if (runId === generationRunId) {
            setPaused(false);
            pauseButton.disabled = true;
        }
    }
    const elapsedMilliseconds = performance.now() - startedAt - pausedMilliseconds;

    const phraseCountInField = phraseListField.value.split('\n').filter((line) => line.length > 0).length;
    if (phraseCountInField !== requestedCount) {
        setStatus('Error: the page shows ' + phraseCountInField + ' phrases instead of ' + requestedCount, true);
        return;
    }
    setStatus(
        'Done: ' + describePhraseCount(requestedCount) + ' in ' + describeDuration(elapsedMilliseconds) +
        ', on average ' + (elapsedMilliseconds / requestedCount).toFixed(2) + ' ms per phrase',
        false
    );
}

function startGeneration() {
    const requestedCount = readRequestedPhraseCount();
    if (requestedCount === null) {
        setStatus('Enter a whole number of phrases from 1 to ' + MAXIMUM_PHRASE_COUNT, true);
        return;
    }
    const allowedIndices = readAllowedIndices();
    if (allowedIndices.size === 0) {
        setStatus('The words field has no word from the BIP39 list', true);
        return;
    }
    generateAllPhrases(requestedCount, allowedIndices).catch((error) => setStatus(error.message, true));
}

function readRequestedPhraseCount() {
    const requestedCount = Number.parseInt(phraseCountField.value, 10);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > MAXIMUM_PHRASE_COUNT) {
        return null;
    }
    return requestedCount;
}

function readAllowedIndices() {
    const indices = new Set();
    for (const word of wordsField.value.split(/\s+/)) {
        const index = wordIndexByWord.get(word);
        if (index !== undefined) {
            indices.add(index);
        }
    }
    return indices;
}

function initializeWordsField() {
    wordsField.value = orderWordsForDisplay(wordlist).join(' ');
}

function orderWordsForDisplay(words) {
    return [...words].sort((left, right) => {
        if (left.length !== right.length) {
            return left.length - right.length;
        }
        const leftReversed = reverseWord(left);
        const rightReversed = reverseWord(right);
        if (leftReversed < rightReversed) {
            return -1;
        }
        if (leftReversed > rightReversed) {
            return 1;
        }
        return 0;
    });
}

function reverseWord(word) {
    return word.split('').reverse().join('');
}

function updateWordsSummary() {
    let unknownWordCount = 0;
    const allowedIndices = new Set();
    for (const word of wordsField.value.split(/\s+/)) {
        if (word.length === 0) {
            continue;
        }
        const index = wordIndexByWord.get(word);
        if (index === undefined) {
            unknownWordCount += 1;
        } else {
            allowedIndices.add(index);
        }
    }
    const entropyBits = allowedIndices.size === 0
        ? 0
        : Math.max(0, Math.round(24 * Math.log2(allowedIndices.size) - 16));
    let summary = 'Words in the set: ' + allowedIndices.size + ', estimated strength about ' + entropyBits + ' bits';
    if (unknownWordCount > 0) {
        summary += ', words outside the BIP39 list skipped: ' + unknownWordCount;
    }
    wordsSummaryLine.textContent = summary;
    wordsSummaryLine.classList.toggle('failure', entropyBits < 100);
    updateCategoryButtonStates();
}

function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitUntilResumed(runId) {
    while (generationIsPaused && runId === generationRunId) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

function setPaused(isPaused) {
    generationIsPaused = isPaused;
    pauseButton.textContent = isPaused ? 'Continue' : 'Pause';
}

function togglePause() {
    if (pauseButton.disabled) {
        return;
    }
    setPaused(!generationIsPaused);
}

async function copyAllPhrases() {
    const phrases = phraseListField.value;
    if (phrases.length === 0) {
        setStatus('The list is empty for now', true);
        return;
    }
    try {
        await navigator.clipboard.writeText(phrases);
    } catch (error) {
        phraseListField.select();
        if (!document.execCommand('copy')) {
            setStatus('Could not copy to the clipboard', true);
            return;
        }
    }
    copyButton.textContent = 'Copied';
    setTimeout(() => {
        copyButton.textContent = 'Copy';
    }, 1500);
}

function setProgress(generatedCount, requestedCount, elapsedMilliseconds) {
    if (generatedCount === 0) {
        counterLine.textContent = 'Generated 0 of ' + requestedCount;
        return;
    }
    counterLine.textContent = 'Generated ' + generatedCount + ' of ' + requestedCount +
        ', ' + (elapsedMilliseconds / generatedCount).toFixed(2) + ' ms per phrase';
}

function setStatus(message, isFailure) {
    statusLine.textContent = message;
    statusLine.classList.toggle('failure', isFailure);
}

function describeDuration(milliseconds) {
    if (milliseconds < 1000) {
        return Math.round(milliseconds) + ' ms';
    }
    return (milliseconds / 1000).toFixed(2) + ' s';
}

function describePhraseCount(count) {
    return count === 1 ? '1 phrase' : count + ' phrases';
}

generateButton.addEventListener('click', startGeneration);
pauseButton.addEventListener('click', togglePause);
copyButton.addEventListener('click', copyAllPhrases);
wordsField.addEventListener('input', updateWordsSummary);
renderWordCategories();
if (wordsField.value.trim().length === 0) {
    initializeWordsField();
}
updateWordsSummary();
