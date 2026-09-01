const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const { execFile } = require("child_process");
const { YoutubeTranscript } = require("youtube-transcript");
const Video = require("../models/videoModel");
const { buildChunksFromTranscript, cleanText } = require("../services/retrievalService");

const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const tempDir = path.join(__dirname, "../temp");
const uploadsDir = path.join(__dirname, "../uploads");

fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getBaseUrl = (req) =>
  process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;

const safeFileName = (value = "video") =>
  value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);

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

async function downloadYouTubeAudio(videoUrl, videoId) {
  const outputPath = path.join(tempDir, `audio-${safeFileName(videoId)}.mp3`);
  // FFmpeg location for winget-installed ffmpeg
  const ffmpegLocation = "C:\\Users\\Hp\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin";
  // Try multiple format options
  const formats = ["bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio", "bestaudio"];

  for (const format of formats) {
    try {
      await new Promise((resolve, reject) => {
        const args = [
          "-f",
          format,
          "-x",
          "--audio-format",
          "mp3",
          "--ffmpeg-location",
          ffmpegLocation,
          "-o",
          outputPath,
          videoUrl,
          "--no-playlist",
          "--no-warnings",
        ];

        const proc = execFile("yt-dlp", args, (error, stdout, stderr) => {
          if (error) {
            return reject(new Error(stderr || error.message));
          }
          resolve(stdout);
        });

        proc.on("error", reject);
      });

      if (fs.existsSync(outputPath)) return outputPath;
    } catch (error) {
      console.warn(`Audio download failed for ${format}: ${error.message}`);
    }
  }

  throw new Error("Audio download failed after trying all formats");
}

async function fetchYouTubeCaptionTranscript(videoId, videoUrl) {
  // Try Hindi first since these are Hindi devotional videos
  const langs = ["hi"];

  for (const lang of langs) {
    try {
      console.log(`[Caption] Trying ${lang} for ${videoId}...`);
      const transcript = await YoutubeTranscript.fetchTranscript(videoUrl || videoId, {
        lang,
      });

      if (!transcript || transcript.length === 0) {
        console.log(`[Caption] Empty transcript for lang=${lang}`);
        continue;
      }

      const segments = transcript.map((item) => ({
        text: item.text,
        startTime: Number(item.offset || 0) / 1000,
        endTime: Number(item.offset || 0) / 1000 + Number(item.duration || 0) / 1000,
        source: "youtube-caption",
      }));

      console.log(`[Caption] ✅ Success: ${segments.length} segments`);
      return {
        transcript: segments.map((segment) => segment.text).join(" "),
        segments,
        source: "youtube-caption",
      };
    } catch (error) {
      console.warn(`[Caption] Failed for lang=${lang}: ${error.message}`);
    }
  }

  return null;
}

async function transcribeWithWhisper(audioPath) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for Whisper");

  const formData = new FormData();
  formData.append("file", fs.createReadStream(audioPath));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const response = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    formData,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
    }
  );

  const segments = (response.data.segments || []).map((segment) => ({
    text: segment.text,
    startTime: segment.start,
    endTime: segment.end,
    source: "whisper",
  }));

  return {
    transcript: response.data.text || segments.map((segment) => segment.text).join(" "),
    segments,
    source: "whisper",
  };
}

