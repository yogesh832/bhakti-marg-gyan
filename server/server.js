/* ---------- server.js ---------- */
const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const { execSync } = require("child_process");
const cors = require("cors");
const path = require("path");

const ingestRouter = require("./controllers/ingestController");
const askRouter = require("./controllers/askController");
const { autoSeed } = require("./services/autoSeeder");

const app = express();
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Catch ALL unhandled errors
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

console.log("🔧 Starting application...");

// ✅ Routes
app.use("/api/ingest", ingestRouter);
app.use("/api/ask", askRouter);

// Auto-seed endpoint - GET /api/seed to trigger, or POST with custom videos
app.get("/api/seed", async (req, res) => {
  try {
    const seeds = require("./config/seeds.json");
    if (!seeds.videos || seeds.videos.length === 0) {
      return res.json({ success: true, message: "No videos in seed list", total: 0 });
    }
    const result = await autoSeed(seeds.videos);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Seed error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Seed status endpoint
app.get("/api/seed/status", async (req, res) => {
  try {
    const seeds = require("./config/seeds.json");
    const Video = require("./models/videoModel");
    const existing = await Video.find({}).select("videoId");
    const existingIds = new Set(existing.map(v => v.videoId));

    const pending = seeds.videos.filter(v => !existingIds.has(require("./services/autoSeeder").getYouTubeId(v.url)));

    res.json({
      success: true,
      totalInList: seeds.videos.length,
      inDatabase: existing.length,
      pending: pending.length,
      seeded: seeds.videos.length - pending.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 5001;
const HOST = "0.0.0.0"; // ✅ Required for Render deployment

/* ✅ Check required environment variables */
function checkEnvVariables() {
  const required = ["MONGO_URI"];
  const optional = [
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "ASSEMBLYAI_API_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `❌ Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Please set them in your Render dashboard or .env file");
    process.exit(1);
  }

  console.log("✅ Required environment variables found");

  const missingOptional = optional.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn(
      `⚠️ Optional environment variables not set: ${missingOptional.join(", ")}`
    );
    console.warn("Some AI features may not work without these keys");
  } else {
    console.log("✅ All optional environment variables found");
  }
}

/* ✅ Safe FFmpeg & FFprobe check (won't crash if missing) */
function checkFFmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    execSync("ffprobe -version", { stdio: "ignore" });
    console.log("✅ FFmpeg & FFprobe detected.");
  } catch (err) {
    console.warn("⚠️ FFmpeg or FFprobe not found. Continuing without them.");
    console.warn(
      "Note: Some video processing features may not work without FFmpeg"
    );
  }
}

/* ✅ MongoDB connection + Server startup */
async function start() {
  try {
    console.log("🔍 Checking environment variables...");
    checkEnvVariables();

    console.log("🔍 Checking FFmpeg availability...");
    checkFFmpeg();

    console.log("🔌 Connecting to MongoDB...");
    console.log(`MongoDB URI: ${process.env.MONGO_URI.substring(0, 20)}...`);

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");

    // Start server - MUST bind to 0.0.0.0 for Render
    app.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`Available routes:`);
      console.log(`  POST ${HOST}:${PORT}/api/ingest/process`);
      console.log(`  POST ${HOST}:${PORT}/api/ask`);
    });
  } catch (err) {
    console.error("❌ Error starting server:");
    console.error("Message:", err.message);
    console.error("Stack trace:", err.stack);

    // Provide helpful error messages
    if (err.message.includes("MONGO")) {
      console.error(
        "\n💡 MongoDB connection failed. Please check your MONGO_URI environment variable."
      );
    }

    process.exit(1);
  }
}

// 🔧 Run startup
console.log("🚀 Calling start function...");
start();

// Auto-seed on startup (always runs, checks for pending videos)
mongoose.connection.once("open", async () => {
  console.log("📥 Checking for pending videos to seed...");
  try {
    const seeds = require("./config/seeds.json");
    const Video = require("./models/videoModel");
    const existing = await Video.find({}).select("videoId");
    const existingIds = new Set(existing.map(v => v.videoId));
    const { getYouTubeId } = require("./services/autoSeeder");

    const pending = seeds.videos.filter(v => !existingIds.has(getYouTubeId(v.url)));

    if (pending.length > 0) {
      console.log(`📥 Found ${pending.length} pending videos, starting auto-seed...`);
      // Run in background (non-blocking)
      autoSeed(pending).catch(err => console.error("❌ Auto-seed error:", err.message));
    } else {
      console.log("✅ All videos already seeded, skipping auto-seed.");
    }
  } catch (err) {
    console.error("⚠️ Could not check pending videos:", err.message);
  }
});
