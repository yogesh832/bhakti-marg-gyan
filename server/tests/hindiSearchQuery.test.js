const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchQuery, buildPhraseQueries } = require('../services/hindiSearchQuery');
test('Hindi combining marks stay intact and question filler is excluded', () => {
  assert.equal(buildSearchQuery('भजन कैसे करें?'), 'भजन:*');
  assert.equal(buildSearchQuery('भक्ति कैसे करें'), 'भक्ति:*');
});
test('children naming query can match a teaching using पुत्र and रखना', () => {
  assert.equal(buildSearchQuery('क्या बच्चों का नाम भगवान के नाम से रख सकते हैं?'),
    '(बच्च:* | पुत्र:* | संतान:*) & नाम:* & भगवान:* & रख:*');
});
test('query operators from input cannot become search syntax', () => {
  assert.equal(buildSearchQuery("भक्ति | !भजन'); DROP"), 'भक्ति:* & भजन:* & drop:*');
  assert.equal(buildSearchQuery('क्या कैसे हैं?'), '');
});
test('anger question does not require incidental grammatical forms from source', () => {
  const question = 'बहुत क्रोध आता है मैं क्या करूं';
  assert.equal(buildSearchQuery(question), 'क्रोध:*');
  assert.equal(buildSearchQuery('मुझे बहुत क्रोध आ रहा है, मैं क्या करूँ?'), 'क्रोध:*');
  const phrases = buildPhraseQueries(question);
  assert.ok(phrases.includes('बहुत:* <-> क्रोध:* <-> आता:*'));
  assert.ok(!phrases.includes('मैं:* <-> क्या:* <-> करूं:*'));
  assert.equal(new Set(phrases).size, phrases.length);
});
