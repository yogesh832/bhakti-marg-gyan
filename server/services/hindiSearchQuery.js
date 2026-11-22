const STOP_WORDS = new Set('क्या कैसे क्यों कब कहाँ कहां कौन किस किसे कितना कितने कितनी का के की को से में पर है हैं हूं हूँ हो होता होती होते था थी थे हम मैं मुझे मेरे मेरा मेरी आप आपका अपनी अपने अपना यह ये वह वो एक और तो भी ही लिए लिये सकते सकता सकती करें करे करना करें कृपया बताओ बताएं तरीका'.split(' '));
for (const word of 'बहुत आता आती आते आए आये आकर रहा रही रहे करूं करूँ करू करु करूँगा चाहिए'.split(' ')) STOP_WORDS.add(word);

const tokenize = question => String(question).normalize('NFC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];

function buildSearchQuery(question) {
  const words = tokenize(question);
  const terms = [...new Set(words)].filter(word => word.length > 1 && !STOP_WORDS.has(word));
  return terms.map(word => {
    // Retrieval synonyms only: source text and the user's question stay intact.
    if (/^(बच्च|पुत्र|संतान)/u.test(word)) return '(बच्च:* | पुत्र:* | संतान:*)';
    if (/^रख/u.test(word)) return 'रख:*';
    return `${word}:*`;
  }).join(' & ');
}

function buildPhraseQueries(question) {
  const words = tokenize(question).slice(0, 40);
  const phrases = new Set();
  // Preserve filler inside phrases for question wording, but never boost a
  // phrase composed solely of filler. Count each phrase once, not repetitions.
  for (const size of [3, 2]) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size);
      if (phrase.some(word => word.length > 1 && !STOP_WORDS.has(word))) {
        phrases.add(phrase.map(word => `${word}:*`).join(' <-> '));
      }
      if (phrases.size >= 16) return [...phrases];
    }
  }
  return [...phrases];
}

module.exports = { buildSearchQuery, buildPhraseQueries };
