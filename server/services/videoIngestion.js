const { prepareTranscript } = require("./transcriptQuality");
const { syncSeedToNeon } = require("./syncSeedToNeon");
async function saveVideoRecord({ segments, duration, ...record }) {
  const prepared = prepareTranscript(segments, duration);
  const video = { ...record, ...prepared, status: "done", meta: { ...record.meta, quality: prepared.quality } };
  const count = await syncSeedToNeon(video);
  return { ...video, chunks: prepared.chunks, chunkCount: count };
}
module.exports = { saveVideoRecord };
