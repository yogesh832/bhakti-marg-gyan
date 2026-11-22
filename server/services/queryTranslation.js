// Bound preprocessing latency and share concurrent identical translations.
function createQueryTranslator(translate, { timeoutMs = 3000, ttlMs = 600000, maxEntries = 300 } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function toHindi(question) {
    if (/[ऀ-ॿ]/.test(question)) return question;
    const key = question.trim().replace(/\s+/g, ' ');
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    if (pending.has(key)) return pending.get(key);
    const controller = new AbortController();
    let timer;
    const job = (async () => {
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => translate(key, controller.signal)),
          new Promise((_, reject) => { timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Translation deadline exceeded'));
          }, timeoutMs); }),
        ]);
        const value = String(result || '').trim().split('\n')[0].trim();
        if (!/[ऀ-ॿ]/.test(value)) return question;
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } catch {
        // Failed/aborted work is not cached; a later request can recover.
        return question;
      } finally {
        clearTimeout(timer);
        pending.delete(key);
      }
    })();
    pending.set(key, job);
    return job;
  };
}

module.exports = { createQueryTranslator };
