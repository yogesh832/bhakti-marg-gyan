const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const OpenAI = require("openai");
const Video = require("../models/videoModel");

// ✅ Check for required API keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ✅ Only initialize clients if keys exist
let genAI, groq, openai;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  console.log("✅ Gemini client initialized");
} else {
  console.warn("⚠️ GEMINI_API_KEY not found");
}

if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
  console.log("✅ Groq client initialized");
} else {
  console.warn("⚠️ GROQ_API_KEY not found");
}

if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log("✅ OpenAI client initialized");
} else {
  console.warn("⚠️ OPENAI_API_KEY not found");
}

// 🎯 AI Provider configurations
const AI_PROVIDERS = [
  {
    name: "Gemini",
    enabled: !!genAI,
    handler: async (prompt) => {
      if (!genAI) throw new Error("Gemini not configured");
      const modelName = await getGeminiModel();
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
  },
  {
    name: "Groq",
    enabled: !!groq,
    handler: async (prompt) => {
      if (!groq) throw new Error("Groq not configured");
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 2048,
      });
      return completion.choices[0]?.message?.content || "";
    },
  },
  {
    name: "OpenAI",
    enabled: !!openai,
    handler: async (prompt) => {
      if (!openai) throw new Error("OpenAI not configured");
      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 2048,
      });
      return completion.choices[0]?.message?.content || "";
    },
  },
].filter((provider) => provider.enabled); // ✅ Only include enabled providers

// 🧩 Get best available Gemini model
const getGeminiModel = async () => {
  if (!GEMINI_API_KEY) return "models/gemini-1.5-flash";

  try {
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`
    );
    const models = res.data.models.map((m) => m.name);

    return (
      models.find((m) => m.includes("1.5-flash")) ||
      models.find((m) => m.includes("flash")) ||
      models.find((m) => m.includes("pro")) ||
      "models/gemini-1.5-flash"
    );
  } catch {
    return "models/gemini-1.5-flash";
  }
};

// 🔄 Smart AI caller with automatic provider fallback
const callAIWithFallback = async (prompt, maxRetries = 2) => {
  if (AI_PROVIDERS.length === 0) {
    throw new Error(
      "No AI providers configured. Please set API keys in environment variables."
    );
  }

  let lastError;

  for (const provider of AI_PROVIDERS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🤖 Trying ${provider.name} (attempt ${attempt}/${maxRetries})...`
        );
        const response = await provider.handler(prompt);
        console.log(`✅ Success with ${provider.name}`);
        return { response, provider: provider.name };
      } catch (error) {
        lastError = error;
        const isRetryable = error.status === 503 || error.status === 429;

        console.warn(
          `⚠️ ${provider.name} failed (attempt ${attempt}/${maxRetries}):`,
          error.message
        );

        if (attempt < maxRetries && isRetryable) {
          const delay = 2000 * Math.pow(2, attempt - 1);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }
  }

  throw new Error(
    `All AI providers failed. Last error: ${
      lastError?.message || "Unknown error"
    }`
  );
};

// Rest of your code remains the same...
const splitIntoChunks = (text, size = 10000) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
};

