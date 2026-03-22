const crypto = require('crypto');
const { config } = require('./config');

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\-\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function normalize(vector) {
  const sumSquares = vector.reduce((s, v) => s + (v * v), 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vector.map((v) => v / norm);
}

function localHashEmbedding(text, dim) {
  const tokens = tokenize(text);
  const vec = new Array(dim).fill(0);

  for (const token of tokens) {
    const digest = crypto.createHash('sha1').update(token).digest();
    const idx = digest.readUInt16BE(0) % dim;
    const sign = (digest[2] % 2 === 0) ? 1 : -1;
    vec[idx] += sign;
  }

  return normalize(vec);
}

async function embedWithOpenAI(texts) {
  const apiKey = config.vector.openAiApiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.vector.embeddingModel,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding error: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const vectors = (json.data || []).map((item) => item.embedding || []);
  return vectors.map((v) => normalize(v));
}

async function embedTexts(texts) {
  const safeTexts = (texts || []).map((t) => String(t || '').slice(0, 6000));
  if (safeTexts.length === 0) return [];

  if (config.vector.embeddingProvider === 'openai') {
    return embedWithOpenAI(safeTexts);
  }

  const dim = Math.max(64, config.vector.embeddingDimension || 384);
  return safeTexts.map((text) => localHashEmbedding(text, dim));
}

module.exports = { embedTexts };
