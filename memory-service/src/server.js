const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { config } = require('./config');
const { ensureSchema, closeDriver, driver } = require('./neo4j');
const { ingestProject } = require('./indexer');
const { queryMemory } = require('./retrieval');
const { ensureVectorCollection, resetVectorCollection } = require('./vectorStore');
const { generateAgentAnswer } = require('./answerer');

function compactSnippet(text, maxChars = 500) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function buildAgentContext(question, result) {
  const lines = [];
  lines.push(`Question: ${question}`);
  lines.push(`Retrieval strategy: ${result.strategy || 'keyword'}`);
  lines.push(`Tokens: ${(result.tokens || []).join(', ') || '(none)'}`);
  lines.push('Top Snippets:');

  (result.chunks || []).forEach((chunk, idx) => {
    lines.push(
      `${idx + 1}. ${chunk.path}:${chunk.startLine}-${chunk.endLine} (score=${Number(chunk.score || 0).toFixed(4)}, kw=${Number(chunk.keywordScore || 0).toFixed(2)}, vec=${Number(chunk.vectorScore || 0).toFixed(4)}) | ${compactSnippet(chunk.text)}`
    );
  });

  lines.push('Related Files:');
  (result.related || []).forEach((item) => {
    const symbols = (item.symbols || []).map((s) => `${s.kind}:${s.name}`).slice(0, 8).join(', ');
    const imports = (item.imports || []).slice(0, 8).join(', ');
    lines.push(`- ${item.path}`);
    lines.push(`  symbols: ${symbols || '(none)'}`);
    lines.push(`  imports: ${imports || '(none)'}`);
  });

  return lines.join('\n');
}

