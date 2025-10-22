const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { exec } = require("child_process");
const Video = require("../models/videoModel");

const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 🎧 Download YouTube audio
async function downloadAudio(videoUrl, videoId) {
  const outputPath = path.join(__dirname, `../temp/audio-${videoId}.mp3`);
  const formats = [
    "bestaudio[ext=m4a]",
    "bestaudio[ext=webm]",
    "bestaudio/best",
  ];

  for (const format of formats) {
    try {
      await new Promise((resolve, reject) => {
        const cmd = `yt-dlp -f "${format}" -x --audio-format mp3 -o "${outputPath}" "${videoUrl}" --no-playlist --no-warnings`;
        console.log(`🎧 Trying format: ${format}`);

        const proc = exec(cmd, async (error, stdout, stderr) => {
          if (error) {
            console.error("yt-dlp error:", stderr);
            return reject(new Error(`Download failed for format: ${format}`));
          }

          // wait for file to unlock (Windows fix)
          for (let i = 0; i < 5; i++) {
            if (fs.existsSync(outputPath)) {
              try {
                fs.accessSync(outputPath, fs.constants.R_OK);
                break;
              } catch {
                console.log("⏳ Waiting for file unlock...");
                await sleep(1000);
              }
            }
          }

          if (!fs.existsSync(outputPath))
            return reject(new Error("Audio file missing after download"));

          resolve();
        });

        proc.on("error", reject);
      });

      console.log("✅ Audio saved at:", outputPath);
      return outputPath;
    } catch (err) {
      console.warn(`⚠️ ${err.message}`);
    }
  }

  throw new Error("Audio download failed after trying all formats");
}

// 🧠 Transcription (Whisper → fallback to AssemblyAI)
async function fetchTranscript(videoId, videoUrl) {
  let audioPath = "";
  let finalTranscript = "";

  try {
    // 1️⃣ Download audio
    audioPath = await downloadAudio(videoUrl, videoId);
    const stats = fs.statSync(audioPath);

    // 2️⃣ If ≤25MB → use OpenAI Whisper
    if (stats.size <= 25 * 1024 * 1024) {
      console.log("🚀 Sending audio to OpenAI Whisper...");
      const formData = new FormData();
      formData.append("file", fs.createReadStream(audioPath));
      formData.append("model", "whisper-1");

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

      finalTranscript = response.data.text;
      console.log("✅ Transcript fetched successfully from Whisper!");
    } else {
      // 3️⃣ Otherwise → fallback to AssemblyAI
      console.warn("❌ Whisper failed: file too large → using AssemblyAI");
      console.log("⚙️ Uploading audio to AssemblyAI...");

      const audioData = fs.readFileSync(audioPath);
      const uploadRes = await axios.post(
        "https://api.assemblyai.com/v2/upload",
        audioData,
        {
          headers: {
            authorization: ASSEMBLYAI_API_KEY,
            "Transfer-Encoding": "chunked",
          },
        }
      );

      const uploadUrl = uploadRes.data.upload_url;
      console.log("🔗 Uploaded:", uploadUrl);

      console.log("🧠 Requesting transcription...");
      const transRes = await axios.post(
        "https://api.assemblyai.com/v2/transcript",
        {
          audio_url: uploadUrl,
          language_detection: true,
          punctuate: true,
          format_text: true,
          disfluencies: false,
        },
        { headers: { authorization: ASSEMBLYAI_API_KEY } }
      );

      const transcriptId = transRes.data.id;
      let status = "processing";

      while (status === "processing" || status === "queued") {
        await sleep(5000);
        const poll = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { authorization: ASSEMBLYAI_API_KEY } }
        );
        status = poll.data.status;

        if (status === "completed") {
          finalTranscript = poll.data.text;
          break;
        } else if (status === "error") {
          throw new Error(poll.data.error);
        }

        console.log("⏳ Waiting for transcription...");
      }

      console.log("✅ Transcript fetched successfully from AssemblyAI!");
    }

    // 4️⃣ Save to MongoDB
    await Video.findOneAndUpdate(
      { videoId },
      {
        videoId,
        videoUrl,
        transcript: finalTranscript,
        status: "done",
      },
      { upsert: true }
    );

    console.log("💾 Transcript saved to database!");
    return { success: true, transcript: finalTranscript };
  } catch (error) {
    console.error(
      "❌ fetchTranscript error:",
      error.response?.data || error.message
    );
    return { success: false, error: error.response?.data || error.message };
  } finally {
    // cleanup
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log("🧹 Cleaned up:", audioPath);
    }
  }
}

// 🚀 POST /api/ingest/process
router.post("/process", async (req, res) => {
  try {
    const { videoId, videoUrl } = req.body;
    if (!videoId || !videoUrl)
      return res
        .status(400)
        .json({ success: false, error: "Missing videoId or videoUrl" });

    const result = await fetchTranscript(videoId, videoUrl);
    res.json(result);
  } catch (error) {
    console.error("❌ ingest route error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
