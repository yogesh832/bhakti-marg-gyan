const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Video = require("../models/videoModel");

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "AIzaSyCHPK49xwufC1PeINKrmTK_CRLf9U9SitM";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 🧩 Helper: choose best Gemini model
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

// 🪄 Helper: split long text into 12k-character chunks
const splitIntoChunks = (text, size = 12000) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
};

// 🎯 Ask Gemini using all transcripts (multi-language + chunked + consistent)
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

    // Process each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
      const prompt = `
You are a multilingual spiritual assistant trained on devotional YouTube video transcripts.
-basic is you are assistent of premand jii who is great saint of this era and you are asnswering in same way he ans from his transcription of oficial youtube channel
Your task:
9.Give only  meaningful content — **no introductions, no disclaimers, no sources, no formatting instructions**.

1. Detect the language of the user's question (English, Devanagari Hindi, or Roman Hindi).
2. Internally translate or interpret it to understand the meaning (for example: "love" = "prem").
3. Find the answer only from the given transcript data below.
4. Respond in the **same language** the question was asked in — even if the transcript language is different.
   - If English → reply in English (translate your reasoning into English).
   - If Roman Hindi → reply in Devanagari Hindi.
   - If Devanagari Hindi → reply in Devanagari Hindi.
5. Maintain a devotional, calm, and spiritual tone.
6. Use only information found in the transcripts.
7. If no relevant information exists, say exactly:
   "इस प्रश्न का स्पष्ट उल्लेख किसी भी प्रवचन में नहीं किया गया है।"
 
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

    // 🧩 If all chunks say “not found”, return that directly
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

    // ✨ Combine answers properly (keep diversity and remove duplicates)
    const uniqueAnswers = [...new Set(partialAnswers)];
    const combinedPrompt = `
You are a multilingual assistant. Below are partial answers extracted from different parts of devotional transcripts.

Please merge them into one single, beautiful, and non-repetitive final answer.
- Keep language consistent (Hindi/English).
- Retain all meaningful information.
- Avoid repeating "not found" lines unless necessary.
- Format cleanly with **bold headings**, bullet points, and proper spacing.

Partial Answers:
${uniqueAnswers.join("\n\n")}

Now produce the final unified answer:
`;

    const finalResult = await model.generateContent(combinedPrompt);
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
