const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports');

const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md'];

const FAMILY_COLORS = {
  'TECH-MOD': '#50B86C', 'TECH-ARCH': '#4A90D9', 'TECH-DEV': '#9B59B6',
  'TECH-DB': '#E67E22', 'TECH-UX': '#1ABC9C', 'BIZ-ARCH': '#E74C3C',
  'GOV-ADR': '#8E44AD', 'USER': '#3498DB', 'ADMIN': '#2C3E50'
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
    if (summaryLines.length >= 5) break;
  }
  return summaryLines.join(' ').substring(0, 300);
}

function extractRoutes(content) {
  const routes = [];
  const routeRegex = /\|\s*(\d+)\s*\|\s*(\w+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = routeRegex.exec(content)) !== null) {
    const idx = Math.max(0, m.index - 300);
    const ctx = content.slice(idx, m.index);
    if (ctx.includes('Method') && ctx.includes('Path')) {
      routes.push({ method: m[2].trim(), path: m[3].trim().replace(/`/g, ''), permission: m[4].trim().replace(/`/g, '').split(',').map(s => s.trim()).join(', '), description: m[5].trim() });
    }
  }
  return routes;
}

function getDependents(moduleId, allContent) {
  const deps = [];
  for (const [id, content] of allContent) {
    if (id === moduleId) continue;
    const regex = new RegExp(`\\b${moduleId}\\b`, 'g');
    if (regex.test(content)) deps.push(id);
  }
  return deps;
}

function generate() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/generate-release-knowledge.cjs <VERSION>');
    console.error('Example: node scripts/generate-release-knowledge.cjs v2.3.0');
    process.exit(1);
  }

  const releaseDir = path.join(EXPORTS_DIR, 'releases', version);
  ensureDir(releaseDir);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const allContent = new Map();
  const allDocs = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    allContent.set(docId, content);
    allDocs.push({
      id: docId,
      name: fm?.document_name || docId,
      family: fm?.family || 'UNKNOWN',
      type: fm?.document_type || 'DOC',
      status: fm?.status || 'Unknown',
      version: fm?.version || '0.0',
      summary: extractSummary(content)
    });
  }

  const moduleDocs = allDocs.filter(d => d.family === 'TECH-MOD');
  const archDocs = allDocs.filter(d => d.family === 'TECH-ARCH');
  const adrDocs = allDocs.filter(d => d.family === 'GOV-ADR');
  const devDocs = allDocs.filter(d => d.family === 'TECH-DEV');

  const changedObjects = {
    version,
    generated: new Date().toISOString(),
    summary: {
      total_documents: allDocs.length,
      modules: moduleDocs.length,
      architecture_docs: archDocs.length,
      decisions: adrDocs.length,
      standards: devDocs.length
    },
    modules: moduleDocs.map(m => ({
      id: m.id,
      name: m.name,
      status: m.status,
      version: m.version,
      routes: m.content ? extractRoutes(m.content).length : 0
    })),
    all_documents: allDocs.map(d => ({
      id: d.id,
      name: d.name,
      family: d.family,
      status: d.status,
      version: d.version
    }))
  };

  const moduleImpacts = moduleDocs.map(mod => {
    const routes = fs.existsSync(path.join(DOCS_DIR, files.find(f => f.includes(mod.id)) || ''))
      ? extractRoutes(allContent.get(mod.id) || '').length : 0;
    const dependents = getDependents(mod.id, allContent);
    const impactScore = (routes * 3) + (dependents.length * 5);
    return {
      module_id: mod.id,
      module_name: mod.name,
      changes: { routes, dependents: dependents.length },
      impact_score: impactScore
    };
  }).sort((a, b) => b.impact_score - a.impact_score);

  const impactSummary = {
    version,
    generated: new Date().toISOString(),
    total_modules: moduleDocs.length,
    highest_impact_module: moduleImpacts[0] || null,
    module_impacts: moduleImpacts,
    overall_risk: moduleImpacts.length > 3 ? 'medium' : 'low'
  };

  const releaseNotes = `# Release ${version} — Knowledge Pack

**Generated:** ${new Date().toISOString().split('T')[0]}

## Summary

- **${allDocs.length} knowledge documents** across ${new Set(allDocs.map(d => d.family)).size} families
- **${moduleDocs.length} technical modules** documented
- **${archDocs.length} architecture documents**
- **${adrDocs.length} architecture decision records**
- **${devDocs.length} development standards**

## Module Overview

${moduleDocs.map(m => `- **${m.id}** — ${m.name} (${m.status})`).join('\n')}

## Architecture Decisions

${adrDocs.map(a => `- **${a.id}** — ${a.name}`).join('\n') || '*None documented*'}

## Standards & Guidelines

${devDocs.map(d => `- **${d.id}** — ${d.name}`).join('\n') || '*None documented*'}

## Impact Analysis

**Highest impact module:** ${moduleImpacts[0]?.module_name || 'N/A'} (score: ${moduleImpacts[0]?.impact_score || 0})

**Overall risk level:** ${impactSummary.overall_risk}

---

*Auto-generated by CourtZon Knowledge Intelligence Layer*
`;

  const diffContent = `# Knowledge Diff for ${version}

## Overview

This release covers the current state of the CourtZon Enterprise Knowledge Platform.

### Document Count by Family

${Object.entries(allDocs.reduce((acc, d) => {
    acc[d.family] = (acc[d.family] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).map(([family, count]) => `- **${family}**: ${count} documents`).join('\n')}

### Status Distribution

${Object.entries(allDocs.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {})).map(([status, count]) => `- **${status}**: ${count}`).join('\n')}

### Key Metrics

- Total documents: ${allDocs.length}
- Total families: ${new Set(allDocs.map(d => d.family)).size}
- Modules: ${moduleDocs.length}
- Architecture docs: ${archDocs.length}
- ADRs: ${adrDocs.length}
- Standards: ${devDocs.length}

---

*Baseline knowledge state for ${version}*
`;

  fs.writeFileSync(path.join(releaseDir, 'release_notes.md'), releaseNotes);
  fs.writeFileSync(path.join(releaseDir, 'changed_objects.json'), JSON.stringify(changedObjects, null, 2));
  fs.writeFileSync(path.join(releaseDir, 'impact_summary.json'), JSON.stringify(impactSummary, null, 2));
  fs.writeFileSync(path.join(releaseDir, 'knowledge_diff.md'), diffContent);

  console.log(`\n Release Knowledge Pack generated for ${version}:`);
  console.log(`   ${releaseDir}`);
  console.log(`   release_notes.md — Release summary`);
  console.log(`   changed_objects.json — ${allDocs.length} knowledge objects`);
  console.log(`   impact_summary.json — ${moduleImpacts.length} modules analyzed`);
  console.log(`   knowledge_diff.md — Baseline diff report\n`);
}

generate();
