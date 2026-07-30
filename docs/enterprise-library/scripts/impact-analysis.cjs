const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md'];

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
        description: m[5].trim()
      });
    }
  }
  return routes;
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
  return tests;
}

function performImpactAnalysis(targetId) {
  if (!targetId) {
    console.error('Usage: node scripts/impact-analysis.js <KNOWLEDGE_OBJECT_ID>');
    console.error('Example: node scripts/impact-analysis.js PERM-012');
    process.exit(1);
  }

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const references = [];
  const affectedModules = new Set();
  const affectedApis = [];
  const affectedPermissions = new Set();
  const affectedTestCases = [];
  const affectedUserGuides = new Set();
  const affectedEntities = [];

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    const docName = fm?.document_name || file.replace(/\.md$/, '').replace(/_/g, ' ');
    const family = fm?.family || 'UNKNOWN';

    let relationshipType = null;

    if (fm?.knowledge_objects) {
      const ko = fm.knowledge_objects;
      if (ko.governs && (Array.isArray(ko.governs) ? ko.governs : [ko.governs]).includes(targetId)) {
        relationshipType = 'governs';
      }
      if (ko.references && (Array.isArray(ko.references) ? ko.references : [ko.references]).includes(targetId)) {
        relationshipType = 'references';
      }
      if (ko.related && (Array.isArray(ko.related) ? ko.related : [ko.related]).includes(targetId)) {
        relationshipType = 'related';
      }
      if (fm.supersedes && (Array.isArray(fm.supersedes) ? fm.supersedes : [fm.supersedes]).includes(targetId)) {
        relationshipType = 'supersedes';
      }
      if (fm.related_decisions && (Array.isArray(fm.related_decisions) ? fm.related_decisions : [fm.related_decisions]).includes(targetId)) {
        relationshipType = 'related_decision';
      }
    }

    const contentRef = new RegExp(`\\b${targetId}\\b`).test(content);
    if (contentRef && !relationshipType) {
      relationshipType = 'inline_reference';
    }

    if (relationshipType) {
      references.push({
        docId,
        docName,
        file,
        family,
        relationshipType
      });

      if (family === 'TECH-MOD') {
        affectedModules.add(docId);
      }

      if (family === 'USER-GUIDE' || family === 'USER-TUT' || docName.toLowerCase().includes('guide')) {
        affectedUserGuides.add(docId);
      }

      const routes = extractRoutes(content);
      for (const route of routes) {
        if (!affectedApis.find(a => a.path === route.path && a.method === route.method)) {
          affectedApis.push(route);
        }
      }

      const perms = extractPermissions(content);
      for (const p of perms) affectedPermissions.add(p);

      const entities = extractEntities(content);
      for (const e of entities) {
        if (!affectedEntities.find(en => en.name === e.name)) {
          affectedEntities.push(e);
        }
      }

      const tests = extractTestCases(content);
      for (const t of tests) {
        if (!affectedTestCases.includes(t)) affectedTestCases.push(t);
      }
    }
  }

  const result = {
    objectId: targetId,
    analyzed: new Date().toISOString(),
    summary: {
      totalReferences: references.length,
      affectedModules: affectedModules.size,
      affectedApis: affectedApis.length,
      affectedPermissions: affectedPermissions.size,
      affectedEntities: affectedEntities.length,
      affectedTestCases: affectedTestCases.length,
      affectedUserGuides: affectedUserGuides.size
    },
    references: references.map(r => ({
      docId: r.docId,
      docName: r.docName,
      file: r.file,
      family: r.family,
      relationshipType: r.relationshipType
    })),
    affectedModules: [...affectedModules],
    affectedApis,
    affectedPermissions: [...affectedPermissions],
    affectedEntities,
    affectedTestCases: affectedTestCases.slice(0, 50),
    affectedUserGuides: [...affectedUserGuides]
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

const targetId = process.argv[2];
performImpactAnalysis(targetId);
