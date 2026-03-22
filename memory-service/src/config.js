const path = require('path');
require('dotenv').config();

function num(name, fallback) {
  const raw = process.env[name];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function csv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const config = {
  port: num('PORT', 5055),
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'neo4jpassword',
  },
  security: {
    webhookSecret: process.env.MEMORY_WEBHOOK_SECRET || '',
  },
  ingest: {
    projectRoot: process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..'),
    includeGlob: process.env.INGEST_GLOB || '**/*.{js,ts,tsx,jsx,json,md,yml,yaml}',
    excludeGlobs: csv('EXCLUDE_GLOBS', ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/coverage/**']),
    maxFileSize: num('MAX_FILE_SIZE_BYTES', 512 * 1024),
    chunkSizeLines: num('CHUNK_SIZE_LINES', 80),
    chunkOverlapLines: num('CHUNK_OVERLAP_LINES', 10),
    autoIngestEnabled: String(process.env.AUTO_INGEST_ENABLED || 'false') === 'true',
    autoIngestIntervalSec: num('AUTO_INGEST_INTERVAL_SEC', 900),
    maskPii: String(process.env.MASK_PII || 'true') === 'true',
  },
  observability: {
    metricWindowSize: num('METRIC_WINDOW_SIZE', 200),
  },
  vector: {
    enabled: String(process.env.VECTOR_ENABLED || 'true') === 'true',
    qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
    collection: process.env.QDRANT_COLLECTION || 'p2p_memory_chunks',
    embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local-hash',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingDimension: num('EMBEDDING_DIMENSION', 384),
    openAiApiKey: process.env.OPENAI_API_KEY || '',
    keywordWeight: Number(process.env.KEYWORD_WEIGHT || 0.55),
    vectorWeight: Number(process.env.VECTOR_WEIGHT || 0.45),
    graphWeight: Number(process.env.GRAPH_WEIGHT || 0.30),
    rrfK: num('RRF_K', 60),
    minVectorScore: Number(process.env.MIN_VECTOR_SCORE || 0.15),
  },
  answer: {
    provider: process.env.ANSWER_PROVIDER || 'auto',
    model: process.env.ANSWER_MODEL || 'gpt-4o-mini',
    geminiModel: process.env.ANSWER_GEMINI_MODEL || 'gemini-1.5-flash',
    maxContextChars: num('ANSWER_MAX_CONTEXT_CHARS', 12000),
    temperature: Number(process.env.ANSWER_TEMPERATURE || 0.1),
    openAiApiKey: process.env.ANSWER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    geminiApiKey: process.env.ANSWER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    requestTimeoutMs: num('ANSWER_TIMEOUT_MS', 20000),
    tmpDir: process.env.ANSWER_TMP_DIR || '',
    tmpCleanupEnabled: String(process.env.ANSWER_TMP_CLEANUP_ENABLED || 'true') === 'true',
    tmpTtlSec: num('ANSWER_TMP_TTL_SEC', 86400),
    tmpCleanupIntervalSec: num('ANSWER_TMP_CLEANUP_INTERVAL_SEC', 600),
  },
};

module.exports = { config };
