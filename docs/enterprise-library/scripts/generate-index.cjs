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

function extractEntities(content, docId) {
  const entities = [];
  const entityTableRegex = /\|\s*(\w[\w\s]*)\s*\|\s*`(\w+)`\s*\|\s*([^|]+)\s*\|/g;
  let m;
  while ((m = entityTableRegex.exec(content)) !== null) {
    const lineBefore = content.slice(Math.max(0, m.index - 200), m.index);
    if (lineBefore.includes('Entity') && lineBefore.includes('Table')) {
      entities.push({
        name: m[1].trim(),
        table: m[2].trim(),
        keyFields: m[3].trim().split(',').map(s => s.trim().replace(/`/g, '')),
        sourceDoc: docId
      });
    }
  }
  return entities;
}

function extractEvents(content, docId) {
  const events = [];
  const eventRegex = /`([\w:]+)`\s*[—–-]?\s*(.+?)(?:\n|$)/g;
  let m;
  while ((m = eventRegex.exec(content)) !== null) {
    if (m[1].includes(':') && !m[1].startsWith('backend')) {
      events.push({
        name: m[1].trim(),
        description: m[2].trim(),
        sourceDoc: docId
      });
    }
  }
  return events;
}

function extractRoutes(content, docId) {
  const routes = [];
  const routeTableRegex = /\|\s*\d+\s*\|\s*(\w+)\s*\|\s*(\/[^\s|]+)\s*\|\s*`?([\w.*-]+)`?\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = routeTableRegex.exec(content)) !== null) {
    const lineBefore = content.slice(Math.max(0, m.index - 200), m.index);
    if (lineBefore.includes('Method') && lineBefore.includes('Path')) {
      routes.push({
        method: m[1].trim(),
        path: m[2].trim(),
        permission: m[3].trim(),
        description: m[4].trim(),
        sourceDoc: docId
      });
    }
  }
  return routes;
}

function extractPermissionsFromContent(content, docId) {
  const perms = [];
  const permRegex = /`([\w.*-]+)`/g;
  let m;
  while ((m = permRegex.exec(content)) !== null) {
    const perm = m[1].trim();
    if (/^[\w]+\.[\w.*-]+$/.test(perm)) {
      if (!perms.find(p => p.permission === perm)) {
        perms.push({ permission: perm, sourceDoc: docId });
      }
    }
  }
  return perms;
}

function extractCrossReferences(fm, docId) {
  const refs = [];
  if (!fm || !fm.knowledge_objects) return refs;
  const ko = fm.knowledge_objects;
  if (ko.governs) {
    for (const g of (Array.isArray(ko.governs) ? ko.governs : [ko.governs])) {
      refs.push({ type: 'governs', target: g });
    }
  }
  if (ko.references) {
    for (const r of (Array.isArray(ko.references) ? ko.references : [ko.references])) {
      refs.push({ type: 'references', target: r });
    }
  }
  if (ko.related) {
    for (const r of (Array.isArray(ko.related) ? ko.related : [ko.related])) {
      refs.push({ type: 'related', target: r });
    }
  }
  return refs;
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const knowledgeObjects = [];
  const moduleIndex = [];
  const permissionsIndex = [];
  const entitiesIndex = [];
  const allEntities = [];
  const allPermissions = [];
  const allModules = [];

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    const docName = fm?.document_name || file.replace(/\.md$/, '').replace(/_/g, ' ');
    const family = fm?.family || 'UNKNOWN';

    const refs = extractCrossReferences(fm, docId);
    const entities = extractEntities(content, docId);
    const events = extractEvents(content, docId);
    const routes = extractRoutes(content, docId);
    const perms = extractPermissionsFromContent(content, docId);

    knowledgeObjects.push({
      id: docId,
      name: docName,
      family,
      status: fm?.status || 'Unknown',
      version: fm?.version || '0.0',
      type: fm?.document_type || 'DOC',
      crossReferences: refs,
      entities: entities.map(e => ({ name: e.name, table: e.table })),
      events: events.map(e => ({ name: e.name, description: e.description })),
      routes: routes.map(r => ({ method: r.method, path: r.path, permission: r.permission }))
    });

    allEntities.push(...entities);

    for (const p of perms) {
      if (!allPermissions.find(x => x.permission === p.permission)) {
        allPermissions.push({ permission: p.permission, sourceDocs: [docId] });
      } else {
        const existing = allPermissions.find(x => x.permission === p.permission);
        if (!existing.sourceDocs.includes(docId)) existing.sourceDocs.push(docId);
      }
    }

    if (family === 'TECH-MOD') {
      allModules.push({
        id: docId,
        name: docName,
        entities: entities.map(e => e.name),
        events: events.map(e => e.name),
        permissions: perms.map(p => p.permission),
        routes: routes.map(r => ({ method: r.method, path: r.path }))
      });
    }
  }

  entitiesIndex.push(...allEntities.map(e => ({
    name: e.name,
    table: e.table,
    keyFields: e.keyFields,
    moduleOwner: e.sourceDoc
  })));

  permissionsIndex.push(...allPermissions.map(p => ({
    permission: p.permission,
    canonicalModule: p.permission.split('.')[0],
    sourceDocs: p.sourceDocs
  })));

  const output = {
    knowledgeObjects: {
      count: knowledgeObjects.length,
      items: knowledgeObjects
    },
    moduleIndex: {
      count: allModules.length,
      items: allModules
    },
    permissionsIndex: {
      count: permissionsIndex.length,
      items: permissionsIndex
    },
    entitiesIndex: {
      count: entitiesIndex.length,
      items: entitiesIndex
    }
  };

  fs.writeFileSync(path.join(EXPORTS_DIR, 'knowledge_objects.json'), JSON.stringify({ knowledgeObjects }, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'module_index.json'), JSON.stringify({ modules: allModules }, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'permissions_index.json'), JSON.stringify({ permissions: permissionsIndex }, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'entities_index.json'), JSON.stringify({ entities: entitiesIndex }, null, 2));

  console.log(`\n✅ Index generated:`);
  console.log(`   ${knowledgeObjects.length} knowledge objects`);
  console.log(`   ${allModules.length} modules`);
  console.log(`   ${permissionsIndex.length} permissions`);
  console.log(`   ${entitiesIndex.length} entities\n`);
}

generate();
