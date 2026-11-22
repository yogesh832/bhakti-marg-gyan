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

async function profile() {
  console.log("=================================================");
  console.log("⏱️ Latency Profiler: Warm Connection Benchmark");
  console.log("=================================================\n");

  await checkConnection();
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const testQuestions = [
    "भक्ति कैसे करें?",
    "bhakti kaise kare",
    "भगवान का ध्यान लगाने का तरीका",
  ];

  for (let i = 0; i < testQuestions.length; i++) {
    const q = testQuestions[i];
    console.log(`🔍 [Run ${i + 1}] Profiling Question: "${q}"`);
    const req = { body: { question: q, language: "hindi" } };
    const res = createMockRes();

    const totalStart = Date.now();
    await askController(req, res);
    const totalEnd = Date.now() - totalStart;

    console.log(`     - Retrieval Mode : ${res.data?.retrievalMode}`);
    console.log(`     - AI Provider    : ${res.data?.providers?.[0]}`);
    console.log(`     - Retrieval Time : ${res.data?.timing?.retrievalMs} ms`);
    console.log(`     - AI Gen Time    : ${res.data?.timing?.aiMs} ms`);
    console.log(`     - TOTAL Time     : ${totalEnd} ms\n`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

profile().catch(console.error);
