const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema(
  {
    index: Number,
    startTime: Number,
    endTime: Number,
    text: String,
    source: {
      type: String,
      enum: ["youtube-caption", "whisper", "assemblyai", "estimated"],
      default: "estimated",
    },
  },
  { _id: false }
);

const videoSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true },
  url: String,
  mediaUrl: String,
  title: String,
  channel: String,
  sourceType: {
    type: String,
    enum: ["youtube", "upload"],
    default: "youtube",
  },
  ingestDate: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["queued", "processing", "done", "failed"],
    default: "queued",
  },
  transcript: String,
  chunks: [chunkSchema],
  meta: {},
});

videoSchema.index({
  title: "text",
  transcript: "text",
  "chunks.text": "text",
});

module.exports = mongoose.model("Video", videoSchema);
