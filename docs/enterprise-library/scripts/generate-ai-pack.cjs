const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports');
const AI_DIR = path.join(EXPORTS_DIR, 'ai');
const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const yaml = match[1];
  const fm = {};
  let currentKey = null;
  const lines = yaml.split('\n');
  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let value = kvMatch[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean);
      }
      if (value === '') {
        fm[currentKey] = {};
      } else {
        fm[currentKey] = value;
      }
    } else if (currentKey && typeof fm[currentKey] === 'object') {
      const nestedMatch = line.match(/^\s+(\w+):\s*(.+)$/);
      if (nestedMatch) {
        let value = nestedMatch[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean);
        }
        fm[currentKey][nestedMatch[1]] = value;
      }
    }
  }
  return fm;
}

function extractSummary(content) {
  const lines = content.split('\n');
  const summaryLines = [];
  let inCode = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (line.trim().startsWith('#')) continue;
    if (line.trim().startsWith('---')) continue;
    if (line.trim() === '') continue;
    if (line.trim().startsWith('|')) continue;
    summaryLines.push(line.trim().replace(/\*\*/g, ''));
    if (summaryLines.length >= 15) break;
  }
  return summaryLines.join(' ').substring(0, 500);
}

function extractRoutes(content) {
  const routes = [];
  const routeRegex = /\|\s*(\d+)\s*\|\s*(\w+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = routeRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 300);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Method') && ctx.includes('Path')) {
      routes.push({
        method: m[2].trim(),
        path: m[3].trim().replace(/`/g, ''),
        permission: m[4].trim().replace(/`/g, '').split(',').map(s => s.trim()).join(', '),
        description: m[5].trim()
      });
    }
  }
  return routes;
}

