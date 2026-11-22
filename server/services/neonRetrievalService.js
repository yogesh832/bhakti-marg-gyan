const { query } = require("../db/neonDb");
const { buildSearchQuery, buildPhraseQueries } = require('./hindiSearchQuery');

function normalizeQueryText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchNeonChunks(question, limit = 7) {
  if (!process.env.DATABASE_URL) return [];

  const cleanQ = normalizeQueryText(question);
  if (!cleanQ) return [];
  const searchQuery = buildSearchQuery(question);
  if (!searchQuery) return [];

  try {
    // Rank/limit matching chunks before fetching video metadata and continuations.
    const ftsSql = `
      WITH phrases AS MATERIALIZED (
        SELECT to_tsquery('simple', phrase) AS query FROM unnest($3::text[]) AS phrase
      ), ranked AS MATERIALIZED (
        SELECT c.*, ts_rank_cd(to_tsvector('simple', c.text), to_tsquery('simple', $1), 2) AS rank,
          (SELECT count(*) FROM phrases p WHERE to_tsvector('simple', c.text) @@ p.query) AS phrase_matches
        FROM transcript_chunks c
        WHERE to_tsvector('simple', c.text) @@ to_tsquery('simple', $1)
          AND EXISTS (SELECT 1 FROM videos v WHERE v.video_id = c.video_id AND v.status = 'done')
        ORDER BY phrase_matches DESC, rank DESC, c.video_id, c.chunk_index
        LIMIT $2
      )
      SELECT 
        c.video_id,
        v.title,
        v.url,
        v.media_url,
        v.source_type,
        c.chunk_id,
        c.chunk_index,
        c.start_time,
        c.end_time,
        c.text,
        c.cleaned_text,
        next_c.text AS continuation,
        next_c.end_time AS continuation_end_time,
        c.rank
      FROM ranked c
      JOIN videos v ON v.video_id = c.video_id
      LEFT JOIN transcript_chunks next_c ON next_c.video_id = c.video_id AND next_c.chunk_index = c.chunk_index + 1
      ORDER BY c.phrase_matches DESC, c.rank DESC, c.video_id, c.chunk_index;
    `;

    let res = await query(ftsSql, [searchQuery, limit, buildPhraseQueries(question)]);

    // 2. Fallback to ILIKE if full-text search yields no hits
    if (!res.rows || res.rows.length === 0) {
      const ilikeSql = `
        SELECT 
          c.video_id,
          v.title,
          v.url,
          v.media_url,
          v.source_type,
          c.chunk_id,
          c.chunk_index,
          c.start_time,
          c.end_time,
          c.text,
          c.cleaned_text,
          next_c.text AS continuation,
          next_c.end_time AS continuation_end_time,
          0.5 AS rank
        FROM transcript_chunks c
        JOIN videos v ON v.video_id = c.video_id
        LEFT JOIN transcript_chunks next_c ON next_c.video_id = c.video_id AND next_c.chunk_index = c.chunk_index + 1
        WHERE v.status = 'done'
          AND c.search_text ILIKE $1
        LIMIT $2;
      `;
      res = await query(ilikeSql, [`%${cleanQ}%`, limit]);
    }

    if (!res.rows || res.rows.length === 0) return [];

    return res.rows.map((row) => ({
      score: Math.max(0.5, row.rank || 0.5),
      videoId: row.video_id,
      title: row.title || `Video ${row.video_id}`,
      url: row.url,
      mediaUrl: row.media_url,
      sourceType: row.source_type || "youtube",
      startTime: Math.max(0, Math.floor(row.start_time || 0)),
      endTime: Math.max(Math.ceil(row.end_time || row.start_time + 45), Math.floor(row.start_time || 0) + 12),
      quote: row.text,
      chunkIndex: row.chunk_index,
      continuation: row.continuation && row.continuation.length > 30 ? row.continuation : null,
      continuationEndTime: row.continuation && row.continuation.length > 30
        ? Math.ceil(row.continuation_end_time || row.end_time || 0)
        : null,
    }));
  } catch (err) {
    console.warn("⚠️ Neon search query failed:", err.message);
    throw err;
  }
}

module.exports = {
  searchNeonChunks,
};
