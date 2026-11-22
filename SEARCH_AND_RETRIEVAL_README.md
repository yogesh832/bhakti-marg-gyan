# Bhakti Marg Gyan — Search & Retrieval System

## Overview

This document explains how the system stores video transcripts, chunks them into searchable pieces, retrieves relevant content for a user's question, and generates an AI answer — using a **hybrid parallel retrieval** architecture (text + phrase + vector), strict source-grounded prompts, and configurable weights.

---

## High-Level Flow

```
User Question
     │
     ▼
Query Normalization
     │
     ▼
┌──────────────────────────────────────────────┐
│         Parallel Retrieval (Promise.all)      │
│  ┌────────────┬──────────────┬───────────┐ │
│  │ Text Search│ Phrase Search│  Vector   │ │
│  │ (MongoDB   │  (regex on   │  Search   │ │
│  │  $text)    │  cleaned     │  (MongoDB │ │
│  │            │  chunks)     │  Atlas    │ │
│  │            │              │  Vector   │ │
│  └────────────┴──────────────┴───────────┘ │
└──────────────────────────────────────────────┘
     │
     ▼
Candidate Merge + Deduplication
(videoId + chunkIndex key)
     │
     ▼
Relevance Ranking
(vectorScore×0.50 + textScore×0.25 + phraseScore×0.15 + keywordScore×0.10)
     │
     ▼
Adjacent Chunk Expansion
     │
     ▼
Confidence Threshold Check
     │
     ▼
Top 3–5 Segments → Context
     │
     ▼
Strict Source-Grounded Prompt
     │
     ▼
AI Generation (Gemini → Groq → OpenAI)
     │
     ▼
Answer + Source References + YouTube Timestamps
```

---

## Step-by-Step Breakdown

### 1. Ingestion — How Videos Are Stored

When a video is processed (`POST /api/ingest/process`):

| Stage | What Happens |
|---|---|
| **Transcript Source** | YouTube captions (Hindi first) **or** Whisper/AssemblyAI transcription |
| **Text Cleaning** | Repeated devotional words (राधा, भजन, etc.) and filler repetitions are normalized |
| **Chunking** | Transcript split into ~900-character segments with timestamps |
| **Deduplication** | Near-identical chunks (Jaccard similarity ≥ 0.7) merged, keeping longer version |
| **Embedding** | Each chunk gets a `text-embedding-3-large` vector via OpenAI, stored in MongoDB |
| **Storage** | Full transcript + chunks (with `cleanedText`, `chunkId`, `embedding`) in `Video` model |

**MongoDB Schema** (`Video` model):
```
videoId        — unique YouTube ID or generated ID
title          — video title
url            — original YouTube URL
mediaUrl       — hosted media URL
transcript     — full transcript text
chunks[]       — array of {
                  chunkId,        // stable ID: "${videoId}::${index}"
                  index,
                  startTime,
                  endTime,
                  text,
                  cleanedText,    // cleaned version for search
                  source,
                  embedding       // OpenAI vector, stored in MongoDB
                }
status         — "queued" | "processing" | "done" | "failed"
```

**Text Index** (used for candidate pre-filtering):
```javascript
videoSchema.index({ title: "text", transcript: "text", "chunks.text": "text" });
```

---

### 2. Query Normalization

Before searching, the user question is normalized:

```javascript
normalizeQuery("मेरे अंदर बहुत अहंकार है, इसे कैसे दूर करूं?")
// → {
//      original: "मेरे अंदर बहुत अहंकार है...",
//      cleaned: "मेरे अंदर बहुत अहंकार है इसे कैसे दूर करूं",
//      tokens: ["अंदर", "बहुत", "अहंकार", "दूर", "करूं"],
//      normalized: "अंदर बहुत अहंकार दूर करूं"
//    }
```

- Stop words removed (Hindi + English)
- Unicode variations normalized
- Whitespace collapsed
- User intent preserved — no expansion into unrelated concepts

---

