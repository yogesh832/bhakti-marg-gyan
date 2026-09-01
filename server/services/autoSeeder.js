/**
 * Auto-Seeder Service for Bhakti Marg Gyan
 * Seeds videos from a predefined list on server startup
 * Processes one video at a time to avoid rate limiting
 */

const Video = require("../models/videoModel");
const axios = require("axios");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

const TEMP_DIR = path.join(__dirname, "../temp");
fs.mkdirSync(TEMP_DIR, { recursive: true });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// VIDEO LIST - Add Ekantik Vartalap videos here
// ============================================
const VIDEO_SEED_LIST = [
  // Add video URLs in format: { url: "youtube-url", title: "optional title" }
  // Example:
  // { url: "https://www.youtube.com/watch?v=XXXXX", title: "Ekantik Vartalap 1" },

  // Ekantik Vartalap videos will be added here
];

const getYouTubeId = (value = "") => {
  const input = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").slice(0, 11);
    }
    return url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();
  } catch {
    return input;
  }
};

const safeFileName = (value = "video") =>
  value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);

// Check if video already exists in DB
const videoExists = async (videoId) => {
  const existing = await Video.findOne({ videoId });
  return !!existing;
};

// Fetch YouTube caption transcript
async function fetchYouTubeCaptionTranscript(videoId, videoUrl) {
  const { YoutubeTranscript } = require("youtube-transcript");
  // Try Hindi first since these are Hindi videos
  const langs = ["hi", "en"];

  for (const lang of langs) {
    try {
      console.log(`   Trying ${lang} captions...`);
      const transcript = await YoutubeTranscript.fetchTranscript(videoUrl || videoId, { lang });
      if (!transcript || transcript.length === 0) {
        console.log(`   No ${lang} transcript content`);
        continue;
      }

      const segments = transcript.map((item) => ({
        text: item.text,
        startTime: Number(item.offset || 0) / 1000,
        endTime: Number(item.offset || 0) / 1000 + Number(item.duration || 0) / 1000,
        source: "youtube-caption",
      }));

      console.log(`   ✅ Got ${segments.length} segments in ${lang}`);
      return {
        transcript: segments.map((s) => s.text).join(" "),
        segments,
        source: "youtube-caption",
      };
    } catch (error) {
      console.warn(`   Caption fetch failed for lang=${lang}: ${error.message}`);
    }
  }
  return null;
}

// Download audio from YouTube
async function downloadYouTubeAudio(videoUrl, videoId) {
  const outputPath = path.join(TEMP_DIR, `audio-${safeFileName(videoId)}.mp3`);
  // FFmpeg location for winget-installed ffmpeg
  const ffmpegLocation = "C:\\Users\\Hp\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin";
  // More flexible format options
  const formats = [
    "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "bestaudio",
    "ba",
  ];

  for (const format of formats) {
    try {
      await new Promise((resolve, reject) => {
        const args = [
          "-f", format,
          "-x", "--audio-format", "mp3",
          "--ffmpeg-location", ffmpegLocation,
          "-o", outputPath,
          videoUrl,
          "--no-playlist",
          "--no-warnings",
          "--no-check-certificate",
        ];
        execFile("yt-dlp", args, (error, stdout, stderr) => {
          if (error) {
            console.warn(`yt-dlp error: ${stderr || error.message}`);
            return reject(new Error(stderr || error.message));
          }
          resolve();
        });
      });
      if (fs.existsSync(outputPath)) return outputPath;
    } catch (error) {
      console.warn(`Audio download failed for format '${format}': ${error.message}`);
    }
  }
  throw new Error("Audio download failed for all formats");
}

// Transcribe with Whisper
async function transcribeWithWhisper(audioPath) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required");

  const FormData = require("form-data");
  const formData = new FormData();
  formData.append("file", fs.createReadStream(audioPath));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const response = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    formData,
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, ...formData.getHeaders() }, maxBodyLength: Infinity }
  );

  const segments = (response.data.segments || []).map((s) => ({
    text: s.text,
    startTime: s.start,
    endTime: s.end,
    source: "whisper",
  }));

  return {
    transcript: response.data.text || segments.map((s) => s.text).join(" "),
    segments,
    source: "whisper",
  };
}

