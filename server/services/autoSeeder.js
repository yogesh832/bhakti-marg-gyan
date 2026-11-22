/**
 * Auto-Seeder Service for Bhakti Marg Gyan
 * Seeds videos from a predefined list on server startup
 * Processes one video at a time to avoid rate limiting
 */

const { getPool } = require("../db/neonDb");
const { syncSeedToNeon } = require("./syncSeedToNeon");
const axios = require("axios");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { assertAssemblyAvailable, recordBillingFailure } = require("./providerAvailability");
const { transcribeWithDeepgram } = require("./deepgramTranscription");

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
  const { rows } = await getPool().query("SELECT 1 FROM videos v WHERE video_id=$1 AND status='done' AND length(coalesce(transcript,''))>0 AND EXISTS(SELECT 1 FROM transcript_chunks c WHERE c.video_id=v.video_id)", [videoId]);
  return rows.length > 0;
};

// JSON3 carries each spoken fragment once, unlike rolling rendered VTT windows.
const { parseJson3, requireQuality, buildSafeChunks, prepareTranscript, normalizeSegments } = require('./transcriptQuality');
async function fetchYouTubeCaptionTranscript(videoId, videoUrl) {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekantik-quality-'));
  try {
    for (const lang of ['hi', 'en']) {
      const prefix = path.join(dir, lang);
      try {
        await new Promise((resolve, reject) => execFile('yt-dlp', [
          '--write-subs', '--write-auto-subs', '--sub-lang', lang, '--sub-format', 'json3',
          '--write-info-json', '--skip-download', '--no-playlist', '--no-warnings',
          '--socket-timeout', '25', '--retries', '1', '-o', prefix, videoUrl || videoId
        ], { timeout: 180000 }, error => error ? reject(error) : resolve()));
        const file = prefix + '.' + lang + '.json3';
        if (!fs.existsSync(file)) continue;
        const metadata = JSON.parse(fs.readFileSync(prefix + '.info.json', 'utf8'));
        if (!(metadata.duration > 0)) throw new Error('Caption duration missing');
        const segments = normalizeSegments(parseJson3(JSON.parse(fs.readFileSync(file, 'utf8')), metadata.duration));
        const quality = requireQuality(segments, metadata.duration);
        console.log('Caption quality passed: ' + segments.length + ' source fragments');
        return { transcript: segments.map(s => s.text).join(' '), segments, source: 'youtube-caption', quality };
      } catch (error) {
        if (error.code === 'TRANSCRIPT_QUALITY') throw error;
        console.log('No usable ' + lang + ' caption download: ' + error.message.slice(0, 160));
      }
    }
    return null;
  } finally {
    // This freshly-created, task-owned temp directory contains processing files only.
    if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('ekantik-quality-')) fs.rmSync(dir, { recursive: true, force: true });
  }
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
          "--js-runtimes", "node",
          "-o", outputPath,
          videoUrl,
          "--no-playlist",
          "--no-warnings",
          "--no-check-certificate",
        ];
        execFile("yt-dlp", args, { timeout: 900000 }, (error, stdout, stderr) => {
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
  assertAssemblyAvailable();
  return require("./assemblyCredentialFallback").runWithAssemblyCredentials(key => transcribeWithAssemblyCredential(audioPath, key));
}
async function transcribeWithAssemblyCredential(audioPath, ASSEMBLYAI_API_KEY) {
  try {
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
  } catch (error) {
    const detail = error.response?.data?.error;
    // Credential wrapper records exhaustion only after checking fallback availability.
    if (typeof detail === 'string') error.message = 'AssemblyAI ' + (error.response.status || '') + ': ' + detail.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 350);
    throw error;
  }
}

