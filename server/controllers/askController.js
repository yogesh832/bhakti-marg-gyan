const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const OpenAI = require("openai");
const Video = require("../models/videoModel");
const {
  searchRelevantChunks,
  cleanText,
} = require("../services/retrievalService");
const neonService = require("../services/neonRetrievalService");
const { selectCitedSources } = require("../services/sourceAttribution");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let genAI;
let groq;
let openai;

if (GEMINI_API_KEY) genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
if (GROQ_API_KEY) groq = new Groq({ apiKey: GROQ_API_KEY, maxRetries: 0 });
if (OPENAI_API_KEY) openai = new OpenAI({ apiKey: OPENAI_API_KEY, maxRetries: 0 });

let cachedGeminiModel = null;

const getGeminiModel = async (signal) => {
  if (cachedGeminiModel) return cachedGeminiModel;
  if (!GEMINI_API_KEY) return "models/gemini-1.5-flash";
  try {
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`,
      { signal, timeout: 2000 }
    );
    const models = res.data.models.map((model) => model.name);
    cachedGeminiModel = (
      models.find((model) => model.includes("1.5-flash")) ||
      models.find((model) => model.includes("flash")) ||
      "models/gemini-1.5-flash"
    );
    return cachedGeminiModel;
  } catch {
    return "models/gemini-1.5-flash";
  }
};

const disabledProviders = new Map();

const isProviderDisabled = (name) => {
  const until = disabledProviders.get(name);
  if (!until) return false;
  if (Date.now() > until) {
    disabledProviders.delete(name);
    return false;
  }
  return true;
};

const disableProvider = (name, durationMs = 600000) => {
  disabledProviders.set(name, Date.now() + durationMs);
};

const AI_PROVIDERS = [
  {
    name: "Groq",
    enabled: !!groq,
    handler: async (prompt, signal) => {
      const models = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];
      let lastErr;
      for (const m of models) {
        if (signal && signal.aborted) break;
        try {
          const completion = await groq.chat.completions.create(
            {
              messages: [{ role: "user", content: prompt }],
              model: m,
              temperature: 0.3,
              max_tokens: 800,
            },
            { signal }
          );
          const content = completion.choices[0]?.message?.content;
          if (content && content.trim().length > 0) {
            return content;
          }
        } catch (err) {
          lastErr = err;
          // Fail fast on auth errors
          if (err.status === 401 || (err.message && err.message.includes("api_key"))) {
            throw err;
          }
          // On 429 rate limit, try next model immediately (each model has its own rate limit quota)
          if (err.status === 429 || (err.message && err.message.includes("rate_limit"))) {
            console.warn(`⚠️ Groq model ${m} rate-limited (429). Switching model immediately...`);
          } else {
            console.warn(`⚠️ Groq model ${m} failed (${err.status || err.name}): ${err.message}`);
          }
        }
      }
      throw new Error(`All Groq models failed: ${lastErr?.message || ""}`);
    },
  },
  {
    name: "Gemini",
    enabled: !!genAI,
    handler: async (prompt, signal) => {
      if (isProviderDisabled("Gemini")) {
        throw new Error("Gemini is temporarily disabled due to daily quota exhaustion (429).");
      }
      try {
        const modelName = await getGeminiModel(signal);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
          },
        });
        const result = await model.generateContent(
          { contents: [{ role: "user", parts: [{ text: prompt }] }] },
          { signal }
        );
        return result.response.text();
      } catch (err) {
        if (err.message && (err.message.includes("429") || err.message.includes("Quota exceeded"))) {
          console.warn("⚠️ Gemini daily quota exhausted. Disabling Gemini for 10 minutes.");
          disableProvider("Gemini", 600000);
        }
        throw err;
      }
    },
  },
  {
    name: "OpenAI",
    enabled: !!openai,
    handler: async (prompt, signal) => {
      if (isProviderDisabled("OpenAI")) {
        throw new Error("OpenAI is temporarily disabled due to credit exhaustion (429).");
      }
      try {
        const completion = await openai.chat.completions.create(
          {
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o-mini",
            temperature: 0.3,
            max_tokens: 800,
          },
          { signal }
        );
        return completion.choices[0]?.message?.content || "";
      } catch (err) {
        if (err.status === 429 || (err.message && (err.message.includes("429") || err.message.includes("credits")))) {
          console.warn("⚠️ OpenAI billing quota exhausted. Disabling OpenAI for 10 minutes.");
          disableProvider("OpenAI", 600000);
        }
        throw err;
      }
    },
  },
].filter((provider) => provider.enabled);

const callAIWithFallback = async (prompt) => {
  if (AI_PROVIDERS.length === 0) {
    throw new Error("No AI providers configured.");
  }

  let lastError;
  for (const provider of AI_PROVIDERS) {
    if (isProviderDisabled(provider.name)) continue;

    const controller = new AbortController();
    let timer;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`${provider.name} execution timed out (12s signal abort)`));
        }, 12000);
      });

      const response = await Promise.race([
        provider.handler(prompt, controller.signal),
        timeoutPromise,
      ]).finally(() => clearTimeout(timer));

      if (response && response.trim().length > 0) {
        return { response, provider: provider.name };
      }
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      console.warn(`⚠️ ${provider.name} failed/timed out: ${error.message}`);
    }
  }
  throw new Error(`All AI providers failed: ${lastError?.message || "Unknown error"}`);
};

// ── Query translation for search ─────────────────────────────────────────────
// Transcripts are stored in Devanagari. A romanized ("bhakti kaise karu") or
// English question matches nothing, so translate it to Hindi BEFORE retrieval.
// The translated query is only used for searching — the AI still answers the
// original question. Cached: identical questions skip the extra AI round-trip.
const { createQueryTranslator } = require("../services/queryTranslation");
const toHindiSearchQuery = createQueryTranslator(async (question, signal) => {
  const prompt = "Translate this Hindi/Hinglish/English question to Hindi Devanagari. Preserve its meaning. Return ONLY the translated question:\n" + question;
  for (const provider of AI_PROVIDERS) {
    if (signal.aborted) break;
    if (isProviderDisabled(provider.name)) continue;
    try {
      // Translation gets a small output budget and no hidden SDK retries.
      if (provider.name === "Groq") {
        for (const model of ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]) {
          if (signal.aborted) break;
          try {
            const result = await groq.chat.completions.create({
              model, messages: [{ role: "user", content: prompt }],
              temperature: 0.1, max_tokens: 80,
            }, { signal });
            const text = result.choices[0]?.message?.content || "";
            if (/[ऀ-ॿ]/.test(text)) return text;
          } catch (error) {
            if (signal.aborted || error.status === 401 || error.status === 403) throw error;
          }
        }
      } else {
        const text = await provider.handler(prompt, signal);
        if (/[ऀ-ॿ]/.test(text)) return text;
      }
    } catch { if (signal.aborted) break; }
  }
  return question;
});

const getLanguageInstruction = (language) => {  const instructions = {
    hindi: "जवाब हिंदी में दें।",
    english: "Answer in English.",
    tamil: "பதிலை தமிழில் கொடுங்கள்.",
    malayalam: "ഉത്തരം മലയാളത്തിൽ നൽകുക.",
    bengali: "উত্তর বাংলায় দিন।",
    gujarati: "જવાબ ગુજરાતીમાં આપો.",
    kannada: "ಉತ್ತರವನ್ನು ಕನ್ನಡದಲ್ಲಿ ನೀಡಿ.",
  };
  return instructions[language] || "जवाब उसी भाषा में दें जिसमें सवाल पूछा गया है।";
};

const getToneInstruction = (tone) => {
  const tones = {
    premand:
      "शैली: बिल्कुल सीधा उत्तर — किसी भी संबोधन ('प्रिय मित्र', 'बेटा', 'बहना'), प्रस्तावना " +
      "('आपकी स्थिति को समझते हुए...', 'मैं आपको साझा करना चाहता हूँ...') या निष्कर्ष-बकवास के बिना। " +
      "पहला शब्द ही प्रश्न का उत्तर हो। तथ्य तीसरे पुरुष में स्रोत से जोड़ें — " +
      "'प्रेमानंद जी महाराज ने अपने प्रवचन में कहा कि...', 'उनके वीडियो के अनुसार...'। भाषा सरल, सहज, सीधी।",
    brief:
      "शैली: एक-दो वाक्य, बिना संबोधन के सीधे उत्तर — 'महाराज जी के अनुसार...' जैसे स्रोत-संदर्भ के साथ।",
    detailed:
      "शैली: विस्तार से लेकिन सीधे — बिना संबोधन/प्रस्तावना के, हर बिंदु पर 'महाराज जी ने बताया है' जैसा स्पष्ट संदर्भ।",
  };
  return tones[tone] || tones.premand;
};

const formatSources = (matches) =>
  matches
    .map((match, index) => {
      const lines = [
        `[Source ${index + 1}]`,
        `Video: ${match.title}`,
        `Timestamp: ${Math.floor(match.startTime / 60)}:${String(Math.floor(match.startTime % 60)).padStart(2, '0')} – ${Math.floor(match.endTime / 60)}:${String(Math.floor(match.endTime % 60)).padStart(2, '0')}`,
        `"${String(match.quote || "").trim()}"`,
      ];
      if (match.continuation) {
        lines.push(`Same video, next segment (often contains महाराज जी's answer):`);
        lines.push(`"${String(match.continuation).trim()}"`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

const noAnswerText = (language) => {
  const messages = {
    hindi: "इस प्रश्न से संबंधित उपदेश अभी डेटाबेस में उपलब्ध नहीं है। कृपया अपना प्रश्न थोड़ा अलग तरीके से पूछें।",
    default: "माफ़ कीजिए, इस प्रश्न का उत्तर मिलने में कठिनाई हो रही है। कृपया प्रश्न को सरल शब्दों में पूछें।"
  };
  return messages[language] || messages.default;
};

const noSupportedAnswerText = (language, question) =>
  language === "hindi" || (language === "auto" && /[ऀ-ॿ]/.test(question))
    ? "मिले हुए प्रवचन अंश इस प्रश्न का पुष्ट उत्तर नहीं देते। कृपया प्रश्न अधिक स्पष्ट करके पूछें।"
    : "The retrieved pravachan passages do not establish an answer to this question. Please ask more specifically.";

// NOTE: transcript is excluded from projection — chunks[] already contain
// the searchable text. Loading full transcripts (10-55KB each × 1000+ videos)
// over the wire adds 30+ seconds of network I/O for zero benefit.
const PROJECTION = {
  videoId: 1,
  url: 1,
  mediaUrl: 1,
  sourceType: 1,
  title: 1,
  chunks: 1,
};

// In-memory chunk cache — pulling 50 fat chunk documents from Atlas takes ~50s
// on a shared cluster. Seeded content rarely changes, so cache with a TTL.
const CHUNK_CACHE = new Map(); // videoId -> { expiresAt, doc }
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;

const getVideoDocs = async (videoIds) => {
  const now = Date.now();
  const missing = [];
  const docs = [];

  for (const id of videoIds) {
    const cached = CHUNK_CACHE.get(id);
    if (cached && cached.expiresAt > now) {
      docs.push(cached.doc);
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    const fetched = await Video.find({ videoId: { $in: missing } })
      .select(Object.keys(PROJECTION).join(" "))
      .lean();
    if (CHUNK_CACHE.size > CACHE_MAX_ENTRIES) CHUNK_CACHE.clear();
    for (const doc of fetched) {
      CHUNK_CACHE.set(doc.videoId, { expiresAt: now + CACHE_TTL_MS, doc });
      docs.push(doc);
    }
  }

  return docs;
};

const loadCandidateVideos = async (question) => {
  try {
    // Phase 1: light $text query (ids + score only) — sorting fat documents
    // carrying chunks[] arrays blows the 32MB memory limit and disk-sort is 50x
    // slower, so fetch ids first, then load full docs for just those videos.
    // find() can't push the projection ahead of the textScore sort, so full fat
    // documents flow through the sort buffer and blow the 32MB limit (Atlas
    // ignores allowDiskUse for find+textScore). An aggregation with early
    // $project sorts tiny docs instead.
    const matchedIds = await Video.aggregate([
      { $match: { status: "done", $text: { $search: question } } },
      { $project: { _id: 0, videoId: 1, score: { $meta: "textScore" } } },
      { $sort: { score: -1 } },
      { $limit: 50 },
    ]).allowDiskUse(true);

    if (matchedIds.length > 0) {
      const order = new Map(matchedIds.map((m, i) => [m.videoId, i]));
      const docs = await getVideoDocs([...order.keys()]);
      docs.sort((a, b) => order.get(a.videoId) - order.get(b.videoId));
      return docs;
    }
  } catch (error) {
    console.warn(`Mongo text search failed: ${error.message}`);
  }

  // Fallback: first 100 done videos. No server-side sort — an unindexed sort
  // buffers full (fat) documents before projection and blows the 32MB limit.
  const recent = await Video.find({ status: "done" })
    .select("videoId")
    .limit(100)
    .lean();
  return getVideoDocs(recent.map((v) => v.videoId));
};

const askFromIndexedTranscripts = async (req, res) => {
  const requestStart = Date.now();
  try {
    const { question, language = "auto", tone = "premand" } = req.body;

    if (typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    // Translate romanized/English questions to Devanagari for retrieval
    const searchQuery = await toHindiSearchQuery(question);
    const translationMs = Date.now() - requestStart;

    // Search provider control — defaults to "mongodb" unless explicitly set to "neon" or "hybrid"
    const searchProvider = (process.env.TRANSCRIPT_SEARCH_PROVIDER || "mongodb").toLowerCase();
    const retrievalStart = Date.now();
    let matches = [];
    let activeRetrievalMode = searchProvider === "neon" ? "neon" : "mongodb";
    let candidateCount = 0;

    if (searchProvider === "neon" || searchProvider === "hybrid") {
      try {
        matches = await neonService.searchNeonChunks(searchQuery, 5);
        if (matches && matches.length > 0) {
          activeRetrievalMode = "neon";
          candidateCount = matches.length;
        }
      } catch (err) {
        if (searchProvider === "neon") {
          return res.status(503).json({
            success: false,
            error: "Transcript search is temporarily unavailable. Please retry.",
            timing: { translationMs, retrievalMs: Date.now() - retrievalStart, aiMs: 0, totalMs: Date.now() - requestStart },
          });
        }
        console.warn("⚠️ Neon search error, falling back to MongoDB:", err.message);
      }
    }

    // Mongo is an explicit legacy/hybrid option. Neon-only misses stay fast.
    if (searchProvider !== "neon" && (!matches || matches.length === 0)) {
      const videos = await loadCandidateVideos(searchQuery);
      candidateCount = videos ? videos.length : 0;
      if (videos && videos.length > 0) {
        matches = await searchRelevantChunks(videos, searchQuery, 3);
        const chunksByVideo = new Map();
        for (const v of videos) {
          if (v.chunks && v.chunks.length > 0) chunksByVideo.set(v.videoId, v.chunks);
        }
        for (const match of matches) {
          if (!match.continuation) {
            const chunks = chunksByVideo.get(match.videoId);
            if (chunks) {
              const idx = chunks.findIndex((c) => c.index === match.chunkIndex);
              const next = chunks[idx + 1] || chunks.find((c) => c.index === match.chunkIndex + 1);
              if (next && next.text && next.text.length > 30) {
                match.continuation = next.text;
                match.continuationEndTime = Math.ceil(next.endTime || match.endTime);
              }
            }
          }
        }
      }
      activeRetrievalMode = "mongodb";
    }

    const totalVideos = 1048;

    const retrievalMs = Date.now() - retrievalStart;

    // ── No transcripts at all ───────────────────────────────────────────────
    if (!matches || matches.length === 0) {
      return res.json({
        success: true,
        retrievalMode: activeRetrievalMode,
        totalVideos,
        candidateVideos: candidateCount,
        providers: [],
        answer: noAnswerText(language),
        sources: [],
        sourceCount: 0,
        timing: { translationMs, retrievalMs, aiMs: 0, totalMs: Date.now() - requestStart },
      });
    }

    // ── Build source-grounded prompt ─────────────────────────────────────────
    // Retrieval supplies candidates; the response includes only passages the answer cites.
    const prompt = `You are a source-grounded spiritual Q&A assistant presenting teachings from Premaanand Ji Maharaj's video transcripts.

Answer ONLY from the provided retrieved transcript context.
The retrieved transcript is the only source of truth.

RULES:
- Ground every claim in the retrieved sources below. Do NOT invent quotations or specific teachings, practices, or stories that are not in the sources.
- Use only passages that actually support the answer. One strong passage is enough; do not cite every retrieved candidate.
- A passage containing only a devotee's question does not establish महाराज जी's answer. Use the continuation only if it contains the relevant teaching.
- If the passages do not support a specific answer, say that the available transcripts do not establish it. Do not fill gaps with plausible spiritual advice.
- What is forbidden: fabricating quotes, fake timestamps, or claiming "महाराज जी ने [Source N] में कहा" for content not actually present in that source.
- NEVER speak AS Maharaj Ji — you are a third-person assistant. Attribute points to the sources, e.g. "महाराज जी ने इस प्रवचन में बताया है कि...", "उनके वीडियो के अनुसार..."
- Do NOT address the user at all — no salutation, no preamble ("प्रिय मित्र", "आपकी स्थिति को समझते हुए", "मैं आपको साझा करना चाहता हूँ"), no "बेटा"/"बहना". The very first word of your answer must be part of the answer itself.
- If sources are partial, state only what they actually show. If none answers the question, give one honest line without citations.
- Only use quotation marks for actual transcript text shown below
- Cite each factual claim beside the passage that supports it, using [Source 1], [Source 2], ... exactly as numbered below. Never cite a passage merely because it was retrieved. Do not invent a citation like "(वीडियो #...)".
- If the retrieved sources are completely unrelated to the question, honestly say so in one line and stop

RESPONSE FORMAT (exactly two parts):
1. SHORT ANSWER: the essence in 1-3 simple, direct sentences with inline [Source N] citations, no salutation, no preamble.
2. Then a line containing exactly:
<<<more>>>
3. DETAILED ANSWER: the fuller explanation, fully grounded in the same retrieved sources. Explain what महाराज जी taught on this, with inline [Source N] citations. No salutation or closing remarks.
If the sources are completely unrelated, SKIP the format and just say so honestly in one line.

${getLanguageInstruction(language)}
${getToneInstruction(tone)}

USER QUESTION: ${question}

RETRIEVED SOURCES:
${formatSources(matches)}

ANSWER:`;

    const aiStart = Date.now();
    const { response, provider } = await callAIWithFallback(prompt);
    const aiMs = Date.now() - aiStart;
    const cited = selectCitedSources(response.trim(), matches);
    const answer = cited.sources.length ? cited.answer : noSupportedAnswerText(language, question);

    // Build YouTube timestamp URLs from backend (not AI)
    const buildYouTubeUrl = (match) => {
      if (match.sourceType === "youtube" && match.videoId) {
        return `https://www.youtube.com/watch?v=${match.videoId}&t=${Math.floor(match.startTime)}s`;
      }
      return match.url || match.mediaUrl || "";
    };

    res.json({
      success: true,
      retrievalMode: activeRetrievalMode,
      totalVideos,
      candidateVideos: candidateCount,
      providers: [provider],
      answer,
      sources: cited.sources.map((match) => ({
        videoId: match.videoId,
        title: match.title,
        url: buildYouTubeUrl(match),
        mediaUrl: match.mediaUrl,
        sourceType: match.sourceType,
        startTime: match.startTime,
        endTime: Math.max(match.endTime, match.continuationEndTime || 0),
        quote: String(match.quote || "").trim(),
        continuation: match.continuation ? String(match.continuation).trim() : null,
        score: Number(match.score.toFixed(2)),
      })),
      sourceCount: cited.sources.length,
      timing: {
        retrievalMs,
        aiMs,
        translationMs,
        totalMs: Date.now() - requestStart,
      },
    });
  } catch (error) {
    console.error("Error in askFromIndexedTranscripts:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message || "Something went wrong.",
    });
  }
};

module.exports = askFromIndexedTranscripts;
// exported for tests
module.exports.toHindiSearchQuery = toHindiSearchQuery;
module.exports.loadCandidateVideos = loadCandidateVideos;
