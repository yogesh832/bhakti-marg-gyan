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

const PORT = process.env.PORT || 5000;
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