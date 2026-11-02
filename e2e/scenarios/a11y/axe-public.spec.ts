/**
 * E3 — automated accessibility scan (axe-core) for PUBLIC, read-only pages.
 *
 * Scope (approved review, 2026-11-02):
 *   `/`, `/login`, `/forgot-password`, `/register`, `/tournaments/public`,
 *   and one public tournament detail page when the runtime API exposes one.
 *
 * Viewports: the constants already used by E1 / E2 / E4.
 *   E1 → 1440x900, E2 → 390x844, E4 → 768x1024 and 1024x768.
 *
 * Hard safety barriers:
 *  1. Fail closed unless the frontend target is loopback on port 5173 and the
 *     API target is loopback on port 3000 (never Live).
 *  2. `test` is imported directly from `@playwright/test` — no fixtures or
 *     helpers that could write to the database are imported.
 *  3. Every non-GET/HEAD/OPTIONS request is aborted and recorded; any such
 *     attempt fails the test.
 *  4. No data, accounts or tournaments are created. Missing data = BLOCKED,
 *     never PASS.
 *
 * Success criterion (E3 row, E2E_SCENARIO_MATRIX §3.5):
 *   zero `critical` and zero `serious` violations per scanned page.
 *   `moderate` / `minor` are recorded as observations, not failures.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_URL = process.env.E2E_A11Y_BASE_URL ?? 'http://127.0.0.1:5173';
const BACKEND_URL = process.env.E2E_A11Y_API_URL ?? 'http://127.0.0.1:3000';
const FRONTEND_PORT = '5173';
const BACKEND_PORT = '3000';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Colour scheme under test. The app defaults to `dark` when
 * `localStorage.theme_mode` is absent (`frontend/src/store/theme.store.ts:71`),
 * so both modes must be scanned explicitly (approved 2026-11-02).
 */
const THEME: 'light' | 'dark' = process.env.E3_THEME === 'light' ? 'light' : 'dark';

/**
 * Local frontend ports allowed for the scan:
 *  - 5173: the Docker/Nginx frontend
 *  - 5174: a local Vite dev server running the same source (used when the
 *          Docker image is intentionally not rebuilt)
 * Both are loopback-only; anything else fails closed.
 */
const ALLOWED_FRONTEND_PORTS = new Set([FRONTEND_PORT, '5174']);

/** Fail closed before any browser or network activity. */
function assertLoopback(raw: string, expectedPorts: Set<string>, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`E3 HARD STOP: ${label} URL is not parseable: "${raw}"`);
  }
  if (url.protocol !== 'http:') {
    throw new Error(`E3 HARD STOP: ${label} must use http on loopback, got "${raw}"`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`E3 HARD STOP: ${label} host must be loopback (127.0.0.1/localhost/::1), got "${url.hostname}"`);
  }
  if (!expectedPorts.has(url.port)) {
    throw new Error(
      `E3 HARD STOP: ${label} port must be one of ${[...expectedPorts].join('/')}, got "${url.port || '(default)'}"`,
    );
  }
  return url;
}

const FRONTEND = assertLoopback(FRONTEND_URL, ALLOWED_FRONTEND_PORTS, 'frontend');
assertLoopback(BACKEND_URL, new Set([BACKEND_PORT]), 'backend API');

/** Viewport constants inherited from E1 (1440x900), E2 (390x844) and E4 (768/1024). */
const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 }, // E1
  { name: 'mobile-390x844', width: 390, height: 844 }, // E2
  { name: 'tablet-768x1024', width: 768, height: 1024 }, // E4
  { name: 'tablet-1024x768', width: 1024, height: 768 }, // E4
] as const;

type PageDef = {
  key: string;
  label: string;
  /** Fixed path, or a resolver that returns null when the page has no runtime data. */
  path?: string;
  resolvePath?: () => Promise<string | null>;
};

let discovery: Promise<{ id: string; name: string } | null> | undefined;