// Auto-transcribe audio
async function transcribeAudio(audioPath, provider) {
  if (provider === "deepgram") return transcribeWithDeepgram(audioPath);
  if (provider === "assemblyai") return transcribeWithAssemblyAI(audioPath);
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

// Process single video
async function processVideo(videoData, persistence = {}) {
  const { url, title, transcriptProvider = process.env.TRANSCRIPT_PROVIDER || "assemblyai" } = videoData;
  const videoId = getYouTubeId(url);

  console.log(`\n📥 Processing: ${title || videoId}`);

  // Check if already exists
  if (await (persistence.exists || videoExists)(videoId)) {
    console.log(`⏭️  Already exists, skipping: ${videoId}`);
    return { videoId, status: "skipped", reason: "already exists" };
  }

  let audioPath = "";
  try {
  let transcriptResult = await fetchYouTubeCaptionTranscript(videoId, url);
  if (!transcriptResult) {
    if (transcriptProvider === "assemblyai") assertAssemblyAvailable();
    console.log(`🎧 No captions, downloading audio...`);
    audioPath = await downloadYouTubeAudio(url, videoId);
    transcriptResult = await transcribeAudio(audioPath, transcriptProvider);
    const duration = await new Promise((resolve, reject) => execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath], { timeout: 30000 }, (error, stdout) => {
      const seconds = Number(String(stdout).trim());
      if (error || !(seconds > 0)) reject(new Error("Cannot verify audio duration for quality gate"));
      else resolve(seconds);
    }));
    transcriptResult.quality = requireQuality(transcriptResult.segments, duration);
  }

  const { quality, chunks, transcript } = prepareTranscript(transcriptResult.segments, transcriptResult.quality?.duration);
  transcriptResult.transcript = transcript;
  if (!transcriptResult.transcript?.trim() || !chunks.length) {
    throw new Error("Empty transcript: video was not marked done");
  }

  const record = {
      videoId,
      url,
      sourceType: "youtube",
      title: title || `YouTube Video ${videoId}`,
      transcript: transcriptResult.transcript,
      chunks,
      status: "done",
      meta: { transcriptSource: transcriptResult.source, seededAt: new Date(), quality },
    };
  if (persistence.save) {
    await persistence.save(record);
  } else {
    await syncSeedToNeon(record);
  }

  console.log(`✅ Done: ${videoId} (${chunks.length} chunks)`);
  return { videoId, status: "success", chunks: chunks.length };
  } finally {
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}

// Mark video as failed so it's not retried endlessly
async function markVideoFailed(videoId, url, title, reason) {
  // A rejected source is never published as a transcript in either database.
  console.warn('Video not saved: ' + videoId + ': ' + reason.slice(0, 250));
}

// Wrap processVideo to catch access-denied failures
async function processVideoSafe(videoData) {
  const { url, title } = videoData;
  const videoId = getYouTubeId(url);
  try {
    return await processVideo(videoData);
  } catch (err) {
    // Don't retry age-restricted, private, or unavailable videos
    const unrecoverable = [
      "Sign in to confirm your age",
      "Private video",
      "is not available",
      "Video unavailable",
    ];
    const isUnrecoverable = unrecoverable.some((msg) => err.message && err.message.includes(msg));
    if (isUnrecoverable) {
      console.error(`❌ Unrecoverable (will not retry): ${err.message}`);
      await markVideoFailed(videoId, url, title, err.message);
      return { videoId, status: "skipped", reason: err.message };
    }
    // Rethrow for retry on actual errors
    throw err;
  }
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
      const result = await processVideoSafe(video);
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

async function transcribeAudioFile(audioPath) {
 const duration = await new Promise((resolve, reject) => execFile('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audioPath], {timeout:30000}, (error, stdout) => {
  const seconds=Number(String(stdout).trim());
  if(error || !(seconds>0)) reject(new Error('Cannot verify media duration'));
  else resolve(seconds);
 }));
 const result=await transcribeAudio(audioPath, process.env.TRANSCRIPT_PROVIDER || 'assemblyai');
 return {...result, quality:requireQuality(result.segments,duration)};
}
module.exports = { autoSeed, processVideo, VIDEO_SEED_LIST, getYouTubeId, fetchYouTubeCaptionTranscript, transcribeAudioFile };
