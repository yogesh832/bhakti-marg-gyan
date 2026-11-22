const CITATION_RE = /\[(?:Source|स्रोत)\s*(\d+)\]/gi;

function selectCitedSources(answer, candidates) {
  const citedIndexes = [];
  const seen = new Set();

  for (const match of String(answer || "").matchAll(CITATION_RE)) {
    const index = Number(match[1]) - 1;
    if (index < 0 || index >= candidates.length || seen.has(index)) continue;
    seen.add(index);
    citedIndexes.push(index);
  }

  const citationNumbers = new Map(citedIndexes.map((index, position) => [index, position + 1]));
  const normalizedAnswer = String(answer || "").replace(CITATION_RE, (citation, number) => {
    const mapped = citationNumbers.get(Number(number) - 1);
    return mapped ? `[Source ${mapped}]` : "";
  }).replace(/ {2,}/g, " ").trim();

  return {
    answer: normalizedAnswer,
    sources: citedIndexes.map((index) => candidates[index]),
  };
}

module.exports = { selectCitedSources };
