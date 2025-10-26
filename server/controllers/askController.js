const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Video = require("../models/videoModel");

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "AIzaSyCHPK49xwufC1PeINKrmTK_CRLf9U9SitM";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 🧩 Helper: choose best available Gemini model
const getAvailableModel = async () => {
  try {
    const res = await axios.get(
      "https://generativelanguage.googleapis.com/v1/models?key=" +
        GEMINI_API_KEY
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

// 🪄 Split transcript into chunks for safe processing
const splitIntoChunks = (text, size = 12000) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
};

// 🎯 Main: Ask Gemini using all transcripts + preferences
const askFromAllTranscripts = async (req, res) => {
  try {
    const { question, language = "auto", tone = "premand" } = req.body;

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

    // 🔍 Merge all transcripts
    const combinedTranscripts = videos
      .map(
        (v, i) =>
          `Video ${i + 1} [${v.videoId || "no-id"}]:\n${v.transcript?.slice(
            0,
            3000
          )}`
      )
      .join("\n\n---\n\n");

    const chunks = splitIntoChunks(combinedTranscripts, 12000);
    const modelName = await getAvailableModel();
    const model = genAI.getGenerativeModel({ model: modelName });

    let partialAnswers = [];

    // 🔁 Process each chunk
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
   - Example: instead of "प्रस्फुटित", use "उभरता है"  
     instead of "अनुभूति", use "अनुभव"  
     instead of "श्रवण", use "सुनना"  
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

      console.log(`🧠 Processing chunk ${i + 1}/${chunks.length}...`);
      const result = await model.generateContent(prompt);
      const text = result.response.text()?.trim();
      if (text) partialAnswers.push(text);
    }

    // 🧩 Handle “not found” cases
    const allNotFound = partialAnswers.every((ans) =>
      ans.includes("इस प्रश्न का स्पष्ट उल्लेख")
    );
    if (allNotFound) {
      return res.json({
        success: true,
        totalVideos: videos.length,
        totalChunks: chunks.length,
        model: modelName,
        answer:
          "इस प्रश्न का स्पष्ट उल्लेख किसी भी प्रवचन में नहीं किया गया है।",
      });
    }

    // ✨ Merge partial answers into one final message
    const uniqueAnswers = [...new Set(partialAnswers)];
    const mergePrompt = `
You are a multilingual assistant. Below are partial answers from different transcript chunks.

Combine them into one clean, non-repetitive, and spiritually beautiful final answer.
- Maintain the same tone (${tone})
- Respond in the preferred or requested language (${language})
- Avoid unnecessary repetition or "not found" statements.

Partial Answers:
${uniqueAnswers.join("\n\n")}

Now produce the unified final answer:
`;

    const finalResult = await model.generateContent(mergePrompt);
    const finalAnswer = finalResult.response.text()?.trim();

    res.json({
      success: true,
      totalVideos: videos.length,
      totalChunks: chunks.length,
      model: modelName,
      answer:
        finalAnswer ||
        "इस प्रश्न का स्पष्ट उल्लेख किसी भी प्रवचन में नहीं किया गया है।",
    });
  } catch (err) {
    console.error("❌ Error in askFromAllTranscripts:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
};

module.exports = askFromAllTranscripts;