const askFromAllTranscripts = async (req, res) => {
  try {
    const { question, language = "auto", tone = "premand" } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const videos = await Video.find({ status: "done" }).select(
      "transcript url videoId"
    );

    if (!videos || videos.length === 0) {
      return res.status(404).json({ error: "No transcripts found." });
    }

    console.log(`📚 Found ${videos.length} videos with transcripts`);

    const combinedTranscripts = videos
      .map(
        (v, i) =>
          `Video ${i + 1} [${v.videoId || "no-id"}]:\n${v.transcript?.slice(
            0,
            2500
          )}`
      )
      .join("\n\n---\n\n");

    const chunks = splitIntoChunks(combinedTranscripts, 10000);
    console.log(`📦 Split into ${chunks.length} chunks`);

    let partialAnswers = [];
    let usedProviders = new Set();

    for (let i = 0; i < chunks.length; i++) {
      const prompt = `
You are a multilingual spiritual assistant trained on devotional YouTube transcripts.
You are the humble digital assistant of *Premanand Ji Maharaj*, a great saint of this era.
You are **not** Premanand Ji — you are his respectful digital assistant who explains his teachings without personal attachment.

🕉️ User Preferences:
- Preferred response language: ${language}
- Response tone: ${tone}

Guidelines:
1. Detect the user's question language automatically.
2. If the user explicitly requests another language (e.g., "Tamil me batao"), reply in that requested language.
3. If not specified, reply in the preferred language (${language}) or auto-detect if set to "auto".
4. Keep the tone:
   - "premand": devotional, peaceful, based on his teachings — **without personal addressing**.
   - "brief": short and clear.
   - "detailed": explanatory but simple.
5. Use **simple and easy-to-understand words** in every language — avoid overly Sanskritized or complex phrases.
6. Focus on clarity and feeling, not heavy grammar.
7. Never use personal phrases like "my dear child", "beloved one", etc.
8. Use only transcript information.
9. If no answer found, say exactly:
   "इस प्रश्न का स्पष्ट उल्लेख किसी भी प्रवचन में नहीं किया गया है।"
10. Keep answers short (3–6 lines), loving, and simple for everyone to understand.

Transcript Data (Part ${i + 1}/${chunks.length}):
${chunks[i]}

Question:
${question}
`;

      try {
        console.log(`\n🧠 Processing chunk ${i + 1}/${chunks.length}...`);
        const { response, provider } = await callAIWithFallback(prompt);

        if (response?.trim()) {
          partialAnswers.push(response.trim());
          usedProviders.add(provider);
        }
      } catch (chunkError) {
        console.error(
          `❌ Failed to process chunk ${i + 1}:`,
          chunkError.message
        );
      }
    }

    if (partialAnswers.length === 0) {
      return res.status(503).json({
        error: "Service temporarily unavailable",
        message:
          "All AI providers are currently unavailable. Please try again in a few moments.",
      });
    }

    console.log(
      `✅ Successfully processed ${partialAnswers.length}/${chunks.length} chunks`
    );

    const allNotFound = partialAnswers.every((ans) =>
      ans.includes("इस प्रश्न का स्पष्ट उल्लेख")
    );

    if (allNotFound) {
      return res.json({
        success: true,
        totalVideos: videos.length,
        totalChunks: chunks.length,
        processedChunks: partialAnswers.length,
        providers: Array.from(usedProviders),
        answer:
          "इस प्रश्न का स्पष्ट उल्लेख किसी भी प्रवचन में नहीं किया गया है।",
      });
    }

    const uniqueAnswers = [...new Set(partialAnswers)];
    const mergePrompt = `
You are a multilingual assistant. Below are partial answers from different transcript chunks.

Combine them into one clean, non-repetitive, and spiritually beautiful final answer.
- Maintain the same tone (${tone})
- Respond in the preferred or requested language (${language})
- Avoid unnecessary repetition or "not found" statements.
- Keep the final answer concise (5-8 lines maximum).

Partial Answers:
${uniqueAnswers.join("\n\n")}

Now produce the unified final answer:
`;

    console.log(`\n🔀 Merging ${uniqueAnswers.length} unique answers...`);
    const { response: finalAnswer, provider: mergeProvider } =
      await callAIWithFallback(mergePrompt);
    usedProviders.add(mergeProvider);

    res.json({
      success: true,
      totalVideos: videos.length,
      totalChunks: chunks.length,
      processedChunks: partialAnswers.length,
      providers: Array.from(usedProviders),
      answer:
        finalAnswer?.trim() ||
        "इस प्रश्न का स्पष्ट उल्लेख किसी भी प्रवचन में नहीं किया गया है।",
    });
  } catch (err) {
    console.error("❌ Error in askFromAllTranscripts:", err);

    res.status(500).json({
      error: "Internal server error",
      message: err.message || "Something went wrong. Please try again.",
    });
  }
};

module.exports = askFromAllTranscripts;
