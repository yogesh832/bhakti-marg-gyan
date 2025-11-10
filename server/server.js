/* ---------- src/server.js ---------- */
const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const { execSync } = require("child_process");
const cors = require("cors");

const ingestRouter = require("./controllers/ingestController");
const askRouter = require("./controllers/askController");

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Routes
app.use("/api/ingest", ingestRouter);
app.use("/api/ask", askRouter);

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0"; // ✅ Required for Render

/* ✅ Safe FFmpeg & FFprobe check (won't crash if missing) */
function checkFFmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    execSync("ffprobe -version", { stdio: "ignore" });
    console.log("✅ FFmpeg & FFprobe detected.");
  } catch (err) {
    console.warn("⚠️ FFmpeg or FFprobe not found. Continuing without them.");
  }
}

/* ✅ MongoDB connection + Server startup */
async function start() {
  try {
    // Check FFmpeg availability
    checkFFmpeg();

    // MongoDB connection
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");

    // Start server - MUST bind to 0.0.0.0 for Render
    app.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error starting server:", err.message);
    process.exit(1);
  }
}

// 🔧 Run startup
start();
