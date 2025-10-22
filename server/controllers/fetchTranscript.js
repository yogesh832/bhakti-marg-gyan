const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");
const Video = require("../models/videoModel");

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 🎧 Download audio from YouTube
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
        const proc = exec(cmd, async (error) => {
          if (error) return reject(new Error(`Download failed: ${format}`));

          // Wait for Windows file unlock
          for (let i = 0; i < 5; i++) {
            if (fs.existsSync(outputPath)) {
              try {
                fs.accessSync(outputPath, fs.constants.R_OK);
                break;
              } catch {
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
      return outputPath;
    } catch {
      continue;
    }
  }

  throw new Error("Audio download failed in all formats");
}

// 🧠 Fetch transcript using AssemblyAI
async function fetchTranscript(videoId, videoUrl) {
  let audioPath = "";
  let finalTranscript = "";
  try {
    // 1️⃣ Download audio
    audioPath = await downloadAudio(videoUrl, videoId);

    // 2️⃣ Upload to AssemblyAI
    console.log("🚀 Uploading audio to AssemblyAI...");
    const audioStream = fs.createReadStream(audioPath);
    const uploadRes = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      audioStream,
      {
        headers: {
          authorization: ASSEMBLYAI_API_KEY,
          "Transfer-Encoding": "chunked",
        },
        maxBodyLength: Infinity,
      }
    );

    const uploadUrl = uploadRes.data.upload_url;
    console.log("✅ Uploaded successfully:", uploadUrl);

    // 3️⃣ Request transcription
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
    console.log(`📝 Transcription started (ID: ${transcriptId})`);

    // 4️⃣ Poll until complete
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
        console.log("✅ Transcription completed!");
        break;
      } else if (status === "error") {
        throw new Error(poll.data.error);
      }
    }

    // 5️⃣ Save transcript in MongoDB
    await Video.findOneAndUpdate(
      { videoId },
      {
        videoUrl,
        transcript: `
You are a knowledgeable assistant specializing in summarizing and answering questions from spiritual discourses.

Below is the transcript extracted from a YouTube video.
The transcript may contain Hindi, Sanskrit, or English words.

Please analyze it carefully and be ready to answer questions related to it.

When responding:
- Give answers clearly and precisely based on the transcript only.
- Preserve the tone of the speaker (e.g., devotional, philosophical).
- Format the output with clear spacing and paragraphs.
- Use line breaks between topics, numbered lists, or bold headings when relevant.

Transcript:
${finalTranscript}
`,
        status: "done",
      },
      { upsert: true }
    );

    console.log("💾 Transcript saved to database");
    return { success: true, transcript: finalTranscript };
  } catch (error) {
    console.error("❌ fetchTranscript error:", error.message);
    return { success: false, error: error.message };
  } finally {
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log(`🧹 Cleaned up: ${audioPath}`);
    }
  }
}

module.exports = fetchTranscript;




// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const FormData = require("form-data");
// const { exec } = require("child_process");
// const Video = require("../models/videoModel");

// // ENV keys assumed to be loaded elsewhere
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// // Downloads audio from YouTube video and saves as mp3
// async function downloadAudio(videoUrl, videoId) {
//   const outputPath = path.join(__dirname, `../temp/audio-${videoId}.mp3`);
//   const formats = [
//     "bestaudio[ext=m4a]",
//     "bestaudio[ext=webm]",
//     "bestaudio/best",
//   ];

//   for (const format of formats) {
//     try {
//       await new Promise((resolve, reject) => {
//         const cmd = `yt-dlp -f "${format}" -x --audio-format mp3 -o "${outputPath}" "${videoUrl}" --no-playlist --no-warnings`;
//         const proc = exec(cmd, async (error, stdout, stderr) => {
//           if (error)
//             return reject(new Error(`Download failed format: ${format}`));

