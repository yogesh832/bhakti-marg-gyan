/**
 * Improved Retrieval Service for Bhakti Marg Gyan
 * Better chunking, deduplication, and semantic search
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "how", "i", "in", "is", "it", "me", "of", "on", "or", "the", "to", "what",
  "when", "where", "why", "with",
  // Hindi stop words
  "का", "के", "की", "को", "में", "से", "और", "क्या", "है", "हैं", "को", "पर", "नहीं"
]);

// Clean transcript text - remove repetitions and normalize
const cleanText = (text = "") => {
  // Collapse repeated whole-word runs like "राधा राधा राधा राधा" (more than 3 times).
  // Word-bounded regex: the old /(.{2,})\1{3,}/g backtracked catastrophically
  // on ordinary sentences (~10ms+ per chunk).
  let cleaned = text.replace(/(\S{1,20})(\s+\1){3,}/g, '$1 $1 $1');

  // Remove filler words repeated more than twice
  cleaned = cleaned.replace(/(भजन|राधा|प्रभु|भगवान|हरि|कृष्ण)\s*(?:\1\s*){2,}/gi, '$1');

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
};

// Normalize text for comparison
const normalizeText = (value = "") =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Tokenize with Unicode-aware word boundary splitting
const tokenize = (value = "") => {
  if (!value) return [];
  const lower = value.toLowerCase();
  // Use Devanagari Unicode range [ऀ-ॿ] to match whole Hindi words
  // combined with ASCII alphanumeric for English words
  const words = lower.match(/[ऀ-ॿ॰-ॿ]+|[a-z0-9]+/g) || [];
  return words.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
};

// Calculate similarity between two strings
const jaccardSimilarity = (tokens1, tokens2) => {
  if (!tokens1.length || !tokens2.length) return 0;
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const intersection = [...set1].filter(x => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0;
};

// Deduplicate chunks based on content similarity
const deduplicateChunks = (chunks, similarityThreshold = 0.7) => {
  const seen = [];

  for (const chunk of chunks) {
    const chunkTokens = tokenize(chunk.text);
    let isDuplicate = false;

    for (const existing of seen) {
      const existingTokens = tokenize(existing.text);
      const similarity = jaccardSimilarity(chunkTokens, existingTokens);

      if (similarity >= similarityThreshold) {
        isDuplicate = true;
        // Keep the longer version if more informative
        if (chunk.text.length > existing.text.length) {
          existing.text = chunk.text;
          existing.startTime = chunk.startTime;
          existing.endTime = chunk.endTime;
        }
        break;
      }
    }

    if (!isDuplicate) {
      seen.push({ ...chunk });
    }
  }

  return seen;
};

// Build chunks with better processing
const splitPlainTranscript = (text = "", targetWords = 100) => {
  if (!text) return [];

  const cleaned = cleanText(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const chunks = [];
  const wordsPerMinute = 135;
  const secondsPerWord = 60 / wordsPerMinute;

  for (let i = 0; i < words.length; i += targetWords) {
    const chunkWords = words.slice(i, i + targetWords);
    const startTime = Math.floor(i * secondsPerWord);
    const endTime = Math.ceil((i + chunkWords.length) * secondsPerWord);
    const chunkText = chunkWords.join(' ');

    // Skip very short chunks or mostly empty
    if (chunkText.length > 50) {
      chunks.push({
        index: chunks.length,
        startTime,
        endTime: Math.max(endTime, startTime + 12),
        text: cleanText(chunkText),
        source: "estimated",
      });
    }
  }

  return chunks;
};

// Process timed segments with deduplication
const chunkTimedSegments = (segments = [], targetChars = 900) => {
  if (!segments || segments.length === 0) return [];

  const chunks = [];
  let current = null;

  for (const segment of segments) {
    const text = cleanText(segment.text || "").trim();
    if (!text || text.length < 10) continue;

    const startTime = Number(segment.startTime ?? segment.start ?? 0);
    const endTime = Number(segment.endTime ?? segment.end ?? startTime + (segment.duration || 8));

    if (!current) {
      current = {
        index: chunks.length,
        startTime: Math.max(0, Math.floor(startTime)),
        endTime: Math.ceil(endTime),
        text,
        source: segment.source || "estimated",
      };
      continue;
    }

    const wouldBeLong = `${current.text} ${text}`.length > targetChars;
    const gapTooLarge = startTime - current.endTime > 10;

    if (wouldBeLong || gapTooLarge) {
      if (current.text.length > 50) {
        chunks.push(current);
      }
      current = {
        index: chunks.length,
        startTime: Math.max(0, Math.floor(startTime)),
        endTime: Math.ceil(endTime),
        text,
        source: segment.source || current.source || "estimated",
      };
    } else {
      current.text = cleanText(`${current.text} ${text}`);
      current.endTime = Math.ceil(Math.max(current.endTime, endTime));
    }
  }

  if (current && current.text.length > 50) {
    chunks.push(current);
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    index,
    endTime: Math.max(chunk.endTime, chunk.startTime + 12),
  }));
};

// Main chunk builder
const buildChunksFromTranscript = (transcript, timedSegments = []) => {
  const timedChunks = chunkTimedSegments(timedSegments);
  if (timedChunks.length > 0) {
    const deduplicated = deduplicateChunks(timedChunks);
    return deduplicated;
  }
  return splitPlainTranscript(transcript);
};

// Score chunk relevance to question
const scoreChunk = (questionTokens, chunkText = "") => {
  const chunkTokens = tokenize(chunkText);
  if (questionTokens.length === 0 || chunkTokens.length === 0) return 0;

  const freq = new Map();
  for (const token of chunkTokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  let score = 0;

  // Word overlap scoring
  for (const token of questionTokens) {
    if (freq.has(token)) {
      score += 2 + Math.log1p(freq.get(token));
    }
  }

  // Exact phrase bonus
  const phrase = normalizeText(questionTokens.join(" "));
  const normalizedChunk = normalizeText(chunkText);
  if (phrase.length > 5 && normalizedChunk.includes(phrase)) {
    score += 10;
  }

  // Jaccard similarity bonus
  const similarity = jaccardSimilarity(questionTokens, chunkTokens);
  score += similarity * 5;

  // Normalize by chunk length (prefer medium-length chunks)
  const lengthPenalty = Math.max(0.5, 1 - Math.abs(chunkTokens.length - 50) / 100);

  return (score / Math.sqrt(chunkTokens.length)) * lengthPenalty;
};

// Main search function
const searchRelevantChunks = (videos, question, limit = 7) => {
  const questionTokens = tokenize(question);
  if (questionTokens.length === 0) return [];

  const allChunks = [];

  for (const video of videos) {
    let chunks;

    if (video.chunks && video.chunks.length > 0) {
      // Chunks were already cleaned at ingestion (buildChunksFromTranscript) —
      // re-cleaning here wastes ~8ms per chunk for no benefit.
      chunks = video.chunks.filter(c => c.text && c.text.length > 30);
    } else if (video.transcript) {
      // Fallback to transcript splitting
      chunks = splitPlainTranscript(video.transcript);
    } else {
      continue;
    }

    for (const chunk of chunks) {
      const score = scoreChunk(questionTokens, chunk.text);
      if (score <= 0.1) continue; // Minimum threshold

      allChunks.push({
        score,
        videoId: video.videoId,
        title: video.title || `Video ${video.videoId}`,
        url: video.url,
        mediaUrl: video.mediaUrl,
        sourceType: video.sourceType || "youtube",
        startTime: Math.max(0, Math.floor(chunk.startTime || 0)),
        endTime: Math.max(
          Math.ceil(chunk.endTime || (chunk.startTime || 0) + 45),
          Math.floor(chunk.startTime || 0) + 12
        ),
        quote: chunk.text, // Full chunk (~900 chars) — cutting mid-text left proverbs/sentences truncated
        chunkIndex: chunk.index,
      });
    }
  }

  // Sort by score and deduplicate similar quotes
  const sorted = allChunks.sort((a, b) => b.score - a.score);

  // Final deduplication by quote similarity
  const result = [];
  const addedQuotes = new Set();

  for (const match of sorted) {
    const quoteKey = normalizeText(match.quote).substring(0, 100);
    if (addedQuotes.has(quoteKey)) continue;
    addedQuotes.add(quoteKey);
    result.push(match);
    if (result.length >= limit) break;
  }

  return result;
};

module.exports = {
  buildChunksFromTranscript,
  searchRelevantChunks,
  splitPlainTranscript,
  cleanText,
  deduplicateChunks,
};
