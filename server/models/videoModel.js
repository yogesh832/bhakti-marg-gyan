const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema(
  {
    index: Number,
    startTime: Number,
    endTime: Number,
    text: String,
  },
  { _id: false }
);

const videoSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true },
  url: String,
  title: String,
  channel: String,
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

module.exports = mongoose.model("Video", videoSchema);