//           // Wait for file unlock (Windows fix)
//           for (let i = 0; i < 5; i++) {
//             if (fs.existsSync(outputPath)) {
//               try {
//                 fs.accessSync(outputPath, fs.constants.R_OK);
//                 break;
//               } catch {
//                 await sleep(1000);
//               }
//             }
//           }
//           if (!fs.existsSync(outputPath))
//             return reject(new Error("Audio file missing after download"));
//           resolve();
//         });
//         proc.on("error", reject);
//       });
//       return outputPath;
//     } catch (err) {
//       // Try next format
//       continue;
//     }
//   }
//   throw new Error("Audio download failed after all formats");
// }

// // Main transcript workflow
// async function fetchTranscript(videoId, videoUrl) {
//   let audioPath = "";
//   let finalTranscript = "";
//   try {
//     audioPath = await downloadAudio(videoUrl, videoId);
//     const stats = fs.statSync(audioPath);

//     // Try Whisper first (if audio ≤25MB)
//     if (stats.size <= 25 * 1024 * 1024) {
//       const formData = new FormData();
//       formData.append("file", fs.createReadStream(audioPath));
//       formData.append("model", "whisper-1");
//       const response = await axios.post(
//         "https://api.openai.com/v1/audio/transcriptions",
//         formData,
//         {
//           headers: {
//             Authorization: `Bearer ${OPENAI_API_KEY}`,
//             ...formData.getHeaders(),
//           },
//           maxBodyLength: Infinity,
//         }
//       );
//       finalTranscript = response.data.text;
//     } else {
//       // Fallback: AssemblyAI for larger files
//       const audioData = fs.readFileSync(audioPath);
//       const uploadRes = await axios.post(
//         "https://api.assemblyai.com/v2/upload",
//         audioData,
//         {
//           headers: {
//             authorization: ASSEMBLYAI_API_KEY,
//             "Transfer-Encoding": "chunked",
//           },
//         }
//       );
//       const uploadUrl = uploadRes.data.upload_url;
//       const transRes = await axios.post(
//         "https://api.assemblyai.com/v2/transcript",
//         {
//           audio_url: uploadUrl,
//           language_detection: true,
//           punctuate: true,
//           format_text: true,
//           disfluencies: false,
//         },
//         { headers: { authorization: ASSEMBLYAI_API_KEY } }
//       );
//       const transcriptId = transRes.data.id;
//       let status = "processing";
//       while (status === "processing" || status === "queued") {
//         await sleep(5000);
//         const poll = await axios.get(
//           `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
//           { headers: { authorization: ASSEMBLYAI_API_KEY } }
//         );
//         status = poll.data.status;
//         if (status === "completed") {
//           finalTranscript = poll.data.text;
//           break;
//         } else if (status === "error") {
//           throw new Error(poll.data.error);
//         }
//       }
//     }

//     // Save to MongoDB
//     await Video.findOneAndUpdate(
//       { videoId },
//       {
//         videoUrl,
//         transcript: `
// You are a knowledgeable assistant specializing in summarizing and answering questions from spiritual discourses.

// Below is the transcript extracted from a YouTube video.
// The transcript may contain Hindi, Sanskrit, or English words.

// Please analyze it carefully and be ready to answer questions related to it.

// When responding:
// - Give answers clearly and precisely based on the transcript only.
// - Preserve the tone of the speaker (e.g., devotional, philosophical).
// - Format the output with clear spacing and paragraphs.
// - Use line breaks between topics, numbered lists, or bold headings when relevant.

// Transcript:
// ${finalTranscript}
// `,
//         status: "done",
//       },
//       { upsert: true }
//     );
//     return { success: true, transcript: finalTranscript };
//   } catch (error) {
//     return { success: false, error: error.message };
//   } finally {
//     if (audioPath && fs.existsSync(audioPath)) {
//       fs.unlinkSync(audioPath);
//     }
//   }
// }

// module.exports = fetchTranscript;
