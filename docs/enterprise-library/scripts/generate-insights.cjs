const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports');
const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md'];

const FAMILY_PLANNED = {
  'TECH-MOD': 52,
  'TECH-ARCH': 25,
  'TECH-DEV': 15,
  'TECH-DB': 5,
  'TECH-UX': 12,
  'BIZ-ARCH': 5,
  'GOV-ADR': 12,
  'GOV-POL': 5,
  'USER': 3,
  'ADMIN': 3,
  'OPS-DEPLOY': 3,
  'OPS-MON': 3,
  'OPS-RUN': 3,
  'OPS-RECOV': 2,
  'QUAL-TEST': 3,
  'QUAL-TRACE': 2,
  'QUAL-CERT': 1
};

const KNOWLEDGE_DOMAIN_MAP = {
  'TECH-MOD': 'Technical Architecture',
  'TECH-ARCH': 'Technical Architecture',
  'TECH-DEV': 'Development Standards',
  'TECH-DB': 'Data Architecture',
  'TECH-UX': 'User Experience',
  'BIZ-ARCH': 'Business Strategy',
  'GOV-ADR': 'Governance',
  'GOV-POL': 'Governance',
  'GOV-COMP': 'Governance',
  'USER': 'End User Documentation',
  'ADMIN': 'Admin Documentation',
  'USER-GUIDE': 'End User Documentation',
  'USER-TUT': 'End User Documentation',
  'OPS-DEPLOY': 'Operations',
  'OPS-MON': 'Operations',
  'OPS-RUN': 'Operations',
  'OPS-RECOV': 'Operations',
  'QUAL-TEST': 'Quality Assurance',
  'QUAL-TRACE': 'Quality Assurance',
  'QUAL-CERT': 'Quality Assurance'
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

function countIncomingRefs(docId, allDocs, contentByDoc) {
  let count = 0;
  for (const [id, content] of contentByDoc) {
    if (id === docId) continue;
    const regex = new RegExp(`\\b${docId}\\b`, 'g');
    if (regex.test(content)) count++;
  }
  return count;
}

function getDependents(moduleId, allDocs, contentByDoc) {
  const deps = [];
  for (const [id, content] of contentByDoc) {
    if (id === moduleId) continue;
    const regex = new RegExp(`\\b${moduleId}\\b`, 'g');
    if (regex.test(content)) {
      deps.push(id);
    }
  }
  return deps;
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const docs = [];
  const contentByDoc = new Map();

  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    const family = fm?.family || 'UNKNOWN';
    contentByDoc.set(docId, content);
    docs.push({
      id: docId,
      name: fm?.document_name || docId,
      file,
      family,
      type: fm?.document_type || 'DOC',
      status: fm?.status || 'Unknown',
      version: fm?.version || '0.0',
      fm
    });
  }

  const incomingRefs = {};
  for (const doc of docs) {
    incomingRefs[doc.id] = countIncomingRefs(doc.id, docs, contentByDoc);
  }

  const orphans = docs.filter(d => incomingRefs[d.id] === 0).map(d => ({
    id: d.id,
    name: d.name,
    family: d.family,
    file: d.file
  }));

  const mostConnected = docs
    .map(d => ({ id: d.id, name: d.name, incomingRefs: incomingRefs[d.id], family: d.family }))
    .sort((a, b) => b.incomingRefs - a.incomingRefs)
    .slice(0, 10);

  const moduleDocs = docs.filter(d => d.family === 'TECH-MOD');
  const moduleDepCounts = moduleDocs.map(m => ({
    id: m.id,
    name: m.name,
    dependents: getDependents(m.id, docs, contentByDoc)
  }));
  const highRisk = moduleDepCounts
    .filter(m => m.dependents.length > 3)
    .sort((a, b) => b.dependents.length - a.dependents.length)
    .map(m => ({ id: m.id, name: m.name, dependentCount: m.dependents.length, dependents: m.dependents }));

  const crossRefCounts = {};
  for (const doc of docs) {
    let count = 0;
    if (doc.fm?.knowledge_objects) {
      const ko = doc.fm.knowledge_objects;
      if (ko.references) count += (Array.isArray(ko.references) ? ko.references : [ko.references]).length;
      if (ko.related) count += (Array.isArray(ko.related) ? ko.related : [ko.related]).length;
    }
    crossRefCounts[doc.id] = count;
  }
  const hotspots = docs
    .filter(d => crossRefCounts[d.id] > 5)
    .sort((a, b) => crossRefCounts[b.id] - crossRefCounts[a.id])
    .slice(0, 10)
    .map(d => ({ id: d.id, name: d.name, crossRefCount: crossRefCounts[d.id] }));

  const familyStats = {};
  for (const doc of docs) {
    if (!familyStats[doc.family]) familyStats[doc.family] = { existing: 0, statuses: {} };
    familyStats[doc.family].existing++;
    familyStats[doc.family].statuses[doc.status] = (familyStats[doc.family].statuses[doc.status] || 0) + 1;
  }

  const coverageByFamily = {};
  for (const [family, planned] of Object.entries(FAMILY_PLANNED)) {
    const existing = familyStats[family]?.existing || 0;
    coverageByFamily[family] = {
      existing,
      planned,
      percentage: planned > 0 ? Math.round((existing / planned) * 100) : 0
    };
  }

  const coverageByKnowledgeDomain = {};
  for (const doc of docs) {
    const domain = KNOWLEDGE_DOMAIN_MAP[doc.family] || 'Other';
    if (!coverageByKnowledgeDomain[domain]) coverageByKnowledgeDomain[domain] = { existing: 0, families: new Set() };
    coverageByKnowledgeDomain[domain].existing++;
    coverageByKnowledgeDomain[domain].families.add(doc.family);
  }
  for (const [domain, data] of Object.entries(coverageByKnowledgeDomain)) {
    data.families = [...data.families];
  }

  const gapAnalysis = [];
  for (const [family, planned] of Object.entries(FAMILY_PLANNED)) {
    const existing = familyStats[family]?.existing || 0;
    if (existing < planned) {
      gapAnalysis.push({
        family,
        existing,
        planned,
        gap: planned - existing,
        severity: planned - existing > 5 ? 'high' : planned - existing > 2 ? 'medium' : 'low'
      });
    }
  }

  const recommendations = [];
  if (orphans.length > 0) {
    recommendations.push(`Add cross-references to ${orphans.length} orphan documents (${orphans.map(o => o.id).join(', ')}) to improve discoverability`);
  }
  if (gapAnalysis.length > 0) {
    const highGaps = gapAnalysis.filter(g => g.severity === 'high');
    if (highGaps.length > 0) {
      recommendations.push(`Prioritize authoring ${highGaps.map(g => `${g.gap} ${g.family} docs`).join(', ')} — these families have the largest documentation gaps`);
    }
  }
  const draftDocs = docs.filter(d => d.status === 'Draft');
  if (draftDocs.length > 0) {
    recommendations.push(`Review and publish ${draftDocs.length} documents still in Draft status (${Math.round((draftDocs.length / docs.length) * 100)}% of total)`);
  }
  if (highRisk.length > 0) {
    recommendations.push(`Conduct dependency audits for ${highRisk.length} high-risk modules: ${highRisk.map(h => h.id).join(', ')}`);
  }
  recommendations.push('Schedule quarterly knowledge graph health reviews to maintain documentation quality');
  recommendations.push('Add traceability metadata (knowledge_objects references/related) to all documents missing it');

  const insights = {
    orphan_documents: orphans,
    most_connected_documents: mostConnected,
    most_referenced_modules: moduleDepCounts.sort((a, b) => b.dependents.length - a.dependents.length).slice(0, 10).map(m => ({
      id: m.id,
      name: m.name,
      dependentCount: m.dependents.length
    })),
    high_risk_dependencies: highRisk,
    documentation_hotspots: hotspots,
    coverage_by_family: coverageByFamily,
    coverage_by_knowledge_domain: coverageByKnowledgeDomain,
    gap_analysis: gapAnalysis.sort((a, b) => b.gap - a.gap),
    recommendations
  };

  fs.writeFileSync(path.join(EXPORTS_DIR, 'knowledge_insights.json'), JSON.stringify(insights, null, 2));

  console.log(`\n Knowledge Insights generated:`);
  console.log(`   ${orphans.length} orphan documents`);
  console.log(`   ${highRisk.length} high-risk dependencies`);
  console.log(`   ${gapAnalysis.length} gaps identified`);
  console.log(`   ${recommendations.length} recommendations\n`);
}

generate();
