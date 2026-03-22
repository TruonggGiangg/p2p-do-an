const { driver } = require('./neo4j');
const { config } = require('./config');
const { searchChunkVectors } = require('./vectorStore');

const STOP_WORDS = new Set([
  'la', 'là', 'o', 'ở', 'dau', 'đâu', 'nao', 'nào', 'cho', 'chỗ', 'vi', 'vì', 'sao', 'co', 'có',
  'roi', 'rồi', 'va', 'và', 'tu', 'từ', 'duoc', 'được', 'the', 'thế', 'nhu', 'như', 'is', 'are',
  'the', 'a', 'an', 'to', 'from', 'where', 'what', 'which', 'why', 'how', 'of', 'for', 'in', 'on'
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\-\s]/gu, ' ')
    .split(/\s+/)
    .filter((x) => x.length >= 2 && !STOP_WORDS.has(x))
    .slice(0, 30);
}

function normalizeForMatching(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

const QUERY_ALIAS_RULES = [
  { pattern: /\b(giai\s*ngan|disburse|disbursement)\b/, aliases: ['disbursement', 'disburse', 'borrower', 'escrow'] },
  { pattern: /\b(escrow|ky\s*quy|tai\s*khoan\s*dam\s*bao)\b/, aliases: ['escrow', 'escrowAccount'] },
  { pattern: /\b(khoan\s*vay|loan)\b/, aliases: ['loan', 'loanContract', 'fineractLoanId'] },
  { pattern: /\b(nha\s*dau\s*tu|lender|investor)\b/, aliases: ['lender', 'investor', 'investment'] },
  { pattern: /\b(nguoi\s*vay|borrower)\b/, aliases: ['borrower', 'client'] },
  { pattern: /\b(phi|fee)\b/, aliases: ['fee', 'charge', 'serviceFee'] },
  { pattern: /\b(transfer|chuyen\s*tien|chuyen\s*khoan)\b/, aliases: ['transfer', 'accounttransfers'] },
  { pattern: /\b(api|endpoint|route|duong\s*dan)\b/, aliases: ['api', 'endpoint', 'route', 'controller'] },
  { pattern: /\b(payload|request|response|body)\b/, aliases: ['payload', 'request', 'response'] },
  { pattern: /\b(webhook|callback)\b/, aliases: ['webhook', 'callback', 'notify'] },
  { pattern: /\b(fineract)\b/, aliases: ['fineract', 'accounttransfers', 'savingsaccounts'] },
  { pattern: /\b(loan\s*product|san\s*pham\s*vay|loanproduct)\b/, aliases: ['loanproduct', 'PostLoanProductsRequest', 'LoanProductsApiResource', 'loanProducts'] },
  { pattern: /\b(savings\s*product|san\s*pham\s*tiet\s*kiem|savingsproduct)\b/, aliases: ['savingsproduct', 'SavingsProductsApiResource', 'PostSavingsProductsRequest'] },
  { pattern: /\b(schema|field|truong|cot|column)\b/, aliases: ['schema', 'field', 'property', 'attribute'] },
];

function buildQueryExpansion(question) {
  const original = String(question || '').trim();
  const normalized = normalizeForMatching(original);
  const aliases = new Set();

  for (const rule of QUERY_ALIAS_RULES) {
    if (rule.pattern.test(normalized)) {
      for (const alias of rule.aliases) {
        aliases.add(alias);
      }
    }
  }

  const aliasText = Array.from(aliases).join(' ');
  const expandedQuestion = aliasText ? `${original} ${aliasText}` : original;
  const expandedTokens = tokenize(expandedQuestion);

  return {
    aliases: Array.from(aliases),
    expandedQuestion,
    expandedTokens,
  };
}

function buildFulltextQuery(tokens, operator = 'AND') {
  const safeTokens = (tokens || [])
    .map((token) => String(token || '').trim())
    .filter(Boolean)
    .map((token) => `"${token.replace(/["\\]/g, ' ')}"`);

  if (safeTokens.length === 0) return '';
  return safeTokens.join(` ${operator} `);
}

function detectQueryMode(question, tokens) {
  const q = String(question || '');
  const hasPathOrId = /(\.tsx?|\.jsx?|\.md|\/|\\|loan[_\-]?\d+|tx[-_]?\d+|\baccounttransfers\b|\bfineract\b|#\d+|\bid\b\s*[:=])/i.test(q);
  const hasApiIntent = /\b(api|endpoint|function|method|hàm|service|transfer|fee|payload|request|response)\b/i.test(q);
  if (hasPathOrId) return 'graph-first';
  if (hasApiIntent && (tokens || []).length <= 10) return 'graph-first';
  if ((tokens || []).length <= 3) return 'keyword-first';
  return 'hybrid';
}

function detectQueryIntent(question) {
  const q = String(question || '').toLowerCase();
  if (/\b(api|endpoint|route|function|method|service|payload|request|response|transfer|fee)\b/.test(q)) {
    return 'api';
  }
  if (/\b(flow|luong|quy\s*trinh|giai\s*ngan|disbursement|escrow|borrower|investor)\b/.test(q)) {
    return 'flow';
  }
  return 'general';
}

function pathCategory(path) {
  const normalizedPath = String(path || '').replace(/\\/g, '/').toLowerCase();

  if (/^(client|p2p-web|web-app)\//.test(normalizedPath)) {
    return 'client-app';
  }

  if (/(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(normalizedPath) || /\.(spec|test)\.[jt]sx?$/.test(normalizedPath)) {
    return 'test';
  }
  if (/(^|\/)(doc|docs)(\/|$)/.test(normalizedPath) || normalizedPath.endsWith('.md')) {
    return 'doc';
  }
  if (/^server\/interfaces\//.test(normalizedPath)) {
    return 'server-interface';
  }
  if (/^server\/(interators|interfaces|controllers|routes|services)\//.test(normalizedPath)) {
    return 'core-server';
  }
  if (/(^|\/)(script|scripts|setup|seed|migration)(\/|$)/.test(normalizedPath)) {
    return 'ops-script';
  }
  if (/^server\//.test(normalizedPath)) {
    return 'server';
  }
  return 'other';
}

function pathPriorMultiplier(path, intent) {
  const category = pathCategory(path);

  if (intent === 'api' || intent === 'flow') {
    if (category === 'core-server') return 1.50;
    if (category === 'server-interface') return 1.25;
    if (category === 'server') return 1.15;
    if (category === 'client-app') return 0.35;
    if (category === 'ops-script') return 0.20;
    if (category === 'test') return 0.25;
    if (category === 'doc') return 0.45;
    return 0.75;
  }

  if (intent === 'logic') {
    if (category === 'core-server') return 1.35;
    if (category === 'server-interface') return 1.15;
    if (category === 'server') return 1.10;
    if (category === 'client-app') return 0.55;
    if (category === 'ops-script') return 0.35;
    if (category === 'test') return 0.35;
    if (category === 'doc') return 0.60;
    return 0.85;
  }

  if (category === 'test') return 0.65;
  if (category === 'doc') return 0.80;
  return 1.0;
}

function buildRankMap(items) {
  const map = new Map();
  (items || []).forEach((item, index) => {
    map.set(item.id, index + 1);
  });
  return map;
}

function computeWeights(mode) {
  if (mode === 'graph-first') {
    return { keyword: 0.30, vector: 0.20, graph: 0.50 };
  }
  if (mode === 'vector-first') {
    return { keyword: 0.20, vector: 0.60, graph: 0.20 };
  }
  if (mode === 'keyword-first') {
    return { keyword: 0.55, vector: 0.20, graph: 0.25 };
  }

  return {
    keyword: Math.max(0, config.vector.keywordWeight || 0.45),
    vector: Math.max(0, config.vector.vectorWeight || 0.35),
    graph: Math.max(0, config.vector.graphWeight || 0.20),
  };
}

function applyRrfFusion({ keywordChunks, vectorChunks, graphChunks, mode, limit, intent }) {
  const rrfK = Math.max(1, config.vector.rrfK || 60);
  const weights = computeWeights(mode);

  const keywordRanks = buildRankMap(keywordChunks);
  const vectorRanks = buildRankMap(vectorChunks);
  const graphRanks = buildRankMap(graphChunks);

  const candidates = new Map();

  function upsert(item) {
    const existing = candidates.get(item.id);
    if (!existing) {
      candidates.set(item.id, { ...item });
      return;
    }

    if (!existing.text && item.text) existing.text = item.text;
    if (!existing.path && item.path) existing.path = item.path;
    if (!existing.language && item.language) existing.language = item.language;
    existing.startLine = Math.min(existing.startLine || Number.MAX_SAFE_INTEGER, item.startLine || Number.MAX_SAFE_INTEGER);
    existing.endLine = Math.max(existing.endLine || 0, item.endLine || 0);
    existing.keywordScore = Math.max(existing.keywordScore || 0, item.keywordScore || 0);
    existing.vectorScore = Math.max(existing.vectorScore || 0, item.vectorScore || 0);
    existing.graphScore = Math.max(existing.graphScore || 0, item.graphScore || 0);
  }

  [...keywordChunks, ...vectorChunks, ...graphChunks].forEach(upsert);

  const scored = Array.from(candidates.values()).map((item) => {
    const keywordRank = keywordRanks.get(item.id);
    const vectorRank = vectorRanks.get(item.id);
    const graphRank = graphRanks.get(item.id);

    const keywordRrf = keywordRank ? (weights.keyword / (rrfK + keywordRank)) : 0;
    const vectorRrf = vectorRank ? (weights.vector / (rrfK + vectorRank)) : 0;
    const graphRrf = graphRank ? (weights.graph / (rrfK + graphRank)) : 0;

    const baseScore = keywordRrf + vectorRrf + graphRrf;
    const prior = pathPriorMultiplier(item.path, intent);

    return {
      ...item,
      score: baseScore * prior,
      rrf: {
        keyword: keywordRrf,
        vector: vectorRrf,
        graph: graphRrf,
      },
      prior,
    };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);

  let ranked = sorted;
  if (intent === 'api' || intent === 'flow' || intent === 'logic') {
    const backendPreferred = sorted.filter((item) => {
      const category = pathCategory(item.path);
      return category === 'core-server' || category === 'server-interface' || category === 'server';
    });

    if (backendPreferred.length >= Math.max(2, Math.min(4, limit))) {
      ranked = backendPreferred;
    }
  }

  return {
    chunks: ranked.slice(0, limit),
    weights,
    rrfK,
  };
}

async function queryKeywordChunks(tokens, limit) {
  if (!tokens || tokens.length === 0) return [];

  const andQuery = buildFulltextQuery(tokens, 'AND');
  if (!andQuery) return [];

  const session = driver.session();
  try {
    let result = await session.run(
      `
      CALL db.index.fulltext.queryNodes('chunk_text_fulltext', $queryString)
      YIELD node, score
      MATCH (f:File)-[:HAS_CHUNK]->(node)
      RETURN f.path AS path,
             f.language AS language,
             node.startLine AS startLine,
             node.endLine AS endLine,
             node.text AS text,
             score
      ORDER BY score DESC, path ASC, startLine ASC
      LIMIT toInteger($limit)
      `,
      { queryString: andQuery, limit }
    );

    if (result.records.length === 0 && tokens.length > 1) {
      const orQuery = buildFulltextQuery(tokens, 'OR');
      result = await session.run(
        `
        CALL db.index.fulltext.queryNodes('chunk_text_fulltext', $queryString)
        YIELD node, score
        MATCH (f:File)-[:HAS_CHUNK]->(node)
        RETURN f.path AS path,
               f.language AS language,
               node.startLine AS startLine,
               node.endLine AS endLine,
               node.text AS text,
               score
        ORDER BY score DESC, path ASC, startLine ASC
        LIMIT toInteger($limit)
        `,
        { queryString: orQuery, limit }
      );
    }

    return result.records.map((r) => ({
      id: `${r.get('path')}#${Number(r.get('startLine'))}-${Number(r.get('endLine'))}`,
      path: r.get('path'),
      language: r.get('language'),
      startLine: Number(r.get('startLine')),
      endLine: Number(r.get('endLine')),
      text: r.get('text'),
      keywordScore: Number(r.get('score') || 0),
      vectorScore: 0,
      graphScore: 0,
    }));
  } finally {
    await session.close();
  }
}

async function queryPathHintChunks(tokens, limit) {
  const pathTokens = [...new Set((tokens || [])
    .map((token) => String(token || '').toLowerCase())
    .filter((token) => token.length >= 4))];

  if (pathTokens.length === 0) return [];

  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (f:File)-[:HAS_CHUNK]->(c:Chunk)
      WITH f, c, [token IN $tokens WHERE toLower(f.path) CONTAINS token] AS matched
      WHERE size(matched) > 0
      WITH f, c, size(matched) AS pathScore,
           reduce(hits = 0, token IN $tokens |
             hits + CASE WHEN toLower(c.text) CONTAINS token THEN 1 ELSE 0 END
           ) AS chunkRelevance
      ORDER BY pathScore DESC, chunkRelevance DESC, c.order ASC
      WITH f, pathScore, collect(c)[0] AS c
      WHERE c IS NOT NULL
      RETURN f.path AS path,
             f.language AS language,
             c.startLine AS startLine,
             c.endLine AS endLine,
             c.text AS text,
             pathScore
      ORDER BY pathScore DESC, path ASC
      LIMIT toInteger($limit)
      `,
      { tokens: pathTokens, limit }
    );

    return result.records.map((r) => ({
      id: `${r.get('path')}#${Number(r.get('startLine'))}-${Number(r.get('endLine'))}`,
      path: r.get('path'),
      language: r.get('language'),
      startLine: Number(r.get('startLine')),
      endLine: Number(r.get('endLine')),
      text: r.get('text'),
      keywordScore: Number(r.get('pathScore') || 0) * 3,
      vectorScore: 0,
      graphScore: 0,
    }));
  } finally {
    await session.close();
  }
}