function extractEntities(content) {
  const entities = [];
  const entityRegex = /\|\s*(\w[\w\s]*)\s*\|\s*`(\w+)`\s*\|\s*([^|]+)\s*\|/g;
  let m;
  while ((m = entityRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 300);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Entity') && ctx.includes('Table')) {
      entities.push({ name: m[1].trim(), table: m[2].trim(), fields: m[3].trim().split(',').map(s => s.trim().replace(/`/g, '')) });
    }
  }
  return entities;
}

function extractEvents(content) {
  const events = [];
  const eventRegex = /`([a-z]+(?:\.[a-z]+)?:[a-z_]+)`\s*[—–-]?\s*(.+?)(?:\n|$)/gi;
  let m;
  while ((m = eventRegex.exec(content)) !== null) {
    if (!events.find(e => e.name === m[1].trim())) {
      events.push({ name: m[1].trim(), description: m[2].trim() });
    }
  }
  const tableEventRegex = /\|\s*`([\w:]+)`\s*\|\s*(\w[\w\s]*)\s*\|\s*(\w[\w\s,]*)\s*\|/g;
  while ((m = tableEventRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 200);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Event') && ctx.includes('Publisher')) {
      if (!events.find(e => e.name === m[1].trim())) {
        events.push({ name: m[1].trim(), publisher: m[2].trim(), consumers: m[3].trim().split(',').map(s => s.trim()) });
      }
    }
  }
  return events;
}

function extractPermissions(content) {
  const perms = [];
  const permTableRegex = /\|\s*`([\w.*-]+)`\s*\|\s*(\w+)\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = permTableRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 200);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Permission') && ctx.includes('Type')) {
      if (!perms.find(p => p.permission === m[1].trim())) {
        perms.push({ permission: m[1].trim(), type: m[2].trim(), component: m[3].trim() });
      }
    }
  }
  const inlinePermRegex = /`([\w]+\.(?:[\w.*-]+))`/g;
  let m2;
  while ((m2 = inlinePermRegex.exec(content)) !== null) {
    if (!perms.find(p => p.permission === m2[1].trim())) {
      perms.push({ permission: m2[1].trim(), type: 'inline' });
    }
  }
  return perms;
}

function extractQuestions(content) {
  const questions = [];
  const qLines = content.split('\n');
  for (const line of qLines) {
    const trimmed = line.trim();
    if (trimmed.endsWith('?') && trimmed.length > 20 && trimmed.length < 200 && !trimmed.startsWith('|') && !trimmed.startsWith('#')) {
      const clean = trimmed.replace(/\*\*/g, '');
      const nextIdx = qLines.indexOf(line) + 1;
      let answer = '';
      if (nextIdx < qLines.length) {
        const nextLine = qLines[nextIdx].trim();
        if (nextLine && !nextLine.startsWith('#') && !nextLine.startsWith('|') && !nextLine.startsWith('```')) {
          answer = nextLine.replace(/\*\*/g, '');
        }
      }
      if (!questions.find(q => q.question === clean)) {
        questions.push({ question: clean, answer: answer.substring(0, 300) });
      }
    }
  }
  return questions.slice(0, 20);
}

function generate() {
  ensureDir(AI_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const knowledgeObjects = [];
  const embeddingChunks = [];
  const faqCorpus = [];
  const apiCatalog = [];
  const seenApis = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    const docName = fm?.document_name || file.replace(/\.md$/, '').replace(/_/g, ' ');
    const family = fm?.family || 'UNKNOWN';
    const summary = extractSummary(content);
    const routes = extractRoutes(content);
    const entities = extractEntities(content);
    const events = extractEvents(content);
    const perms = extractPermissions(content);
    const questions = extractQuestions(content);

    const refs = [];
    if (fm?.knowledge_objects) {
      const ko = fm.knowledge_objects;
      if (ko.references) refs.push(...(Array.isArray(ko.references) ? ko.references : [ko.references]));
      if (ko.related) refs.push(...(Array.isArray(ko.related) ? ko.related : [ko.related]));
      if (ko.governs) refs.push(...(Array.isArray(ko.governs) ? ko.governs : [ko.governs]));
    }

    const ko = {
      id: docId,
      title: docName,
      description: summary,
      family,
      type: fm?.document_type || 'DOC',
      status: fm?.status || 'Unknown',
      version: fm?.version || '0.0',
      audience: fm?.audience || [],
      permissions: perms.map(p => p.permission),
      entities: entities.map(e => ({ name: e.name, table: e.table })),
      events: events.map(e => ({ name: e.name, description: e.description || '' })),
      endpoints: routes.map(r => `${r.method} ${r.path}`),
      relationships: refs
    };
    knowledgeObjects.push(ko);

    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 50 && !p.trim().startsWith('---') && !p.trim().startsWith('```'));
    for (let i = 0; i < paragraphs.length; i++) {
      const snippet = paragraphs[i].replace(/\*\*/g, '').replace(/\|/g, '').substring(0, 500).trim();
      if (snippet.length < 50) continue;
      embeddingChunks.push({
        id: `${docId}-chunk-${i}`,
        title: docName,
        content_snippet: snippet,
        tags: [family, fm?.document_type || 'DOC', ...(fm?.audience || [])],
        knowledge_objects: [docId],
        module: family === 'TECH-MOD' ? docId : (refs.find(r => r.startsWith('TECH-MOD')) || '')
      });
    }

    for (const q of questions) {
      faqCorpus.push({
        question: q.question,
        answer: q.answer || `See the ${docName} (${docId}) document for detailed information.`,
        source_document: docId,
        source_title: docName,
        tags: [family]
      });
    }

    for (const route of routes) {
      const apiKey = `${route.method}:${route.path}`;
      if (!seenApis.has(apiKey)) {
        seenApis.add(apiKey);
        apiCatalog.push({
          method: route.method,
          path: route.path,
          description: route.description,
          required_permission: route.permission,
          module: docId
        });
      }
    }
  }

  const corpus = {
    metadata: {
      generated: new Date().toISOString(),
      documentCount: knowledgeObjects.length,
      apiCount: apiCatalog.length,
      faqCount: faqCorpus.length,
      chunkCount: embeddingChunks.length
    },
    knowledge_objects: knowledgeObjects,
    relationships: knowledgeObjects.flatMap(ko =>
      ko.relationships.map(r => ({
        source: ko.id,
        target: r,
        type: 'references'
      }))
    )
  };

  fs.writeFileSync(path.join(AI_DIR, 'knowledge_corpus.json'), JSON.stringify(corpus, null, 2));
  fs.writeFileSync(path.join(AI_DIR, 'embeddings_ready.json'), JSON.stringify({
    metadata: { generated: new Date().toISOString(), total_chunks: embeddingChunks.length },
    chunks: embeddingChunks
  }, null, 2));
  fs.writeFileSync(path.join(AI_DIR, 'faq_corpus.json'), JSON.stringify({
    metadata: { generated: new Date().toISOString(), total_faqs: faqCorpus.length },
    faqs: faqCorpus
  }, null, 2));
  fs.writeFileSync(path.join(AI_DIR, 'api_catalog.json'), JSON.stringify({
    metadata: { generated: new Date().toISOString(), total_apis: apiCatalog.length },
    endpoints: apiCatalog
  }, null, 2));

  console.log(`\n AI Assistant Knowledge Pack generated:`);
  console.log(`   knowledge_corpus.json — ${knowledgeObjects.length} knowledge objects`);
  console.log(`   embeddings_ready.json — ${embeddingChunks.length} chunks for embedding`);
  console.log(`   faq_corpus.json — ${faqCorpus.length} FAQ entries`);
  console.log(`   api_catalog.json — ${apiCatalog.length} API endpoints\n`);
}

generate();
