import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { wordCategoryTree } from './word-categories.js';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the single html file references no external resource', () => {
    assert.ok(!page.includes('<script src'), 'script must be inline');
    assert.ok(!page.includes('<link'), 'no external stylesheet');
    assert.ok(!page.includes('src='), 'no external script or image');
    assert.ok(!page.includes('href='), 'no external link');
    assert.ok(!page.includes('url('), 'no css url reference');
    assert.ok(!page.includes('@import'), 'no css import');
    assert.ok(page.includes('abandon'), 'the english wordlist must be embedded');
});

test('the embedded script fills the page with 1024 phrases, one per line', async () => {
    const { elements } = await runPage('1024');

    const lines = await readPhraseLines(elements);
    assert.equal(lines.length, 1024);
    assert.equal(new Set(lines).size, 1024);
    assert.match(elements.get('counter').textContent, /^Generated 1024 of 1024, \d+\.\d\d ms per phrase$/);
    assert.ok(!elements.has('first-half'), 'the half fields must be gone');
    assert.match(
        elements.get('status').textContent,
        /^Done: 1024 phrases in \d+(\.\d+)? (ms|s), on average \d+\.\d\d ms per phrase$/
    );

    for (let index = 1; index < lines.length; index++) {
        const previous = lines[index - 1];
        const current = lines[index];
        if (previous.length === current.length) {
            assert.ok(previous <= current, 'equal length lines must be alphabetical: ' + previous + ' then ' + current);
        } else {
            assert.ok(previous.length < current.length, 'lines must be sorted by length: ' + previous + ' then ' + current);
        }
    }

    for (const line of lines) {
        const words = line.split(' ');
        assert.equal(words.length, 24);
        assert.ok(validateMnemonic(line, wordlist), line);
        assert.ok(validateMnemonic(words.slice(0, 12).join(' '), wordlist), line);
        assert.ok(validateMnemonic(words.slice(12).join(' '), wordlist), line);
    }
});

test('the requested count from the field decides how many phrases are produced', async () => {
    const { elements } = await runPage('120');

    const lines = await readPhraseLines(elements);
    assert.equal(lines.length, 120);
    assert.equal(new Set(lines).size, 120);
    assert.match(elements.get('counter').textContent, /^Generated 120 of 120, \d+\.\d\d ms per phrase$/);
    assert.match(
        elements.get('status').textContent,
        /^Done: 120 phrases in \d+(\.\d+)? (ms|s), on average \d+\.\d\d ms per phrase$/
    );
});

test('a count outside the allowed range is refused without generating anything', async () => {
    const { elements } = await runPage('0');

    assert.match(elements.get('status').textContent, /^Enter a whole number of phrases from 1 to 100000$/);
    assert.equal(elements.get('phrase-list').value, '');
});

test('the copy button sends the whole list to the clipboard', async () => {
    const { elements, clipboardWrites } = await runPage('120');
    await readPhraseLines(elements);

    elements.get('copy-all').handlers.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(clipboardWrites.length, 1);
    assert.equal(clipboardWrites[0], elements.get('phrase-list').value);
    assert.equal(clipboardWrites[0].split('\n').filter((line) => line.length > 0).length, 120);
    assert.equal(elements.get('copy-all').textContent, 'Copied');
    assert.match(elements.get('status').textContent, /^Done: 120 phrases/, 'copying must not erase the timing message');
});

test('pause stops new phrases and the same button resumes generation', async () => {
    const { elements } = await runPage('500');
    const pauseButton = elements.get('pause');
    const counterLine = elements.get('counter');

    assert.equal(pauseButton.disabled, false, 'pause must be available while generating');
    pauseButton.handlers.click();
    assert.equal(pauseButton.textContent, 'Continue');

    await new Promise((resolve) => setTimeout(resolve, 200));
    const counterWhilePaused = counterLine.textContent;
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(counterLine.textContent, counterWhilePaused, 'no phrases may appear while paused');
    assert.match(counterWhilePaused, /^Generated \d+ of 500(, \d+\.\d\d ms per phrase)?$/);

    pauseButton.handlers.click();
    assert.equal(pauseButton.textContent, 'Pause');

    const lines = await readPhraseLines(elements);
    assert.equal(lines.length, 500);
    assert.equal(pauseButton.disabled, true, 'pause must be unavailable once generation is finished');
});

