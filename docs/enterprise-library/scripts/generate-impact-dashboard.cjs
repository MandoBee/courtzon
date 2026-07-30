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
      events.push({ name: m[1].trim() });
    }
  }
  const tableEventRegex = /\|\s*`([\w:]+)`\s*\|\s*(\w[\w\s]*)\s*\|\s*(\w[\w\s,]*)\s*\|/g;
  while ((m = tableEventRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 200);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Event') && ctx.includes('Publisher')) {
      if (!events.find(e => e.name === m[1].trim())) {
        events.push({ name: m[1].trim() });
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

function extractTestCases(content) {
  const tests = [];
  const testRegex = /__tests__\/|\.spec\.ts|\.test\.ts|test\(|it\(/g;
  let m;
  while ((m = testRegex.exec(content)) !== null) {
    const lineStart = content.lastIndexOf('\n', m.index) + 1;
    const lineEnd = content.indexOf('\n', m.index);
    const line = content.slice(lineStart, lineEnd > 0 ? lineEnd : undefined).trim();
    if (line.length < 100) tests.push(line);
  }
  return tests.slice(0, 10);
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const contentByDoc = new Map();
  const allDocs = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    contentByDoc.set(docId, content);
    allDocs.push({ id: docId, fm, content, file, family: fm?.family || 'UNKNOWN', name: fm?.document_name || docId });
  }

  const moduleDocs = allDocs.filter(d => d.family === 'TECH-MOD');
  const userGuides = allDocs.filter(d => d.family === 'USER' || d.family === 'USER-GUIDE' || d.family === 'USER-TUT');
  const adminGuides = allDocs.filter(d => d.family === 'ADMIN');
  const adrs = allDocs.filter(d => d.family === 'GOV-ADR');

  const dashboard = {};

  for (const mod of moduleDocs) {
    const routes = extractRoutes(mod.content);
    const entities = extractEntities(mod.content);
    const events = extractEvents(mod.content);
    const perms = extractPermissions(mod.content);
    const tests = extractTestCases(mod.content);

    const publishesEvents = events.filter(e => mod.content.includes(`\`${e.name}\``));
    const consumedEvents = [];

    for (const evt of events) {
      for (const [id, content] of contentByDoc) {
        if (id !== mod.id && content.includes(`\`${evt.name}\``)) {
          if (!consumedEvents.find(c => c === evt.name)) {
            consumedEvents.push(evt.name);
          }
        }
      }
    }

    const modUserGuides = [];
    for (const ug of userGuides) {
      if (ug.content.includes(mod.id)) modUserGuides.push(ug.id);
    }
    const modAdminGuides = [];
    for (const ag of adminGuides) {
      if (ag.content.includes(mod.id)) modAdminGuides.push(ag.id);
    }
    const modAdrs = [];
    for (const adr of adrs) {
      if (adr.content.includes(mod.id)) modAdrs.push(adr.id);
    }

    const dependsOn = [];
    const dependents = [];
    for (const [id, content] of contentByDoc) {
      if (id !== mod.id) {
        const regex = new RegExp(`\\b${mod.id}\\b`, 'g');
        if (regex.test(content)) {
          dependents.push(id);
        }
      }
    }
    if (mod.fm?.knowledge_objects) {
      const ko = mod.fm.knowledge_objects;
      if (ko.references) {
        const refs = Array.isArray(ko.references) ? ko.references : [ko.references];
        dependsOn.push(...refs);
      }
    }

    const impactScore = (routes.length * 3) + (entities.length * 2) + (perms.length * 2) + (events.length * 2) + (dependents.length * 4) + (dependsOn.length * 2) + (modUserGuides.length * 3) + (modAdminGuides.length * 3) + (modAdrs.length * 2) + (tests.length * 1);

    dashboard[mod.id] = {
      module: mod.name.replace(/ Module$/, ''),
      exposes_apis: routes.length,
      persists_entities: entities.map(e => e.table),
      requires_permissions: perms,
      publishes_events: publishesEvents.map(e => e.name),
      consumes_events: consumedEvents,
      has_tests: tests,
      user_guides: modUserGuides,
      admin_guides: modAdminGuides,
      adrs: modAdrs,
      total_dependencies: dependsOn.length,
      total_dependents: dependents.length,
      impact_score: impactScore
    };
  }

  const sorted = Object.entries(dashboard).sort((a, b) => b[1].impact_score - a[1].impact_score);
  const result = {};
  for (const [key, value] of sorted) {
    result[key] = value;
  }

  fs.writeFileSync(path.join(EXPORTS_DIR, 'impact_dashboard.json'), JSON.stringify(result, null, 2));

  console.log(`\n Impact Dashboard generated:`);
  console.log(`   ${Object.keys(result).length} modules analyzed`);
  const topModule = Object.entries(result)[0];
  if (topModule) {
    console.log(`   Highest impact: ${topModule[0]} (${topModule[1].module}) — score ${topModule[1].impact_score}`);
  }
  console.log(`   Total APIs: ${Object.values(result).reduce((s, m) => s + m.exposes_apis, 0)}`);
  console.log(`   Total permissions: ${new Set(Object.values(result).flatMap(m => m.requires_permissions)).size}\n`);
}

generate();
