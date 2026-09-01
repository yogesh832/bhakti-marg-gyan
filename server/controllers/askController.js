const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const OpenAI = require("openai");
const Video = require("../models/videoModel");
const { searchRelevantChunks, cleanText } = require("../services/retrievalService");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let genAI;
let groq;
let openai;

if (GEMINI_API_KEY) genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
if (GROQ_API_KEY) groq = new Groq({ apiKey: GROQ_API_KEY });
if (OPENAI_API_KEY) openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const getGeminiModel = async () => {
  if (!GEMINI_API_KEY) return "models/gemini-1.5-flash";
  try {
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`
    );
    const models = res.data.models.map((model) => model.name);
    return (
      models.find((model) => model.includes("1.5-flash")) ||
      models.find((model) => model.includes("flash")) ||
      "models/gemini-1.5-flash"
    );
  } catch {
    return "models/gemini-1.5-flash";
  }
};

const AI_PROVIDERS = [
  {
    name: "Gemini",
    enabled: !!genAI,
    handler: async (prompt) => {
      const model = genAI.getGenerativeModel({ model: await getGeminiModel() });
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
  },
  {
    name: "Groq",
    enabled: !!groq,
    handler: async (prompt) => {
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3, // Lower temp for more focused answers
        max_tokens: 1200,
      });
      return completion.choices[0]?.message?.content || "";
    },
  },
  {
    name: "OpenAI",
    enabled: !!openai,
    handler: async (prompt) => {
      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 1200,
      });
      return completion.choices[0]?.message?.content || "";
    },
  },
].filter((provider) => provider.enabled);

const callAIWithFallback = async (prompt) => {
  if (AI_PROVIDERS.length === 0) {
    throw new Error("No AI providers configured.");
  }

  let lastError;
  for (const provider of AI_PROVIDERS) {
    try {
      const response = await provider.handler(prompt);
      return { response, provider: provider.name };
    } catch (error) {
      lastError = error;
      console.warn(`${provider.name} failed: ${error.message}`);
    }
  }
  throw new Error(`All AI providers failed: ${lastError?.message || "Unknown error"}`);
};

const getLanguageInstruction = (language) => {
  const instructions = {
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
    premand: "शैली: Premanand Ji Maharaj जी की शिक्षाओं के अनुसार, शांत, प्रेमपूर्ण और सरल।",
    brief: "शैली: संक्षिप्त और सीधा।",
    detailed: "शैली: विस्तृत और स्पष्ट।",
  };
  return tones[tone] || tones.premand;
};

// Clean quote for display
const cleanQuote = (quote) => {
  if (!quote) return "";
  // Remove repeated words like "राधा राधा राधा"
  let cleaned = quote.replace(/(.{2,})\s*(?:\1\s*){2,}/g, '$1');
  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
};

const formatEvidence = (matches) =>
  matches
    .map((match, index) => {
      const cleanedQuote = cleanQuote(match.quote);
      return `[${index + 1}] ${match.title}
समय: ${Math.floor(match.startTime / 60)}:${String(Math.floor(match.startTime % 60)).padStart(2, '0')} - ${Math.floor(match.endTime / 60)}:${String(Math.floor(match.endTime % 60)).padStart(2, '0')}
"${cleanedQuote}"`
    })
    .join("\n\n");

const noAnswerText = (language) => {
  const messages = {
    hindi: "इस प्रश्न से संबंधित उपदेश अभी डेटाबेस में उपलब्ध नहीं है। कृपया अपना प्रश्न थोड़ा अलग तरीके से पूछें।",
    default: "माफ़ कीजिए, इस प्रश्न का उत्तर मिलने में कठिनाई हो रही है। कृपया प्रश्न को सरल शब्दों में पूछें।"
  };
  return messages[language] || messages.default;
};

const loadCandidateVideos = async (question) => {
  const projection = {
    videoId: 1,
    url: 1,
    mediaUrl: 1,
    sourceType: 1,
    title: 1,
    transcript: 1,
    chunks: 1,
  };

  try {
    // Try text search first
    const textMatches = await Video.find(
      { status: "done", $text: { $search: question } },
      { score: { $meta: "textScore" }, ...projection }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(50);

    if (textMatches.length > 0) return textMatches;
  } catch (error) {
    console.warn(`Mongo text search failed: ${error.message}`);
  }

  // Fallback to all done videos
  return Video.find({ status: "done" })
    .select(Object.values(projection).join(' '))
    .limit(100);
};

const askFromIndexedTranscripts = async (req, res) => {
  try {
    const { question, language = "auto", tone = "premand" } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    const [videos, totalVideos] = await Promise.all([
      loadCandidateVideos(question),
      Video.countDocuments({ status: "done" }),
    ]);

    if (!videos || videos.length === 0) {
      return res.status(404).json({ error: "No transcripts found." });
    }

    // Search for relevant chunks with improved retrieval
    const matches = searchRelevantChunks(videos, question, 7);

    if (matches.length === 0) {
      return res.json({
        success: true,
        retrievalMode: "local-index",
        totalVideos,
        providers: [],
        answer: noAnswerText(language),
        sources: [],
        sourceCount: 0,
      });
    }

    // Build improved prompt
    const prompt = `तुम एक आध्यात्मिक गुरु हो - Premanand Ji Maharaj जी की शिक्षाओं पर आधारित।

नीचे दिए गए प्रवचन के अंशों को पढ़ो और सवाल का जवाब दो।

${getLanguageInstruction(language)}
${getToneInstruction(tone)}

नियम:
- केवल दिए गए अंशों से जवाब दो
- जवाब सरल, सीधा और उपयोगी होना चाहिए
- किसी भी जानकारी का झूठ न बोलो
- अगर अंश पूरी तरह जवाब नहीं देता, तो बताओ कि कौन सा हिस्सा मिलता है

सवाल: ${question}

प्रवचन अंश:
${formatEvidence(matches)}

जवाब (सीधे और संक्षिप्त):`;

    const { response, provider } = await callAIWithFallback(prompt);

    res.json({
      success: true,
      retrievalMode: "local-index",
      totalVideos,
      candidateVideos: videos.length,
      providers: [provider],
      answer: response.trim(),
      sources: matches.map((match) => ({
        videoId: match.videoId,
        title: match.title,
        url: match.url,
        mediaUrl: match.mediaUrl,
        sourceType: match.sourceType,
        startTime: match.startTime,
        endTime: match.endTime,
        quote: cleanQuote(match.quote),
        score: Number(match.score.toFixed(2)),
      })),
      sourceCount: matches.length,
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