### 3. Parallel Retrieval — Three Independent Paths

All three run concurrently via `Promise.all`:

#### 3a. Text Search — `textSearch()`
```
- MongoDB $text index on { title, transcript, "chunks.text" }
- Filter: status = "done"
- Each candidate chunk scored with token overlap + phrase bonus + Jaccard
- Returns top 20
```

#### 3b. Phrase Search — `phraseSearch()`
```
- Top 5 significant tokens extracted from question
- Regex search across all chunks in all done videos
- Proportion of phrase matches × Jaccard = phraseScore
- Returns top 10
```

#### 3c. Vector Search — `vectorSearch()`
```
- Query embedding: OpenAI text-embedding-3-large (lazy-loaded, cached)
- MongoDB Atlas $vectorSearch on chunks.embedding field
- Requires Atlas Search Index named "vector_index"
- Returns top 20 with similarity scores
- Gracefully skipped if OpenAI key missing or vector search unavailable
```

---

### 4. Candidate Merge + Deduplication

Results merged using key = `"${videoId}::${chunkIndex}"`:

```javascript
// Pseudocode
for (const r of textResults)  merged[r.key].textScore  = r.textScore
for (const r of phraseResults) merged[r.key].phraseScore = r.phraseScore
for (const r of vectorResults) merged[r.key].vectorScore = r.vectorScore
```

No chunk appears twice. When multiple paths score the same chunk, the highest score is kept.

---

### 5. Relevance Ranking — Combined Score

```javascript
combinedScore =
    vectorScore  * 0.50   // RAG_VECTOR_WEIGHT
  + textScore    * 0.25   // RAG_TEXT_WEIGHT
  + phraseScore  * 0.15   // RAG_PHRASE_WEIGHT
  + keywordScore * 0.10   // RAG_KEYWORD_WEIGHT
```

These are configurable via environment variables. Tunable using real user questions.

---

### 6. Adjacent Chunk Expansion

For highly-scored chunks (above `RAG_MIN_SCORE` threshold), neighboring chunks are included if they are part of the same discussion:

```javascript
// chunk 10 scored high
// check chunk 9 and chunk 11
// if they share the same topic, include them too
```

This prevents answers from being cut mid-sentence. Adjacent chunks score 70% of the parent's score.

---

### 7. Confidence Threshold Check

Before sending to AI:

```javascript
if (bestScore < RAG_MIN_SCORE) {
  return {
    answer: "उपलब्ध प्रवचनों में इस प्रश्न का स्पष्ट उत्तर नहीं मिला।",
    sources: [],
    sourceCount: 0
  }
}
```

Default threshold: `0.3`. Configurable via `RAG_MIN_SCORE`.

---

### 8. Strict Source-Grounded Prompt

The AI receives **no roleplay instructions**. It is an assistant explaining available source material:

```
You are a source-grounded spiritual Q&A assistant.

Answer ONLY from the provided retrieved transcript context.
The retrieved transcript is the only source of truth.

RULES:
- Do NOT use any pretrained spiritual knowledge, general knowledge, assumptions,
  or information not present in the retrieved sources below
- Do NOT invent teachings, practices, examples, explanations, conclusions,
  quotations, or instructions
- Do NOT speak as Maharaj Ji or any spiritual figure
- Do NOT claim "Maharaj Ji said..." unless the provided transcript explicitly supports it
- Do NOT add spiritual concepts not present in the retrieved sources
- Accuracy is more important than completeness
- Only use quotation marks for actual transcript text shown below
- If the retrieved sources do not clearly answer the question, say so honestly

[Language instruction]
[Tone instruction]

USER QUESTION: [question]

RETRIEVED SOURCES:
[Source 1]
Video: [title]
Timestamp: 2:13 – 3:45
"transcript excerpt..."

ANSWER:
```

---

### 9. AI Generation — Provider Fallback Chain

