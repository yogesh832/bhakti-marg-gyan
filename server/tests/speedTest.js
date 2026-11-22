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

async function runSpeedTest() {
  console.log("=================================================");
  console.log("⚡ SPEED BENCHMARK TEST: Neon PostgreSQL + LLM API");
  console.log(`Search Provider: TRANSCRIPT_SEARCH_PROVIDER=${process.env.TRANSCRIPT_SEARCH_PROVIDER}`);
  console.log(`Auto-Seed Status: AUTO_SEED=${process.env.AUTO_SEED}`);
  console.log("=================================================\n");

  const ok = await checkConnection();
  if (!ok) {
    console.error("❌ Neon database connection failed.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const benchmarkQueries = [
    { label: "1. Devanagari Query", query: "भक्ति कैसे करें?" },
    { label: "2. Hinglish Query", query: "naam jap ke fayde kya hain" },
    { label: "3. Exact Phrase Query", query: "मनुष्य मात्र संशय रहित कैसे हो" },
  ];

  const results = [];

  for (const item of benchmarkQueries) {
    console.log(`⏱️ Running Benchmark: ${item.label} ("${item.query}")`);

    const req = {
      body: {
        question: item.query,
        language: "hindi",
        tone: "premand",
      },
    };
    const res = createMockRes();

    const startTime = Date.now();
    await askController(req, res);
    const overallMs = Date.now() - startTime;

    if (res.statusCode === 200 && res.data?.success) {
      const { retrievalMode, providers, timing, sourceCount } = res.data;
      results.push({
        label: item.label,
        retrievalMode,
        provider: providers[0],
        sources: sourceCount,
        retrievalMs: timing.retrievalMs,
        aiMs: timing.aiMs,
        totalMs: overallMs,
      });

      console.log(`  ✅ Mode       : ${retrievalMode}`);
      console.log(`  ⚡ Retrieval  : ${timing.retrievalMs} ms`);
      console.log(`  🧠 AI Gen     : ${timing.aiMs} ms (via ${providers[0]})`);
      console.log(`  🚀 Total      : ${overallMs} ms\n`);
    } else {
      console.error(`❌ Benchmark failed for ${item.label}:`, res.data);
    }
  }

  await mongoose.disconnect();

  console.log("=================================================");
  console.log("📊 SPEED BENCHMARK SUMMARY TABLE");
  console.log("=================================================");
  console.table(
    results.map((r) => ({
      "Query Type": r.label,
      "Retrieval Mode": r.retrievalMode,
      "AI Model": r.provider,
      "Retrieval (ms)": r.retrievalMs,
      "AI Gen (ms)": r.aiMs,
      "Total (ms)": r.totalMs,
    }))
  );
  console.log("=================================================\n");

  process.exit(0);
}

runSpeedTest().catch((err) => {
  console.error("Fatal Benchmark Error:", err);
  process.exit(1);
});
