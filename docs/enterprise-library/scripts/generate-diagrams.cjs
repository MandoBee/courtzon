const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(DOCS_DIR, 'exports', 'diagrams');

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

function extractEvents(content) {
  const events = [];
  const eventRegex = /`([a-z]+(?:\.[a-z]+)?:[a-z_]+)`/gi;
  let m;
  while ((m = eventRegex.exec(content)) !== null) {
    if (!events.includes(m[1].trim()) && m[1].includes(':')) {
      events.push(m[1].trim());
    }
  }
  return events;
}

function generate() {
  ensureDir(EXPORTS_DIR);

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && !EXCLUDED_FILES.includes(f));
  const docs = [];
  const crossRefs = [];
  const allEvents = [];

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const docId = fm?.document_id || file.replace(/\.md$/, '');
    const docName = fm?.document_name || file.replace(/\.md$/, '').replace(/_/g, ' ');
    const family = fm?.family || 'UNKNOWN';

    docs.push({ id: docId, name: docName, family, type: fm?.document_type || 'DOC' });

    if (fm?.knowledge_objects) {
      const ko = fm.knowledge_objects;
      const addRefs = (targets, type) => {
        if (!targets) return;
        const arr = Array.isArray(targets) ? targets : [targets];
        for (const t of arr) {
          crossRefs.push({ source: docId, target: t, type });
        }
      };
      addRefs(ko.governs, 'governs');
      addRefs(ko.references, 'references');
      addRefs(ko.related, 'related');
    }

    const events = extractEvents(content);
    allEvents.push(...events.map(e => ({ source: docId, event: e })));
  }

  const familyStyles = {
    'TECH-ARCH': { fill: '#4A90D9', stroke: '#2C5F8A' },
    'TECH-MOD': { fill: '#50B86C', stroke: '#2D7A46' },
    'TECH-DEV': { fill: '#9B59B6', stroke: '#6C3483' },
    'TECH-DB': { fill: '#E67E22', stroke: '#A85C16' },
    'TECH-UX': { fill: '#1ABC9C', stroke: '#0E6655' },
    'BIZ-ARCH': { fill: '#E74C3C', stroke: '#A93226' },
    'BIZ-PROD': { fill: '#F39C12', stroke: '#B7770C' },
    'GOV-ADR': { fill: '#8E44AD', stroke: '#5B2C6F' },
    'OPS-DEPLOY': { fill: '#2C3E50', stroke: '#1A252F' },
    'OPS-MON': { fill: '#7F8C8D', stroke: '#5D6D7E' },
    'OPS-RUN': { fill: '#5D6D7E', stroke: '#3D4B53' },
    'QUAL-TEST': { fill: '#27AE60', stroke: '#1A7A42' },
    'QUAL-TRACE': { fill: '#16A085', stroke: '#0E6655' },
    'QUAL-CERT': { fill: '#2980B9', stroke: '#1A5276' },
    'USER-GUIDE': { fill: '#3498DB', stroke: '#1F6DA0' },
    default: { fill: '#95A5A6', stroke: '#5D6D7E' }
  };

  const familySubgroups = {
    'Business': ['BIZ-ARCH', 'BIZ-PROD', 'BIZ-ECO'],
    'Architecture': ['TECH-ARCH'],
    'Modules': ['TECH-MOD'],
    'Development': ['TECH-DEV', 'TECH-DB', 'TECH-UX'],
    'Governance': ['GOV-ADR', 'GOV-POL', 'GOV-COMP'],
    'Operations': ['OPS-DEPLOY', 'OPS-MON', 'OPS-RUN', 'OPS-RECOV'],
    'Quality': ['QUAL-TEST', 'QUAL-TRACE', 'QUAL-CERT'],
    'User Guides': ['USER-GUIDE', 'USER-TUT']
  };

  const familyToSubgroup = {};
  for (const [sg, families] of Object.entries(familySubgroups)) {
    for (const f of families) familyToSubgroup[f] = sg;
  }

  let sysArch = 'graph TD\n';
  sysArch += '  subgraph "Frontend"\n';
  sysArch += '    FE[React 19 + Vite]\n';
  sysArch += '  end\n';
  sysArch += '  subgraph "Backend (Fastify)"\n';
  const moduleDocs = docs.filter(d => d.family === 'TECH-MOD');
  for (const mod of moduleDocs) {
    const name = mod.id.replace(/[-\s]/g, '_');
    sysArch += `    ${name}["${mod.name}"]\n`;
  }
  sysArch += '  end\n';
  sysArch += '  subgraph "Data Layer"\n';
  sysArch += '    DB[(MySQL)]\n';
  sysArch += '    REDIS[(Redis)]\n';
  sysArch += '  end\n';
  sysArch += '  subgraph "External"\n';
  sysArch += '    PAY[Payment Gateway]\n';
  sysArch += '    EMAIL[Email/SMS/Push]\n';
  sysArch += '  end\n';
  sysArch += '  FE -->|HTTP| Backend\n';

  const archDocs = docs.filter(d => d.family === 'TECH-ARCH');
  const modIds = moduleDocs.map(m => m.id);
  for (const ref of crossRefs) {
    if (modIds.includes(ref.source) && modIds.includes(ref.target)) {
      const s = ref.source.replace(/[-\s]/g, '_');
      const t = ref.target.replace(/[-\s]/g, '_');
      if (!sysArch.includes(`${s} -->|${ref.type}| ${t}`)) {
        sysArch += `  ${s} -->|${ref.type}| ${t}\n`;
      }
    }
  }
  sysArch += '  Backend --> DB\n';
  sysArch += '  Backend --> REDIS\n';
  sysArch += '  Backend --> PAY\n';
  sysArch += '  Backend --> EMAIL\n';
  fs.writeFileSync(path.join(EXPORTS_DIR, 'system_architecture.mmd'), sysArch);

  let modDeps = 'graph LR\n';
  const subgroupColors = {
    'Business': '#E74C3C',
    'Architecture': '#4A90D9',
    'Modules': '#50B86C',
    'Development': '#9B59B6',
    'Governance': '#8E44AD',
    'Operations': '#2C3E50',
    'Quality': '#27AE60',
    'User Guides': '#3498DB'
  };

  for (const doc of docs) {
    const sg = familyToSubgroup[doc.family] || 'Other';
    const color = subgroupColors[sg] || '#95A5A6';
    const nid = doc.id.replace(/[-\s]/g, '_');
    modDeps += `  ${nid}["${doc.id}: ${doc.name}"]:::${sg.replace(/[-\s]/g, '_')}\n`;
  }

  for (const ref of crossRefs) {
    const s = ref.source.replace(/[-\s]/g, '_');
    const t = ref.target.replace(/[-\s]/g, '_');
    const exists = docs.find(d => d.id === ref.target);
    if (exists) {
      modDeps += `  ${s} -->|${ref.type}| ${t}\n`;
    }
  }

  modDeps += '\n';
  for (const [sg, color] of Object.entries(subgroupColors)) {
    const cls = sg.replace(/[-\s]/g, '_');
    modDeps += `  classDef ${cls} fill:${color}22,stroke:${color},stroke-width:2px\n`;
  }
  fs.writeFileSync(path.join(EXPORTS_DIR, 'module_dependencies.mmd'), modDeps);

  let eventFlow = 'graph LR\n';
  const seenEvents = [...new Set(allEvents.map(e => e.event))];
  for (const evt of seenEvents) {
    const eid = evt.replace(/:/g, '_').replace(/[-\s]/g, '_');
    const sources = allEvents.filter(e => e.event === evt).map(e => e.source);
    const srcNodes = [...new Set(sources)];
    eventFlow += `  ${eid}["${evt}"]\n`;
    for (const src of srcNodes) {
      const sid = src.replace(/[-\s]/g, '_');
      eventFlow += `  ${sid} -->|emits| ${eid}\n`;
    }
  }
  eventFlow += '  style Event fill:#f9f,stroke:#333,stroke-width:2px\n';
  fs.writeFileSync(path.join(EXPORTS_DIR, 'event_flow.mmd'), eventFlow);

  console.log(`\n✅ Diagrams generated in ${EXPORTS_DIR}/:`);
  console.log(`   system_architecture.mmd — ${docs.length} components`);
  console.log(`   module_dependencies.mmd — ${crossRefs.length} relationships`);
  console.log(`   event_flow.mmd — ${seenEvents.length} events\n`);
}

generate();
