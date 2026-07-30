const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const VALID_FAMILIES = ['TECH-DEV', 'TECH-ARCH', 'TECH-MOD', 'TECH-DB', 'TECH-UX', 'TECH-API', 'BIZ-ARCH', 'BIZ-PROD', 'BIZ-ECO', 'GOV-ADR', 'GOV-POL', 'GOV-COMP', 'USER-GUIDE', 'USER-TUT', 'ADMIN', 'USER', 'OPS-DEPLOY', 'OPS-MON', 'OPS-RUN', 'OPS-RECOV', 'QUAL-TEST', 'QUAL-TRACE', 'QUAL-CERT'];
const FORBIDDEN_PATTERNS = [/TODO/i, /TBD/i, /\bPlaceholder\b/i, /Coming Soon/i, /FUTURE/i];
const EXCLUDED_FILES = ['README.md', 'mkdocs.yml', 'index.md']; 
const VOLUME_PREFIX = 'VOLUME_';

const REQUIRED_FIELDS = ['document_id', 'document_name', 'family', 'status', 'version'];

let errors = [];
let docs = [];
let allDocIds = new Map();

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

function extractDocIdFromContent(content) {
  const match = content.match(/\(?\b([A-Z]+-\d+(?:-\d+)?)\)?/);
  if (match) return match[1];
  return null;
}

function findInternalLinks(content, knownIds) {
  const links = [];
  const patterns = [
    ...knownIds
  ];
  const regex = new RegExp(`\\b(${knownIds.join('|')})\\b`, 'g');
  let m;
  while ((m = regex.exec(content)) !== null) {
    if (!links.includes(m[1])) links.push(m[1]);
  }
  return links;
}

function checkForbiddenPatterns(content, filePath) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      errors.push(`${filePath}: Contains forbidden text "${match[0]}"`);
    }
  }
}

function validate() {
  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const knownIds = new Set();

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);

    if (!fm) {
      const isVolume = file.startsWith(VOLUME_PREFIX);
      let inferredId = extractDocIdFromContent(file);
      if (isVolume) {
        const volMatch = file.match(/^VOLUME_(\d+)_/);
        if (volMatch) inferredId = `VOLUME-${volMatch[1]}`;
      }
      if (inferredId) {
        if (!isVolume) {
          errors.push(`${file}: Missing frontmatter (document_id inferred as ${inferredId})`);
        }
        knownIds.add(inferredId);
        docs.push({ file, id: inferredId, fm: null });
      } else {
        if (!isVolume) {
          errors.push(`${file}: Missing frontmatter and no document_id could be inferred`);
        }
      }
      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!fm[field] || fm[field] === '') {
        errors.push(`${file}: Missing required frontmatter field "${field}"`);
      }
    }

    if (fm.document_id) {
      const id = fm.document_id;
      if (allDocIds.has(id) && allDocIds.get(id) !== file) {
        errors.push(`${file}: Duplicate document_id "${id}" (also in ${allDocIds.get(id)})`);
      } else {
        allDocIds.set(id, file);
        knownIds.add(id);
      }
    }

    if (fm.family && !VALID_FAMILIES.includes(fm.family)) {
      errors.push(`${file}: Invalid family "${fm.family}". Must be one of: ${VALID_FAMILIES.join(', ')}`);
    }

    docs.push({ file, id: fm.document_id || extractDocIdFromContent(file), fm });
  }

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    checkForbiddenPatterns(content, file);

    const internalLinks = findInternalLinks(content, [...knownIds]);
    const doc = docs.find(d => d.file === file);
    if (doc && doc.id) {
      for (const link of internalLinks) {
        if (link === doc.id) continue;
        if (!knownIds.has(link)) {
          errors.push(`${file}: Cross-reference to "${link}" but no document with that ID exists`);
        }
      }
    }
  }

  const allRefs = new Set();
  for (const doc of docs) {
    if (doc.fm && doc.fm.knowledge_objects) {
      const ko = doc.fm.knowledge_objects;
      if (ko.references) {
        for (const ref of ko.references) {
          if (!knownIds.has(ref) && ref !== doc.id) {
            errors.push(`${doc.file}: knowledge_objects.references "${ref}" points to non-existent document`);
          }
          allRefs.add(ref);
        }
      }
      if (ko.related) {
        for (const rel of ko.related) {
          if (!knownIds.has(rel) && rel !== doc.id) {
            errors.push(`${doc.file}: knowledge_objects.related "${rel}" points to non-existent document`);
          }
          allRefs.add(rel);
        }
      }
    }
  }

  const statuses = ['Draft', 'Accepted', 'Deprecated', 'Review', 'Published'];
  for (const doc of docs) {
    if (doc.fm && doc.fm.status && !statuses.includes(doc.fm.status)) {
      errors.push(`${doc.file}: Unknown status "${doc.fm.status}"`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Validation failed with ${errors.length} error(s):\n`);
    for (const err of errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  } else {
    console.log(`\n✅ Validation passed for ${docs.length} documents.\n`);
    process.exit(0);
  }
}

validate();
