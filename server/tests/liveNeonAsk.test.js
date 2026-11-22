const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const askController = require("../controllers/askController");
const { searchNeonChunks } = require("../services/neonRetrievalService");
const { checkConnection } = require("../db/neonDb");

// Mock Express req and res objects
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

async function runLiveTests() {
  console.log("=================================================");
  console.log("🚀 Starting Live Neon PostgreSQL Search & /api/ask Integration Tests");
  console.log(`Configured Provider: TRANSCRIPT_SEARCH_PROVIDER=${process.env.TRANSCRIPT_SEARCH_PROVIDER}`);
  console.log("=================================================\n");

  if (!process.env.MONGO_URI || !process.env.DATABASE_URL) {
    console.error("❌ Missing MONGO_URI or DATABASE_URL in environment.");
    process.exit(1);
  }

  // 1. Verify Neon connection
  const neonOk = await checkConnection();
  console.log(`🔌 Neon PostgreSQL Connection Check: ${neonOk ? "✅ CONNECTED" : "❌ FAILED"}`);

  // 2. Connect MongoDB
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("🔌 MongoDB Connection Check: ✅ CONNECTED\n");

  const testQueries = [
    { type: "Devanagari Query", question: "भक्ति कैसे करें?" },
    { type: "Hindi Query", question: "भगवान का ध्यान लगाने का तरीका" },
    { type: "Hinglish Query", question: "naam jap ke fayde kya hain" },
    { type: "Exact-Phrase Query", question: "मनुष्य मात्र संशय रहित कैसे हो" },
  ];

  let allPassed = true;

  for (const testCase of testQueries) {
    console.log(`-------------------------------------------------`);
    console.log(`🔍 Testing ${testCase.type}: "${testCase.question}"`);
    console.log(`-------------------------------------------------`);

    const req = {
      body: {
        question: testCase.question,
        language: "hindi",
        tone: "premand",
      },
    };
    const res = createMockRes();

    await askController(req, res);

    if (res.statusCode !== 200 || !res.data?.success) {
      console.error(`❌ Request Failed with status ${res.statusCode}:`, res.data);
      allPassed = false;
      continue;
    }

    const { retrievalMode, providers, answer, sources, sourceCount, timing } = res.data;

    console.log(`  ✅ Retrieval Mode       : ${retrievalMode}`);
    console.log(`  ✅ AI Provider Used     : ${providers.join(", ")}`);
    console.log(`  ✅ Sources Found        : ${sourceCount}`);
    console.log(`  ⏱️  Timings              : Retrieval=${timing.retrievalMs}ms, AI=${timing.aiMs}ms, Total=${timing.totalMs}ms`);

    if (sources && sources.length > 0) {
      console.log(`  📌 Top Citation Sample  :`);
      console.log(`     - Video ID  : ${sources[0].videoId}`);
      console.log(`     - Title     : ${sources[0].title}`);
      console.log(`     - Timestamp : ${sources[0].startTime}s - ${sources[0].endTime}s`);
      console.log(`     - URL       : ${sources[0].url}`);
      console.log(`     - Quote     : "${sources[0].quote.substring(0, 70)}..."`);
    }

    console.log(`  💬 Short Answer Sample  :\n     "${answer.substring(0, 120).replace(/\n/g, " ")}..."\n`);

    if (retrievalMode !== "neon") {
      console.warn(`⚠️ Expected retrievalMode 'neon', but got '${retrievalMode}'`);
      allPassed = false;
    }
  }

  // 3. Test Zero-Result Query Fallback
  console.log(`-------------------------------------------------`);
  console.log(`🧪 Testing Zero-Result Query Fallback (Nonsense Query)`);
  console.log(`-------------------------------------------------`);
  const reqZero = {
    body: {
      question: "xyz123abc456qwertyuiop987",
      language: "hindi",
    },
  };
  const resZero = createMockRes();
  await askController(reqZero, resZero);

  console.log(`  ✅ Zero-Result Retrieval Mode: ${resZero.data.retrievalMode}`);
  console.log(`  ✅ Handled Safely Without Crash: ${resZero.data.success}\n`);

  // 4. Test Simulated Neon Connection Failure Fallback
  console.log(`-------------------------------------------------`);
  console.log(`🧪 Testing Neon Connection Failure Fallback`);
  console.log(`-------------------------------------------------`);

  const neonService = require("../services/neonRetrievalService");
  const originalSearchNeonChunks = neonService.searchNeonChunks;

  // Simulate Neon connection failure
  neonService.searchNeonChunks = async () => {
    throw new Error("Simulated Neon DB connection timeout");
  };

  const reqFallback = {
    body: {
      question: "भक्ति कैसे करें?",
      language: "hindi",
    },
  };
  const resFallback = createMockRes();
  // Mongo fallback is now explicitly hybrid; Neon-only failures return 503.
  const previousProvider = process.env.TRANSCRIPT_SEARCH_PROVIDER;
  process.env.TRANSCRIPT_SEARCH_PROVIDER = 'hybrid';
  await askController(reqFallback, resFallback);
  process.env.TRANSCRIPT_SEARCH_PROVIDER = previousProvider;

  // Restore original function
  neonService.searchNeonChunks = originalSearchNeonChunks;

  console.log(`  ✅ Fallback Retrieval Mode: ${resFallback.data.retrievalMode}`);
  console.log(`  ✅ Fallback Succeeded     : ${resFallback.data.success}`);
  console.log(`  ✅ Sources Found via Mongo : ${resFallback.data.sourceCount}\n`);

  if (resFallback.data.retrievalMode !== "mongodb") {
    console.error("❌ Fallback test failed: expected 'mongodb' retrieval mode when Neon fails.");
    allPassed = false;
  }

  await mongoose.disconnect();

  console.log("=================================================");
  console.log(allPassed ? "🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!" : "⚠️ SOME INTEGRATION TESTS HAD WARNINGS/FAILURES");
  console.log("=================================================\n");

  process.exit(allPassed ? 0 : 1);
}

runLiveTests().catch((err) => {
  console.error("Fatal Test Error:", err);
  process.exit(1);
});