test('the words field shows all 2048 words ordered by length, then by reversed spelling', async () => {
    const { elements } = await runPage('1');

    const words = elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0);
    assert.ok(!elements.get('words-field').value.includes('\n'), 'words must be separated by spaces, not by line breaks');
    assert.equal(words.length, 2048);
    assert.deepEqual([...words].sort(), [...wordlist].sort());
    for (let index = 1; index < words.length; index++) {
        const previous = words[index - 1];
        const current = words[index];
        if (previous.length !== current.length) {
            assert.ok(previous.length < current.length, 'lengths must increase: ' + previous + ' then ' + current);
        } else {
            const previousReversed = previous.split('').reverse().join('');
            const currentReversed = current.split('').reverse().join('');
            assert.ok(previousReversed <= currentReversed, 'reversed words must be alphabetical: ' + previous + ' then ' + current);
        }
    }
    assert.ok(words.indexOf('tag') < words.indexOf('fall'));
    assert.ok(words.indexOf('fall') < words.indexOf('siren'));
    assert.match(elements.get('words-summary').textContent, /^Words in the set: 2048, estimated strength about 248 bits$/);
});

test('generation uses only the words left in the edited field', async () => {
    const allowedWords = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
        'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    ];
    const { elements } = await runPage('5', allowedWords.join(' '));
    const lines = await readPhraseLines(elements);

    assert.equal(lines.length, 5);
    const allowed = new Set(allowedWords);
    for (const line of lines) {
        const words = line.split(' ');
        assert.equal(words.length, 24);
        assert.ok(validateMnemonic(line, wordlist), line);
        for (const word of words) {
            assert.ok(allowed.has(word), 'word outside the edited set: ' + word);
        }
    }
    assert.match(
        elements.get('words-summary').textContent,
        /^Words in the set: 24, estimated strength about 94 bits$/
    );
});

test('words outside the BIP39 list are reported and ignored', async () => {
    const { elements } = await runPage('1', 'abandon ability zzz able');

    assert.match(
        elements.get('words-summary').textContent,
        /^Words in the set: 3, estimated strength about \d+ bits, words outside the BIP39 list skipped: 1$/
    );
});

test('the speed is shown in the counter while phrases are still being generated', async () => {
    const { elements } = await runPage('2000');

    await new Promise((resolve) => setTimeout(resolve, 900));
    const counterWhileRunning = elements.get('counter').textContent;
    assert.match(counterWhileRunning, /^Generated \d+ of 2000, \d+\.\d\d ms per phrase$/);
    assert.ok(!elements.get('status').textContent.startsWith('Done'), 'generation must still be running');

    const lines = await readPhraseLines(elements);
    assert.equal(lines.length, 2000);
});

test('generation does not start until the button is pressed', async () => {
    const { elements } = await runPage('10', '', false);

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(elements.get('phrase-list').value, '');
    assert.equal(elements.get('counter').textContent, '');
    assert.equal(elements.get('status').textContent, '');
    assert.match(page, /<button id="pause"[^>]*disabled/, 'pause must start disabled in the markup');

    elements.get('generate').handlers.click();
    const lines = await readPhraseLines(elements);
    assert.equal(lines.length, 10);
});

function collectCategoryButtons(container) {
    const found = [];
    const visit = (element) => {
        if (typeof element.className === 'string' && element.className.split(' ').includes('category-button')) {
            found.push(element);
        }
        for (const child of element.children || []) {
            visit(child);
        }
    };
    visit(container);
    return found;
}

test('category buttons start in the all state and cover every length and every semantic group', async () => {
    const { elements } = await runPage('1', '', false);
    const buttons = collectCategoryButtons(elements.get('word-categories'));

    const semanticButtonCount = wordCategoryTree.reduce(
        (total, group) => total + 1 + group.children.length,
        0
    );
    assert.equal(buttons.length, 7 + semanticButtonCount);
    assert.deepEqual(buttons.slice(0, 7).map((button) => button.textContent), ['Word length', '3', '4', '5', '6', '7', '8']);
    assert.equal(
        buttons.slice(7).map((button) => button.textContent).join(', '),
        wordCategoryTree
            .flatMap((group) => [group.title, ...group.children.map((child) => child.title)])
            .join(', ')
    );
    assert.ok(buttons.every((button) => button.dataset.state === 'all'));
    assert.equal(buttons[0].title, '2048/2048');
    assert.equal(buttons[1].title, '103/103');
    const animalsGroup = wordCategoryTree.find((group) => group.id === 'animals');
    const animalWordCount = new Set(animalsGroup.children.flatMap((child) => child.words)).size;
    assert.equal(buttons[7].title, animalWordCount + '/' + animalWordCount);
    assert.ok(buttons.every((button) => button.title.includes('/')), 'every tooltip must be a fraction');
});

