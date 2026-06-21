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

for (const f of files) {
  let c = readFileSync(f, 'utf8');
  c = c.replace(/adminGuard from/g, 'adminGuard } from');
  c = c.replace(/requirePermission, adminGuard from/g, 'requirePermission, adminGuard } from');
  writeFileSync(f, c);
  console.log('fixed', f);
}
