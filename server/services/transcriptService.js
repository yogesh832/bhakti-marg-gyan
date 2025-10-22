const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const TEMP_DIR = path.join(__dirname, "..", "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const EDENAI_API_KEY = process.env.EDENAI_API_KEY;

// 🎧 Download audio using yt-dlp
const downloadAudio = (videoUrl) => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(TEMP_DIR, `audio-${Date.now()}.mp3`);
    const command = `yt-dlp -f "bestaudio" -x --audio-format mp3 -o "${outputPath}" "${videoUrl}" --no-playlist --no-warnings`;

    console.log("🎧 Downloading audio with yt-dlp...");
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("yt-dlp error:", stderr);
        return reject(new Error("Failed to download audio"));
      }
      resolve(outputPath);
    });
  });
};

// 🧠 Fetch transcript from Eden AI
exports.fetchTranscript = async (videoId, videoUrl) => {
  try {
    console.log("🎥 Processing:", videoUrl);

    // 1️⃣ Download audio
    const audioPath = await downloadAudio(videoUrl);
    console.log("✅ Audio saved at:", audioPath);

    // 2️⃣ Convert to Base64
    const audioData = fs.readFileSync(audioPath);
    const base64Audio = audioData.toString("base64");

    // 3️⃣ Submit transcription job
    console.log("🚀 Sending audio to Eden AI...");
    const jobResponse = await axios.post(
      "https://api.edenai.run/v2/audio/speech_to_text_async",
      {
        providers: ["openai"],
        language: "en",
        file: base64Audio, // correct key
      },
      {
        headers: {
          Authorization: `Bearer ${EDENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const jobId = jobResponse.data.public_id;
    console.log("🕒 Job submitted:", jobId);

    // 4️⃣ Poll until job completes
    let result;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000)); // wait 3 sec between checks
      const statusRes = await axios.get(
        `https://api.edenai.run/v2/audio/speech_to_text_async/${jobId}`,
        {
          headers: { Authorization: `Bearer ${EDENAI_API_KEY}` },
        }
      );

      if (statusRes.data.status === "succeeded") {
        result = statusRes.data;
        break;
      } else {
        console.log(`⌛ Status: ${statusRes.data.status} (check ${i + 1}/10)`);
      }
    }

    // 5️⃣ Cleanup temp file
    fs.unlinkSync(audioPath);

    if (!result) {
      throw new Error("Transcription job did not complete in time.");
    }

    console.log("✅ Transcript fetched successfully");
    return {
      success: true,
      videoId,
      transcript: result.result?.openai?.text || "No transcript found",
    };
  } catch (error) {
    console.error(
      "❌ fetchTranscript error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};
