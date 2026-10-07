-- Migration 201: Privacy Policy — semantic document structure (h2) + updated date
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Same presentation-structure upgrade already applied to the Terms page by
--   migration 200, applied to the Privacy Policy page. The legal wording is NOT
--   changed — only the stored tag hierarchy is raised to proper semantic HTML
--   (the 7 main sections become <h2>) and the hero "Last updated" date is
--   advanced to October 2026 to match the Terms page (the document was revised
--   today). The landing page has no typography plugin, so headings rendered
--   flat before; a scoped CSS class (.cz-landing--privacy) now styles the
--   hierarchy exactly like the Terms page.
--
-- GUARD (production uses admin-generated block keys, so never guard on
--   block_key)
--   * Targets rows by stable properties only: page slug 'privacy' + block_type
--     (text/hero) + content fingerprints.
--   * Text: updates unless the row ALREADY holds the final content; only fires
--     when the document still starts with "1. Information We Collect" as an h3
--     (a fully rewritten CMS document is never touched).
--   * Hero: updates unless the row ALREADY holds the final JSON; only fires
--     when the subheading is still "Last updated: January 2026".
--   * Idempotent: after this runs, the fingerprints no longer match, so a
--     re-run is a no-op.
--   * Fresh environments get the final content from
--     database/seeds/001_baseline.sql (entrypoint stamps, does not run).
--   * Only the Privacy Policy page is affected; the Terms page and other CMS
--     pages are outside the guard's scope.

UPDATE cms_section_blocks b
JOIN cms_pages p ON p.id = b.page_id AND p.slug = 'privacy'
SET b.content = '{"html":"<h2>1. Information We Collect</h2><p>We collect information you provide directly, such as your name, email, phone number, and payment information when you create an account or make a booking. We also collect technical information including device info and usage data.</p><h2>2. How We Use Your Information</h2><p>We use your information to provide and improve our services, process transactions, send notifications, and comply with legal obligations.</p><h2>3. Information Sharing</h2><p>We share your information with facility owners when you book, with payment processors to complete transactions, and as required by law. We do not sell your personal information.</p><h2>4. Data Security</h2><p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access or disclosure.</p><h2>5. Your Rights</h2><p>You have the right to access, correct, or delete your personal information. Contact privacy@courtzon.com to exercise these rights.</p><h2>6. Cookies</h2><p>We use cookies to improve your experience and analyze usage. You can control cookie settings through your browser.</p><h2>7. Contact</h2><p>For privacy inquiries: privacy@courtzon.com.</p>"}'
WHERE b.block_type = 'text'
  AND b.content <> '{"html":"<h2>1. Information We Collect</h2><p>We collect information you provide directly, such as your name, email, phone number, and payment information when you create an account or make a booking. We also collect technical information including device info and usage data.</p><h2>2. How We Use Your Information</h2><p>We use your information to provide and improve our services, process transactions, send notifications, and comply with legal obligations.</p><h2>3. Information Sharing</h2><p>We share your information with facility owners when you book, with payment processors to complete transactions, and as required by law. We do not sell your personal information.</p><h2>4. Data Security</h2><p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access or disclosure.</p><h2>5. Your Rights</h2><p>You have the right to access, correct, or delete your personal information. Contact privacy@courtzon.com to exercise these rights.</p><h2>6. Cookies</h2><p>We use cookies to improve your experience and analyze usage. You can control cookie settings through your browser.</p><h2>7. Contact</h2><p>For privacy inquiries: privacy@courtzon.com.</p>"}'
  AND b.content LIKE '%<h3>1. Information We Collect</h3>%';

UPDATE cms_section_blocks b
JOIN cms_pages p ON p.id = b.page_id AND p.slug = 'privacy'
SET b.content = '{"heading":"Privacy Policy","subheading":"Last updated: October 2026"}'
WHERE b.block_type = 'hero'
  AND b.content <> '{"heading":"Privacy Policy","subheading":"Last updated: October 2026"}'
  AND b.content LIKE '%Last updated: January 2026%';
