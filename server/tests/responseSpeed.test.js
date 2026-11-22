const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueryTranslator } = require('../services/queryTranslation');

test('concurrent translations share work, successful results cache, Hindi skips AI', async () => {
  let calls = 0;
  const translate = createQueryTranslator(async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return 'भक्ति कैसे करें';
  });
  assert.deepEqual(await Promise.all([translate('bhakti kaise kare'), translate('bhakti kaise kare')]),
    ['भक्ति कैसे करें', 'भक्ति कैसे करें']);
  assert.equal(await translate('bhakti kaise kare'), 'भक्ति कैसे करें');
  assert.equal(await translate('मन शांत'), 'मन शांत');
  assert.equal(calls, 1);
});

test('hung translations abort within budget and are retried on later requests', async () => {
  let calls = 0;
  let aborted = 0;
  const translate = createQueryTranslator((_, signal) => {
    calls++;
    signal.addEventListener('abort', () => aborted++);
    return new Promise(() => {});
  }, { timeoutMs: 20 });
  const start = performance.now();
  assert.equal(await translate('question'), 'question');
  assert.ok(performance.now() - start < 500);
  assert.equal(await translate('question'), 'question');
  assert.equal(calls, 2);
  assert.equal(aborted, 2);
});

test('translation cache is bounded and failures do not poison it', async () => {
  let calls = 0;
  const translate = createQueryTranslator(async q => {
    calls++;
    if (q === 'bad') throw new Error('temporary');
    return 'भक्ति';
  }, { maxEntries: 1 });
  await translate('a'); await translate('b'); await translate('a');
  await translate('bad'); await translate('bad');
  assert.equal(calls, 5);
});

test('Neon-only empty retrieval never touches Mongo or answer AI; reports end-to-end timing', async () => {
  // No real provider requests or database queries in this regression.
  const keys = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'TRANSCRIPT_SEARCH_PROVIDER'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  keys.forEach(k => delete process.env[k]);
  process.env.TRANSCRIPT_SEARCH_PROVIDER = 'neon';
  const neon = require('../services/neonRetrievalService');
  const Video = require('../models/videoModel');
  const originalSearch = neon.searchNeonChunks, originalAggregate = Video.aggregate;
  neon.searchNeonChunks = async () => [];
  Video.aggregate = () => { throw new Error('Mongo bypass regression'); };
  const path = require.resolve('../controllers/askController');
  delete require.cache[path];
  try {
    const ask = require(path);
    let result;
    const res = { json(body) { result = body; }, status(code) { this.code = code; return this; } };
    await ask({ body: { question: 'भक्ति कैसे करें', language: 'hindi' } }, res);
    assert.equal(res.code, undefined);
    assert.equal(result.retrievalMode, 'neon');
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.providers, []);
    assert.ok(result.timing.totalMs >= result.timing.translationMs + result.timing.retrievalMs);
    neon.searchNeonChunks = async () => { throw new Error('connection unavailable'); };
    await ask({ body: { question: 'भक्ति कैसे करें' } }, res);
    assert.equal(res.code, 503);
    assert.equal(result.success, false);
    await ask({ body: { question: 123 } }, res);
    assert.equal(res.code, 400);
  } finally {
    neon.searchNeonChunks = originalSearch;
    Video.aggregate = originalAggregate;
    delete require.cache[path];
    keys.forEach(k => saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]);
  }
});

test('Neon ranking limits candidates before continuation joins and preserves source mapping', async () => {
  const db = require('../db/neonDb');
  const originalQuery = db.query;
  const originalUrl = process.env.DATABASE_URL;
  const path = require.resolve('../services/neonRetrievalService');
  process.env.DATABASE_URL = 'test';
  db.query = async (sql, params) => {
    assert.ok(sql.indexOf('LIMIT $2') < sql.indexOf('LEFT JOIN'));
    assert.ok(sql.includes('ORDER BY phrase_matches DESC'));
    assert.ok(Array.isArray(params[2]));
    return { rows: [{ video_id: 'v1', start_time: 12.5, end_time: 40,
      text: 'source text', rank: 1, chunk_index: 2, continuation: 'a'.repeat(40), continuation_end_time: 70 }] };
  };
  delete require.cache[path];
  try {
    const [hit] = await require(path).searchNeonChunks('भक्ति', 5);
    assert.equal(hit.quote, 'source text');
    assert.equal(hit.continuationEndTime, 70);
    assert.equal(hit.videoId, 'v1');
  } finally {
    db.query = originalQuery;
    originalUrl === undefined ? delete process.env.DATABASE_URL : process.env.DATABASE_URL = originalUrl;
    delete require.cache[path];
  }
});
