const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports');
const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md'];

const EDGE_TYPES = ['exposes', 'persists', 'requires', 'documented_by', 'implements', 'depends_on', 'publishes', 'consumes', 'validates', 'governs', 'owns', 'uses', 'references', 'traces_to', 'supersedes', 'related_to'];

const FAMILY_MAP = {
  'TECH-MOD': { label: 'Module', family: 'TECH-MOD' },
  'TECH-ARCH': { label: 'Architecture', family: 'TECH-ARCH' },
  'TECH-DEV': { label: 'Development', family: 'TECH-DEV' },
  'TECH-DB': { label: 'Database', family: 'TECH-DB' },
  'TECH-UX': { label: 'UX', family: 'TECH-UX' },
  'TECH-API': { label: 'API', family: 'TECH-API' },
  'BIZ-ARCH': { label: 'Business', family: 'BIZ-ARCH' },
  'BIZ-PROD': { label: 'Product', family: 'BIZ-PROD' },
  'BIZ-ECO': { label: 'Ecosystem', family: 'BIZ-ECO' },
  'GOV-ADR': { label: 'Decision', family: 'GOV-ADR' },
  'GOV-POL': { label: 'Policy', family: 'GOV-POL' },
  'GOV-COMP': { label: 'Compliance', family: 'GOV-COMP' },
  'USER': { label: 'User Guide', family: 'USER' },
  'ADMIN': { label: 'Admin Guide', family: 'ADMIN' },
  'USER-GUIDE': { label: 'User Guide', family: 'USER-GUIDE' },
  'USER-TUT': { label: 'Tutorial', family: 'USER-TUT' },
  'OPS-DEPLOY': { label: 'Deployment', family: 'OPS-DEPLOY' },
  'OPS-MON': { label: 'Monitoring', family: 'OPS-MON' },
  'OPS-RUN': { label: 'Runbook', family: 'OPS-RUN' },
  'OPS-RECOV': { label: 'Recovery', family: 'OPS-RECOV' },
  'QUAL-TEST': { label: 'Testing', family: 'QUAL-TEST' },
  'QUAL-TRACE': { label: 'Traceability', family: 'QUAL-TRACE' },
  'QUAL-CERT': { label: 'Certification', family: 'QUAL-CERT' }
};

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

function extractRoutes(content) {
  const routes = [];
  const routeRegex = /\|\s*(\d+)\s*\|\s*(\w+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = routeRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 300);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Method') && ctx.includes('Path')) {
      routes.push({ method: m[2].trim(), path: m[3].trim().replace(/`/g, ''), permission: m[4].trim().replace(/`/g, '').split(',').map(s => s.trim()).join(', ') });
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
      entities.push({ name: m[1].trim(), table: m[2].trim() });
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
  const perms = new Set();
  const permRegex = /`([\w]+\.(?:[\w.*-]+))`/g;
  let m;
  while ((m = permRegex.exec(content)) !== null) {
    perms.add(m[1].trim());
  }
  return [...perms];
}

function getNodeType(family) {
  if (family === 'TECH-MOD') return 'module';
  if (family === 'TECH-ARCH') return 'architecture';
  if (family === 'TECH-DEV') return 'standard';
  if (family === 'TECH-DB') return 'entity';
  if (family === 'TECH-UX') return 'ux';
  if (family === 'BIZ-ARCH') return 'business';
  if (family === 'GOV-ADR') return 'decision';
  if (family === 'USER' || family === 'USER-GUIDE' || family === 'USER-TUT') return 'guide';
  if (family === 'ADMIN') return 'admin';
  if (family.startsWith('OPS')) return 'operations';
  if (family.startsWith('QUAL')) return 'quality';
  return 'document';
}

