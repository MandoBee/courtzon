import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'backend/src/modules/community/presentation/community.routes.ts',
  'backend/src/modules/activities/presentation/activities.routes.ts',
  'backend/src/modules/rbac/presentation/rbac.routes.ts',
  'backend/src/modules/reports/presentation/reports.routes.ts',
  'backend/src/modules/marketplace/presentation/admin-tag.routes.ts',
  'backend/src/modules/marketplace/presentation/admin-brand.routes.ts',
  'backend/src/modules/marketplace/presentation/admin-sport-categories.routes.ts',
  'backend/src/modules/banks/presentation/banks.routes.ts',
  'backend/src/modules/amenities/presentation/amenities.routes.ts',
  'backend/src/modules/marketplace/presentation/admin-categories.routes.ts',
  'backend/src/modules/cms/presentation/cms.routes.ts',
  'backend/src/modules/cities/presentation/cities.routes.ts',
  'backend/src/modules/provinces/presentation/provinces.routes.ts',
  'backend/src/modules/languages/presentation/languages.routes.ts',
  'backend/src/modules/currencies/presentation/currencies.routes.ts',
  'backend/src/modules/countries/presentation/countries.routes.ts',
  'backend/src/modules/translations/presentation/translations.routes.ts',
];

const adminLine = "const adminGuard = requireRole(['super_admin', 'super-admin', 'admin']);";

for (const f of files) {
  let c = readFileSync(f, 'utf8');
  if (!c.includes(adminLine)) {
    console.log('skip', f);
    continue;
  }
  c = c.replace(`${adminLine}\n\n`, '').replace(`${adminLine}\n`, '');
  c = c.replace(
    /import \{ authMiddleware, requireRole(?:, requirePermission)? \}/,
    'import { authMiddleware, adminGuard',
  );
  c = c.replace(
    /import \{ authMiddleware, requirePermission, requireRole \}/,
    'import { authMiddleware, requirePermission, adminGuard',
  );
  c = c.replace(
    /import \{ authMiddleware, requireRole, requirePermission \}/,
    'import { authMiddleware, requirePermission, adminGuard',
  );
  writeFileSync(f, c);
  console.log('patched', f);
}