test('a semantic subcategory adds exactly its own words and removes them again', async () => {
    const { elements } = await runPage('1', '', false);
    const buttons = collectCategoryButtons(elements.get('word-categories'));
    const lengthGroupButton = buttons.find((button) => button.dataset.categoryId === 'word-length');
    const birdsButton = buttons.find((button) => button.dataset.categoryId === 'animals/birds');
    const birdsWords = wordCategoryTree
        .find((group) => group.id === 'animals')
        .children.find((child) => child.id === 'birds')
        .words;

    assert.ok(birdsButton !== undefined, 'the birds button must exist');
    lengthGroupButton.handlers.click();
    assert.equal(elements.get('words-field').value, '', 'the field must start empty for this test');

    birdsButton.handlers.click();
    const wordsAfterClick = elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0);
    assert.deepEqual([...wordsAfterClick].sort(), [...birdsWords].sort());
    assert.equal(birdsButton.dataset.state, 'all');

    birdsButton.handlers.click();
    assert.equal(elements.get('words-field').value, '');
    assert.equal(birdsButton.dataset.state, 'none');
});

test('a semantic group button adds the union of its subcategories', async () => {
    const { elements } = await runPage('1', '', false);
    const buttons = collectCategoryButtons(elements.get('word-categories'));
    const animalsButton = buttons.find((button) => button.dataset.categoryId === 'animals');
    const animalsGroup = wordCategoryTree.find((group) => group.id === 'animals');
    const groupWords = new Set();
    for (const child of animalsGroup.children) {
        for (const word of child.words) {
            groupWords.add(word);
        }
    }

    assert.ok(animalsButton !== undefined, 'the animals button must exist');
    buttons.find((button) => button.dataset.categoryId === 'word-length').handlers.click();
    assert.equal(elements.get('words-field').value, '', 'the field must start empty for this test');

    animalsButton.handlers.click();
    const wordsAfterClick = elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0);
    assert.deepEqual([...wordsAfterClick].sort(), [...groupWords].sort());
    assert.equal(animalsButton.dataset.state, 'all');
    for (const child of animalsGroup.children) {
        const childButton = buttons.find((button) => button.dataset.categoryId === 'animals/' + child.id);
        assert.equal(childButton.dataset.state, 'all', child.id);
    }
});

test('the group button turns every length on and off at once', async () => {
    const { elements } = await runPage('1', '', false);
    const buttons = collectCategoryButtons(elements.get('word-categories'));
    const groupButton = buttons[0];

    groupButton.handlers.click();
    assert.equal(elements.get('words-field').value, '');
    assert.ok(buttons.every((button) => button.dataset.state === 'none'));
    assert.match(elements.get('words-summary').textContent, /^Words in the set: 0,/);

    groupButton.handlers.click();
    assert.ok(buttons.every((button) => button.dataset.state === 'all'));
    assert.equal(elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0).length, 2048);
    assertOrderMatchesInitialRule(elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0));
});

test('a category click removes its words, and a second click brings them back', async () => {
    const { elements } = await runPage('1', '', false);
    const buttons = collectCategoryButtons(elements.get('word-categories'));
    const threeLetterButton = buttons.find((button) => button.textContent === '3');
    const threeLetterWordCount = wordlist.filter((word) => word.length === 3).length;

    threeLetterButton.handlers.click();
    assert.equal(threeLetterButton.dataset.state, 'none');
    const wordsAfterRemoval = elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0);
    assert.equal(wordsAfterRemoval.length, 2048 - threeLetterWordCount);
    assert.ok(wordsAfterRemoval.every((word) => word.length !== 3));
    assert.match(elements.get('words-summary').textContent, new RegExp('^Words in the set: ' + (2048 - threeLetterWordCount) + ','));

    threeLetterButton.handlers.click();
    assert.equal(threeLetterButton.dataset.state, 'all');
    const wordsAfterRestore = elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0);
    assert.equal(wordsAfterRestore.length, 2048);
    assert.equal(new Set(wordsAfterRestore).size, 2048);
});