/** Read-only discovery of a public tournament. No creation, no writes. */
function discoverPublicTournament(): Promise<{ id: string; name: string } | null> {
  discovery ??= (async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/public/tournaments`, { method: 'GET' });
      if (!res.ok) return null;
      const json: any = await res.json();
      const arr: any[] = json?.data ?? json?.tournaments ?? (Array.isArray(json) ? json : []);
      if (!Array.isArray(arr)) return null;
      const first = arr.find((t) => t && t.id != null);
      return first ? { id: String(first.id), name: String(first.name ?? '') } : null;
    } catch {
      return null;
    }
  })();
  return discovery;
}

const PAGES: PageDef[] = [
  { key: 'landing', label: 'Landing (/)', path: '/' },
  { key: 'login', label: 'Login (/login)', path: '/login' },
  { key: 'forgot-password', label: 'Forgot password (/forgot-password)', path: '/forgot-password' },
  { key: 'register', label: 'Register (/register)', path: '/register' },
  { key: 'public-tournaments', label: 'Public tournaments list (/tournaments/public)', path: '/tournaments/public' },
  {
    key: 'public-tournament-detail',
    label: 'Public tournament detail (/tournaments/public/:id)',
    resolvePath: async () => {
      const t = await discoverPublicTournament();
      return t ? `/tournaments/public/${t.id}` : null;
    },
  },
];

type NodeSummary = {
  target: string;
  html: string;
  failureSummary: string;
};

type ViolationSummary = {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: number;
  targets: string[];
  nodeDetails: NodeSummary[];
};

function summarise(results: any): ViolationSummary[] {
  return (results.violations ?? []).map((v: any) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: Array.isArray(v.tags) ? v.tags : [],
    nodes: Array.isArray(v.nodes) ? v.nodes.length : 0,
    targets: Array.isArray(v.nodes)
      ? v.nodes.slice(0, 5).map((n: any) => (Array.isArray(n.target) ? n.target.join(' ') : String(n.target)))
      : [],
    nodeDetails: Array.isArray(v.nodes)
      ? v.nodes.slice(0, 10).map((n: any) => ({
          target: Array.isArray(n.target) ? n.target.join(' ') : String(n.target),
          html: String(n.html ?? '').slice(0, 300),
          failureSummary: String(n.failureSummary ?? '').slice(0, 600),
        }))
      : [],
  }));
}

/**
 * The SPA bootstraps the session with `POST /auth/refresh`. It is not initiated
 * by this spec and it is ALWAYS aborted below (so it never reaches the server
 * and can never rotate a token or write to the database). It is recorded, not
 * treated as a harness failure. Any other non-GET request is unexpected.
 */
const KNOWN_BOOTSTRAP_WRITES = [/\/auth\/refresh$/];

function isKnownBootstrapWrite(entry: string): boolean {
  return KNOWN_BOOTSTRAP_WRITES.some((re) => re.test(entry.split(' ').slice(1).join(' ')));
}

for (const viewport of VIEWPORTS) {
  for (const pageDef of PAGES) {
    test(`E3 ${pageDef.key} @ ${viewport.name} [${THEME}]`, async ({ page }, testInfo) => {
      test.setTimeout(150_000);

      const targetPath = pageDef.path ?? (await pageDef.resolvePath!());
      if (!targetPath) {
        testInfo.annotations.push({
          type: 'blocked',
          description:
            'BLOCKED: GET /public/tournaments returned no public tournament; no data was created (creation is out of scope).',
        });
        test.skip(true, 'BLOCKED: no public tournament exposed at runtime — no data created.');
        return;
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Force the colour scheme before the SPA boots: `theme.store.ts:init()`
      // reads `localStorage.theme_mode` synchronously on first paint.
      await page.addInitScript((mode: 'light' | 'dark') => {
        try {
          localStorage.setItem('theme_mode', mode);
        } catch {
          /* storage disabled — the assertion below will catch the wrong mode */
        }
      }, THEME);
      await page.emulateMedia({ colorScheme: THEME });

      // Barrier 3: every non-GET/HEAD/OPTIONS request is aborted before it can
      // reach the server, so zero writes (and zero DB mutations) are possible.
      const blockedWrites: string[] = [];
      await page.route('**/*', async (route) => {
        const method = route.request().method();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
          await route.continue();
          return;
        }
        blockedWrites.push(`${method} ${route.request().url()}`);
        await route.abort();
      });

      const response = await page.goto(targetPath, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForSelector('#root', { state: 'attached', timeout: 20_000 }).catch(() => undefined);

      // The SPA applies the scheme from `localStorage.theme_mode` in a mount
      // effect (`App.tsx` → `useThemeStore.init()`), which can land after the
      // first paint on heavier pages. Wait for it deterministically instead of
      // assuming a fixed delay, then let the read-only data fetch settle.
      await page
        .waitForFunction(
          (mode: string) => document.documentElement.classList.contains(mode),
          THEME,
          { timeout: 20_000 },
        )
        .catch(() => undefined);

      // Land on the settled visual state: `animate-fade-in` cards start at
      // opacity 0 (and mount after the CMS fetch resolves), so axe would
      // otherwise sample a translucent colour and report a contrast failure
      // that does not exist at rest. Zero-duration animations jump straight to
      // their final keyframe; this does not hide any real colour defect.
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;}',
      });
      await page.evaluate(() => {
        try {
          document.getAnimations?.().forEach((animation) => {
            try {
              animation.finish();
            } catch {
              /* infinite animations cannot be finished */
            }
          });
        } catch {
          /* getAnimations unsupported */
        }
      });
      await page.waitForTimeout(1_000);

      // The requested scheme must actually be active, otherwise the scan would
      // silently report the other palette.
      const appliedTheme = await page.evaluate(() =>
        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      );
      if (appliedTheme !== THEME) {
        throw new Error(
          `E3 HARD STOP: requested ${THEME} theme but the page rendered ${appliedTheme}`,
        );
      }

      // Barrier 1: never leave the local frontend (e.g. a redirect to a remote host).
      const landed = new URL(page.url());
      if (!LOOPBACK_HOSTS.has(landed.hostname) || !ALLOWED_FRONTEND_PORTS.has(landed.port)) {
        throw new Error(`E3 HARD STOP: navigation left the local frontend → ${page.url()}`);
      }

      const status = response?.status() ?? 0;
      const rootText = (await page.locator('#root').innerText().catch(() => '')).trim();
      const blockedReason =
        !response
          ? 'no navigation response'
          : status >= 400
            ? `HTTP ${status}`
            : rootText.length < 10
              ? 'app root rendered empty'
              : null;

      if (blockedReason) {
        testInfo.annotations.push({
          type: 'blocked',
          description: `BLOCKED: ${pageDef.label} could not be scanned (${blockedReason}) at ${viewport.name}; not counted as PASS.`,
        });
        test.skip(true, `BLOCKED: ${blockedReason} — not counted as PASS.`);
        return;
      }

      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      const violations = summarise(results);
      const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 } as Record<string, number>;
      for (const v of violations) {
        const key = v.impact && v.impact in counts ? v.impact : 'minor';
        counts[key] += 1;
      }

      const axeVersion = results.testEngine?.version ?? 'unknown';
      const unexpectedWrites = blockedWrites.filter((w) => !isKnownBootstrapWrite(w));
      const verdict = counts.critical === 0 && counts.serious === 0 ? 'PASS' : 'FAIL';
      const record = {
        scenario: 'E3',
        page: pageDef.key,
        label: pageDef.label,
        path: targetPath,
        landedUrl: page.url(),
        theme: THEME,
        viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
        axeVersion,
        tags: AXE_TAGS,
        counts,
        verdict,
        violations,
        // Every entry below was aborted before reaching the server.
        blockedWrites,
        unexpectedWrites,
        writesSentToServer: 0,
        scannedAt: new Date().toISOString(),
      };

      const outDir = path.resolve('test-results/e2e/a11y');
      fs.mkdirSync(outDir, { recursive: true });
      const fileName = `${pageDef.key}__${viewport.name}__${THEME}.json`;
      fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(record, null, 2), 'utf8');
      await testInfo.attach(`axe-${pageDef.key}-${viewport.name}-${THEME}.json`, {
        body: JSON.stringify(record, null, 2),
        contentType: 'application/json',
      });

      // Stable machine-readable line for the run log / evidence capture.
      console.log(
        `E3RESULT theme=${THEME} page=${pageDef.key} viewport=${viewport.name} axe=${axeVersion} ` +
          `critical=${counts.critical} serious=${counts.serious} moderate=${counts.moderate} minor=${counts.minor} ` +
          `verdict=${verdict} blockedWrites=${blockedWrites.length} writesSent=0 url=${targetPath}`,
      );

      testInfo.annotations.push({
        type: 'e3-result',
        description: JSON.stringify({
          theme: THEME,
          page: pageDef.key,
          viewport: viewport.name,
          axeVersion,
          counts,
          verdict,
          blockedWrites,
          writesSentToServer: 0,
          artifact: `test-results/e2e/a11y/${fileName}`,
        }),
      });

      // Safety barrier: no non-GET request may reach the server, and the only
      // non-GET the app itself attempts (session bootstrap) must be the sole
      // blocked entry. Anything else is an unexpected mutation attempt.
      expect(
        unexpectedWrites,
        `Unexpected non-GET requests were attempted (all were aborted, nothing reached the server): ${unexpectedWrites.join(' | ')}`,
      ).toHaveLength(0);

      const details = violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map((v) => `${v.impact}:${v.id} (${v.nodes} node(s)) ${v.targets.join(', ')}`)
        .join(' | ');

      expect(
        counts.critical,
        `E3 FAIL — critical violations on ${pageDef.key} @ ${viewport.name}: ${details}`,
      ).toBe(0);
      expect(
        counts.serious,
        `E3 FAIL — serious violations on ${pageDef.key} @ ${viewport.name}: ${details}`,
      ).toBe(0);
    });
  }
}
