const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const fg = require('fast-glob');
const { driver } = require('./neo4j');
const { config } = require('./config');
const { upsertChunkVectors, deleteVectorsByPaths } = require('./vectorStore');

function languageFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.json': 'json',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml',
  };
  return map[ext] || 'text';
}

function hashText(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

function maskPii(text) {
  if (!config.ingest.maskPii) return text;

  return String(text || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(\+?\d[\d\s\-()]{7,}\d)\b/g, '[REDACTED_PHONE]')
    .replace(/\b(sk-[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_\-]{20,})\b/g, '[REDACTED_SECRET]')
    .replace(/\b\d{9,16}\b/g, '[REDACTED_NUMBER]');
}

function splitChunks(lines, chunkSize, overlap) {
  const chunks = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + chunkSize);
    if (start >= end) break;
    chunks.push({
      startLine: start + 1,
      endLine: end,
      text: lines.slice(start, end).join('\n'),
    });
    if (end === lines.length) break;
  }
  return chunks;
}

function extractSymbols(content, filePath) {
  const results = [];
  const patterns = [
    { kind: 'class', regex: /class\s+([A-Za-z0-9_]+)/g },
    { kind: 'function', regex: /function\s+([A-Za-z0-9_]+)/g },
    { kind: 'function', regex: /const\s+([A-Za-z0-9_]+)\s*=\s*\(/g },
    { kind: 'function', regex: /async\s+function\s+([A-Za-z0-9_]+)/g },
  ];

  patterns.forEach(({ kind, regex }) => {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      results.push({
        key: `${filePath}:${kind}:${name}`,
        name,
        kind,
      });
    }
  });

  return results;
}

function extractImports(content) {
  const imports = new Set();
  const importRegex = /import\s+[^'"\n]+['"]([^'"]+)['"]/g;
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

  let m;
  while ((m = importRegex.exec(content)) !== null) imports.add(m[1]);
  while ((m = requireRegex.exec(content)) !== null) imports.add(m[1]);
  return Array.from(imports);
}

async function indexFile(projectRoot, relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  const stat = await fs.stat(absolutePath);
  if (stat.size > config.ingest.maxFileSize) {
    return { skipped: true, reason: 'too_large', relativePath };
  }

  const content = await fs.readFile(absolutePath, 'utf8');
  const contentHash = hashText(content);
  const language = languageFromExt(relativePath);
  const lines = content.split(/\r?\n/);
  const chunks = splitChunks(lines, config.ingest.chunkSizeLines, config.ingest.chunkOverlapLines);
  const symbols = extractSymbols(content, relativePath);
  const imports = extractImports(content);

  const session = driver.session();
  try {
    const hashCheck = await session.run(
      'MATCH (f:File {path: $path}) RETURN f.hash AS hash LIMIT 1',
      { path: relativePath }
    );

    const existingHash = hashCheck.records[0]?.get('hash');
    if (existingHash && existingHash === contentHash) {
      return { skipped: true, reason: 'unchanged', relativePath };
    }

    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MERGE (f:File {path: $path})
        SET f.language = $language,
            f.hash = $hash,
            f.updatedAt = datetime(),
            f.size = $size
        WITH f
        OPTIONAL MATCH (f)-[:HAS_CHUNK]->(old:Chunk)
        DETACH DELETE old
        `,
        { path: relativePath, language, hash: contentHash, size: stat.size }
      );

      await tx.run(
        `
        MATCH (f:File {path: $path})
        OPTIONAL MATCH (f)-[:DECLARES]->(s:Symbol)
        DETACH DELETE s
        `,
        { path: relativePath }
      );

      await tx.run(
        `
        MATCH (f:File {path: $path})
        OPTIONAL MATCH (f)-[r:IMPORTS]->(:ImportRef)
        DELETE r
        `,
        { path: relativePath }
      );

      for (let index = 0; index < chunks.length; index += 1) {
        const c = chunks[index];
        const chunkId = `${relativePath}#${c.startLine}-${c.endLine}`;
        await tx.run(
          `
          MATCH (f:File {path: $path})
          MERGE (c:Chunk {id: $id})
          SET c.text = $text,
              c.startLine = $startLine,
              c.endLine = $endLine,
              c.order = $order,
              c.updatedAt = datetime()
          MERGE (f)-[:HAS_CHUNK]->(c)
          `,
          {
            path: relativePath,
            id: chunkId,
            text: maskPii(c.text),
            startLine: c.startLine,
            endLine: c.endLine,
            order: index,
          }
        );
      }

      for (const symbol of symbols) {
        await tx.run(
          `
          MATCH (f:File {path: $path})
          MERGE (s:Symbol {key: $key})
          SET s.name = $name,
              s.kind = $kind,
              s.updatedAt = datetime()
          MERGE (f)-[:DECLARES]->(s)
          `,
          { path: relativePath, ...symbol }
        );
      }

      for (const source of imports) {
        await tx.run(
          `
          MATCH (f:File {path: $path})
          MERGE (i:ImportRef {source: $source})
          MERGE (f)-[:IMPORTS]->(i)
          `,
          { path: relativePath, source }
        );
      }
    });
  } finally {
    await session.close();
  }

  return {
    skipped: false,
    relativePath,
    language,
    chunks: chunks.length,
    symbols: symbols.length,
    imports: imports.length,
    chunkDocs: chunks.map((c) => ({
      id: `${relativePath}#${c.startLine}-${c.endLine}`,
      path: relativePath,
      language,
      startLine: c.startLine,
      endLine: c.endLine,
      text: maskPii(c.text),
    })),
  };
}

