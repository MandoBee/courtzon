import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * PHASE 0 / GROUP 2 — Legacy Academy navigation isolation.
 *
 * Every active Academy entry point must point to the NEW Academy experience
 * (`/academy*`), never to the removed legacy `/academies*` routes.
 */
const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('PHASE 0/G2 — Legacy Academy navigation is redirected to the new experience', () => {
  it('App.tsx redirects legacy player routes to the new Academy', () => {
    const app = read('../../App.tsx');
    expect(app).toContain('<Route path="/academies" element={<Navigate to="/academy" replace />} />');
    expect(app).toContain('<Route path="/academies/:id" element={<LegacyAcademyDetailRedirect />} />');
    expect(app).not.toContain('<Route path="/academies" element={<AcademyListPage />} />');
  });

  it('App.tsx redirects the legacy admin Academies page to the new admin Academy', () => {
    const app = read('../../App.tsx');
    expect(app).toContain('<Route path="academies" element={<Navigate to="academy/dashboard" replace />} />');
  });

  it('Navbar academy link points to /academy (not the dead legacy route)', () => {
    const app = read('../../App.tsx');
    expect(app).toContain('to="/academy"');
    expect(app).not.toContain('to="/academies"');
  });

  it('player navigation registry + search point to /academy', () => {
    const registry = read('../../navigation/player.registry.ts');
    const search = read('../../navigation/search.ts');
    expect(registry).not.toContain("path: '/academies'");
    expect(registry).toContain("path: '/academy'");
    expect(search).not.toContain("path: '/academies'");
    expect(search).toContain("path: '/academy'");
  });

  it('player Dashboard academy QuickAction points to /academy', () => {
    const dash = read('./DashboardPage.tsx');
    expect(dash).not.toContain('to="/academies"');
    expect(dash).toContain('to="/academy"');
  });
});