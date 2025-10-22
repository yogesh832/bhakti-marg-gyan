const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Video = require("../models/videoModel");

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "AIzaSyCHPK49xwufC1PeINKrmTK_CRLf9U9SitM";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 🧩 Helper: get available Gemini model
const getAvailableModel = async () => {
  try {
    const res = await axios.get(
      "https://generativelanguage.googleapis.com/v1/models?key=" + GEMINI_API_KEY
    );
    const models = res.data.models.map((m) => m.name);
    const preferred =
      models.find((m) => m.includes("flash")) ||
      models.find((m) => m.includes("pro")) ||
      models[0];
    return preferred;
  } catch {
    return "models/gemini-1.5-flash";
  }
};

// 🧠 Safe Gemini call with retry, fallback & timeout
const safeAskGemini = async (prompt, retries = 3, timeout = 20000) => {
  const modelNames = [
    "models/gemini-2.5-flash",
    "models/gemini-1.5-flash",
    "models/gemini-1.5-pro",
  ];

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      for (let i = 0; i < retries; i++) {
        try {
          console.log(`[${new Date().toLocaleTimeString()}] 🔹 Using ${modelName}`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const result = await model.generateContent(prompt, {
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          return { text: result.response.text(), model: modelName };
        } catch (err) {
          if (err.name === "AbortError") {
            console.warn(`⏳ ${modelName} timed out after ${timeout / 1000}s.`);
          } else if (err.status === 503 && i < retries - 1) {
            console.warn(
              `⚠️ ${modelName} overloaded. Retrying in ${2 * (i + 1)}s...`
            );
            await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      console.warn(`❌ ${modelName} failed: ${err.message}`);
      if (modelName === modelNames[modelNames.length - 1]) throw err;
    }
  }
};

// 🧩 Split long text into manageable chunks
const chunkText = (text, size = 10000) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
};

// 🧠 Summarize large transcripts in chunks
const summarizeLargeTranscripts = async (combinedTranscripts) => {
  const chunks = chunkText(combinedTranscripts);
  const summaries = [];

  console.log(`🪶 Summarizing ${chunks.length} chunks...`);

  for (let i = 0; i < chunks.length; i++) {
    const summaryPrompt = `
Summarize the following part of a devotional transcript in 5–7 bullet points.
Focus on key teachings and main ideas only.

Part ${i + 1}:
${chunks[i]}
`;

    const { text: summary } = await safeAskGemini(summaryPrompt);
    summaries.push(`🕉️ Summary ${i + 1}:\n${summary}`);
  }

  return summaries.join("\n\n");
};

// 🎯 Ask Gemini using all transcripts
const askFromAllTranscripts = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // 🧾 Fetch all completed transcripts
    const videos = await Video.find({ status: "done" }).select(
      "transcript url videoId"
    );

    if (!videos || videos.length === 0) {
      return res.status(404).json({ error: "No transcripts found." });
    }

    // 🔍 Merge all transcripts into one big context
    const combinedTranscripts = videos
      .filter((v) => v.transcript && v.transcript.trim().length > 0)
      .map(
        (v, i) =>
          `Video ${i + 1} [${v.videoId || "no-id"}]:\n${v.transcript.slice(
            0,
            3000
          )}`
      )
      .join("\n\n---\n\n");

    // ✨ Summarize if too long
    let context;
    console.log(combinedTranscripts.length)
    if (combinedTranscripts.length > 12000) {
      console.log("🪶 Transcripts too long — summarizing before asking...");
      context = await summarizeLargeTranscripts(combinedTranscripts);
    } else {
      context = combinedTranscripts;
    }

    // 🧘‍♂️ Build the main prompt
    const prompt = `
You are a spiritual assistant that answers questions from devotional YouTube video transcripts.
Analyze all transcripts (or summaries) below and find the most relevant part to answer clearly and beautifully.

Guidelines:
- Use only information found in the content below.
- Respond in the same language as the transcripts (Hindi if Hindi, English if English).
- Format answer with **bold headings**, bullet points, and clear separation.
- If the question is not answered anywhere, reply:
  "इस प्रश्न का स्पष्ट उल्लेख किसी भी प्रवचन में नहीं किया गया है।"

Below are the available transcripts (summarized if very long):

${context}

Now answer this question:
Q: ${question}
`;

    // 🧠 Ask Gemini safely
    const { text: answer, model } = await safeAskGemini(prompt);

    res.json({
      success: true,
      totalVideos: videos.length,
      model,
      answer,
    });
  } catch (err) {
    console.error("❌ Error in askFromAllTranscripts:", err);
    if (err.status === 503) {
      return res.status(503).json({
        error:
          "Gemini servers are currently overloaded. Please try again in a few moments.",
      });
    }
    res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
};

module.exports = askFromAllTranscripts;
