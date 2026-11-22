// Dry-run the NEW third-person prompt for one question (no server needed)
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { toHindiSearchQuery, loadCandidateVideos } = require("../controllers/askController");
const { searchRelevantChunks } = require("../services/retrievalService");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const cleanQuote = (q) => (q || "").replace(/(.{2,})\s*(?:\1\s*){2,}/g, "$1").replace(/\s+/g, " ").trim();

const question = process.argv[2] || "nam jap m man kese lgaye";

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const searchQuery = await toHindiSearchQuery(question);
  console.log("search query:", searchQuery);
  const videos = await loadCandidateVideos(searchQuery);
  const matches = searchRelevantChunks(videos, searchQuery, 3);

  if (!matches.length) { console.log("no matches"); process.exit(0); }

  const sources = matches.map((m, i) =>
    `[Source ${i + 1}]\nVideo: ${m.title}\nTimestamp: ${Math.floor(m.startTime / 60)}:${String(Math.floor(m.startTime % 60)).padStart(2, "0")} – ${Math.floor(m.endTime / 60)}:${String(Math.floor(m.endTime % 60)).padStart(2, "0")}\n"${cleanQuote(m.quote)}"`
  ).join("\n\n");

  const prompt = `You are a source-grounded spiritual Q&A assistant presenting teachings from Premanand Ji Maharaj's video transcripts.

Answer ONLY from the provided retrieved transcript context.
The retrieved transcript is the only source of truth.

RULES:
- Do NOT use any pretrained spiritual knowledge, general knowledge, assumptions, or information not present in the retrieved sources below
- Do NOT invent teachings, practices, examples, explanations, conclusions, quotations, or instructions
- NEVER speak AS Maharaj Ji — you are a third-person assistant. Attribute EVERY point to the source videos, e.g. "महाराज जी ने इस प्रवचन में बताया है कि...", "उनके वीडियो के अनुसार..."
- Do NOT address the user at all — no salutation, no preamble ("प्रिय मित्र", "आपकी स्थिति को समझते हुए", "मैं आपको साझा करना चाहता हूँ"), no "बेटा"/"बहना". The very first word of your answer must be part of the answer itself.
- Do NOT claim "Maharaj Ji said..." unless the provided transcript explicitly supports it
- Do NOT add spiritual concepts not present in the retrieved sources
- If the retrieved sources provide related information — even if not an exact answer — summarize that information as a partial match
- Accuracy is more important than completeness
- Only use quotation marks for actual transcript text shown below
- When citing a video inline, use its exact label: [Source 1], [Source 2], ... — matching the numbering in RETRIEVED SOURCES. Never invent a citation like "(वीडियो #...)".
- If the retrieved sources are completely unrelated to the question, honestly say so

RESPONSE FORMAT (exactly two parts):
1. SHORT ANSWER: the essence in 1-3 simple, direct sentences — attributed to the sources, no salutation, no preamble.
2. Then a line containing exactly:
<<<more>>>
3. DETAILED ANSWER: the fuller explanation, fully grounded in the same retrieved sources. Explain what महाराज जी taught on this, with inline [Source N] citations. No salutation or closing remarks.
If the sources are completely unrelated, SKIP the format and just say so honestly in one line.

जवाब हिंदी में दें।
शैली: बिल्कुल सीधा उत्तर — किसी भी संबोधन ('प्रिय मित्र', 'बेटा', 'बहना'), प्रस्तावना ('आपकी स्थिति को समझते हुए...', 'मैं आपको साझा करना चाहता हूँ...') या निष्कर्ष-बकवास के बिना। पहला शब्द ही प्रश्न का उत्तर हो। तथ्य तीसरे पुरुष में स्रोत से जोड़ें — 'प्रेमानंद जी महाराज ने अपने प्रवचन में कहा कि...', 'उनके वीडियो के अनुसार...'। भाषा सरल, सहज, सीधी।

USER QUESTION: ${question}

RETRIEVED SOURCES:
${sources}

ANSWER:`;

  // Gemini free-tier quota is exhausted from testing — use Groq directly here
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "qwen/qwen3.8-27b",
    temperature: 0.3,
    max_tokens: 900,
  });
  console.log("\n=== NEW-STYLE ANSWER ===\n" + completion.choices[0]?.message?.content);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
