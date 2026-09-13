import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * PHASE 0 / GROUP 2 — Legacy Academy isolation + broken consumer repair.
 *
 * Source-level contract tests proving every repaired cross-module consumer no
 * longer references the REMOVED legacy Academy columns/statuses
 * (academy_enrollments.academy_id / .user_id, status 'active'/'enrolled'/
 * 'dropped'/'waitlisted') and instead consumes the authoritative NEW Academy
 * model (player_id/program_id, status 'confirmed'/'waiting').
 */
const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('PHASE 0/G2 — RBAC consumer uses the NEW Academy model', () => {
  const src = () => read('../../rbac/infrastructure/repositories/rbac.repository.ts');

  it('getUserAcademyEnrollments no longer joins the removed legacy `academies` column', () => {
    const fn = src().match(/getUserAcademyEnrollments[\s\S]*?ORDER BY ae\.enrolled_at DESC LIMIT 100[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn).not.toContain('a.id = ae.academy_id');
    expect(fn).not.toContain('JOIN academies a');
  });

  it('getUserAcademyEnrollments joins academy_programs via program_id', () => {
    const fn = src().match(/getUserAcademyEnrollments[\s\S]*?ORDER BY ae\.enrolled_at DESC LIMIT 100[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn).toContain('JOIN academy_programs ap ON ap.id = ae.program_id');
    expect(fn).toContain('WHERE ae.player_id = ?');
  });
});

describe('PHASE 0/G2 — CRM consumer uses player_id (not user_id)', () => {
  const src = () => read('../../crm/presentation/crm.controller.ts');

  it('never queries academy_enrollments by the removed user_id column', () => {
    expect(src()).not.toMatch(/academy_enrollments (?:ae )?WHERE ae?\.?user_id/);
    expect(src()).not.toMatch(/FROM academy_enrollments WHERE user_id/);
  });

  it('queries academy_enrollments by player_id', () => {
    expect(src()).toMatch(/academy_enrollments ae WHERE ae\.player_id/);
    expect(src()).toMatch(/FROM academy_enrollments WHERE player_id/);
  });
});

describe('PHASE 0/G2 — Player Academy counts use the new status model', () => {
  const src = () => read('../../player-experience/application/player.service.ts');

  it('never filters academy_enrollments by the removed legacy status `active`', () => {
    expect(src()).not.toMatch(/academy_enrollments\b[\s\S]{0,120}status = 'active'/);
  });

  it('counts active academy enrollments as status = confirmed', () => {
    expect(src()).toMatch(/academy_enrollments WHERE player_id = \? AND status = 'confirmed'/);
    expect(src()).toMatch(/academy_enrollments ae WHERE ae\.player_id = \? AND ae\.status = 'confirmed'/);
  });
});

describe('PHASE 0/G2 — Org portal Academy counts use the new model', () => {
  const src = () => read('../../organisations/presentation/org-portal.controller.ts');

  it('listOrgAcademiesHandler no longer joins the removed category_id / legacy status', () => {
    const fn = src().match(/listOrgAcademiesHandler[\s\S]*?ORDER BY ap\.created_at DESC/)?.[0] ?? '';
    expect(fn).not.toContain('academy_categories');
    expect(fn).not.toContain('ap.category_id');
    expect(fn).not.toContain("ae.status = 'enrolled'");
  });

  it('counts enrolled as status = confirmed and waiting as status = waiting', () => {
    const fn = src().match(/listOrgAcademiesHandler[\s\S]*?ORDER BY ap\.created_at DESC/)?.[0] ?? '';
    expect(fn).toContain("ae.status = 'confirmed'");
    expect(fn).toContain("ae.status = 'waiting'");
  });
});

describe('PHASE 0/G2 — Legacy Academy runtime isolated', () => {
  it('legacy academy routes are no longer registered', () => {
    const routes = read('../presentation/activities.routes.ts');
    expect(routes).not.toContain("'/academies'");
    expect(routes).not.toContain("'/academies/:id'");
    expect(routes).not.toContain('app.academies_enabled');
  });

  it('legacy softDeleteAcademy no longer touches the removed academy_enrollments columns', () => {
    const repo = read('../infrastructure/repositories/activities.repository.ts');
    const fn = repo.match(/async softDeleteAcademy[\s\S]*?\n  \},/)?.[0] ?? '';
    expect(fn).not.toContain('academy_id');
    expect(fn).not.toContain("'dropped'");
    expect(fn).toContain('UPDATE academies SET is_active = 0');
  });

  it('notification deep-links point to the new /academy screen', () => {
    const tpl = read('../../notifications/application/template.service.ts');
    expect(tpl).not.toContain("/academies/{{academyId}}");
    expect(tpl).toContain("/academy/{{academyId}}");
    const engine = read('../../notifications/application/notification-engine.ts');
    expect(engine).not.toContain('`/academies/${data.academyId}`');
    expect(engine).toContain('`/academy/${data.academyId}`');
  });
});