async function getExistingPaths() {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (f:File) RETURN f.path AS path');
    return result.records.map((r) => String(r.get('path')));
  } finally {
    await session.close();
  }
}

async function deleteFilesByPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return;

  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MATCH (f:File)
        WHERE f.path IN $paths
        OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:Chunk)
        OPTIONAL MATCH (f)-[:DECLARES]->(s:Symbol)
        OPTIONAL MATCH (f)-[:IMPORTS]->(i:ImportRef)
        DETACH DELETE f, c, s
        WITH collect(DISTINCT i) AS imports
        UNWIND imports AS imp
        WITH imp
        WHERE imp IS NOT NULL
        OPTIONAL MATCH (imp)<-[:IMPORTS]-(:File)
        WITH imp, count(*) AS refs
        WHERE refs = 0
        DETACH DELETE imp
        `,
        { paths }
      );
    });
  } finally {
    await session.close();
  }
}

async function ingestProject(options = {}, onProgress) {
  const projectRoot = options.projectRoot || config.ingest.projectRoot;
  const includeGlob = options.includeGlob || config.ingest.includeGlob;
  const excludeGlobs = options.excludeGlobs || config.ingest.excludeGlobs;

  const files = await fg(includeGlob, {
    cwd: projectRoot,
    ignore: excludeGlobs,
    onlyFiles: true,
    dot: false,
  });

  const summary = {
    projectRoot,
    totalFiles: files.length,
    indexedFiles: 0,
    skippedFiles: 0,
    totalChunks: 0,
    totalSymbols: 0,
    totalImports: 0,
    removedFiles: 0,
    skipped: [],
  };

  const indexedChunkDocs = [];

  const existingPaths = await getExistingPaths();
  const currentPathSet = new Set(files);
  const removedPaths = existingPaths.filter((oldPath) => !currentPathSet.has(oldPath));

  if (removedPaths.length > 0) {
    await deleteFilesByPaths(removedPaths);
    await deleteVectorsByPaths(removedPaths);
    summary.removedFiles = removedPaths.length;
  }

  for (let i = 0; i < files.length; i++) {
    const relativePath = files[i];
    try {
      const result = await indexFile(projectRoot, relativePath);
      if (result.skipped) {
        summary.skippedFiles += 1;
        summary.skipped.push({ path: result.relativePath, reason: result.reason });
      } else {
        summary.indexedFiles += 1;
        summary.totalChunks += result.chunks;
        summary.totalSymbols += result.symbols;
        summary.totalImports += result.imports;

        // BATCHING: Upsert ngay sau mỗi file thành công để tránh tràn bộ nhớ
        if (result.chunkDocs && result.chunkDocs.length > 0) {
          await upsertChunkVectors(result.chunkDocs);
        }
      }
    } catch (error) {
      summary.skippedFiles += 1;
      summary.skipped.push({ path: relativePath, reason: error.message });
    }

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: files.length,
        percent: Math.round(((i + 1) / files.length) * 100),
        currentFile: relativePath,
        indexedFiles: summary.indexedFiles,
        skippedFiles: summary.skippedFiles,
      });
    }
  }

  return summary;
}

module.exports = { ingestProject };