| Priority | Provider | Model | Config |
|---|---|---|---|
| 1st | Gemini | `gemini-1.5-flash` | `temperature: 0.3`, `max_tokens: 1200` |
| 2nd | Groq | `llama-3.3-70b-versatile` | `temperature: 0.3`, `max_tokens: 1200` |
| 3rd | OpenAI | `gpt-4o-mini` | `temperature: 0.3`, `max_tokens: 1200` |

Same grounding rules applied regardless of provider.

---

### 10. Response

```json
{
  "success": true,
  "retrievalMode": "hybrid",
  "totalVideos": 12,
  "candidateVideos": 5,
  "providers": ["Gemini"],
  "answer": "अभिमान के विषय में...",
  "sources": [
    {
      "videoId": "abc123",
      "title": "भक्ति मार्ग ग्यान",
      "url": "https://www.youtube.com/watch?v=abc123&t=150s",
      "mediaUrl": "https://.../abc123.mp3",
      "sourceType": "youtube",
      "startTime": 150,
      "endTime": 225,
      "quote": "अभिमान निकालना नहीं बल्कि परिवर्तन करना है...",
      "score": 0.91
    }
  ],
  "sourceCount": 3,
  "debug": {
    "retrievalMs": 187,
    "textCount": 12,
    "phraseCount": 5,
    "vectorCount": 3,
    "mergedCount": 18,
    "bestScore": 0.91,
    "weights": { "vector": 0.5, "text": 0.25, "phrase": 0.15, "keyword": 0.1 },
    "minScore": 0.3
  }
}
```

YouTube timestamp URLs are generated by the backend from `videoId + startTime` — the AI never generates URLs.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `RAG_VECTOR_WEIGHT` | `0.50` | Weight for vector search score |
| `RAG_TEXT_WEIGHT` | `0.25` | Weight for text/token score |
| `RAG_PHRASE_WEIGHT` | `0.15` | Weight for phrase match score |
| `RAG_KEYWORD_WEIGHT` | `0.10` | Weight for keyword overlap score |
| `RAG_MIN_SCORE` | `0.3` | Minimum score to generate an answer |
| `RAG_DEBUG` | `false` | Enable debug logging in response |

---

## File Map

| File | Role |
|---|---|
| `server/server.js` | Express app, MongoDB connection, route registration |
| `server/controllers/askController.js` | `/api/ask` — orchestrates retrieval + AI generation |
| `server/services/retrievalService.js` | Text + phrase + vector search, merge, rank, expand |
| `server/services/vectorService.js` | OpenAI embeddings, MongoDB Atlas Vector Search, cache |
| `server/models/videoModel.js` | Mongoose schema with text index + embedding field |
| `server/controllers/ingestController.js` | Video ingestion — transcript → chunks → embeddings → MongoDB |
| `server/config/seeds.json` | List of video URLs to auto-seed on startup |

---

## Atlas Vector Search Setup

To enable vector search, create an Atlas Search Index on the `videos` collection:

```javascript
{
  "fields": [
    {
      "path": "chunks.embedding",
      "type": "vector",
      "similarity": "cosine",
      "numDimensions": 3072   // text-embedding-3-large output dimension
    }
  ]
}
```

Name the index `vector_index` (or update `VECTOR_INDEX_NAME` in `vectorService.js`).

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| **MongoDB Atlas Vector Search** (not Pinecone) | Already using MongoDB; avoids a second service |
| **Lazy OpenAI init** | `OPENAI_API_KEY` may not be set; service must still start |
| **Query embedding cache** | Repeated identical questions avoid re-embedding |
| **Combined score, not only vector** | Lexical text search catches exact Hindi terminology that embeddings may miss |
| **Strict prompt (no roleplay)** | Prevents hallucination; every answer must be traceable to transcript |
| **3–5 chunks max** | Small context = higher focus, lower latency, less hallucination risk |
| **Adjacent expansion** | Prevents cutting mid-thought; AI sees complete sentences |
| **Backend-generated YouTube URLs** | AI cannot fabricate or misspell video links |
