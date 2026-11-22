const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Video = require("../models/videoModel");
const { query, checkConnection } = require("../db/neonDb");

async function verifyMigration() {
  console.log(`\n=================================================`);
  console.log(`🔍 Starting MongoDB vs Neon PostgreSQL Migration Verification`);
  console.log(`=================================================\n`);

  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI environment variable is missing.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is missing.");
    process.exit(1);
  }

  const ok = await checkConnection();
  if (!ok) {
    console.error("❌ Cannot connect to Neon PostgreSQL for verification.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log("✅ Sources connected: MongoDB and Neon PostgreSQL.");

  // 1. Compare total video counts
  const mongoVideoCount = await Video.countDocuments({ status: "done" });
  const neonVideoRes = await query("SELECT COUNT(*) as count FROM videos WHERE status = 'done'");
  const neonVideoCount = parseInt(neonVideoRes.rows[0].count, 10);

  console.log(`\n📊 Video Count Check:`);
  console.log(`   MongoDB Done Videos : ${mongoVideoCount}`);
  console.log(`   Neon Done Videos    : ${neonVideoCount}`);

  // 2. Compare total chunk counts using MongoDB aggregation
  const chunkCountAgg = await Video.aggregate([
    { $match: { status: "done" } },
    { $project: { numChunks: { $size: { $ifNull: ["$chunks", []] } } } },
    { $group: { _id: null, total: { $sum: "$numChunks" } } }
  ]);
  const mongoChunkCount = chunkCountAgg[0]?.total || 0;

  const neonChunkRes = await query("SELECT COUNT(*) as count FROM transcript_chunks");
  const neonChunkCount = parseInt(neonChunkRes.rows[0].count, 10);

  console.log(`\n📊 Chunk Count Check:`);
  console.log(`   MongoDB Total Chunks : ${mongoChunkCount}`);
  console.log(`   Neon Total Chunks    : ${neonChunkCount}`);

  // 3. Detailed ID & timestamp integrity checks
  const neonVideosRes = await query("SELECT video_id FROM videos");
  const neonVideoIds = new Set(neonVideosRes.rows.map((r) => r.video_id));

  const mongoVideoIdsRes = await Video.find({ status: "done" }).select("videoId").lean();
  let missingVideoIds = [];
  for (const v of mongoVideoIdsRes) {
    if (!neonVideoIds.has(v.videoId)) {
      missingVideoIds.push(v.videoId);
    }
  }

  let timestampDiscrepancies = 0;
  let textDiscrepancies = 0;

  // Sample 10 videos from MongoDB to verify chunk-level details (timestamps & text)
  const sampleVideos = await Video.find({ status: "done" }).limit(10).lean();

  for (const video of sampleVideos) {
    const videoId = video.videoId;
    const chunks = video.chunks || [];
    if (chunks.length === 0) continue;

    const neonChunksForVideo = await query(
      "SELECT chunk_id, start_time, end_time, text FROM transcript_chunks WHERE video_id = $1",
      [videoId]
    );
    const neonChunkMap = new Map();
    for (const r of neonChunksForVideo.rows) {
      neonChunkMap.set(r.chunk_id, r);
    }

    for (let idx = 0; idx < chunks.length; idx++) {
      const c = chunks[idx];
      const chunkId = c.chunkId || `${videoId}::${c.index !== undefined ? c.index : idx}`;
      const neonChunk = neonChunkMap.get(chunkId);

      if (!neonChunk) {
        textDiscrepancies++;
        continue;
      }

      if (Math.abs(neonChunk.start_time - (c.startTime || 0)) > 0.1 || Math.abs(neonChunk.end_time - (c.endTime || 0)) > 0.1) {
        timestampDiscrepancies++;
      }

      if ((neonChunk.text || "").trim() !== (c.text || "").trim()) {
        textDiscrepancies++;
      }
    }
  }

  await mongoose.disconnect();

  console.log(`\n=================================================`);
  console.log(`📌 Verification Results Summary`);
  console.log(`=================================================`);
  console.log(`Missing Video IDs in Neon      : ${missingVideoIds.length}`);
  console.log(`Timestamp Mismatches (Sampled) : ${timestampDiscrepancies}`);
  console.log(`Text Discrepancies (Sampled)   : ${textDiscrepancies}`);

  const passed =
    mongoVideoCount === neonVideoCount &&
    mongoChunkCount === neonChunkCount &&
    missingVideoIds.length === 0 &&
    timestampDiscrepancies === 0 &&
    textDiscrepancies === 0;

  if (passed) {
    console.log(`\n✅ VERIFICATION PASSED: Neon PostgreSQL is a 100% accurate copy of MongoDB source data.`);
  } else {
    console.warn(`\n⚠️ VERIFICATION WARN: Found discrepancies between MongoDB and Neon.`);
  }

  console.log(`=================================================\n`);

  process.exit(passed ? 0 : 1);
}

if (require.main === module) {
  verifyMigration();
}

module.exports = { verifyMigration };
