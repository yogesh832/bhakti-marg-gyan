-- Safe repeatable migration for Bhakti Marg Gyan on Neon PostgreSQL

CREATE TABLE IF NOT EXISTS videos (
  video_id VARCHAR(255) PRIMARY KEY,
  title TEXT,
  url TEXT,
  media_url TEXT,
  source_type VARCHAR(50) DEFAULT 'youtube',
  status VARCHAR(50) DEFAULT 'done',
  language VARCHAR(50) DEFAULT 'hi',
  transcript TEXT,
  transcript_hash VARCHAR(64),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcript_chunks (
  id BIGSERIAL PRIMARY KEY,
  video_id VARCHAR(255) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
  chunk_id VARCHAR(255) NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  start_time DOUBLE PRECISION NOT NULL DEFAULT 0,
  end_time DOUBLE PRECISION NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  cleaned_text TEXT,
  search_text TEXT NOT NULL,
  source VARCHAR(50) DEFAULT 'estimated',
  content_hash VARCHAR(64) NOT NULL,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_video_chunk UNIQUE (video_id, chunk_id)
);

-- Video lookups
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos (status);

-- Sequential chunk lookup & adjacent chunk expansion
CREATE INDEX IF NOT EXISTS idx_chunks_video_index ON transcript_chunks (video_id, chunk_index);

-- Full text search index on search_text using 'simple' configuration (preserves Hindi Devanagari tokens)
CREATE INDEX IF NOT EXISTS idx_chunks_fts_simple ON transcript_chunks USING gin (to_tsvector('simple', search_text));
