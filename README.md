# seed-generator-bip39
Generating seed phrases for research purposes, not for real use

Generates seed phrases of 24 words each, one phrase per line, where the first 12 words and the
last 12 words of every phrase are each a valid 12-word BIP39 phrase. The number of phrases is
chosen in the page field, 1024 by default. Phrases appear as they are generated, are kept
ordered by increasing phrase length and alphabetically among phrases of the same length, and
generation stops at the chosen count. While phrases
are generated, the page shows the running speed every half second; when it stops, the page
reports the total time and the average time per phrase.

The page also shows the 2048 words of the English BIP39 list in one editable field. The field
is ordered by word length, and among words of the same length by the alphabetical order of
their reversed spelling, so words with similar endings stand together. Only the words left in
that field are used for generation, and the page reports how many words the set holds and the
approximate strength in bits. Words outside the BIP39 list are ignored and counted. A set of a
single word can contain no valid phrase at all; the page then reports that instead of showing a
phrase that would not pass validation.

Because a restricted set cannot be sampled at random like the full list, the generator picks the
first eleven words of each half from the set and derives the twelfth word from the checksum
rules, retrying until that word belongs to the set.

Below the words field there are category buttons, grouped in two levels: a group button and the
buttons inside it. Every group starts a new row with its own button, and the buttons of its
subcategories follow it on the same row, wrapping only when the row runs out of width. There are
23 groups and 162 buttons in total. The first group is word length,
its button is named "Word length" and the buttons inside it are the numbers 3 to 8, the lengths
that exist in the English BIP39 list. The other 22 groups are the meaning categories of the
BIP39 vocabulary, taken from `word-categories.js`: Animals, Nature and Environment, Food and
Drinks, Human Body and Health, People and Relationships, Home, Clothing, City, Transport,
Education, Work and Business, Science and Technology, Actions and Processes, Time and Space,
Size and Shape, Sounds and Music, Qualities, Law and Politics, Sports and Games, Arts and
Culture, Religion, Abstract Ideas. Every word of the BIP39 list belongs to at least one
subcategory, and a word with several meanings belongs to several.

Each button, the group one included, shows one of three states: the list has no word of that
category (light), it has some but not all of them (grey), or it has all of them (dark). A left
click adds the missing words of that category. A right click removes every word of that category
from the list, and the browser context menu does not open on buttons. A group button covers every
word of the group, so it adds or removes all of its subcategories at once. The state is
recomputed after any edit of the words field.

A category that is only partly in the list also draws a thin line along the bottom edge of its
button, filled in proportion to the share of the category that is present, so that one word out
of three hundred looks clearly different from two hundred ninety nine out of three hundred. The
share is the exact percentage of the category; the line has a floor of two pixels so that a very
small share is still drawn instead of vanishing. The line sits inside the button and does not
change its height. Hovering a button shows the exact numbers in the form X/Y, where X is the
number of its words present in the list and Y is the total number of its words.

After every change made with a button, the words field is rebuilt in its initial order: shortest
words first, and among words of the same length by the alphabetical order of their reversed
spelling. This keeps the field readable and identical to the order shown on load.

The deliverable is `index.html`: one self-contained file with no network requests. Open it by
double-clicking, it works offline.

Randomness comes from the browser `crypto.getRandomValues`, the cryptographic generator built
into the browser. `Math.random` is not used anywhere.

## How it works

A 24-word phrase carries 256 bits of entropy plus 8 bits of checksum. A 12-word phrase carries
128 bits of entropy plus 4 bits of checksum. For a 24-word phrase to split into two valid
phrases, the checksum bits of the halves must sit exactly where the 24-word phrase keeps its
entropy and checksum, which gives two constraints of four bits each. The generator draws the
first 128 bits freely, then draws 124 more bits and retries until the two constraints hold;
acceptance probability is 1/16 per attempt, so generation takes about sixteen attempts on average.

## Building

1. `npm install`
2. `npm run build` writes `index.html`
3. `npm test` rebuilds and runs the tests, which cover the generator logic, the bit-level
   relationship between the halves and the whole phrase, the absence of external references,
   and the built file executed as a page that must produce unique valid phrases in the order
   asked by the count field and must report the elapsed time

## Embedded libraries

`@scure/bip39` 2.4.0 and `@noble/hashes` 2.4.0, both MIT. They are bundled into `index.html`
by `build.mjs`, so the page has no external dependency.

## Security

Any generated phrase and each of its halves is a working wallet seed. Anyone who sees a half
gains a valid phrase, so treat every half as a secret. The page draws randomness only from the
browser `crypto.getRandomValues` and never sends anything anywhere.
