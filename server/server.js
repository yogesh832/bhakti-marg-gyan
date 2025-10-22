/* ---------- src/server.js ---------- */
const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const { execSync } = require("child_process");
const cors = require("cors"); // ✅ added
// const { Queue, Worker } = require("bullmq");
// const IORedis = require("ioredis");

const ingestRouter = require("./controllers/ingestController");
const askRouter = require("./controllers/askController");

const app = express();
app.use(express.json());
app.use(cors()); // ✅ fixed

// ✅ Routes
app.use("/api/ingest", ingestRouter);
app.use("/api/ask", askRouter);

const PORT = process.env.PORT || 5000;

// ✅ FFmpeg & FFprobe check before server start
function checkFFmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    execSync("ffprobe -version", { stdio: "ignore" });
    console.log("✅ FFmpeg & FFprobe detected.");
  } catch (err) {
    console.error("\n❌ FFmpeg or FFprobe not found!");
    console.error(
      "Please install FFmpeg and make sure it is added to your system PATH."
    );
    console.error("👉 Download from: https://ffmpeg.org/download.html");
    process.exit(1);
  }
}

async function start() {
  try {
    // 🔍 Check FFmpeg availability
    checkFFmpeg();

    // 🗄️ Connect MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");

    // 🚀 Start server
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Error starting server:", err.message);
    process.exit(1);
  }
}

// 🔧 Run startup
start();