function buildAnswerTmpText({ question, answerResult, retrievalResult }) {
  const lines = [];
  lines.push(`Question: ${question}`);
  lines.push(`Reasoning Mode: ${answerResult.reasoningMode}`);
  lines.push(`Provider Used: ${answerResult.providerUsed}`);
  lines.push(`Confidence: ${answerResult.confidence}`);
  lines.push('');
  lines.push('Answer:');
  lines.push(answerResult.answer || '(empty)');
  lines.push('');
  lines.push('Used Files:');

  (answerResult.usedFiles || []).forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.path}:${item.startLine}-${item.endLine} (score=${Number(item.score || 0).toFixed(4)})`);
  });

  lines.push('');
  lines.push('Retrieval:');
  lines.push(`- mode: ${retrievalResult.mode}`);
  lines.push(`- strategy: ${retrievalResult.strategy}`);
  lines.push(`- intent: ${retrievalResult.intent || 'general'}`);
  lines.push(`- timings: ${JSON.stringify(retrievalResult.timings || {}, null, 2)}`);

  return lines.join('\n');
}

function getAnswerTmpDir() {
  const configured = String(config.answer.tmpDir || '').trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  return path.resolve(process.cwd(), 'tmp', 'agent-answers');
}

async function cleanupAnswerTmpFiles() {
  if (!config.answer.tmpCleanupEnabled) {
    return { removed: 0, scanned: 0, skipped: true };
  }

  const baseDir = getAnswerTmpDir();
  const ttlMs = Math.max(60, config.answer.tmpTtlSec || 86400) * 1000;
  const cutoff = Date.now() - ttlMs;

  let entries;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { removed: 0, scanned: 0, skipped: false };
    }
    throw error;
  }

  let removed = 0;
  let scanned = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.txt')) {
      continue;
    }

    scanned += 1;
    const filePath = path.join(baseDir, entry.name);
    try {
      const stat = await fs.stat(filePath);
      if (Number(stat.mtimeMs || 0) < cutoff) {
        await fs.unlink(filePath);
        removed += 1;
      }
    } catch (_error) {
    }
  }

  return { removed, scanned, skipped: false };
}

async function writeAnswerTmpFile({ question, answerResult, retrievalResult }) {
  const baseDir = getAnswerTmpDir();
  await fs.mkdir(baseDir, { recursive: true });

  const safeDate = new Date().toISOString().replace(/[:.]/g, '-');
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const fileName = `answer-${safeDate}-${randomSuffix}.txt`;
  const filePath = path.join(baseDir, fileName);

  const fileContent = buildAnswerTmpText({
    question,
    answerResult,
    retrievalResult,
  });

  await fs.writeFile(filePath, fileContent, 'utf8');
  return { filePath, fileName };
}

async function bootstrap() {
  await ensureSchema();
  await ensureVectorCollection();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  let ingestInProgress = false;
  const metricWindowSize = Math.max(50, config.observability.metricWindowSize || 200);
  function createRecentMetrics() {
    return {
      ingestDurationsMs: [],
      retrievalDurationsMs: [],
      retrievalKeywordMs: [],
      retrievalVectorMs: [],
      retrievalGraphMs: [],
      retrievalRerankMs: [],
      retrievalRelatedMs: [],
      ingestErrors: 0,
      retrievalErrors: 0,
      lastRetrievalAt: null,
      lastIngestAt: null,
    };
  }

  function createLifetimeBucket() {
    return { count: 0, sumMs: 0, maxMs: 0 };
  }

  function createLifetimeMetrics() {
    return {
      ingest: createLifetimeBucket(),
      retrieval: createLifetimeBucket(),
      retrievalKeyword: createLifetimeBucket(),
      retrievalVector: createLifetimeBucket(),
      retrievalGraph: createLifetimeBucket(),
      retrievalRerank: createLifetimeBucket(),
      retrievalRelated: createLifetimeBucket(),
      ingestErrors: 0,
      retrievalErrors: 0,
      lastRetrievalAt: null,
      lastIngestAt: null,
    };
  }

  const metrics = {
    recent: createRecentMetrics(),
    lifetime: createLifetimeMetrics(),
  };

  function pushMetric(list, value) {
    list.push(value);
    if (list.length > metricWindowSize) list.shift();
  }

  function updateLifetime(bucket, value) {
    const safeValue = Number(value || 0);
    bucket.count += 1;
    bucket.sumMs += safeValue;
    bucket.maxMs = Math.max(bucket.maxMs, safeValue);
  }

  function summarize(list) {
    if (!list.length) return { count: 0, avgMs: 0, p95Ms: 0, maxMs: 0 };
    const sorted = [...list].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return {
      count: sorted.length,
      avgMs: Number((sum / sorted.length).toFixed(2)),
      p95Ms: sorted[p95Index],
      maxMs: sorted[sorted.length - 1],
    };
  }

  function summarizeLifetime(bucket) {
    if (!bucket || bucket.count === 0) return { count: 0, avgMs: 0, maxMs: 0 };
    return {
      count: bucket.count,
      avgMs: Number((bucket.sumMs / bucket.count).toFixed(2)),
      maxMs: bucket.maxMs,
    };
  }

  function recordIngestDuration(durationMs) {
    pushMetric(metrics.recent.ingestDurationsMs, durationMs);
    updateLifetime(metrics.lifetime.ingest, durationMs);
    const now = new Date().toISOString();
    metrics.recent.lastIngestAt = now;
    metrics.lifetime.lastIngestAt = now;
  }

  function recordRetrieval(result, durationMs) {
    pushMetric(metrics.recent.retrievalDurationsMs, durationMs);
    updateLifetime(metrics.lifetime.retrieval, durationMs);

    const keywordMs = result.timings?.keywordMs || 0;
    const vectorMs = result.timings?.vectorMs || 0;
    const graphMs = result.timings?.graphMs || 0;
    const rerankMs = result.timings?.rerankMs || 0;
    const relatedMs = result.timings?.relatedMs || 0;

    pushMetric(metrics.recent.retrievalKeywordMs, keywordMs);
    pushMetric(metrics.recent.retrievalVectorMs, vectorMs);
    pushMetric(metrics.recent.retrievalGraphMs, graphMs);
    pushMetric(metrics.recent.retrievalRerankMs, rerankMs);
    pushMetric(metrics.recent.retrievalRelatedMs, relatedMs);

    updateLifetime(metrics.lifetime.retrievalKeyword, keywordMs);
    updateLifetime(metrics.lifetime.retrievalVector, vectorMs);
    updateLifetime(metrics.lifetime.retrievalGraph, graphMs);
    updateLifetime(metrics.lifetime.retrievalRerank, rerankMs);
    updateLifetime(metrics.lifetime.retrievalRelated, relatedMs);

    const now = new Date().toISOString();
    metrics.recent.lastRetrievalAt = now;
    metrics.lifetime.lastRetrievalAt = now;
  }

  function resetRecentMetrics() {
    metrics.recent = createRecentMetrics();
  }

  function resetLifetimeMetrics() {
    metrics.lifetime = createLifetimeMetrics();
  }
  let lastIngest = {
    startedAt: null,
    finishedAt: null,
    status: 'idle',
    trigger: null,
    summary: null,
    error: null,
  };

  let ingestProgress = {
    current: 0,
    total: 0,
    percent: 0,
    currentFile: null,
    indexedFiles: 0,
    skippedFiles: 0,
  };

  async function runIngest(trigger, options = {}) {
    if (ingestInProgress) {
      return {
        queued: false,
        started: false,
        reason: 'ingest_already_running',
        lastIngest,
        progress: ingestProgress,
      };
    }

    ingestInProgress = true;
    ingestProgress = { current: 0, total: 0, percent: 0, currentFile: null, indexedFiles: 0, skippedFiles: 0 };
    lastIngest = {
      ...lastIngest,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'running',
      trigger,
      summary: null,
      error: null,
    };

    try {
      const startedAt = Date.now();
      const summary = await ingestProject({
        projectRoot: options.projectRoot,
        includeGlob: options.includeGlob,
        excludeGlobs: options.excludeGlobs,
      }, (progress) => {
        ingestProgress = { ...progress };
      });
      recordIngestDuration(Date.now() - startedAt);

      lastIngest = {
        ...lastIngest,
        finishedAt: new Date().toISOString(),
        status: 'success',
        summary,
      };

      return {
        queued: false,
        started: true,
        status: 'success',
        summary,
      };
    } catch (error) {
      metrics.recent.ingestErrors += 1;
      metrics.lifetime.ingestErrors += 1;
      lastIngest = {
        ...lastIngest,
        finishedAt: new Date().toISOString(),
        status: 'failed',
        error: error.message,
      };
      throw error;
    } finally {
      ingestInProgress = false;
    }
  }

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'p2p-memory-service',
      vectorEnabled: config.vector.enabled,
      embeddingProvider: config.vector.embeddingProvider,
      qdrantCollection: config.vector.collection,
    });
  });

  app.get('/memory/status', (_req, res) => {
    res.json({
      ok: true,
      ingestInProgress,
      lastIngest,
      progress: ingestInProgress ? ingestProgress : null,
      autoIngestEnabled: config.ingest.autoIngestEnabled,
      autoIngestIntervalSec: config.ingest.autoIngestIntervalSec,
      vectorEnabled: config.vector.enabled,
      embeddingProvider: config.vector.embeddingProvider,
    });
  });

  app.get('/memory/ingest/progress', (_req, res) => {
    res.json({
      ok: true,
      ingestInProgress,
      progress: ingestProgress,
      lastIngest: {
        status: lastIngest.status,
        trigger: lastIngest.trigger,
        startedAt: lastIngest.startedAt,
        finishedAt: lastIngest.finishedAt,
      },
    });
  });

  app.get('/metrics', (_req, res) => {
    const recentIngest = {
      ...summarize(metrics.recent.ingestDurationsMs),
      errors: metrics.recent.ingestErrors,
      lastAt: metrics.recent.lastIngestAt,
    };

    const recentRetrieval = {
      ...summarize(metrics.recent.retrievalDurationsMs),
      errors: metrics.recent.retrievalErrors,
      lastAt: metrics.recent.lastRetrievalAt,
      breakdown: {
        keyword: summarize(metrics.recent.retrievalKeywordMs),
        vector: summarize(metrics.recent.retrievalVectorMs),
        graph: summarize(metrics.recent.retrievalGraphMs),
        rerank: summarize(metrics.recent.retrievalRerankMs),
        related: summarize(metrics.recent.retrievalRelatedMs),
      },
    };

    const lifetimeIngest = {
      ...summarizeLifetime(metrics.lifetime.ingest),
      errors: metrics.lifetime.ingestErrors,
      lastAt: metrics.lifetime.lastIngestAt,
    };

    const lifetimeRetrieval = {
      ...summarizeLifetime(metrics.lifetime.retrieval),
      errors: metrics.lifetime.retrievalErrors,
      lastAt: metrics.lifetime.lastRetrievalAt,
      breakdown: {
        keyword: summarizeLifetime(metrics.lifetime.retrievalKeyword),
        vector: summarizeLifetime(metrics.lifetime.retrievalVector),
        graph: summarizeLifetime(metrics.lifetime.retrievalGraph),
        rerank: summarizeLifetime(metrics.lifetime.retrievalRerank),
        related: summarizeLifetime(metrics.lifetime.retrievalRelated),
      },
    };

    res.json({
      ok: true,
      ingest: recentIngest,
      retrieval: recentRetrieval,
      recent: {
        ingest: recentIngest,
        retrieval: recentRetrieval,
      },
      lifetime: {
        ingest: lifetimeIngest,
        retrieval: lifetimeRetrieval,
      },
      windowSize: metricWindowSize,
    });
  });

  app.post('/metrics/reset', (req, res) => {
    if (config.security.webhookSecret) {
      const incomingSecret = req.get('x-memory-secret') || '';
      if (incomingSecret !== config.security.webhookSecret) {
        return res.status(401).json({ ok: false, error: 'invalid reset secret' });
      }
    }

    const scope = String(req.body?.scope || 'recent').toLowerCase();
    if (scope !== 'recent' && scope !== 'all') {
      return res.status(400).json({ ok: false, error: 'scope must be "recent" or "all"' });
    }

    resetRecentMetrics();
    if (scope === 'all') {
      resetLifetimeMetrics();
    }

    return res.json({ ok: true, scope, resetAt: new Date().toISOString() });
  });

  app.post('/memory/ingest', async (req, res) => {
    try {
      const startedAt = Date.now();
      const outcome = await runIngest('manual_api', {
        projectRoot: req.body?.projectRoot,
        includeGlob: req.body?.includeGlob,
        excludeGlobs: req.body?.excludeGlobs,
      });

      if (!outcome.started) {
        return res.status(409).json({ ok: false, durationMs: Date.now() - startedAt, ...outcome });
      }

      return res.json({ ok: true, durationMs: Date.now() - startedAt, summary: outcome.summary });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/webhooks/git', async (req, res) => {
    try {
      if (config.security.webhookSecret) {
        const incomingSecret = req.get('x-memory-secret') || '';
        if (incomingSecret !== config.security.webhookSecret) {
          return res.status(401).json({ ok: false, error: 'invalid webhook secret' });
        }
      }

      const outcome = await runIngest('git_webhook', {
        projectRoot: req.body?.projectRoot,
        includeGlob: req.body?.includeGlob,
        excludeGlobs: req.body?.excludeGlobs,
      });

      if (!outcome.started) {
        return res.status(409).json({ ok: false, ...outcome });
      }

      return res.json({ ok: true, trigger: 'git_webhook', summary: outcome.summary });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/memory/query', async (req, res) => {
    try {
      const startedAt = Date.now();
      const question = String(req.body?.question || '').trim();
      const limit = Number(req.body?.limit || 8);
      if (!question) {
        return res.status(400).json({ ok: false, error: 'question is required' });
      }

      const result = await queryMemory(question, limit);
      recordRetrieval(result, Date.now() - startedAt);
      return res.json({ ok: true, result });
    } catch (error) {
      metrics.recent.retrievalErrors += 1;
      metrics.lifetime.retrievalErrors += 1;
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/agent/context', async (req, res) => {
    try {
      const startedAt = Date.now();
      const question = String(req.body?.question || '').trim();
      const limit = Number(req.body?.limit || 8);
      if (!question) {
        return res.status(400).json({ ok: false, error: 'question is required' });
      }

      const result = await queryMemory(question, limit);
      const contextText = buildAgentContext(question, result);
      recordRetrieval(result, Date.now() - startedAt);

      return res.json({
        ok: true,
        question,
        contextText,
        result,
      });
    } catch (error) {
      metrics.recent.retrievalErrors += 1;
      metrics.lifetime.retrievalErrors += 1;
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/agent/answer', async (req, res) => {
    try {
      const startedAt = Date.now();
      const question = String(req.body?.question || '').trim();
      const limit = Number(req.body?.limit || 8);
      const debug = Boolean(req.body?.debug);

      if (!question) {
        return res.status(400).json({ ok: false, error: 'question is required' });
      }

      const retrievalResult = await queryMemory(question, limit);
      recordRetrieval(retrievalResult, Date.now() - startedAt);

      const answerResult = await generateAgentAnswer(question, retrievalResult);
      const tmpFile = await writeAnswerTmpFile({
        question,
        answerResult,
        retrievalResult,
      });

      const response = {
        ok: true,
        question,
        answer: answerResult.answer,
        usedFiles: answerResult.usedFiles,
        reasoningMode: answerResult.reasoningMode,
        tmpFilePath: tmpFile.filePath,
        tmpFileName: tmpFile.fileName,
        tmpFileUrl: `/agent/answer/tmp/${encodeURIComponent(tmpFile.fileName)}`,
      };

      if (debug) {
        response.debug = {
          providerUsed: answerResult.providerUsed,
          confidence: answerResult.confidence,
          retrieval: retrievalResult,
          contextPack: answerResult.contextPack,
        };
      }

      return res.json(response);
    } catch (error) {
      metrics.recent.retrievalErrors += 1;
      metrics.lifetime.retrievalErrors += 1;
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/agent/answer/tmp/:fileName', async (req, res) => {
    try {
      const rawName = String(req.params.fileName || '');
      const fileName = path.basename(rawName);
      if (!fileName || fileName.includes('..')) {
        return res.status(400).json({ ok: false, error: 'invalid fileName' });
      }

      const baseDir = getAnswerTmpDir();
      const filePath = path.join(baseDir, fileName);
      const content = await fs.readFile(filePath, 'utf8');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(content);
    } catch (error) {
      return res.status(404).json({ ok: false, error: 'tmp file not found' });
    }
  });

  // --- Graph overview for UI visualization ---
  app.get('/memory/graph/overview', async (_req, res) => {
    const session = driver.session();
    try {
      // 1. All files with chunk/symbol/import counts
      const filesResult = await session.run(`
        MATCH (f:File)
        OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:Chunk)
        OPTIONAL MATCH (f)-[:DECLARES]->(s:Symbol)
        OPTIONAL MATCH (f)-[:IMPORTS]->(i:ImportRef)
        RETURN f.path AS path, f.language AS language, f.size AS size,
               count(DISTINCT c) AS chunks, count(DISTINCT s) AS symbols, count(DISTINCT i) AS imports
        ORDER BY f.path
      `);

      const files = filesResult.records.map(r => ({
        path: r.get('path'),
        language: r.get('language'),
        size: r.get('size')?.toNumber ? r.get('size').toNumber() : r.get('size'),
        chunks: r.get('chunks')?.toNumber ? r.get('chunks').toNumber() : r.get('chunks'),
        symbols: r.get('symbols')?.toNumber ? r.get('symbols').toNumber() : r.get('symbols'),
        imports: r.get('imports')?.toNumber ? r.get('imports').toNumber() : r.get('imports'),
      }));

      // 2. All symbols
      const symbolsResult = await session.run(`
        MATCH (f:File)-[:DECLARES]->(s:Symbol)
        RETURN s.name AS name, s.kind AS kind, f.path AS file
        ORDER BY s.kind, s.name
      `);

      const symbols = symbolsResult.records.map(r => ({
        name: r.get('name'),
        kind: r.get('kind'),
        file: r.get('file'),
      }));

      // 3. Import relationships
      const importsResult = await session.run(`
        MATCH (f:File)-[:IMPORTS]->(i:ImportRef)
        RETURN f.path AS file, i.source AS source
        ORDER BY f.path
      `);

      const imports = importsResult.records.map(r => ({
        file: r.get('file'),
        source: r.get('source'),
      }));

      // 4. Summary stats
      const statsResult = await session.run(`
        MATCH (f:File) WITH count(f) AS totalFiles
        OPTIONAL MATCH (c:Chunk) WITH totalFiles, count(c) AS totalChunks
        OPTIONAL MATCH (s:Symbol) WITH totalFiles, totalChunks, count(s) AS totalSymbols
        OPTIONAL MATCH (i:ImportRef) WITH totalFiles, totalChunks, totalSymbols, count(i) AS totalImports
        RETURN totalFiles, totalChunks, totalSymbols, totalImports
      `);

      const stats = statsResult.records.length > 0 ? {
        totalFiles: statsResult.records[0].get('totalFiles')?.toNumber ? statsResult.records[0].get('totalFiles').toNumber() : statsResult.records[0].get('totalFiles'),
        totalChunks: statsResult.records[0].get('totalChunks')?.toNumber ? statsResult.records[0].get('totalChunks').toNumber() : statsResult.records[0].get('totalChunks'),
        totalSymbols: statsResult.records[0].get('totalSymbols')?.toNumber ? statsResult.records[0].get('totalSymbols').toNumber() : statsResult.records[0].get('totalSymbols'),
        totalImports: statsResult.records[0].get('totalImports')?.toNumber ? statsResult.records[0].get('totalImports').toNumber() : statsResult.records[0].get('totalImports'),
      } : { totalFiles: 0, totalChunks: 0, totalSymbols: 0, totalImports: 0 };

      res.json({ ok: true, stats, files, symbols, imports });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    } finally {
      await session.close();
    }
  });

  // --- Serve static UI files ---
  app.use('/ui', express.static(path.join(__dirname, '..', 'ui')));

  app.post('/memory/reset', async (_req, res) => {
    const session = driver.session();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
      await ensureSchema();
      await resetVectorCollection();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    } finally {
      await session.close();
    }
  });

  const server = app.listen(config.port, () => {
    console.log(`[memory-service] listening on port ${config.port}`);
  });

  let autoIngestTimer = null;
  let tmpCleanupTimer = null;
  if (config.ingest.autoIngestEnabled) {
    const intervalMs = Math.max(30, config.ingest.autoIngestIntervalSec) * 1000;
    console.log(`[memory-service] auto-ingest enabled, interval=${Math.floor(intervalMs / 1000)}s`);
    autoIngestTimer = setInterval(() => {
      runIngest('auto_timer').catch((error) => {
        console.error('[memory-service] auto-ingest failed:', error.message);
      });
    }, intervalMs);
  }

  if (config.answer.tmpCleanupEnabled) {
    const intervalMs = Math.max(30, config.answer.tmpCleanupIntervalSec || 600) * 1000;
    cleanupAnswerTmpFiles().catch((error) => {
      console.error('[memory-service] tmp cleanup failed:', error.message);
    });
    tmpCleanupTimer = setInterval(() => {
      cleanupAnswerTmpFiles().catch((error) => {
        console.error('[memory-service] tmp cleanup failed:', error.message);
      });
    }, intervalMs);
  }

  async function shutdown() {
    if (autoIngestTimer) {
      clearInterval(autoIngestTimer);
    }
    if (tmpCleanupTimer) {
      clearInterval(tmpCleanupTimer);
    }
    server.close(async () => {
      await closeDriver();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('[memory-service] failed to start:', error);
  process.exit(1);
});
