const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports');

const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md'];
const REQUIRED_FIELDS = ['document_id', 'document_name', 'family', 'status', 'version'];
const STATUS_WEIGHTS = { 'Published': 100, 'Accepted': 90, 'Review': 75, 'Draft': 60, 'Deprecated': 30 };
const FORBIDDEN_PATTERNS = [/TODO/i, /TBD/i, /\bPlaceholder\b/i, /Coming Soon/i, /FUTURE/i];

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

function countCrossReferences(fm) {
  let count = 0;
  if (!fm || !fm.knowledge_objects) return 0;
  const ko = fm.knowledge_objects;
  if (ko.governs) count += (Array.isArray(ko.governs) ? ko.governs : [ko.governs]).length;
  if (ko.references) count += (Array.isArray(ko.references) ? ko.references : [ko.references]).length;
  if (ko.related) count += (Array.isArray(ko.related) ? ko.related : [ko.related]).length;
  return count;
}

function checkForbiddenPatterns(content) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) return true;
  }
  return false;
}

function checkLinkIntegrity(content, docId, knownIds) {
  const ids = [...knownIds];
  const refRegex = new RegExp(`\\b(${ids.join('|')})\\b`, 'g');
  const found = new Set();
  let m;
  while ((m = refRegex.exec(content)) !== null) {
    if (m[1] !== docId) found.add(m[1]);
  }
  return { refCount: found.size, refs: [...found] };
}

function calculateScore(doc) {
  let score = 0;
  const checks = {};

  const fmFields = Object.keys(doc.fm || {});
  const requiredPresent = REQUIRED_FIELDS.filter(f => fmFields.includes(f) && doc.fm[f]);
  checks.metadataCompleteness = requiredPresent.length / REQUIRED_FIELDS.length;
  score += checks.metadataCompleteness * 30;

  const statusWeight = STATUS_WEIGHTS[doc.status] || 50;
  checks.statusWeight = statusWeight / 100;
  score += checks.statusWeight * 20;

  checks.hasCrossReferences = doc.refCount > 0 ? 1 : 0;
  score += checks.hasCrossReferences * 15;

  checks.hasEntities = doc.entityCount > 0 ? 1 : 0;
  score += checks.hasEntities * 10;

  checks.hasRoutes = doc.routeCount > 0 ? 1 : 0;
  score += checks.hasRoutes * 10;

  checks.noForbiddenText = doc.hasForbiddenText ? 0 : 1;
  score += checks.noForbiddenText * 15;

  return { score: Math.round(score), checks };
}

function getHealthLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Needs Review';
  return 'Outdated';
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const knownIds = new Set();

  const parsed = [];
  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    knownIds.add(docId);
    const entityCount = (content.match(/\|\s*\w[\w\s]*\s*\|\s*`\w+`\s*\|/g) || []).length;
    const routeCount = (content.match(/\|\s*\d+\s*\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|/g) || []).length;
    parsed.push({ file, docId, fm, content, entityCount, routeCount });
  }

  const docReports = [];
  for (const doc of parsed) {
    const refCount = countCrossReferences(doc.fm);
    const hasForbiddenText = checkForbiddenPatterns(doc.content);
    const linkInfo = checkLinkIntegrity(doc.content, doc.docId, knownIds);
    const status = doc.fm?.status || 'Unknown';

    const scoreData = calculateScore({
      fm: doc.fm,
      status,
      refCount,
      entityCount: doc.entityCount,
      routeCount: doc.routeCount,
      hasForbiddenText
    });

    const docReport = {
      documentId: doc.docId,
      documentName: doc.fm?.document_name || doc.file,
      family: doc.fm?.family || 'UNKNOWN',
      file: doc.file,
      healthScore: scoreData.score,
      healthLabel: getHealthLabel(scoreData.score),
      checks: scoreData.checks,
      metadata: {
        hasDocumentId: !!doc.fm?.document_id,
        hasDocumentName: !!doc.fm?.document_name,
        hasFamily: !!doc.fm?.family,
        hasStatus: !!doc.fm?.status,
        hasVersion: !!doc.fm?.version
      },
      crossReferenceCount: refCount,
      entityCount: doc.entityCount,
      routeCount: doc.routeCount,
      linkRefCount: linkInfo.refCount,
      hasForbiddenText
    };
    docReports.push(docReport);
  }

  const familyScores = {};
  for (const doc of docReports) {
    if (!familyScores[doc.family]) familyScores[doc.family] = { docs: [], totalScore: 0 };
    familyScores[doc.family].docs.push(doc.documentId);
    familyScores[doc.family].totalScore += doc.healthScore;
  }

  const familySummaries = Object.entries(familyScores).map(([family, data]) => {
    const avgScore = Math.round(data.totalScore / data.docs.length);
    return {
      family,
      documentCount: data.docs.length,
      averageHealthScore: avgScore,
      healthLabel: getHealthLabel(avgScore),
      documents: data.docs
    };
  });

  const overallScore = Math.round(docReports.reduce((sum, d) => sum + d.healthScore, 0) / docReports.length);

  const report = {
    generated: new Date().toISOString(),
    overall: {
      documentCount: docReports.length,
      averageHealthScore: overallScore,
      healthLabel: getHealthLabel(overallScore)
    },
    families: familySummaries.sort((a, b) => b.averageHealthScore - a.averageHealthScore),
    documents: docReports.sort((a, b) => a.healthScore - b.healthScore),
    summary: {
      excellent: docReports.filter(d => d.healthLabel === 'Excellent').length,
      good: docReports.filter(d => d.healthLabel === 'Good').length,
      needsReview: docReports.filter(d => d.healthLabel === 'Needs Review').length,
      outdated: docReports.filter(d => d.healthLabel === 'Outdated').length,
      missingFrontmatter: docReports.filter(d => !d.metadata.hasDocumentId).length,
      hasForbiddenText: docReports.filter(d => d.hasForbiddenText).length
    }
  };

  fs.writeFileSync(path.join(EXPORTS_DIR, 'health_report.json'), JSON.stringify(report, null, 2));

  console.log(`\n✅ Health Report generated:`);
  console.log(`   Overall Score: ${overallScore}% (${report.overall.healthLabel})`);
  console.log(`   ${report.summary.excellent} Excellent | ${report.summary.good} Good | ${report.summary.needsReview} Needs Review | ${report.summary.outdated} Outdated`);
  console.log(`   ${docReports.length} documents across ${familySummaries.length} families\n`);
}

generate();
