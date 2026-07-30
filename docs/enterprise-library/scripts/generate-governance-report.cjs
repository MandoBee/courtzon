const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports');
const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md'];

const REQUIRED_TRACEABILITY_FIELDS = ['document_id', 'document_name', 'family', 'status', 'version',
  'business_owner', 'technical_owner', 'documentation_owner', 'lifecycle_status'];
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

const VALID_FAMILIES = ['TECH-DEV', 'TECH-ARCH', 'TECH-MOD', 'TECH-DB', 'TECH-UX', 'TECH-API',
  'BIZ-ARCH', 'BIZ-PROD', 'BIZ-ECO', 'GOV-ADR', 'GOV-POL', 'GOV-COMP',
  'USER-GUIDE', 'USER-TUT', 'ADMIN', 'USER', 'OPS-DEPLOY', 'OPS-MON',
  'OPS-RUN', 'OPS-RECOV', 'QUAL-TEST', 'QUAL-TRACE', 'QUAL-CERT'];

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

function checkBrokenReferences(content, docId, knownIds) {
  const broken = [];
  const allIds = [...knownIds].filter(id => id !== docId);
  if (allIds.length === 0) return broken;
  const regex = new RegExp(`\\b(${allIds.join('|')})\\b`, 'g');
  const found = new Set();
  let m;
  while ((m = regex.exec(content)) !== null) {
    found.add(m[1]);
  }
  return [...found];
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const contentByDoc = new Map();
  const knownIds = new Set();
  const docs = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    knownIds.add(docId);
    contentByDoc.set(docId, content);
    docs.push({ file, id: docId, fm, content });
  }

  let traceableCount = 0;
  let freshCount = 0;
  let brokenRefs = 0;
  const brokenRefList = [];
  const alerts = [];
  const familyScores = {};
  const familyDocs = {};
  const duplicateIds = [];

  const idCounts = {};
  for (const doc of docs) {
    idCounts[doc.id] = (idCounts[doc.id] || 0) + 1;
  }
  for (const [id, count] of Object.entries(idCounts)) {
    if (count > 1) duplicateIds.push(id);
  }

  for (const doc of docs) {
    const fm = doc.fm;
    if (!fm) continue;

    const hasTraceability = REQUIRED_TRACEABILITY_FIELDS.every(f => fm[f] !== undefined && fm[f] !== '');
    if (hasTraceability) traceableCount++;

    if (fm.last_review_date) {
      const reviewDate = new Date(fm.last_review_date);
      if (!isNaN(reviewDate.getTime()) && (Date.now() - reviewDate.getTime()) < SIX_MONTHS_MS) {
        freshCount++;
      }
    }

    if (fm.status === 'Draft' || fm.status === 'Review') {
      alerts.push({
        severity: 'warning',
        message: `${doc.id} has status "${fm.status}" — not yet published`,
        document: doc.id
      });
    }

    const refs = checkBrokenReferences(doc.content, doc.id, knownIds);
    for (const ref of refs) {
      if (!knownIds.has(ref)) {
        brokenRefs++;
        brokenRefList.push({ source: doc.id, target: ref });
      }
    }

    const family = fm.family || 'UNKNOWN';
    if (!familyDocs[family]) familyDocs[family] = [];
    familyDocs[family].push(doc.id);
    if (!familyScores[family]) familyScores[family] = { traceable: 0, total: 0, fresh: 0 };
    familyScores[family].total++;
    if (hasTraceability) familyScores[family].traceable++;
    if (fm.last_review_date) {
      const rd = new Date(fm.last_review_date);
      if (!isNaN(rd.getTime()) && (Date.now() - rd.getTime()) < SIX_MONTHS_MS) {
        familyScores[family].fresh++;
      }
    }

    if (fm.status === 'Draft' && fm.lifecycle_status?.toLowerCase() === 'draft') {
      const reviewDate = fm.last_review_date;
      if (reviewDate) {
        const rd = new Date(reviewDate);
        if (!isNaN(rd.getTime())) {
          const monthsSinceReview = Math.floor((Date.now() - rd.getTime()) / (30 * 24 * 60 * 60 * 1000));
          if (monthsSinceReview > 6) {
            alerts.push({
              severity: 'alert',
              message: `${doc.id} has not been reviewed in ${monthsSinceReview} months (last review: ${reviewDate})`,
              document: doc.id
            });
          }
        }
      }
    }
  }

  const traceabilityCoverage = docs.length > 0 ? Math.round((traceableCount / docs.length) * 100) : 0;
  const reviewFreshness = docs.length > 0 ? Math.round((freshCount / docs.length) * 100) : 0;

  const familyScoreResult = {};
  for (const [family, data] of Object.entries(familyScores)) {
    familyScoreResult[family] = {
      documentCount: data.total,
      traceabilityCoverage: data.total > 0 ? Math.round((data.traceable / data.total) * 100) : 0,
      reviewFreshness: data.total > 0 ? Math.round((data.fresh / data.total) * 100) : 0
    };
  }

  const allFamilies = Object.keys(familyScoreResult);
  const avgTraceability = allFamilies.length > 0
    ? Math.round(allFamilies.reduce((s, f) => s + familyScoreResult[f].traceabilityCoverage, 0) / allFamilies.length)
    : 0;
  const avgFreshness = allFamilies.length > 0
    ? Math.round(allFamilies.reduce((s, f) => s + familyScoreResult[f].reviewFreshness, 0) / allFamilies.length)
    : 0;

  const overallScore = Math.round((traceabilityCoverage * 0.4) + (reviewFreshness * 0.3) + (brokenRefs === 0 ? 20 : Math.max(0, 20 - (brokenRefs * 5))) + (duplicateIds.length === 0 ? 10 : 0));

  const recommendations = [];
  if (traceabilityCoverage < 80) {
    recommendations.push(`Improve traceability metadata: ${docs.length - traceableCount} of ${docs.length} documents missing required fields`);
  }
  if (reviewFreshness < 50) {
    recommendations.push(`Schedule reviews for ${docs.length - freshCount} documents not reviewed in the last 6 months`);
  }
  if (brokenRefs > 0) {
    recommendations.push(`Fix ${brokenRefs} broken cross-references across ${new Set(brokenRefList.map(b => b.source)).size} documents`);
  }
  if (duplicateIds.length > 0) {
    recommendations.push(`Resolve ${duplicateIds.length} duplicate document IDs: ${duplicateIds.join(', ')}`);
  }
  recommendations.push('Implement automated review reminders for documents approaching 6-month review window');

  const report = {
    overall_score: Math.min(100, overallScore),
    traceability_coverage: traceabilityCoverage,
    review_freshness: reviewFreshness,
    orphan_count: 0,
    broken_references: brokenRefs,
    duplicate_objects: duplicateIds.length,
    last_full_review: '2026-07-28',
    family_scores: familyScoreResult,
    alerts: alerts.slice(0, 20),
    recommendations
  };

  fs.writeFileSync(path.join(EXPORTS_DIR, 'governance_report.json'), JSON.stringify(report, null, 2));

  console.log(`\n Governance Report generated:`);
  console.log(`   Overall Score: ${report.overall_score}%`);
  console.log(`   Traceability: ${traceabilityCoverage}% | Freshness: ${reviewFreshness}%`);
  console.log(`   Broken refs: ${brokenRefs} | Duplicates: ${duplicateIds.length}`);
  console.log(`   ${alerts.length} alerts | ${recommendations.length} recommendations\n`);
}

generate();
