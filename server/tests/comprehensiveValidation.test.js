const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const askController = require("../controllers/askController");
const { checkConnection } = require("../db/neonDb");

function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };
}

// 40 Representative test questions
const TEST_QUESTIONS = [
  // Devanagari Questions
  "भक्ति कैसे करें?",
  "भगवान का ध्यान लगाने का तरीका क्या है?",
  "नाम जप का असली महत्व क्या है?",
  "सच्चे संत की पहचान कैसे करें?",
  "मन चंचल क्यों होता है और इसे कैसे स्थिर करें?",
  "क्रोध पर नियंत्रण कैसे पाएं?",
  "गृहस्थ जीवन में भक्ति कैसे संभव है?",
  "दुखों से मुक्ति का क्या उपाय है?",
  "एकांतिक वार्तालाप में महाराज जी ने क्या उपदेश दिया?",
  "भगवान श्री राधा माधव की कृपा कैसे प्राप्त होती है?",

  // Hinglish Questions
  "bhakti kaise kare",
  "naam jap ke fayde kya hain",
  "bhagwan me man kaise lagaye",
  "gussa kam kaise kare",
  "shri radha naam jap ki mahima",
  "gurudev ki kripa kaise milegi",
  "kaam vasna se mukti kaise paye",
  "ekantik vartalaap me maharaj ji ne kya kaha",
  "sacha sant kaun hota hai",
  "chinta aur tanaav door karne ka upay",

  // Detailed Spiritual Questions
  "कर्मफल सिद्धान्त क्या है और मनुष्य अपने कर्मों से कैसे बँधता है?",
  "साधक के जीवन में नाम अपराध क्या होते हैं और इनसे कैसे बचें?",
  "जीव और ईश्वर का क्या सम्बन्ध है प्रेमानंद जी महाराज के अनुसार?",
  "सत्संग का जीवन में क्या प्रभाव पड़ता है?",
  "शरणागति का वास्तविक अर्थ क्या है?",
  "गुरु दीक्षा और गुरु सेवा का क्या महत्व है?",
  "निरंतर नाम सुमिरन करने की अभ्यास विधि क्या है?",
  "भगवद प्राप्ति में मुख्य बाधाएँ क्या हैं?",
  "माया और अविद्या का क्या स्वरूप है?",
  "भक्ति मार्ग और ज्ञान मार्ग में क्या अंतर है?",

  // Edge & General Queries
  "premanand ji maharaj daily routine schedule",
  "vrindavan dham yatra mahima",
  "radhikaji ke charan kamal ki kripa",
  "mangala aarti time and niyam",
  "jap malika kaise pakde",
  "tilak dharan karne ki vidhi",
  "shuddha aahar ka bhakti par prabhav",
  "brahmacharya palan ke niyam",
  "mrityu ke samay bhagwan ka naam smaran",
  "xyz123nonsensequeryforzeroresults", // Zero-result fallback test
];

function calculatePercentiles(arr) {
  if (arr.length === 0) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const max = sorted[sorted.length - 1] || 0;
  return { p50, p95, max };
}