test('a partly present category shows the partial state and one click completes it', async () => {
    const { elements } = await runPage('1', 'act actor', false);
    const buttons = collectCategoryButtons(elements.get('word-categories'));
    const threeLetterButton = buttons.find((button) => button.textContent === '3');
    const fourLetterButton = buttons.find((button) => button.textContent === '4');
    const fiveLetterButton = buttons.find((button) => button.textContent === '5');

    assert.equal(threeLetterButton.dataset.state, 'partial');
    assert.equal(fiveLetterButton.dataset.state, 'partial');
    assert.equal(fourLetterButton.dataset.state, 'none');

    const threeLetterFill = Number.parseInt(threeLetterButton.style.values['--fill'], 10);
    assert.ok(threeLetterFill >= 2 && threeLetterFill <= 99, 'partial fill must be visible and below full: ' + threeLetterFill);
    assert.equal(fourLetterButton.style.values['--fill'], '0%');
    assert.match(threeLetterButton.title, /^1\/103$/);

    threeLetterButton.handlers.click();
    assert.equal(threeLetterButton.dataset.state, 'all');
    const words = elements.get('words-field').value.split(/\s+/).filter((word) => word.length > 0);
    assert.equal(words.filter((word) => word.length === 3).length, 103);
    assert.ok(words.includes('actor'));
    assert.ok(words.includes('act'));
    assertOrderMatchesInitialRule(words);
});

function assertOrderMatchesInitialRule(words) {
    for (let index = 1; index < words.length; index++) {
        const previous = words[index - 1];
        const current = words[index];
        if (previous.length !== current.length) {
            assert.ok(previous.length < current.length, 'lengths must increase: ' + previous + ' then ' + current);
        } else {
            const previousReversed = previous.split('').reverse().join('');
            const currentReversed = current.split('').reverse().join('');
            assert.ok(previousReversed <= currentReversed, 'reversed words must be alphabetical: ' + previous + ' then ' + current);
        }
    }
}

async function runPage(phraseCountValue, wordsValue = '', pressGenerate = true) {
    const scriptMatch = page.match(/<script>([\s\S]*)<\/script>/);
    assert.ok(scriptMatch, 'inline script must exist');

    const elements = new Map();
    const clipboardWrites = [];
    const document = {
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, createElementStub(''));
            }
            return elements.get(id);
        },
        createElement() {
            return createElementStub('');
        },
        execCommand() {
            return true;
        },
    };
    elements.set('phrase-count', createElementStub(phraseCountValue));
    elements.set('words-field', createElementStub(wordsValue));

    const sandbox = {
        document,
        crypto: globalThis.crypto,
        performance: globalThis.performance,
        navigator: {
            clipboard: {
                async writeText(text) {
                    clipboardWrites.push(text);
                },
            },
        },
        setTimeout,
        console,
    };
    vm.runInNewContext(scriptMatch[1], sandbox, { timeout: 20000 });
    if (pressGenerate) {
        elements.get('generate').handlers.click();
    }
    return { elements, clipboardWrites };
}

function createElementStub(value) {
    return {
        value,
        textContent: '',
        title: '',
        className: '',
        disabled: false,
        scrollTop: 0,
        scrollHeight: 0,
        children: [],
        dataset: {},
        style: {
            values: {},
            setProperty(name, value) {
                this.values[name] = value;
            },
        },
        handlers: {},
        classList: { toggle() {} },
        select() {},
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        replaceChildren() {
            this.children = [];
        },
        addEventListener(type, handler) {
            this.handlers[type] = handler;
        },
    };
}

async function readPhraseLines(elements) {
    const statusLine = elements.get('status');
    const deadline = Date.now() + 60000;
    while (!statusLine.textContent.startsWith('Done') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return elements.get('phrase-list').value.split('\n').filter((line) => line.length > 0);
}