function mergeKeywordLikeChunks(primary, secondary) {
  const merged = new Map();

  [...(primary || []), ...(secondary || [])].forEach((item) => {
    const existed = merged.get(item.id);
    if (!existed) {
      merged.set(item.id, { ...item });
      return;
    }

    existed.keywordScore = Math.max(Number(existed.keywordScore || 0), Number(item.keywordScore || 0));
    if (!existed.text && item.text) existed.text = item.text;
    if (!existed.path && item.path) existed.path = item.path;
    if (!existed.language && item.language) existed.language = item.language;
  });

  return Array.from(merged.values()).sort((a, b) => Number(b.keywordScore || 0) - Number(a.keywordScore || 0));
}

async function queryGraphChunks(tokens, limit) {
  if (!tokens || tokens.length === 0) return [];

  const session = driver.session();
  try {
    const result = await session.run(
      `
    MATCH (f:File)
    OPTIONAL MATCH (f)-[:DECLARES]->(s:Symbol)
    OPTIONAL MATCH (f)-[:IMPORTS]->(i:ImportRef)
    WITH f,
         collect(DISTINCT toLower(s.name)) AS symbolNames,
         collect(DISTINCT toLower(i.source)) AS importSources
    WITH f,
         reduce(score = 0, token IN $tokens |
           score
           + CASE WHEN any(name IN symbolNames WHERE name CONTAINS token) THEN 2 ELSE 0 END
           + CASE WHEN any(src IN importSources WHERE src CONTAINS token) THEN 1 ELSE 0 END
         ) AS graphScore
    WHERE graphScore > 0
    OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:Chunk)
    WITH f, graphScore, c,
         reduce(hits = 0, token IN $tokens |
           hits + CASE WHEN toLower(c.text) CONTAINS token THEN 1 ELSE 0 END
         ) AS chunkRelevance
    ORDER BY chunkRelevance DESC, c.order ASC
    WITH f, graphScore, collect(c)[0] AS c
    WHERE c IS NOT NULL
    RETURN f.path AS path,
           f.language AS language,
           c.startLine AS startLine,
           c.endLine AS endLine,
           c.text AS text,
           graphScore
    ORDER BY graphScore DESC, path ASC
        LIMIT toInteger($limit)
    `,
      { tokens, limit }
    );

    return result.records.map((r) => ({
      id: `${r.get('path')}#${Number(r.get('startLine'))}-${Number(r.get('endLine'))}`,
      path: r.get('path'),
      language: r.get('language'),
      startLine: Number(r.get('startLine')),
      endLine: Number(r.get('endLine')),
      text: r.get('text'),
      keywordScore: 0,
      vectorScore: 0,
      graphScore: Number(r.get('graphScore') || 0),
    }));
  } finally {
    await session.close();
  }
}

