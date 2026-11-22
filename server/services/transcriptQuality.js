const VERSION = 1;
const words = text => String(text || "").trim().split(/\s+/).filter(Boolean);
const ARTIFACT = /\[(?:संगीत|तालियां|तालियाँ|हंसी|हँसी|music|applause|laughter|silence)\]/giu;

function normalizeSegments(segments) {
  const seen = new Set(), result = [];
  for (const segment of segments || []) {
    const text = String(segment.text || "").replace(ARTIFACT, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = `${segment.startTime}:${segment.endTime}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key); result.push({ ...segment, text });
  }
  // Generic imports must already be ordered; do not disguise invalid source timing.
  return result;
}

function parseJson3(data, duration) {
  const segments = [], seen = new Set();
  for (const event of data.events || []) {
    if (!event.segs) continue;
    const start = Number(event.tStartMs) / 1000;
    const eventEnd = start + Number(event.dDurationMs || 0) / 1000;
    for (let i = 0; i < event.segs.length; i++) {
      const part = event.segs[i], text = String(part.utf8 || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const time = start + Number(part.tOffsetMs || 0) / 1000;
      const next = event.segs[i + 1];
      const end = next?.tOffsetMs !== undefined ? start + Number(next.tOffsetMs) / 1000 : eventEnd;
      // Only identical text at the SAME source time is a rendering duplicate.
      // A chant or repeated sentence at a later time must survive unchanged.
      const key = `${time.toFixed(3)}:${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // YouTube's whole-second duration can precede a final source word by a
      // fraction of a second. Keep its real start within the existing 0.5s
      // validation tolerance, rather than creating a negative interval.
      segments.push({ text, startTime: time, endTime: Math.min(end, duration ? duration + 0.5 : Infinity), source: "youtube-caption" });
    }
  }
  // Overlapping windows can be emitted out of order; source word time wins.
  return segments.sort((a, b) => a.startTime - b.startTime);
}

function validate(segments, duration) {
  const reasons = [];
  const transcript = segments.map(s => s.text).join(" ").trim();
  if (!transcript || !segments.length) reasons.push("empty_transcript");
  let prior = -1, covered = 0, spanEnd = 0;
  for (const s of segments) {
    const start = Number(s.startTime), end = Number(s.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || start < prior || (duration && end > duration + 0.5)) reasons.push("invalid_timestamps");
    prior = start;
    if (Number.isFinite(start) && Number.isFinite(end)) { covered += Math.max(0, end - Math.max(start, spanEnd)); spanEnd = Math.max(spanEnd, end); }
  }
  const tokens = words(transcript), normalized = tokens.map(t => t.toLowerCase());
  let repeatedTokens = 0;
  // Flag long triplicated phrases; do not erase genuine speech to pass the gate.
  for (let i = 0; i < normalized.length;) {
    let found = 0;
    for (let length = 4; length <= 16 && i + length * 3 <= normalized.length; length++) {
      // Compare tokens before allocating a phrase/string: typical text exits here.
      if (normalized[i] !== normalized[i + length] || normalized[i] !== normalized[i + length * 2]) continue;
      let same = true;
      for (let j = 1; j < length; j++) if (normalized[i+j] !== normalized[i+length+j] || normalized[i+j] !== normalized[i+length*2+j]) { same = false; break; }
      if (!same) continue;
      const phraseWords = normalized.slice(i, i + length);
      // Short chants are real content, even when recited many times.
      if (new Set(phraseWords).size <= 3) continue;
      found = length * 3; break;
    }
    if (found) { repeatedTokens += found; i += found; } else i++;
  }
  const repetitionRatio = tokens.length ? repeatedTokens / tokens.length : 0;
  if (repetitionRatio > 0.22) reasons.push("excessive_phrase_repetition");
  if (!/[\p{L}\p{N}]/u.test(transcript.replace(/\[[^\]]*\]/g, ""))) reasons.push("no_speech_text");
  if (duration) {
    if (covered / duration < 0.35 || spanEnd < duration - Math.max(60, duration * 0.2)) reasons.push("insufficient_caption_coverage");
    if (tokens.length / duration > 7) reasons.push("implausible_word_rate");
  }
  return { version: VERSION, passed: reasons.length === 0, reasons: [...new Set(reasons)], wordAccuracy: "unverified_source_transcription", words: tokens.length, repetitionRatio, duration: duration || null, coveredSeconds: covered };
}

function requireQuality(segments, duration) {
  const report = validate(segments, duration);
  if (!report.passed) { const error = new Error(`Transcript quality rejected: ${report.reasons.join(", ")}`); error.code = "TRANSCRIPT_QUALITY"; error.report = report; throw error; }
  return report;
}

function buildSafeChunks(segments, target = 900) {
  const chunks = []; let current;
  for (const segment of segments) {
    const text = String(segment.text || "").trim(); if (!text) continue;
    if (!current || current.text.length + text.length + 1 > target || segment.startTime - current.endTime > 10) {
      current = { index: chunks.length, startTime: segment.startTime, endTime: segment.endTime, text, source: segment.source || "estimated" }; chunks.push(current);
    } else { current.text += " " + text; current.endTime = Math.max(current.endTime, segment.endTime); }
  }
  // Lossless chunking: no similarity dedup and no global replacement of chants.
  if (chunks.map(c => c.text).join(" ") !== segments.map(s => s.text.trim()).filter(Boolean).join(" ")) throw new Error("Chunk coverage mismatch");
  return chunks;
}
function prepareTranscript(segments, duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    const error = new Error("Transcript quality rejected: verified media duration required"); error.code = "TRANSCRIPT_QUALITY"; throw error;
  }
  const normalized = normalizeSegments(segments);
  if (normalized.some(s => !["youtube-caption", "assemblyai", "whisper", "deepgram"].includes(s.source))) {
    const error = new Error("Transcript quality rejected: source timestamps required; re-ingest from media"); error.code = "TRANSCRIPT_QUALITY"; throw error;
  }
  if (normalized.some(s => /You are a knowledgeable assistant specializing|Please analyze it carefully and be ready to answer/i.test(s.text))) {
    const error = new Error("Transcript quality rejected: legacy prompt wrapper contamination"); error.code = "TRANSCRIPT_QUALITY"; throw error;
  }
  const quality = requireQuality(normalized, duration);
  const chunks = buildSafeChunks(normalized);
  return { transcript: chunks.map(c => c.text).join(" "), chunks, quality };
}
module.exports = { VERSION, parseJson3, validate, requireQuality, buildSafeChunks, normalizeSegments, prepareTranscript };
