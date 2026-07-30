const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports');

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

function extractSummary(content, maxLines = 10) {
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
    if (summaryLines.length >= maxLines) break;
  }
  return summaryLines.join(' ').substring(0, 500);
}

function extractEntities(content, docId) {
  const entities = [];
  const entityTableRegex = /\|\s*(\w[\w\s]*)\s*\|\s*`(\w+)`\s*\|\s*([^|]+)\s*\|/g;
  let m;
  while ((m = entityTableRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 300);
    const contextBefore = content.slice(idx, m.index);
    if (contextBefore.includes('Entity') && contextBefore.includes('Table')) {
      entities.push({
        name: m[1].trim(),
        table: m[2].trim(),
        fields: m[3].trim().split(',').map(s => s.trim().replace(/`/g, '')),
        sourceDoc: docId
      });
    }
  }
  return entities;
}

function extractEvents(content, docId) {
  const events = [];
  const eventRegex = /`([a-z]+(?:\.[a-z]+)?:[a-z_]+)`\s*[—–-]?\s*(.+?)(?:\n|$)/gi;
  let m;
  while ((m = eventRegex.exec(content)) !== null) {
    if (!m[1].startsWith('backend') && !m[1].startsWith('npm')) {
      events.push({
        name: m[1].trim(),
        description: m[2].trim(),
        sourceDoc: docId
      });
    }
  }

  const businessEventRegex = /\|\s*`([\w:]+)`\s*\|\s*(\w[\w\s]*)\s*\|\s*(\w[\w\s,]*)\s*\|/g;
  while ((m = businessEventRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 200);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Event') && ctx.includes('Publisher')) {
      if (!events.find(e => e.name === m[1].trim())) {
        events.push({
          name: m[1].trim(),
          publisher: m[2].trim(),
          consumers: m[3].trim().split(',').map(s => s.trim()),
          sourceDoc: docId
        });
      }
    }
  }
  return events;
}

function extractRoutes(content, docId) {
  const routes = [];
  const routeRegex = /\|\s*(\d+)\s*\|\s*(\w+)\s*\|\s*(\/[^\s|]+)\s*\|\s*`?([\w.*-]+)`?\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = routeRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 300);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Method') && ctx.includes('Path')) {
      routes.push({
        method: m[2].trim(),
        path: m[3].trim(),
        permission: m[4].trim(),
        description: m[5].trim(),
        sourceDoc: docId
      });
    }
  }
  return routes;
}

function extractPermissions(content, docId) {
  const perms = [];
  const permTableRegex = /\|\s*`([\w.*-]+)`\s*\|\s*(\w+)\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = permTableRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 200);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Permission') && ctx.includes('Type')) {
      if (!perms.find(p => p.permission === m[1].trim())) {
        perms.push({
          permission: m[1].trim(),
          type: m[2].trim(),
          component: m[3].trim(),
          sourceDoc: docId
        });
      }
    }
  }
  const inlinePermRegex = /`([\w]+\.(?:[\w.*-]+))`/g;
  while ((m = inlinePermRegex.exec(content)) !== null) {
    if (!perms.find(p => p.permission === m[1].trim())) {
      perms.push({ permission: m[1].trim(), type: 'inline', sourceDoc: docId });
    }
  }
  return perms;
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const knowledgeGraph = { nodes: [], edges: [] };
  const allApis = [];
  const allPermissions = [];
  const allEvents = [];
  const allEntities = [];
  const allDocs = [];

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    const docName = fm?.document_name || file.replace(/\.md$/, '').replace(/_/g, ' ');
    const family = fm?.family || 'UNKNOWN';

    const summary = extractSummary(content);
    const entities = extractEntities(content, docId);
    const events = extractEvents(content, docId);
    const routes = extractRoutes(content, docId);
    const permissions = extractPermissions(content, docId);

    allDocs.push({
      id: docId,
      name: docName,
      family,
      type: fm?.document_type || 'DOC',
      status: fm?.status || 'Unknown',
      version: fm?.version || '0.0',
      summary,
      audience: fm?.audience || [],
      difficulty: fm?.difficulty || 'unknown',
      readingTime: fm?.reading_time || 0,
      businessOwner: fm?.business_owner || '',
      technicalOwner: fm?.technical_owner || '',
      documentationOwner: fm?.documentation_owner || '',
      lifecycleStatus: fm?.lifecycle_status || '',
      supersedes: fm?.supersedes || [],
      relatedDecisions: fm?.related_decisions || []
    });

    knowledgeGraph.nodes.push({
      id: docId,
      name: docName,
      family,
      type: fm?.document_type || 'DOC',
      group: family
    });

    if (fm?.knowledge_objects) {
      const ko = fm.knowledge_objects;
      const addEdges = (targets, type) => {
        if (!targets) return;
        const arr = Array.isArray(targets) ? targets : [targets];
        for (const t of arr) {
          knowledgeGraph.edges.push({ source: docId, target: t, type });
        }
      };
      addEdges(ko.governs, 'governs');
      addEdges(ko.references, 'references');
      addEdges(ko.related, 'related');
    }

    allApis.push(...routes);
    allPermissions.push(...permissions);
    allEvents.push(...events);
    allEntities.push(...entities);
  }

  const knowledgeOutput = {
    metadata: {
      generated: new Date().toISOString(),
      documentCount: allDocs.length,
      families: [...new Set(allDocs.map(d => d.family))],
      familiesCount: [...new Set(allDocs.map(d => d.family))].length
    },
    documents: allDocs
  };

  const graphOutput = {
    metadata: { documentCount: knowledgeGraph.nodes.length, edgeCount: knowledgeGraph.edges.length },
    nodes: knowledgeGraph.nodes,
    edges: knowledgeGraph.edges
  };

  const uniqueApis = [];
  const seenApis = new Set();
  for (const api of allApis) {
    const key = `${api.method}:${api.path}`;
    if (!seenApis.has(key)) {
      seenApis.add(key);
      uniqueApis.push(api);
    }
  }

  const uniquePermissions = [];
  const seenPerms = new Set();
  for (const p of allPermissions) {
    if (!seenPerms.has(p.permission)) {
      seenPerms.add(p.permission);
      uniquePermissions.push(p);
    }
  }

  const uniqueEvents = [];
  const seenEvents = new Set();
  for (const e of allEvents) {
    if (!seenEvents.has(e.name)) {
      seenEvents.add(e.name);
      uniqueEvents.push(e);
    }
  }

  const uniqueEntities = [];
  const seenEntities = new Set();
  for (const e of allEntities) {
    const key = `${e.name}:${e.table}`;
    if (!seenEntities.has(key)) {
      seenEntities.add(key);
      uniqueEntities.push(e);
    }
  }

  fs.writeFileSync(path.join(EXPORTS_DIR, 'knowledge.json'), JSON.stringify(knowledgeOutput, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'knowledge_graph.json'), JSON.stringify(graphOutput, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'apis.json'), JSON.stringify({ apis: uniqueApis }, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'permissions.json'), JSON.stringify({ permissions: uniquePermissions }, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'events.json'), JSON.stringify({ events: uniqueEvents }, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'entities.json'), JSON.stringify({ entities: uniqueEntities }, null, 2));

  console.log(`\n✅ AI Export generated:`);
  console.log(`   knowledge.json — ${allDocs.length} documents`);
  console.log(`   knowledge_graph.json — ${knowledgeGraph.nodes.length} nodes, ${knowledgeGraph.edges.length} edges`);
  console.log(`   apis.json — ${uniqueApis.length} API endpoints`);
  console.log(`   permissions.json — ${uniquePermissions.length} permissions`);
  console.log(`   events.json — ${uniqueEvents.length} events`);
  console.log(`   entities.json — ${uniqueEntities.length} entities\n`);
}

generate();