async function queryMemory(question, limit = 8) {
  const startTotal = Date.now();
  const originalTokens = tokenize(question);
  const expansion = buildQueryExpansion(question);
  const tokens = expansion.expandedTokens;
  const mode = detectQueryMode(question, originalTokens);
  const intent = detectQueryIntent(question);
  const timings = {
    keywordMs: 0,
    vectorMs: 0,
    graphMs: 0,
    rerankMs: 0,
    relatedMs: 0,
    totalMs: 0,
  };

  if (tokens.length === 0 && !config.vector.enabled) {
    return { chunks: [], related: [], tokens, strategy: 'keyword', mode, timings };
  }

  const topLimit = mode === 'graph-first'
    ? Math.max(limit * 3, 12)
    : mode === 'keyword-first'
      ? Math.max(limit * 3, 12)
      : Math.max(limit * 4, 16);

  const shouldRunKeyword = tokens.length > 0;
  const shouldRunPathHint = tokens.length > 0;
  const shouldRunGraph = tokens.length > 0 && (mode === 'graph-first' || mode === 'hybrid');
  const shouldRunVector = config.vector.enabled && (mode === 'hybrid' || mode === 'vector-first' || tokens.length === 0);

  const keywordPromise = shouldRunKeyword
    ? (() => {
      const keywordStart = Date.now();
      return queryKeywordChunks(tokens, topLimit).then((result) => {
        timings.keywordMs = Date.now() - keywordStart;
        return result;
      });
    })()
    : Promise.resolve([]);

  const vectorPromise = shouldRunVector
    ? (() => {
      const vectorStart = Date.now();
      return searchChunkVectors(expansion.expandedQuestion, topLimit).then((result) => {
        timings.vectorMs = Date.now() - vectorStart;
        return result;
      });
    })()
    : Promise.resolve([]);

  const graphPromise = shouldRunGraph
    ? (() => {
      const graphStart = Date.now();
      return queryGraphChunks(tokens, topLimit).then((result) => {
        timings.graphMs = Date.now() - graphStart;
        return result;
      });
    })()
    : Promise.resolve([]);

  const pathHintPromise = shouldRunPathHint
    ? queryPathHintChunks(tokens, topLimit)
    : Promise.resolve([]);

  const [keywordRaw, pathHintChunks, vectorRaw, graphChunks] = await Promise.all([
    keywordPromise,
    pathHintPromise,
    vectorPromise,
    graphPromise,
  ]);

  const keywordChunks = mergeKeywordLikeChunks(keywordRaw, pathHintChunks).slice(0, topLimit);

  const vectorChunks = (vectorRaw || [])
    .filter((item) => Number(item.score || 0) >= (config.vector.minVectorScore || 0))
    .map((item) => ({
      id: item.id,
      path: item.path,
      language: item.language,
      startLine: item.startLine,
      endLine: item.endLine,
      text: item.text,
      keywordScore: 0,
      vectorScore: Number(item.score || 0),
      graphScore: 0,
    }));

  const rerankStart = Date.now();
  const fusion = applyRrfFusion({
    keywordChunks,
    vectorChunks,
    graphChunks,
    mode,
    limit,
    intent,
  });
  const chunks = fusion.chunks;
  timings.rerankMs = Date.now() - rerankStart;

  const relatedStart = Date.now();
  const topPaths = [...new Set(chunks.map((c) => c.path).filter(Boolean))].slice(0, 10);
  let related = [];

  if (topPaths.length > 0) {
    const relatedSession = driver.session();
    let relatedResult;
    try {
      relatedResult = await relatedSession.run(
        `
        MATCH (f:File)
        WHERE f.path IN $paths
        OPTIONAL MATCH (f)-[:DECLARES]->(s:Symbol)
        OPTIONAL MATCH (f)-[:IMPORTS]->(i:ImportRef)
        RETURN f.path AS path,
               collect(DISTINCT {name: s.name, kind: s.kind}) AS symbols,
               collect(DISTINCT i.source) AS imports
        `,
        { paths: topPaths }
      );
    } finally {
      await relatedSession.close();
    }

    related = relatedResult.records.map((r) => ({
      path: r.get('path'),
      symbols: (r.get('symbols') || []).filter((s) => s && s.name),
      imports: (r.get('imports') || []).filter(Boolean),
    }));
  }
  timings.relatedMs = Date.now() - relatedStart;

  timings.totalMs = Date.now() - startTotal;

  return {
    tokens,
    originalTokens,
    aliases: expansion.aliases,
    chunks,
    related,
    strategy: [
      shouldRunKeyword ? 'keyword' : null,
      shouldRunVector ? 'vector' : null,
      shouldRunGraph ? 'graph' : null,
    ].filter(Boolean).join('+') || 'none',
    mode,
    intent,
    weights: fusion.weights,
    rrfK: fusion.rrfK,
    timings,
  };
}

module.exports = { queryMemory };
