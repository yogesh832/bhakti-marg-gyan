const { PineconeClient } = require("@pinecone-database/pinecone");
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const pinecone = new PineconeClient();
async function init() {
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENV || undefined,
  });
}

async function upsert(videoId, chunks) {
  const index = pinecone.Index(process.env.PINECONE_INDEX);
  const vectors = [];
  for (const c of chunks) {
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: c.text,
    });
    vectors.push({
      id: `${videoId}::${c.index}`,
      values: emb.data[0].embedding,
      metadata: {
        videoId,
        index: c.index,
        startTime: c.startTime,
        endTime: c.endTime,
        text: c.text,
      },
    });
  }
  await index.upsert({ upsertRequest: { vectors } });
}

async function query(videoId, queryText, topK = 4) {
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: queryText,
  });
  const vec = emb.data[0].embedding;
  const index = pinecone.Index(process.env.PINECONE_INDEX);
  const qres = await index.query({
    queryRequest: { vector: vec, topK, includeMetadata: true },
  });
  return qres.matches.map((m) => ({ score: m.score, metadata: m.metadata }));
}

module.exports = { init, upsert, query };
