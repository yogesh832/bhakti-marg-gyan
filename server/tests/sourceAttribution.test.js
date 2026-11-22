const assert = require("node:assert/strict");
const test = require("node:test");
const { selectCitedSources } = require("../services/sourceAttribution");

const candidates = Array.from({ length: 5 }, (_, index) => ({ videoId: `video-${index + 1}` }));

test("returns only cited passages and renumbers them in answer order", () => {
  const result = selectCitedSources(
    "Short [Source 5].\n<<<more>>>\nDetail [Source 2] and [Source 5].",
    candidates
  );

  assert.deepEqual(result.sources, [candidates[4], candidates[1]]);
  assert.equal(result.answer, "Short [Source 1].\n<<<more>>>\nDetail [Source 2] and [Source 1].");
});

test("ignores invalid citations and returns no passages when none are cited", () => {
  const invalid = selectCitedSources("Not supported [Source 9].", candidates);
  assert.deepEqual(invalid.sources, []);
  assert.equal(invalid.answer, "Not supported .");

  const missing = selectCitedSources("No citation here.", candidates);
  assert.deepEqual(missing.sources, []);
});
