const { QdrantClient } = require('@qdrant/js-client-rest');
const crypto = require('crypto');
const { config } = require('./config');
const { embedTexts } = require('./embeddings');

const qdrantClient = new QdrantClient({
  url: config.vector.qdrantUrl,
  checkCompatibility: false,
});

function pointIdFromChunkId(chunkId) {
  const hash = crypto.createHash('md5').update(String(chunkId)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function ensureVectorCollection() {
  if (!config.vector.enabled) return;

  const existing = await qdrantClient.getCollections();
  const names = (existing.collections || []).map((c) => c.name);
  if (names.includes(config.vector.collection)) return;

  await qdrantClient.createCollection(config.vector.collection, {
    vectors: {
      size: Math.max(64, config.vector.embeddingDimension || 384),
      distance: 'Cosine',
    },
  });
}

async function upsertChunkVectors(chunkDocs) {
  if (!config.vector.enabled || !Array.isArray(chunkDocs) || chunkDocs.length === 0) return;

  const texts = chunkDocs.map((c) => c.text);
  const vectors = await embedTexts(texts);

  const points = chunkDocs.map((chunk, index) => ({
    id: pointIdFromChunkId(chunk.id),
    vector: vectors[index],
    payload: {
      chunkId: chunk.id,
      path: chunk.path,
      language: chunk.language,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text,
    },
  }));

  await qdrantClient.upsert(config.vector.collection, {
    wait: true,
    points,
  });
}

async function searchChunkVectors(question, limit = 16) {
  if (!config.vector.enabled) return [];

  const [vector] = await embedTexts([question]);
  if (!vector) return [];

  const result = await qdrantClient.search(config.vector.collection, {
    vector,
    with_payload: true,
    limit,
  });

  return (result || []).map((item) => ({
    id: String(item.payload?.chunkId || item.id),
    score: Number(item.score || 0),
    path: item.payload?.path,
    language: item.payload?.language || 'text',
    startLine: Number(item.payload?.startLine || 1),
    endLine: Number(item.payload?.endLine || 1),
    text: String(item.payload?.text || ''),
  }));
}

async function deleteVectorsByPaths(paths) {
  if (!config.vector.enabled || !Array.isArray(paths) || paths.length === 0) return;

  for (const path of paths) {
    await qdrantClient.delete(config.vector.collection, {
      wait: true,
      filter: {
        must: [
          {
            key: 'path',
            match: { value: path },
          },
        ],
      },
    });
  }
}

async function resetVectorCollection() {
  if (!config.vector.enabled) return;

  const existing = await qdrantClient.getCollections();
  const names = (existing.collections || []).map((c) => c.name);

  if (names.includes(config.vector.collection)) {
    await qdrantClient.deleteCollection(config.vector.collection);
  }

  await ensureVectorCollection();
}

module.exports = {
  qdrantClient,
  ensureVectorCollection,
  upsertChunkVectors,
  searchChunkVectors,
  deleteVectorsByPaths,
  resetVectorCollection,
};
