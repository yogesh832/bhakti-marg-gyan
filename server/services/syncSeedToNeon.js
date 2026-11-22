const crypto = require("crypto");
const { getClient } = require("../db/neonDb");
const { requireQuality, VERSION, prepareTranscript } = require("./transcriptQuality");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const normalize = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// A video becomes searchable in Neon only after its complete chunk transaction commits.
async function syncSeedToNeon(video) {
  if (video.status !== "done" || !video.transcript?.trim() || !video.chunks?.length) throw new Error("Cannot sync incomplete video");
  const quality = video.meta?.quality;
  if (!quality?.passed || quality.version !== VERSION) throw new Error("Missing passed transcript quality gate");
  const prepared = prepareTranscript(video.chunks, quality.duration);
  if (video.chunks.map(c => c.text).join(" ") !== video.transcript) throw new Error("Transcript/chunk text mismatch");
  // Every caller, including legacy/import code, passes the same final boundary.
  video = { ...video, transcript: prepared.transcript, chunks: prepared.chunks };
  const client = await getClient();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO videos (video_id,title,url,source_type,status,language,transcript,transcript_hash,media_url,updated_at)
      VALUES ($1,$2,$3,$4,'done','hi',$5,$6,$7,NOW())
      ON CONFLICT (video_id) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,source_type=EXCLUDED.source_type,media_url=EXCLUDED.media_url,status='done',transcript=EXCLUDED.transcript,transcript_hash=EXCLUDED.transcript_hash,updated_at=NOW()`,
    [video.videoId, video.title, video.url, video.sourceType || "youtube", video.transcript, hash(video.transcript), video.mediaUrl || null]);
    // Replace chunks atomically so a retry cannot leave stale indices behind.
    await client.query("DELETE FROM transcript_chunks WHERE video_id=$1", [video.videoId]);
    for (let offset = 0; offset < video.chunks.length; offset += 50) {
      const values = [], params = [];
      for (const [i, chunk] of video.chunks.slice(offset, offset + 50).entries()) {
        const index = chunk.index ?? offset + i;
        const start = chunk.startTime || 0, end = chunk.endTime || 0;
        const text = chunk.text || "", cleaned = chunk.cleanedText || text;
        const base = params.length;
        values.push(`(${Array.from({ length: 10 }, (_, n) => `$${base + n + 1}`).join(",")})`);
        params.push(video.videoId, `${video.videoId}::${index}`, index, start, end, text, cleaned, normalize(cleaned), chunk.source || "estimated", hash(`${text}::${start}::${end}`));
      }
      await client.query(`INSERT INTO transcript_chunks (video_id,chunk_id,chunk_index,start_time,end_time,text,cleaned_text,search_text,source,content_hash) VALUES ${values.join(",")}`, params);
    }
    const check = await client.query("SELECT count(*)::int AS count FROM transcript_chunks WHERE video_id=$1", [video.videoId]);
    if (check.rows[0].count !== video.chunks.length) throw new Error("Neon chunk count mismatch");
    await client.query(`INSERT INTO transcript_quality(video_id,version,report) VALUES($1,$2,$3::jsonb)
      ON CONFLICT(video_id) DO UPDATE SET version=EXCLUDED.version,report=EXCLUDED.report,checked_at=NOW()`,
      [video.videoId, VERSION, JSON.stringify(prepared.quality)]);
    await client.query("COMMIT");
    return check.rows[0].count;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
module.exports = { syncSeedToNeon };