async function transcribeWithAssemblyAI(audioPath) {
  if (!ASSEMBLYAI_API_KEY) {
    throw new Error("ASSEMBLYAI_API_KEY is required for AssemblyAI fallback");
  }

  const audioData = fs.readFileSync(audioPath);
  const uploadRes = await axios.post("https://api.assemblyai.com/v2/upload", audioData, {
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "Transfer-Encoding": "chunked",
    },
    maxBodyLength: Infinity,
  });

  const transRes = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    {
      audio_url: uploadRes.data.upload_url,
      language_detection: true,
      punctuate: true,
      format_text: true,
      disfluencies: false,
    },
    { headers: { authorization: ASSEMBLYAI_API_KEY } }
  );

  let status = "queued";
  let pollData = null;

  while (status === "queued" || status === "processing") {
    await sleep(5000);
    const poll = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transRes.data.id}`,
      { headers: { authorization: ASSEMBLYAI_API_KEY } }
    );
    pollData = poll.data;
    status = pollData.status;

    if (status === "error") throw new Error(pollData.error);
  }

  const words = pollData.words || [];
  const segments = [];
  for (let i = 0; i < words.length; i += 45) {
    const slice = words.slice(i, i + 45);
    if (!slice.length) continue;
    segments.push({
      text: slice.map((word) => word.text).join(" "),
      startTime: slice[0].start / 1000,
      endTime: slice[slice.length - 1].end / 1000,
      source: "assemblyai",
    });
  }

  return {
    transcript: pollData.text || segments.map((segment) => segment.text).join(" "),
    segments,
    source: "assemblyai",
  };
}

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

async function saveVideoRecord({
  videoId,
  videoUrl,
  mediaUrl,
  sourceType,
  title,
  transcript,
  segments,
  meta = {},
}) {
  // Clean the transcript before saving and chunking
  const cleanedTranscript = cleanText(transcript);
  const cleanedSegments = segments?.map(s => ({
    ...s,
    text: cleanText(s.text || '')
  })) || [];

  const chunks = buildChunksFromTranscript(cleanedTranscript, cleanedSegments);

  await Video.findOneAndUpdate(
    { videoId },
    {
      videoId,
      url: videoUrl,
      mediaUrl,
      sourceType,
      title,
      transcript,
      chunks,
      status: "done",
      meta,
    },
    { upsert: true, new: true }
  );

  return { chunks };
}

router.post("/process", async (req, res) => {
  let audioPath = "";

  try {
    const { videoId: rawVideoId, videoUrl, title } = req.body;
    const videoId = getYouTubeId(rawVideoId || videoUrl);

    if (!videoId || !videoUrl) {
      return res
        .status(400)
        .json({ success: false, error: "Missing videoId or videoUrl" });
    }

    let transcriptResult = await fetchYouTubeCaptionTranscript(videoId, videoUrl);

    if (!transcriptResult) {
      audioPath = await downloadYouTubeAudio(videoUrl, videoId);
      transcriptResult = await transcribeAudio(audioPath);
    }

    const { chunks } = await saveVideoRecord({
      videoId,
      videoUrl,
      sourceType: "youtube",
      title: title || `YouTube Video ${videoId}`,
      transcript: transcriptResult.transcript,
      segments: transcriptResult.segments,
      meta: { transcriptSource: transcriptResult.source },
    });

    res.json({
      success: true,
      videoId,
      sourceType: "youtube",
      transcriptSource: transcriptResult.source,
      chunkCount: chunks.length,
      transcript: transcriptResult.transcript,
    });
  } catch (error) {
    console.error("Ingest route error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
});

router.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Missing video file" });
    }

    const ext = path.extname(req.file.originalname || "") || ".mp4";
    const videoId = `upload-${Date.now()}-${req.file.filename}`;
    const storedName = `${safeFileName(videoId)}${ext}`;
    const finalPath = path.join(uploadsDir, storedName);
    fs.renameSync(req.file.path, finalPath);

    const transcriptResult = await transcribeAudio(finalPath);
    const mediaUrl = `${getBaseUrl(req)}/uploads/${storedName}`;

    const { chunks } = await saveVideoRecord({
      videoId,
      videoUrl: mediaUrl,
      mediaUrl,
      sourceType: "upload",
      title: req.body.title || req.file.originalname || "Uploaded Video",
      transcript: transcriptResult.transcript,
      segments: transcriptResult.segments,
      meta: {
        originalName: req.file.originalname,
        transcriptSource: transcriptResult.source,
      },
    });

    res.json({
      success: true,
      videoId,
      sourceType: "upload",
      mediaUrl,
      transcriptSource: transcriptResult.source,
      chunkCount: chunks.length,
      transcript: transcriptResult.transcript,
    });
  } catch (error) {
    console.error("Upload ingest error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/reindex", async (req, res) => {
  try {
    const videos = await Video.find({ status: "done", transcript: { $exists: true } });
    let updated = 0;

    for (const video of videos) {
      const cleanedTranscript = cleanText(video.transcript || "");
      const chunks = buildChunksFromTranscript(cleanedTranscript, []);
      video.chunks = chunks;
      await video.save();
      updated += 1;
    }

    res.json({
      success: true,
      updated,
      message:
        "Existing transcripts were reindexed with estimated timestamps. Re-ingest videos to get exact caption/Whisper timestamps.",
    });
  } catch (error) {
    console.error("Reindex error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all videos
router.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find({})
      .select("videoId title url sourceType status ingestDate chunks transcript")
      .sort({ ingestDate: -1 })
      .limit(100);

    const formatted = videos.map((v) => ({
      _id: v._id,
      videoId: v.videoId,
      title: v.title,
      url: v.url,
      sourceType: v.sourceType,
      status: v.status,
      ingestDate: v.ingestDate,
      chunkCount: v.chunks?.length || 0,
      transcriptPreview: v.transcript?.slice(0, 200) + (v.transcript?.length > 200 ? "..." : ""),
    }));

    res.json({ success: true, videos: formatted, total: formatted.length });
  } catch (error) {
    console.error("List videos error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single video with full transcript
router.get("/videos/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await Video.findOne({ videoId });
    if (!video) {
      return res.status(404).json({ success: false, error: "Video not found" });
    }
    res.json({
      success: true,
      videoId: video.videoId,
      title: video.title,
      url: video.url,
      transcript: video.transcript,
      chunks: video.chunks,
      chunkCount: video.chunks?.length || 0,
      status: video.status,
      ingestDate: video.ingestDate,
    });
  } catch (error) {
    console.error("Get video error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a video
router.delete("/videos/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const result = await Video.findOneAndDelete({ videoId });
    if (!result) {
      return res.status(404).json({ success: false, error: "Video not found" });
    }
    res.json({ success: true, message: "Video deleted" });
  } catch (error) {
    console.error("Delete video error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
