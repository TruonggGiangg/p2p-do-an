const { config } = require('./config');

function compactSnippet(text, maxChars = 600) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function buildUsedFiles(result) {
  const seen = new Set();
  const files = [];

  for (const chunk of result.chunks || []) {
    const key = `${chunk.path}:${chunk.startLine}-${chunk.endLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push({
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score: Number(chunk.score || 0),
    });
  }

  return files;
}

function buildReasoningMode(result, providerUsed) {
  const mode = result.mode || 'unknown-mode';
  const intent = result.intent || 'general';
  return `${providerUsed}:${mode}:${intent}`;
}

function buildContextPack(question, result) {
  const sections = [];
  sections.push(`Question: ${question}`);
  sections.push(`Retrieval mode: ${result.mode}`);
  sections.push(`Retrieval strategy: ${result.strategy}`);
  sections.push(`Intent: ${result.intent || 'general'}`);
  sections.push(`Tokens: ${(result.tokens || []).join(', ') || '(none)'}`);
  sections.push('Top snippets:');

  (result.chunks || []).forEach((chunk, idx) => {
    sections.push(
      `${idx + 1}) ${chunk.path}:${chunk.startLine}-${chunk.endLine} | score=${Number(chunk.score || 0).toFixed(4)} | ${compactSnippet(chunk.text)}`
    );
  });

  sections.push('Related files:');
  (result.related || []).forEach((item) => {
    const symbols = (item.symbols || []).map((s) => `${s.kind}:${s.name}`).slice(0, 8).join(', ');
    const imports = (item.imports || []).slice(0, 8).join(', ');
    sections.push(`- ${item.path}`);
    sections.push(`  symbols: ${symbols || '(none)'}`);
    sections.push(`  imports: ${imports || '(none)'}`);
  });

  const maxChars = Math.max(2000, config.answer.maxContextChars || 12000);
  return sections.join('\n').slice(0, maxChars);
}

function buildExtractiveAnswer(question, result) {
  const topChunks = (result.chunks || []).slice(0, 3);
  if (!topChunks.length) {
    return {
      answer: 'I do not have enough code context to answer this question with confidence.',
      providerUsed: 'extractive',
      confidence: 'low',
    };
  }

  const bullets = topChunks.map((chunk, index) => {
    const snippet = compactSnippet(chunk.text, 260);
    return `${index + 1}. ${chunk.path}:${chunk.startLine}-${chunk.endLine} -> ${snippet}`;
  });

  return {
    answer: [
      `Based on retrieved project context, here are the most relevant code locations for: "${question}".`,
      ...bullets,
      'If you want, ask a narrower follow-up (specific API/function name) for a precise step-by-step flow explanation.',
    ].join('\n'),
    providerUsed: 'extractive',
    confidence: 'medium',
  };
}

async function callOpenAi(contextPack, question) {
  const apiKey = config.answer.openAiApiKey;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, config.answer.requestTimeoutMs || 20000));

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.answer.model,
        temperature: config.answer.temperature,
        messages: [
          {
            role: 'system',
            content:
              'You answer questions about a codebase using only provided context. If context is insufficient, say so. Avoid guessing. Include file paths when relevant.',
          },
          {
            role: 'user',
            content: `Question:\n${question}\n\nContext:\n${contextPack}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) {
      return null;
    }

    return {
      answer,
      providerUsed: 'openai',
      confidence: 'medium',
    };
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(contextPack, question) {
  const apiKey = config.answer.geminiApiKey;
  if (!apiKey) {
    return null;
  }

  const requestedModel = config.answer.geminiModel || 'gemini-1.5-flash';
  const candidateModels = [...new Set([
    requestedModel,
    'gemma-3-27b-it',
    'gemma-3-12b-it',
    'gemma-3-4b-it',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ])];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, config.answer.requestTimeoutMs || 20000));

  try {
    for (const model of candidateModels) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: 'You answer questions about a codebase using only provided context. If context is insufficient, say so. Avoid guessing. Include file paths when relevant.',
              },
            ],
          },
          generationConfig: {
            temperature: config.answer.temperature,
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Question:\n${question}\n\nContext:\n${contextPack}`,
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 404) {
          continue;
        }
        return null;
      }

      const data = await response.json();
      const answer = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('\n').trim();
      if (!answer) {
        continue;
      }

      return {
        answer,
        providerUsed: 'gemini',
        confidence: 'medium',
      };
    }

    return null;
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAgentAnswer(question, retrievalResult) {
  const contextPack = buildContextPack(question, retrievalResult);
  const provider = String(config.answer.provider || 'auto').toLowerCase();

  let generated = null;
  if (provider === 'openai') {
    generated = await callOpenAi(contextPack, question);
  }

  if (provider === 'gemini') {
    generated = await callGemini(contextPack, question);
  }

  if (provider === 'auto') {
    generated = await callOpenAi(contextPack, question);
    if (!generated) {
      generated = await callGemini(contextPack, question);
    }
  }

  if (!generated) {
    generated = buildExtractiveAnswer(question, retrievalResult);
  }

  const usedFiles = buildUsedFiles(retrievalResult);
  return {
    answer: generated.answer,
    usedFiles,
    reasoningMode: buildReasoningMode(retrievalResult, generated.providerUsed),
    providerUsed: generated.providerUsed,
    confidence: generated.confidence,
    contextPack,
  };
}

module.exports = { generateAgentAnswer, buildContextPack };
