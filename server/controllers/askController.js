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
].filter((provider) => provider.enabled);

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
      "transcript url videoId title"
    );

    if (!videos || videos.length === 0) {
      return res.status(404).json({ error: "No transcripts found." });
    }

    console.log(`📚 Found ${videos.length} videos with transcripts`);

    // Create chunks with video metadata for source tracking
    const videoChunks = [];
    videos.forEach((video) => {
      const transcript = video.transcript || "";
      const chunks = splitIntoChunks(transcript, 8000);

      chunks.forEach((chunk, idx) => {
        videoChunks.push({
          content: chunk,
          videoId: video.videoId,
          videoUrl: video.url,
          videoTitle: video.title || `Video ${video.videoId}`,
          chunkIndex: idx,
        });
      });
    });

    console.log(
      `📦 Created ${videoChunks.length} chunks from ${videos.length} videos`
    );

    let partialAnswers = [];
    let usedProviders = new Set();
    let sourcesFound = [];

    // Process chunks in batches to find relevant sources
    for (let i = 0; i < videoChunks.length; i++) {
      const chunk = videoChunks[i];

      const prompt = `
You are the digital assistant of **Premanand Ji Maharaj** (प्रेमानंद जी महाराज), a revered spiritual saint.

🕉️ **CRITICAL INSTRUCTIONS - FOLLOW STRICTLY:**

1. **LANGUAGE PRIORITY (सबसे पहले):**
   - **FIRST**: Always respond in the style and voice of Premanand Ji Maharaj
   - Detect user's question language automatically
   - If language="${language}" is specified, respond in that language
   - Use **simple, easy words** that common people understand (आम बोलचाल की भाषा)
   - Avoid heavy Sanskrit/complex words unless necessary
   - Make it feel warm, devotional, and accessible

2. **TONE (स्वर):**
   - ${
     tone === "premand"
       ? "Devotional, peaceful, exactly like Premanand Ji's teaching style"
       : tone === "brief"
       ? "Brief and clear"
       : "Detailed but simple"
   }
   - Never use "my dear child" or personal addressing
   - Be humble, respectful, and simple
   - Focus on clarity and feeling

3. **SOURCE ATTRIBUTION (स्रोत):**
   - If you find relevant answer in the transcript, you MUST include:
     * Video ID: ${chunk.videoId}
     * A brief quote or reference from the transcript
   - Format your response as JSON:
     {
       "answer": "your answer here in ${language}",
       "found": true/false,
       "videoId": "${chunk.videoId}",
       "videoTitle": "${chunk.videoTitle}",
       "relevantQuote": "exact words from Maharaj Ji if found"
     }

4. **IF NOT FOUND:**
   - If no relevant answer in this chunk, return:
     {
       "answer": "",
       "found": false,
       "videoId": "${chunk.videoId}"
     }

5. **ANSWER QUALITY:**
   - Keep answers short (3-6 lines)
   - Use exact words from Premanand Ji when possible
   - Make it feel like Maharaj Ji is speaking through you
   - Be authentic to his teaching style

📺 **Video Source:**
Video ID: ${chunk.videoId}
Title: ${chunk.videoTitle}
URL: ${chunk.videoUrl}

📜 **Transcript Content (Pravachan):**
${chunk.content}

❓ **User's Question:**
${question}

**RESPOND IN JSON FORMAT ONLY:**
`;

      try {
        console.log(
          `\n🧠 Processing chunk ${i + 1}/${videoChunks.length} from video ${
            chunk.videoId
          }...`
        );
        const { response, provider } = await callAIWithFallback(prompt);

        // Parse JSON response
        try {
          let jsonResponse;
          const jsonMatch = response.match(/\{[\s\S]*\}/);

          if (jsonMatch) {
            jsonResponse = JSON.parse(jsonMatch[0]);
          } else {
            // Fallback if not JSON
            jsonResponse = {
              answer: response.trim(),
              found:
                !response.includes("नहीं मिला") &&
                !response.includes("not found"),
              videoId: chunk.videoId,
              videoTitle: chunk.videoTitle,
            };
          }

          if (jsonResponse.found && jsonResponse.answer?.trim()) {
            partialAnswers.push(jsonResponse.answer.trim());
            sourcesFound.push({
              videoId: jsonResponse.videoId,
              videoTitle: jsonResponse.videoTitle,
              videoUrl: chunk.videoUrl,
              quote: jsonResponse.relevantQuote,
            });
            usedProviders.add(provider);
          }
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse JSON response from chunk ${i + 1}`);
        }
      } catch (chunkError) {
        console.error(
          `❌ Failed to process chunk ${i + 1}:`,
          chunkError.message
        );
      }

      // Stop if we have enough good answers (optimization)
      if (partialAnswers.length >= 3) {
        console.log(
          `✅ Found sufficient answers (${partialAnswers.length}), stopping search...`
        );
        break;
      }
    }

    if (partialAnswers.length === 0) {
      return res.json({
        success: true,
        totalVideos: videos.length,
        searchedChunks: videoChunks.length,
        providers: Array.from(usedProviders),
        answer:
          language === "hindi"
            ? "इस प्रश्न का स्पष्ट उल्लेख प्रेमानंद जी महाराज के किसी भी प्रवचन में नहीं मिला। कृपया प्रश्न को दूसरे तरीके से पूछें।"
            : "This question is not explicitly mentioned in any of Premanand Ji Maharaj's pravachans. Please try rephrasing your question.",
        sources: [],
      });
    }

    console.log(
      `✅ Found ${partialAnswers.length} relevant answers from ${sourcesFound.length} sources`
    );

    // Merge answers if multiple found
    let finalAnswer;
    if (partialAnswers.length === 1) {
      finalAnswer = partialAnswers[0];
    } else {
      const uniqueAnswers = [...new Set(partialAnswers)];
      const mergePrompt = `
You are the digital voice of **Premanand Ji Maharaj**.

Below are multiple answers from different pravachans (प्रवचन) about the same question.

**YOUR TASK:**
1. Combine them into ONE beautiful, unified answer
2. Maintain Premanand Ji's devotional style and voice
3. Keep it in ${language} language
4. Use simple, warm words (सरल और प्यारे शब्द)
5. Make it SHORT (5-7 lines maximum)
6. Remove any repetition
7. Make it feel like Maharaj Ji is speaking directly
8. **IMPORTANT**: At the end, add a small note in the same language indicating this is from Premanand Ji Maharaj's YouTube pravachans

**Tone:** ${
        tone === "premand" ? "Devotional and peaceful like Premanand Ji" : tone
      }

**Language-specific source format:**
- Hindi: "स्रोत: प्रेमानंद जी महाराज के यूट्यूब प्रवचन से लिया गया है।"
- English: "Source: Taken from Premanand Ji Maharaj's YouTube pravachans."
- Tamil: "மூலம்: பிரேமானந்த் ஜி மகாராஜின் யூடியூப் உரைகளிலிருந்து எடுக்கப்பட்டது."
- Malayalam: "ഉറവിടം: പ്രേമാനന്ദ് ജി മഹാരാജിന്റെ യൂട്യൂബ് പ്രഭാഷണങ്ങളിൽ നിന്ന്."
- Bengali: "সূত্র: প্রেমানন্দ জি মহারাজের ইউটিউব প্রবচন থেকে নেওয়া হয়েছে।"
- Gujarati: "સ્રોત: પ્રેમાનંદ જી મહારાજના યુટ્યુબ પ્રવચનમાંથી લેવામાં આવ્યું છે."
- Kannada: "ಮೂಲ: ಪ್ರೇಮಾನಂದ್ ಜಿ ಮಹಾರಾಜರ ಯೂಟ್ಯೂಬ್ ಪ್ರವಚನಗಳಿಂದ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ."

Choose the appropriate source line based on the ${language} language.

**Partial Answers:**
${uniqueAnswers.map((ans, i) => `${i + 1}. ${ans}`).join("\n\n")}

**Provide the FINAL UNIFIED ANSWER in ${language} with source note at the end:**
`;

      console.log(`\n🔀 Merging ${uniqueAnswers.length} answers...`);
      const { response: merged, provider: mergeProvider } =
        await callAIWithFallback(mergePrompt);
      usedProviders.add(mergeProvider);
      finalAnswer = merged?.trim() || partialAnswers[0];
    }

    // Remove duplicate sources
    const uniqueSources = sourcesFound.reduce((acc, source) => {
      if (!acc.find((s) => s.videoId === source.videoId)) {
        acc.push(source);
      }
      return acc;
    }, []);

    res.json({
      success: true,
      totalVideos: videos.length,
      searchedChunks: videoChunks.length,
      providers: Array.from(usedProviders),
      answer: finalAnswer,
      sources: uniqueSources.map((s) => ({
        videoId: s.videoId,
        title: s.videoTitle,
        url: s.videoUrl,
        quote: s.quote,
      })),
      sourceCount: uniqueSources.length,
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
