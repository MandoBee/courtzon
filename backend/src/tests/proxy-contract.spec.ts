import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../../');

// ── Proxy drift guard ─────────────────────────────────────────────────────
// Every active same-origin frontend API prefix must be handled by BOTH the
// production Nginx routing and the Vite development proxy. If a new frontend
// API prefix is added without adding proxy coverage, this test fails — the
// request would fall through to the SPA index.html and be silently broken in
// Docker/Nginx. This is the deterministic mechanism preventing RD-02 regressions.

interface ProxyConfigs {
  nginxLocations: string[];
  viteKeys: string[];
}

function loadConfigs(): ProxyConfigs {
  const nginxConf = resolve(projectRoot, 'frontend/nginx.conf');
  const apiProxyConf = resolve(projectRoot, 'frontend/api-proxy.conf');
  const viteConf = resolve(projectRoot, 'frontend/vite.config.ts');

  let nginxSrc = '';
  if (existsSync(nginxConf)) nginxSrc += readFileSync(nginxConf, 'utf8') + '\n';
  if (existsSync(apiProxyConf)) nginxSrc += readFileSync(apiProxyConf, 'utf8') + '\n';
  const viteSrc = readFileSync(viteConf, 'utf8');

  // Nginx location prefixes: `location /prefix` or `location /prefix/` or `location = /prefix`.
  const nginxLocations = [...nginxSrc.matchAll(/location\s+([=~^* ]*)(\/[A-Za-z0-9_-]+)/g)]
    .map((m) => m[2])
    .filter((p) => p.startsWith('/'));

  // Vite proxy keys: `'/prefix': backend,` or `"/prefix": backend,`
  const viteKeys = [...viteSrc.matchAll(/(['"])(\/[A-Za-z0-9_-]+)\1\s*:\s*backend/g)]
    .map((m) => m[2])
    .filter((p) => p.startsWith('/'));

  return { nginxLocations, viteKeys };
}

/** Extract the first path segment of every active frontend API call. */
function extractActivePrefixes(): string[] {
  const prefixes = new Set<string>();

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        const src = readFileSync(p, 'utf8');
        const callRe = /api\.(get|post|put|patch|delete)\(\s*['"`](\/[A-Za-z0-9_-]+)/g;
        const authApiRe = /authApi\.\w+\(\s*['"`](\/[A-Za-z0-9_-]+)/g;
        let m;
        while ((m = callRe.exec(src)) !== null) prefixes.add(m[2]);
        while ((m = authApiRe.exec(src)) !== null) prefixes.add(m[1]);
      }
    }
  };

  walk(resolve(projectRoot, 'frontend/src'));
  return [...prefixes].sort();
}

describe('Frontend API proxy contract (RD-02 drift guard)', () => {
  let active: string[];
  let nginx: string[];
  let vite: string[];

  beforeAll(() => {
    active = extractActivePrefixes();
    const configs = loadConfigs();
    nginx = configs.nginxLocations;
    vite = configs.viteKeys;
  });

  it('detects a non-empty set of active frontend API prefixes', () => {
    expect(active.length).toBeGreaterThan(10);
    expect(active).toContain('/scheduling');
    expect(active).toContain('/players');
    expect(active).toContain('/withdrawals');
    expect(active).toContain('/unified-settlements');
    expect(active).toContain('/coach-sessions');
    expect(active).toContain('/pricing');
    expect(active).toContain('/referee');
    expect(active).toContain('/bi');
  });

  it('covers every active prefix in the production Nginx routing', () => {
    const uncovered = active.filter((p) => !nginx.some((n) => p.startsWith(n) || n.startsWith(p)));
    expect(uncovered, `Active API prefixes missing from Nginx routing: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('covers every active prefix in the Vite development proxy', () => {
    const uncovered = active.filter((p) => !vite.some((n) => p.startsWith(n) || n.startsWith(p)));
    expect(uncovered, `Active API prefixes missing from Vite proxy: ${uncovered.join(', ')}`).toEqual([]);
  });
});