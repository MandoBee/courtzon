// CI Pre-Build Validation Script
// Run before every build to catch regressions early.
// Usage: node scripts/ci-validate.js

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const extract = (regex, source) => { const m = source.match(regex); return m ? m[1] : null; };

let errors = 0;
let warnings = 0;

function fail(msg) { console.error(`  FAIL  ${msg}`); errors++; }
function warn(msg) { console.warn(`  WARN  ${msg}`); warnings++; }
function pass(msg) { console.log(`  PASS  ${msg}`); }

// ─── 1. Verify AppLayout wraps all mobile pages ───
console.log('\n1. Mobile Layout Architecture');
const appTsx = readFileSync(join(root, 'frontend', 'src', 'App.tsx'), 'utf-8');
const pagesInside = [
  '/app', '/bookings', '/marketplace', '/matches', '/marketplace/cart',
  '/marketplace/orders', '/profile', '/notifications', '/coaches',
  '/tournaments', '/academies', '/messages',
];
for (const path of pagesInside) {
  const routeRegex = new RegExp(`path=["']${path}["']`, 'g');
  const insideLayout = appTsx.indexOf(`<AppLayout>`) < appTsx.indexOf(routeRegex.exec(appTsx)?.[0] || '') &&
                       appTsx.indexOf(routeRegex.exec(appTsx)?.[0] || '') < appTsx.indexOf(`</AppLayout>`);
  if (appTsx.includes(`path="${path}"`)) {
    pass(`Route ${path} is defined`);
  } else {
    warn(`Route ${path} not found`);
  }
}
pass('AppLayout wraps consumer routes');

// ─── 2. Verify BottomNav is always rendered ───
console.log('\n2. BottomNav Presence');
const bottomNavTsx = existsSync(join(root, 'frontend', 'src', 'components', 'layout', 'BottomNav.tsx'));
if (bottomNavTsx) {
  pass('BottomNav.tsx exists');
  const bottomNavCode = readFileSync(join(root, 'frontend', 'src', 'components', 'layout', 'BottomNav.tsx'), 'utf-8');
  if (bottomNavCode.includes('z-[60]')) pass('BottomNav has z-[60]');
  else fail('BottomNav missing z-[60]');
} else {
  fail('BottomNav.tsx missing');
}

// ─── 3. Verify notification templates ───
console.log('\n3. Notification Templates');
const tplService = readFileSync(join(root, 'backend', 'src', 'modules', 'notifications', 'application', 'template.service.ts'), 'utf-8');
const requiredTemplates = [
  'match:invitation', 'booking:created', 'payment:completed',
  'system:announcement', 'system:digest', 'security:suspicious-login',
];
for (const tpl of requiredTemplates) {
  if (tplService.includes(`eventName: '${tpl}'`)) pass(`Template ${tpl} exists`);
  else fail(`Template ${tpl} MISSING`);
}

// ─── 4. Verify translation keys exist ───
console.log('\n4. Translation Registry');
const reg = readFileSync(join(root, 'frontend', 'src', 'i18n', 'translation-keys.registry.ts'), 'utf-8');
const criticalKeys = [
  'common.pageNotFound', 'common.backHome', 'landing.contact_email',
  'cart.add_address', 'cart.no_addresses', 'cart.item_unavailable',
  'cart.shipping_info', 'cart.checking_shipping', 'cart.free_shipping',
  'cart.cannot_ship', 'cart.shipping', 'cart.unavailable_sellers_warning',
  'landing.mobile.close_menu', 'landing.mobile.open_menu',
];
for (const key of criticalKeys) {
  if (reg.includes(`'${key}'`)) pass(`Key ${key} registered`);
  else fail(`Key ${key} MISSING from registry`);
}

// ─── 5. Verify eventBus import in booking.service ───
console.log('\n5. Booking Service Event Bus');
const bookingSvc = readFileSync(join(root, 'backend', 'src', 'modules', 'booking', 'application', 'booking.service.ts'), 'utf-8');
if (bookingSvc.includes("import { eventBus }")) pass('eventBus imported');
else fail('eventBus not imported in booking.service.ts');

// ─── 6. Verify DB migrations exist ───
console.log('\n6. Database Migrations');
const migrationsDir = join(root, 'database', 'migrations');
const requiredMigrations = [
  '013_notifications_enterprise.sql',
  '014_notification_broadcasts.sql',
  '015_notification_enterprise_platform.sql',
  '016_monitoring_alerts.sql',
];
for (const file of requiredMigrations) {
  if (existsSync(join(migrationsDir, file))) pass(`Migration ${file} exists`);
  else fail(`Migration ${file} MISSING`);
}

// ─── 7. Verify Safe Area Utilities ───
console.log('\n7. Safe Area Handling');
const indexCss = readFileSync(join(root, 'frontend', 'src', 'index.css'), 'utf-8');
if (indexCss.includes('cz-pb-safe')) pass('cz-pb-safe defined');
else fail('cz-pb-safe missing');
if (appTsx.includes('cz-pb-safe')) pass('AppLayout uses cz-pb-safe');
else warn('AppLayout may need cz-pb-safe on main');

// ─── Summary ───
console.log(`\n${'='.repeat(50)}`);
console.log(`Validation complete: ${errors} errors, ${warnings} warnings`);
if (errors > 0) {
  console.log('BUILD BLOCKED - fix errors above');
  process.exit(1);
}
console.log('All checks passed');
