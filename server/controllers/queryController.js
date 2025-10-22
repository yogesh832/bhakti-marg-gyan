const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ✅ Initialize Gemini directly with your API key
const genAI = new GoogleGenerativeAI("AIzaSyCHPK49xwufC1PeINKrmTK_CRLf9U9SitM");

// ✅ Helper: Get best available model dynamically
const getAvailableModel = async () => {
  try {
    const res = await axios.get(
      "https://generativelanguage.googleapis.com/v1/models?key=" +
        "AIzaSyCHPK49xwufC1PeINKrmTK_CRLf9U9SitM"
    );

    const models = res.data.models.map((m) => m.name);
    console.log("✅ Gemini models available:", models);

    const preferred =
      models.find((m) => m.includes("flash")) ||
      models.find((m) => m.includes("pro")) ||
      models[0];

    return preferred;
  } catch (err) {
    console.error("❌ Error fetching model list:", err.message);
    return "models/gemini-1.5-flash"; // fallback model
  }
};

// ✅ Main Controller Function
const queryGemini = async (req, res) => {
  try {
    const { videoId, question } = req.body;

    if (!videoId || !question) {
      return res.status(400).json({ error: "Missing videoId or question" });
    }

    // Step 1: Get transcript
    const transcriptRes = await axios.get(
      `http://localhost:5000/api/transcripts/${videoId}`
    );

    if (transcriptRes.data.error === "video not ready") {
      return res.status(202).json({
        status: "processing",
        message: "Video transcript not ready yet",
      });
    }

    const transcriptText = transcriptRes.data.transcriptText;
    if (!transcriptText) {
      return res.status(404).json({ error: "No transcript found" });
    }

    // Step 2: Get model
    const modelName = await getAvailableModel();
    const model = genAI.getGenerativeModel({ model: modelName });
    console.log("🧠 Using Gemini model:", modelName);

    // Step 3: Prompt for Gemini
    const prompt = `
      The following is a YouTube transcript of a spiritual or educational video.
      Answer the user's question concisely and factually based only on this transcript.

      Transcript:
      ${transcriptText.slice(0, 8000)}

      Question: ${question}
    `;

    // Step 4: Generate response
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Step 5: Send response
    res.json({
      success: true,
      model: modelName,
      answer: text,
    });
  } catch (err) {
    console.error("❌ Gemini /api/query error:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
};

module.exports = queryGemini;