async function runComprehensiveValidation() {
  console.log("=================================================");
  console.log("🚀 COMPREHENSIVE BENCHMARK & QUALITY VALIDATION TEST SUITE");
  console.log(`Target Provider : TRANSCRIPT_SEARCH_PROVIDER=${process.env.TRANSCRIPT_SEARCH_PROVIDER}`);
  console.log(`Auto-Seed       : AUTO_SEED=${process.env.AUTO_SEED}`);
  console.log(`Total Questions : ${TEST_QUESTIONS.length}`);
  console.log("=================================================\n");

  await checkConnection();
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const metrics = {
    totalLatencies: [],
    retrievalLatencies: [],
    aiLatencies: [],
    providersUsed: {},
    fallbackCounts: 0,
    timeoutCounts: 0,
    httpErrors: 0,
    successfulResponses: 0,
    truncatedAnswers: 0,
    answerFormatValid: 0,
  };

  // 1. Sequential Runs (30 questions)
  console.log("📌 Phase 1: Sequential Benchmark Execution (Questions 1 to 30)");
  console.log("------------------------------------------------------------------");

  for (let i = 0; i < 30; i++) {
    const q = TEST_QUESTIONS[i];
    const req = { body: { question: q, language: "hindi", tone: "premand" } };
    const res = createMockRes();

    const tStart = Date.now();
    await askController(req, res);
    const tTotal = Date.now() - tStart;

    if (res.statusCode === 200 && res.data?.success) {
      metrics.successfulResponses++;
      metrics.totalLatencies.push(tTotal);
      metrics.retrievalLatencies.push(res.data.timing?.retrievalMs || 0);
      metrics.aiLatencies.push(res.data.timing?.aiMs || 0);

      const provider = res.data.providers?.[0] || "Unknown";
      metrics.providersUsed[provider] = (metrics.providersUsed[provider] || 0) + 1;

      // Quality evaluation: check if <<<more>>> exists and detailed answer is not truncated prematurely
      const answer = res.data.answer || "";
      const hasShort = answer.length > 20;
      const hasMoreDelimiter = answer.includes("<<<more>>>");
      const hasDetailed = answer.split("<<<more>>>")[1]?.trim().length > 30;

      if (hasShort && (hasMoreDelimiter ? hasDetailed : true)) {
        metrics.answerFormatValid++;
      } else {
        metrics.truncatedAnswers++;
      }

      if (res.data.retrievalMode === "mongodb" && process.env.TRANSCRIPT_SEARCH_PROVIDER === "neon") {
        metrics.fallbackCounts++;
      }

      console.log(`  [${String(i + 1).padStart(2, "0")}/30] Mode: ${res.data.retrievalMode} | AI: ${provider} | Ret: ${res.data.timing?.retrievalMs}ms | AI: ${res.data.timing?.aiMs}ms | Total: ${tTotal}ms | Q: "${q.substring(0, 30)}..."`);
    } else {
      metrics.httpErrors++;
      console.error(`  [${String(i + 1).padStart(2, "0")}/30] ❌ Error ${res.statusCode}:`, res.data);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  // 2. Controlled Concurrent Batch Runs (Questions 31 to 40 in 2 parallel batches of 5)
  console.log("\n📌 Phase 2: Controlled Concurrent Batch Execution (Questions 31 to 40)");
  console.log("------------------------------------------------------------------");

  const batch1 = TEST_QUESTIONS.slice(30, 35);
  const batch2 = TEST_QUESTIONS.slice(35, 40);

  for (const [bIdx, batch] of [batch1, batch2].entries()) {
    console.log(`\n⚡ Launching Parallel Batch ${bIdx + 1} (5 concurrent queries)...`);
    const batchStart = Date.now();

    const promises = batch.map(async (q) => {
      const req = { body: { question: q, language: "hindi" } };
      const res = createMockRes();
      const s = Date.now();
      await askController(req, res);
      return { q, res, dur: Date.now() - s };
    });

    const batchResults = await Promise.all(promises);
    const batchDur = Date.now() - batchStart;

    console.log(`  ✅ Batch ${bIdx + 1} completed in ${batchDur}ms:`);
    for (const item of batchResults) {
      const { q, res, dur } = item;
      if (res.statusCode === 200 && res.data?.success) {
        metrics.successfulResponses++;
        metrics.totalLatencies.push(dur);
        metrics.retrievalLatencies.push(res.data.timing?.retrievalMs || 0);
        metrics.aiLatencies.push(res.data.timing?.aiMs || 0);

        const provider = res.data.providers?.[0] || "Unknown";
        metrics.providersUsed[provider] = (metrics.providersUsed[provider] || 0) + 1;

        if (res.data.retrievalMode === "mongodb" && process.env.TRANSCRIPT_SEARCH_PROVIDER === "neon") {
          metrics.fallbackCounts++;
        }

        console.log(`     - Q: "${q.substring(0, 25)}..." ➔ Mode: ${res.data.retrievalMode}, Provider: ${provider}, Time: ${dur}ms`);
      } else {
        metrics.httpErrors++;
        console.error(`     - Q: "${q.substring(0, 25)}..." ➔ Failed (${res.statusCode}):`, res.data);
      }
    }
  }

  await mongoose.disconnect();

  const totalStats = calculatePercentiles(metrics.totalLatencies);
  const retStats = calculatePercentiles(metrics.retrievalLatencies);
  const aiStats = calculatePercentiles(metrics.aiLatencies);

  console.log("\n=================================================");
  console.log("📊 COMPREHENSIVE VALIDATION METRICS & PERCENTILES");
  console.log("=================================================");
  console.log(`Total Requests Processed   : ${metrics.successfulResponses + metrics.httpErrors}/${TEST_QUESTIONS.length}`);
  console.log(`Success Rate               : ${((metrics.successfulResponses / TEST_QUESTIONS.length) * 100).toFixed(1)}%`);
  console.log(`Answer Format Valid        : ${metrics.answerFormatValid}/${metrics.successfulResponses}`);
  console.log(`Truncated Answers          : ${metrics.truncatedAnswers}`);
  console.log(`Fallback to Mongo Count    : ${metrics.fallbackCounts}`);
  console.log(`HTTP Error Count           : ${metrics.httpErrors}`);
  console.log(`AI Providers Distribution  :`, metrics.providersUsed);
  console.log("-------------------------------------------------");
  console.log(`⏱️ TOTAL LATENCY   ➔ p50: ${totalStats.p50}ms | p95: ${totalStats.p95}ms | Max: ${totalStats.max}ms`);
  console.log(`⚡ RETRIEVAL TIME  ➔ p50: ${retStats.p50}ms | p95: ${retStats.p95}ms | Max: ${retStats.max}ms`);
  console.log(`🧠 AI GEN TIME     ➔ p50: ${aiStats.p50}ms | p95: ${aiStats.p95}ms | Max: ${aiStats.max}ms`);
  console.log("=================================================\n");

  process.exit(metrics.httpErrors === 0 ? 0 : 1);
}

runComprehensiveValidation().catch((err) => {
  console.error("Fatal Validation Error:", err);
  process.exit(1);
});
