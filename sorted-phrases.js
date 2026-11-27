export function insertPhraseInOrder(phrases, phrase) {
    let low = 0;
    let high = phrases.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (comparePhrases(phrases[middle], phrase) <= 0) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    phrases.splice(low, 0, phrase);
    return low;
}

function comparePhrases(left, right) {
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