function inferEdges(content, docId, fm, knownIds) {
  const edges = [];
  const allIds = [...knownIds];

  const refRegex = new RegExp(`\\b(${allIds.join('|')})\\b`, 'g');
  const found = new Set();
  let m;
  while ((m = refRegex.exec(content)) !== null) {
    if (m[1] !== docId) found.add(m[1]);
  }

  for (const target of found) {
    if (!edges.find(e => e.source === docId && e.target === target)) {
      edges.push({ source: docId, target, type: 'references' });
    }
  }

  if (fm && fm.knowledge_objects) {
    const ko = fm.knowledge_objects;
    const addEdges = (targets, type) => {
      if (!targets) return;
      const arr = Array.isArray(targets) ? targets : [targets];
      for (const t of arr) {
        const existing = edges.findIndex(e => e.source === docId && e.target === t);
        if (existing >= 0) {
          edges[existing].type = type;
        } else {
          edges.push({ source: docId, target: t, type });
        }
      }
    };
    addEdges(ko.governs, 'governs');
    addEdges(ko.references, 'references');
    addEdges(ko.related, 'related');
    addEdges(ko.implements, 'implements');
    addEdges(ko.depends_on, 'depends_on');
    addEdges(ko.validates, 'validates');
  }

  if (fm && fm.supersedes) {
    const arr = Array.isArray(fm.supersedes) ? fm.supersedes : [fm.supersedes];
    for (const s of arr) {
      if (s) edges.push({ source: docId, target: s, type: 'supersedes' });
    }
  }

  return edges;
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const knownIds = new Set();

  const docs = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    knownIds.add(docId);
    docs.push({ file, docId, fm, content });
  }

  const nodes = [];
  const edges = [];
  const nodeMap = new Set();

  for (const doc of docs) {
    const family = doc.fm?.family || 'UNKNOWN';
    const fi = FAMILY_MAP[family] || { label: 'Document', family: 'UNKNOWN' };
    const nodeType = getNodeType(family);

    if (!nodeMap.has(doc.docId)) {
      nodeMap.add(doc.docId);
      nodes.push({
        id: doc.docId,
        type: nodeType,
        name: doc.fm?.document_name || doc.docId,
        family: fi.family,
        label: fi.label
      });
    }

    const routes = extractRoutes(doc.content);
    const entities = extractEntities(doc.content);
    const events = extractEvents(doc.content);
    const perms = extractPermissions(doc.content);

    for (const route of routes) {
      const apiId = `API-${route.method}-${route.path.replace(/[{}/:]/g, '_')}`;
      if (!nodeMap.has(apiId)) {
        nodeMap.add(apiId);
        nodes.push({
          id: apiId,
          type: 'api',
          name: `${route.method} ${route.path}`,
          family: 'TECH-API',
          label: 'API Endpoint'
        });
      }
      edges.push({ source: doc.docId, target: apiId, type: 'exposes' });
      if (route.permission) {
        const permId = `PERM-${route.permission.replace(/\./g, '-')}`;
        if (!nodeMap.has(permId)) {
          nodeMap.add(permId);
          nodes.push({
            id: permId,
            type: 'permission',
            name: route.permission,
            family: 'TECH-SEC',
            label: 'Permission'
          });
        }
        edges.push({ source: apiId, target: permId, type: 'requires' });
      }
    }

    for (const entity of entities) {
      const entId = `ENT-${entity.table}`;
      if (!nodeMap.has(entId)) {
        nodeMap.add(entId);
        nodes.push({
          id: entId,
          type: 'entity',
          name: entity.table,
          family: 'TECH-DB',
          label: 'Database Entity'
        });
      }
      edges.push({ source: doc.docId, target: entId, type: 'persists' });
    }

    for (const evt of events) {
      const evtId = `EVT-${evt.name.replace(/:/g, '_')}`;
      if (!nodeMap.has(evtId)) {
        nodeMap.add(evtId);
        nodes.push({
          id: evtId,
          type: 'event',
          name: evt.name,
          family: 'TECH-EVT',
          label: 'Event'
        });
      }
      edges.push({ source: doc.docId, target: evtId, type: 'publishes' });
    }

    for (const perm of perms) {
      const permId = `PERM-${perm.replace(/\./g, '-')}`;
      if (!nodeMap.has(permId)) {
        nodeMap.add(permId);
        nodes.push({
          id: permId,
          type: 'permission',
          name: perm,
          family: 'TECH-SEC',
          label: 'Permission'
        });
      }
      edges.push({ source: doc.docId, target: permId, type: 'requires' });
    }

    const docEdges = inferEdges(doc.content, doc.docId, doc.fm, knownIds);
    for (const e of docEdges) {
      if (!edges.find(x => x.source === e.source && x.target === e.target && x.type === e.type)) {
        edges.push(e);
      }
    }
  }

  const connectionCount = {};
  for (const node of nodes) {
    connectionCount[node.id] = 0;
  }
  for (const edge of edges) {
    if (connectionCount[edge.source] !== undefined) connectionCount[edge.source]++;
    if (connectionCount[edge.target] !== undefined) connectionCount[edge.target]++;
  }

  const nodeTypes = {};
  for (const n of nodes) {
    nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
  }

  const edgeTypes = {};
  for (const e of edges) {
    edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;
  }

  const sorted = Object.entries(connectionCount).sort((a, b) => b[1] - a[1]);
  const mostConnected = sorted.slice(0, 10).map(([id, count]) => {
    const node = nodes.find(n => n.id === id);
    return { id, name: node?.name || id, type: node?.type || 'unknown', connectionCount: count };
  });

  const graph = {
    nodes,
    edges,
    statistics: {
      total_nodes: nodes.length,
      total_edges: edges.length,
      node_types: nodeTypes,
      edge_types: edgeTypes,
      most_connected: mostConnected
    }
  };

  fs.writeFileSync(path.join(EXPORTS_DIR, 'knowledge_graph_complete.json'), JSON.stringify(graph, null, 2));

  console.log(`\n Knowledge Graph generated:`);
  console.log(`   ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`   ${Object.keys(nodeTypes).length} node types, ${Object.keys(edgeTypes).length} edge types`);
  console.log(`   Most connected: ${mostConnected[0]?.id || 'N/A'} (${mostConnected[0]?.connectionCount || 0} connections)\n`);
}

generate();