// Transcribe with AssemblyAI fallback
async function transcribeWithAssemblyAI(audioPath) {
  if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY required");

  const audioData = fs.readFileSync(audioPath);
  const uploadRes = await axios.post("https://api.assemblyai.com/v2/upload", audioData, {
    headers: { authorization: ASSEMBLYAI_API_KEY, "Transfer-Encoding": "chunked" },
    maxBodyLength: Infinity,
  });

  const transRes = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    { audio_url: uploadRes.data.upload_url, language_detection: true, punctuate: true, format_text: true },
    { headers: { authorization: ASSEMBLYAI_API_KEY } }
  );

  let status = "queued";
  let poll;
  while (status === "queued" || status === "processing") {
    await sleep(5000);
    poll = await axios.get(`https://api.assemblyai.com/v2/transcript/${transRes.data.id}`, {
      headers: { authorization: ASSEMBLYAI_API_KEY },
    });
    status = poll.data.status;
    if (status === "error") throw new Error(poll.data.error);
  }

  const words = poll.data.words || [];
  const segments = [];
  for (let i = 0; i < words.length; i += 45) {
    const slice = words.slice(i, i + 45);
    if (!slice.length) continue;
    segments.push({
      text: slice.map((w) => w.text).join(" "),
      startTime: slice[0].start / 1000,
      endTime: slice[slice.length - 1].end / 1000,
      source: "assemblyai",
    });
  }

  return {
    transcript: poll.data.text || segments.map((s) => s.text).join(" "),
    segments,
    source: "assemblyai",
  };
}

// Auto-transcribe audio
async function transcribeAudio(audioPath) {
  const stats = fs.statSync(audioPath);
  if (stats.size <= 25 * 1024 * 1024 && OPENAI_API_KEY) {
    try {
      return await transcribeWithWhisper(audioPath);
    } catch (error) {
      console.warn(`Whisper failed, falling back to AssemblyAI: ${error.message}`);
    }
  }
  return transcribeWithAssemblyAI(audioPath);
}

// Build chunks from transcript
const { buildChunksFromTranscript } = require("./retrievalService");

// Process single video
async function processVideo(videoData) {
  const { url, title } = videoData;
  const videoId = getYouTubeId(url);

  console.log(`\n📥 Processing: ${title || videoId}`);

  // Check if already exists
  if (await videoExists(videoId)) {
    console.log(`⏭️  Already exists, skipping: ${videoId}`);
    return { videoId, status: "skipped", reason: "already exists" };
  }

  let transcriptResult = await fetchYouTubeCaptionTranscript(videoId, url);

  let audioPath = "";
  if (!transcriptResult) {
    console.log(`🎧 No captions, downloading audio...`);
    audioPath = await downloadYouTubeAudio(url, videoId);
    transcriptResult = await transcribeAudio(audioPath);
  }

  const chunks = buildChunksFromTranscript(transcriptResult.transcript, transcriptResult.segments);

  await Video.findOneAndUpdate(
    { videoId },
    {
      videoId,
      url,
      sourceType: "youtube",
      title: title || `YouTube Video ${videoId}`,
      transcript: transcriptResult.transcript,
      chunks,
      status: "done",
      meta: { transcriptSource: transcriptResult.source, seededAt: new Date() },
    },
    { upsert: true, new: true }
  );

  // Cleanup audio file
  if (audioPath && fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }

  console.log(`✅ Done: ${videoId} (${chunks.length} chunks)`);
  return { videoId, status: "success", chunks: chunks.length };
}

// Main auto-seed function
async function autoSeed(seeds = VIDEO_SEED_LIST) {
  if (!seeds || seeds.length === 0) {
    console.log("📋 No videos to seed");
    return { total: 0, success: 0, skipped: 0, failed: 0 };
  }

  console.log(`\n🚀 Starting auto-seed: ${seeds.length} videos`);
  console.log("=".repeat(50));

  let success = 0, skipped = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < seeds.length; i++) {
    const video = seeds[i];
    console.log(`\n[${i + 1}/${seeds.length}]`);

    try {
      const result = await processVideo(video);
      if (result.status === "skipped") {
        skipped++;
      } else if (result.status === "success") {
        success++;
      }
    } catch (error) {
      failed++;
      errors.push({ video: video.url, error: error.message });
      console.error(`❌ Failed: ${error.message}`);
    }

    // Delay between videos to avoid rate limiting
    if (i < seeds.length - 1) {
      console.log(`⏳ Waiting 3 seconds before next video...`);
      await sleep(3000);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Auto-seed complete!`);
  console.log(`   ✅ Success: ${success}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors:`);
    errors.forEach((e) => console.log(`   - ${e.video}: ${e.error}`));
  }

  return { total: seeds.length, success, skipped, failed, errors };
}

// Export for use
module.exports = { autoSeed, processVideo, VIDEO_SEED_LIST, getYouTubeId };
