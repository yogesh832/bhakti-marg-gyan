-- Run outside a transaction; preserves transcript data and serves concurrent reads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_original_text_fts
ON transcript_chunks USING gin (to_tsvector('simple', text));
