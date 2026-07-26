# CourtZon Localization Platform Standards

## Purpose

This document defines how every CourtZon module must use the existing localization platform (`translation_keys` + `translations` + `t()`) to become the single source of truth for all translatable content.

**This is NOT a redesign.** It is a standardization of existing capabilities.

---

## PART 1 — Current Usage Audit

### 1.1 UI Labels (Frontend)

| Aspect | Status |
|--------|--------|
| How text is stored | `translation_keys.default_value` (English) + `translations.value` (overrides) |
| Already uses translation system? | **Yes** — ~235 keys in the registry |
| Should continue? | **Yes** — this is the primary use case |
| Should migrate? | No migration needed |

**Module coverage:** `auth`, `common`, `home`, `landing`, `cart`, `marketplace`, `booking`, `profile`, `settings`, `admin`, `validation`, `notification`, `security`, `coaches`, `menu`, `forms`, `errors`, `placeholders`, `footer`, `help`, `tabs`, `fields`, `dates`, `search`, `payment`, `club`, `membership`, `communication`, `connect`, `reviews`, `points`, `system`

**Gaps found:** Tournament, academy, match, wallet, and coach modules have limited or no translation keys. These should be added to the registry.

### 1.2 Validation Messages

| Aspect | Status |
|--------|--------|
| How text is stored | Hardcoded in TypeScript (Zod schemas, error objects) |
| Already uses translation system? | **No** |
| Should migrate? | **Yes** — all user-facing validation messages should use translation keys |
| Priority | **Medium** — validation messages are user-facing and should be localizable |

**Current pattern:** `new ValidationError('Booking ID is required')`

**Target pattern:** `new ValidationError(t('validation.booking.required', locale))`

**Challenge:** Backend validation does not have access to the user's locale. Requires passing locale through the request context.

### 1.3 Notification Templates

| Aspect | Status |
|--------|--------|
| How text is stored | `notification_templates.title_template` and `body_template` as Handlebars strings |
| Already uses translation system? | **No** — uses a separate Handlebars template system |
| Should migrate? | **Yes** — migrate to translation keys |
| Priority | **High** — notifications are the most visible user-facing text after UI labels |

**Key principle:** The template stores the **structure** (which translation keys to use, which variables to pass). The text lives in the translation system.

### 1.4 Email Templates

| Aspect | Status |
|--------|--------|
| How text is stored | Not yet implemented in the codebase |
| Already uses translation system? | N/A |
| Should migrate? | **Yes** — should use translation keys from day one |

### 1.5 SMS Templates

Same as email templates — not yet implemented, should use translation keys.

### 1.6 Push Notifications

| Aspect | Status |
|--------|--------|
| How text is stored | Not yet implemented (Firebase/APNS integration pending) |
| Already uses translation system? | N/A |
| Should migrate? | **Yes** — should use translation keys from day one |

### 1.7 Reports

| Aspect | Status |
|--------|--------|
| How text is stored | Hardcoded in report generators |
| Already uses translation system? | **No** |
| Should migrate? | **Yes** — report column headers, filters, export filenames should use translation keys |
| Priority | **Low** — reports are admin-facing, lower user impact |

### 1.8 Marketplace

| Aspect | Status |
|--------|--------|
| How text is stored | English in DB columns (product names, category names, brand names) |
| Already uses translation system? | **No** |
| Should migrate? | **Not directly** — marketplace content is business data, not system text. See Part 2. |

### 1.9 Academies, Tournaments, Sports, Court Types

Same as marketplace — these are **reference data** with bilingual requirements, but they are not system UI text. They need a **multi-language column strategy**, not the translation key system.

### 1.10 Roles & Permissions

| Aspect | Status |
|--------|--------|
| How text is stored | `roles.name` and `permissions.label` in DB columns |
| Already uses translation system? | **No** |
| Should migrate? | **Yes** — these are system labels that should be translatable |
| Priority | **Medium** — improves admin UX for non-English admins |

### 1.11 Settings & Configuration

| Aspect | Status |
|--------|--------|
| How text is stored | Various DB columns, hardcoded labels |
| Already uses translation system? | Partially — admin UI labels use translation keys, setting descriptions do not |
| Should migrate? | **Yes** — setting labels, descriptions, and help text should use translation keys |

### 1.12 Errors & Success Messages

| Aspect | Status |
|--------|--------|
| How text is stored | Hardcoded in TypeScript |
| Already uses translation system? | **No** |
| Should migrate? | **Yes** — all user-facing success/error messages should use translation keys |

### 1.13 Landing Pages & CMS

| Aspect | Status |
|--------|--------|
| How text is stored | Hardcoded in React components, some using `t()` |
| Already uses translation system? | **Partially** — `landing.*` keys exist in the registry |
| Should migrate? | **Yes** — continue migrating remaining hardcoded strings to keys |

### Current Usage Summary

| Location | Uses Translation Keys? | Should Migrate? | Priority |
|----------|----------------------|-----------------|----------|
| UI Labels (frontend) | ✅ Yes | No migration needed | — |
| Validation messages | ❌ No | ✅ Yes | Medium |
| Notification templates | ❌ No | ✅ Yes | High |
| Email templates | ❌ Not implemented | ✅ Yes | High |
| SMS templates | ❌ Not implemented | ✅ Yes | High |
| Push notifications | ❌ Not implemented | ✅ Yes | High |
| Reports | ❌ No | ✅ Yes | Low |
| Marketplace content | ❌ No | ❌ Not applicable (business data) | — |
| Academy/tournament names | ❌ No | ❌ Not applicable (reference data) | — |
| Roles/permissions | ❌ No | ✅ Yes | Medium |
| Settings labels | ⚠ Partially | ✅ Yes | Medium |
| Error/success messages | ❌ No | ✅ Yes | Medium |
| Landing pages/CMS | ⚠ Partially | ✅ Yes | Low |

---

## PART 2 — Text Classification

### 2.1 Categories

Every text in CourtZon belongs to exactly one category. The category determines where it should be stored and whether it should use the translation system.

#### A. System Text

| Property | Value |
|----------|-------|
| **Definition** | UI labels, messages, instructions, help text, tooltips, placeholders |
| **Where to store** | `translation_keys` + `translations` |
| **Use translation keys?** | **Yes** |
| **Editable?** | Yes (admin translation grid) |
| **Should be translated?** | Yes |
| **Support variables?** | Yes |
| **Examples** | `common.save`, `auth.login.title`, `booking.details.status` |

#### B. Workflow Labels

| Property | Value |
|----------|-------|
| **Definition** | Status names, state labels, action names that are part of the domain model |
| **Where to store** | `translation_keys` + `translations` |
| **Use translation keys?** | **Yes** |
| **Editable?** | Yes |
| **Should be translated?** | Yes |
| **Support variables?** | No |
| **Examples** | `booking.status.confirmed`, `payment.status.paid`, `match.status.open` |

#### C. Validation & Error Messages

| Property | Value |
|----------|-------|
| **Definition** | User-facing validation errors, success messages, confirmation dialogs |
| **Where to store** | `translation_keys` + `translations` |
| **Use translation keys?** | **Yes** |
| **Editable?** | Yes |
| **Should be translated?** | Yes |
| **Support variables?** | Yes — field names, limits, identifiers |
| **Examples** | `validation.required`, `validation.min_length`, `success.booking.created` |

#### D. Notification & Communication Text

| Property | Value |
|----------|-------|
| **Definition** | Notification titles/bodies, email subjects/bodies, SMS text, push messages |
| **Where to store** | `translation_keys` + `translations` |
| **Use translation keys?** | **Yes** |
| **Editable?** | Yes |
| **Should be translated?** | Yes |
| **Support variables?** | Yes — booking IDs, amounts, dates, names |
| **Examples** | `notification.booking.confirmed.title`, `email.welcome.subject` |

#### E. Configuration & Settings Labels

| Property | Value |
|----------|-------|
| **Definition** | Setting names, descriptions, help text, option labels |
| **Where to store** | `translation_keys` + `translations` |
| **Use translation keys?** | **Yes** |
| **Editable?** | Yes |
| **Should be translated?** | Yes |
| **Support variables?** | Rarely |
| **Examples** | `settings.notifications.title`, `settings.payment.description` |

#### F. Reference Data (Bilingual Columns)

| Property | Value |
|----------|-------|
| **Definition** | Domain entities with name/description that need to be available in multiple languages |
| **Where to store** | In the entity's own table with language-specific columns |
| **Use translation keys?** | **No** — these are data, not system text |
| **Editable?** | Yes (by domain administrators) |
| **Should be translated?** | Yes |
| **Support variables?** | No |
| **Examples** | `sports.name_en` + `sports.name_ar`, `court_types.name_en` + `court_types.name_ar` |
| **Pattern** | Each entity has `name_en`, `name_ar` columns (or a JSON `name` column with locale keys) |

#### G. Business Data

| Property | Value |
|----------|-------|
| **Definition** | User-generated content, marketplace listings, organisation profiles |
| **Where to store** | In the entity's own table, in the user's language |
| **Use translation keys?** | **No** |
| **Editable?** | Yes (by content owner) |
| **Should be translated?** | Machine translation option (future), not required |
| **Support variables?** | No |
| **Examples** | Product descriptions, club descriptions, coach bios |

#### H. Marketing Content

| Property | Value |
|----------|-------|
| **Definition** | Landing page copy, promotional banners, campaign content |
| **Where to store** | `translation_keys` + `translations` (if small) or a CMS (if large) |
| **Use translation keys?** | **Yes for small strings**, CMS for large blocks |
| **Editable?** | Yes |
| **Should be translated?** | Yes |
| **Support variables?** | Yes (personalization tokens) |
| **Examples** | `landing.hero.title`, campaign SMS body |

#### I. System-Generated Content (Dynamic)

| Property | Value |
|----------|-------|
| **Definition** | Text assembled at runtime from data + templates |
| **Where to store** | Generated at runtime using translation keys + variables |
| **Use translation keys?** | **Yes** — the template/pattern uses a key, data is injected as variables |
| **Editable?** | The key values are editable; the data comes from the domain |
| **Should be translated?** | Yes |
| **Support variables?** | Yes — this is the primary use case |
| **Examples** | `"Booking {bookingId} confirmed for {date}"` = `t('notification.booking.confirmed.body', { bookingId, date })` |

### 2.2 Decision Matrix

```
Is the text user-facing?
├── No  → Likely internal log/debug text → Do NOT translate
└── Yes
    ├── Is it system UI / labels / messages?
    │   └── Yes → USE translation_keys (Category A, B, C, D, E)
    ├── Is it reference data (sports, court types)?
    │   └── Yes → USE bilingual columns (Category F)
    ├── Is it user-generated content?
    │   └── Yes → Store as-is in user's language (Category G)
    └── Is it marketing/brand content?
        └── Yes → USE translation_keys for short text (Category H)
```

---

## PART 3 — Translation Standards

### 3.1 Key Naming Convention

```
{module}.{screen}.{element}
```

| Part | Rule | Example |
|------|------|---------|
| **module** | Singular noun, lowercase, no hyphens. Matches the domain module slug. | `booking`, `payment`, `notification`, `common` |
| **screen** | Singular noun, lowercase, no hyphens. The page or component. | `login`, `details`, `list`, `form` |
| **element** | Specific element identifier. Can be multi-level with dots. | `title`, `submit`, `status.confirmed`, `error.not_found` |

### 3.2 Module Names

| Module | Slug | Examples |
|--------|------|----------|
| Common / Shared | `common` | `common.save`, `common.cancel`, `common.loading` |
| Authentication | `auth` | `auth.login.title`, `auth.register.submit` |
| Booking | `booking` | `booking.create.title`, `booking.status.confirmed` |
| Payment | `payment` | `payment.method.card`, `payment.status.paid` |
| Notification | `notification` | `notification.booking.confirmed.title` |
| Wallet | `wallet` | `wallet.deposit.title`, `wallet.balance.label` |
| Match | `match` | `match.create.title`, `match.status.open` |
| Tournament | `tournament` | `tournament.create.title`, `tournament.bracket.label` |
| Academy | `academy` | `academy.enroll.title`, `academy.session.label` |
| Coach | `coach` | `coach.profile.title`, `coach.book.submit` |
| Marketplace | `marketplace` | `marketplace.order.placed`, `marketplace.cart.empty` |
| Organisation | `organisation` | `organisation.create.title`, `organisation.branch.label` |
| Membership | `membership` | `membership.plan.title`, `membership.expiry.warning` |
| Report | `report` | `report.revenue.title`, `report.booking.column.date` |
| Admin | `admin` | `admin.dashboard.title`, `admin.settings.label` |
| Validation | `validation` | `validation.required`, `validation.email.invalid` |
| Error | `error` | `error.not_found`, `error.server_error` |
| Success | `success` | `success.booking.created`, `success.payment.received` |
| Landing | `landing` | `landing.hero.title`, `landing.features.label` |
| Settings | `settings` | `settings.profile.title`, `settings.notification.label` |
| Security | `security` | `security.login.alert`, `security.password.label` |

### 3.3 Variable Naming Convention

Variables use `{camelCase}` syntax.

| Rule | Example |
|------|---------|
| Use camelCase | `{bookingId}`, `{userName}`, `{totalAmount}` |
| Be descriptive | `{paymentDate}` not `{date}` |
| Match API property names | If the API returns `booking_id`, use `{bookingId}` |
| Prefix entity identifiers | `{bookingId}`, `{userId}`, `{organisationId}` |

### 3.4 Variable Rules

- Variables are replaced at runtime by the `t()` function
- Variables are NOT translated — they are raw data values
- Date/currency formatting should be done BEFORE passing to `t()`
- Variables should have sensible defaults if missing

### 3.5 Interpolation Rules

```
t(key, params)

t('notification.booking.confirmed.body', {
  bookingId: '12345',
  date: '15 Aug 2026',
  courtName: 'Court 3'
})
→ "Booking 12345 confirmed for 15 Aug 2026 at Court 3"
```

### 3.6 Length Rules

| Context | Max Length | Reason |
|---------|------------|--------|
| UI button text | 30 chars | Button width constraints |
| UI label | 60 chars | Form layout constraints |
| Notification title | 100 chars | Push notification display limit |
| Notification body | 200 chars | Push notification truncation |
| Email subject | 100 chars | Email client display |
| SMS body | 160 chars | Single SMS segment |
| Validation message | 120 chars | Inline display below form fields |
| Tooltip/help text | 200 chars | Tooltip readability |

These are maximums for the English default. Translations may be longer but should be reviewed for layout issues.

### 3.7 RTL Rules

- Arabic translations may be 20-30% longer than English equivalents
- UI components must accommodate text expansion/contraction
- Variables embedded in Arabic text must be handled appropriately (e.g., `{bookingId}` is a number and is locale-independent)
- Directional icons/arrows should mirror in RTL mode
- The existing `is_rtl` column in the `languages` table handles the direction switch

### 3.8 Capitalization Rules

| Context | Rule | Example |
|---------|------|---------|
| Button text | Sentence case | "Save changes" not "Save Changes" |
| Headings | Title case for English | "Booking Details" |
| Labels | Sentence case | "Full name" |
| Error messages | Sentence case | "This field is required" |
| Notification titles | Sentence case | "Booking confirmed" |
| Notification body | Sentence case | "Your booking for Court 3 has been confirmed." |
| Validation messages | Sentence case | "Email address is not valid" |

Note: Capitalization rules vary by locale. Arabic does not use capitalization. The English default follows the rules above; translators may adjust for their locale.

### 3.9 Placeholder Rules

- Placeholder text for input fields uses `element_type: 'placeholder'`
- Placeholder text should use `{variable}` for dynamic context:
  - `validation.placeholder.min_max` → `"Enter {min}-{max} characters"`

### 3.10 Plural Rules (Future)

When pluralization is implemented, use the ICU message format:

```
notification.booking.count
  → "{count} booking(s)"  (current, no plural support)
  → "{count, plural, one {# booking} other {# bookings}}"  (future, with ICU)
```

For now, handle plurality in code:
```
const text = count === 1 ? t('booking.singular') : t('booking.plural');
```

### 3.11 Formatting Rules

- Date/number/currency formatting should NOT be done inside translation keys
- Format data BEFORE passing to `t()` using `Intl` or a formatting helper
- Translation keys receive pre-formatted strings as variables

```typescript
// Correct
const formattedDate = new Intl.DateTimeFormat(locale).format(date);
t('notification.booking.confirmed.body', { date: formattedDate });

// Incorrect
t('notification.booking.confirmed.body', { date: date.toISOString() });
```

---

## PART 4 — Localization Standards

### 4.1 Frontend

| Rule | Standard |
|------|----------|
| Import | `import { useTranslation } from '../../i18n'` |
| Hook | `const { t, locale, setLocale } = useTranslation()` |
| Static text | `t('module.screen.element')` |
| With variables | `t('module.screen.element', { varName: value })` |
| Outside React | `import { t } from '../../i18n'; t('module.screen.element')` |
| Prohibited | Hardcoded English strings in JSX |
| Prohibited | `react-i18next` or other i18n libraries |
| Prohibited | Duplicate translation keys for the same concept |
| Locale detection | `localStorage.getItem('locale')` on boot, user preference on login |
| Language switching | `setLocale(code, isRtl)` — updates localStorage, document, and store |

### 4.2 Backend — API Responses

| Rule | Standard |
|------|----------|
| Error responses | Return error codes, not English messages. Frontend resolves via `t('error.{code}')` |
| Current pattern | `{ error: 'VALIDATION_ERROR', message: 'Booking ID is required' }` |
| Target pattern | `{ error: 'VALIDATION_ERROR', code: 'validation.booking.required', message: '...' }` |
| Important | The `message` field should remain as a English fallback for API consumers. Add `code` field for frontend resolution. |

### 4.3 Backend — Notification Engine

| Rule | Standard |
|------|----------|
| Notification titles | Stored as translation keys in `dispatchToUser()` action |
| Notification bodies | Stored as translation keys |
| Resolution | Resolved at dispatch time using recipient's locale |
| Variables | Passed as `data` to `dispatchToUser()` |

### 4.4 Backend — Email Engine

| Rule | Standard |
|------|----------|
| Email subject | Translation key |
| Email body | Translation key for text, or key + template structure |
| Resolution | Resolved per-recipient using their locale |
| Variables | Passed as template data |

### 4.5 Backend — Template Engine

| Rule | Standard |
|------|----------|
| Notification templates | Store translation keys, NOT raw text |
| The `title_template` column | Holds a translation key string |
| The `body_template` column | Holds a translation key string |
| Resolution | `t(title_template, locale, data)` at dispatch time |
| Backward compatibility | If the value is NOT a valid translation key (doesn't start with a module prefix), treat as raw text |

### 4.6 Backend — Reports

| Rule | Standard |
|------|----------|
| Column headers | Translation keys: `report.revenue.column.date` |
| Report titles | Translation keys: `report.revenue.title` |
| Export filenames | Translation keys: `report.revenue.filename` |
| Resolution | At report generation time using request locale |

### 4.7 Backend — Validation

| Rule | Standard |
|------|----------|
| User-facing validation | Use a `code` field with a translation key |
| Example | `throw new ValidationError('validation.booking.required', { field: 'bookingId' })` |
| Resolution | Frontend resolves via `t('validation.booking.required', { field: 'bookingId' })` |
| Backward compatibility | Keep existing `message` field as English fallback |

### 4.8 Backend — Errors

| Rule | Standard |
|------|----------|
| API error responses | Include `error_code` with a translation key |
| Logged errors | Full English text (not localized, for developers) |
| User-facing errors | Translation key for frontend resolution |

### 4.9 Scheduler

| Rule | Standard |
|------|----------|
| Scheduled job descriptions | Not localized (developer-facing) |
| Error notifications from scheduler | Use translation keys (user-facing) |

### 4.10 Realtime

| Rule | Standard |
|------|----------|
| Socket events | Event names are NOT localized (protocol-level) |
| Notification delivery payload | Includes resolved text (pre-translated for the recipient) |
| Real-time UI updates | Use existing `t()` in the frontend component |

---

## PART 5 — Communication Center

### 5.1 Field Classification

| Field | Type | Translation Source | Why |
|-------|------|-------------------|-----|
| Notification Type Name | **Translation key** | `translation_keys` | System label, must be translatable |
| Notification Title | **Translation key** | `translation_keys` | User-facing text with variables |
| Notification Body | **Translation key** | `translation_keys` | User-facing text with variables |
| Campaign Name | **Free text** | Stored in campaign record | Created by admin, not translatable (branding) |
| Campaign Description | **Free text** | Stored in campaign record | Internal admin notes |
| Email Subject | **Translation key** | `translation_keys` | User-facing text with variables |
| Email Body | **Translation key** for structure; free text for marketing content | Both | System emails use keys; marketing emails may use campaign-specific text |
| SMS Body | **Translation key** | `translation_keys` | Short, structured, user-facing |
| Push Body | **Translation key** | `translation_keys` | Short, structured, user-facing |
| Deep Link | **Business data** | Stored in `NotificationAction.route` | Generated by backend, not translated |
| Variables | **Business data** | Data from domain models | Never translated, injected at runtime |
| Category | **Translation key** | `translation_keys` | `notification.category.booking`, `notification.category.payment` |
| Tags | **Free text** | Stored in campaign record | Admin-facing metadata |
| Icons | **Reference data** | Free text (emoji or icon name) | Not translated |

### 5.2 Key Naming for Notifications

```
notification.{event_name}.{field}
notification.{event_name}.{field}.{variant}
```

| Key | Example |
|-----|---------|
| Title | `notification.booking.confirmed.title` |
| Body | `notification.booking.confirmed.body` |
| Button | `notification.booking.confirmed.action.view` |
| Category | `notification.category.booking` |

### 5.3 Template Resolution

The notification template (`notification_templates` table) stores:

```json
{
  "title_key": "notification.booking.confirmed.title",
  "body_key": "notification.booking.confirmed.body",
  "variables": ["bookingId", "courtName", "date"],
  "action": { "route": "/bookings/{bookingId}", "tab": null },
  "channels": ["in_app", "push", "email"]
}
```

At dispatch time:
```
1. Load template
2. Read recipient's locale from user profile
3. Resolve title_key via t(key, locale, data)
4. Resolve body_key via t(key, locale, data)
5. Interpolate action.route with data
6. Dispatch to channels
```

---

## PART 6 — Notification Architecture

### 6.1 System Notifications

**Definition:** Generated automatically by the platform in response to domain events.

**Characteristics:**
- Triggered by event bus events (`booking:confirmed`, `payment:succeeded`)
- Text defined by translation keys in the notification engine handlers
- All recipients receive the same text (in their own language)

**How they use localization:**
```
Event → notification-engine.ts handler
  → dispatchToUser({
      userId,
      actionKey: 'view_booking',
      actionPayload: { bookingId },
      data: { bookingId, courtName, date }  // Variables for translation
    })
  → Notification dispatched with resolved text
```

The handler provides the translation key context (which keys to use) and the dynamic data. The actual text comes from the translation system.

### 6.2 Campaign Messages

**Definition:** Created by administrators for marketing, promotions, or announcements.

**Characteristics:**
- Created via admin broadcast UI
- Content may be specific to a campaign (not reusable)
- May target specific user segments
- May be time-bound

**How they use localization:**
```
Admin creates campaign
  → Provides text per locale (or provides English, machine-translates)
  → Stored in campaign record with locale variants
  → On send: resolved per-recipient using their locale
```

For campaign messages, the text is campaign-specific and may not exist as reusable translation keys. The campaign stores text directly, keyed by locale:

```json
{
  "campaignId": 42,
  "title": {
    "en": "Summer Special!",
    "ar": "عرض الصيف!"
  },
  "body": {
    "en": "Get 20% off on all courts this weekend.",
    "ar": "احصل على خصم 20% على جميع الملاعب هذا الأسبوع."
  }
}
```

### 6.3 Coexistence

Both systems share the same delivery pipeline but differ in text sourcing:

```
┌─────────────────────┐     ┌──────────────────────┐
│  System Notification│     │  Campaign Message     │
│  (event-driven)     │     │  (admin-created)      │
└─────────┬───────────┘     └──────────┬─────────────┘
          │                            │
          ▼                            ▼
  Translation keys              Campaign-specific
  (translation_keys)            text per locale
          │                            │
          └──────────┬─────────────────┘
                     ▼
            Resolve per recipient locale
                     │
                     ▼
           Delivery pipeline (same)
```

**No duplication:** System notifications use reusable translation keys. Campaign messages use campaign-specific text. Both resolve through the same locale-per-recipient mechanism.

---

## PART 7 — Enterprise Localization Model

### 7.1 Entity Matrix

| Entity | Source of Truth | Translation Source | Editable? | Versioned? | Audited? | Localized? | Cached? |
|--------|---------------|-------------------|-----------|------------|----------|------------|---------|
| **UI Labels** | `translation_keys.default_value` | `translations.value` | Yes (admin) | No | No | Yes | Future |
| **Validation Messages** | `translation_keys.default_value` | `translations.value` | Yes (admin) | No | No | Yes | Future |
| **Error Messages** | `translation_keys.default_value` | `translations.value` | Yes (admin) | No | No | Yes | Future |
| **Success Messages** | `translation_keys.default_value` | `translations.value` | Yes (admin) | No | No | Yes | Future |
| **Notification Types** | `notification_templates` table | Translation keys in template config | Yes (admin) | Yes (template version) | Yes | Yes | Template cached |
| **Notification Templates** | Translation keys | `translations.value` | Yes (admin) | Yes (template version) | Yes | Yes | Template cached |
| **Emails** | Translation keys | `translations.value` | Yes (admin) | Yes | Yes | Yes | Future |
| **SMS** | Translation keys | `translations.value` | Yes (admin) | Yes | Yes | Yes | Future |
| **Push** | Translation keys | `translations.value` | Yes (admin) | Yes | Yes | Yes | Future |
| **Reports** | Translation keys + report config | `translations.value` | Yes (admin) | No | No | Yes | Future |
| **Settings** | Translation keys | `translations.value` | Yes (admin) | No | No | Yes | Future |
| **Permissions** | Translation keys for labels | `translations.value` | Yes (admin) | No | Yes (via audit log) | Yes | Future |
| **Roles** | Translation keys for names | `translations.value` | Yes (admin) | No | Yes (via audit log) | Yes | Future |
| **Sports** | Bilingual columns `name_en`, `name_ar` | Direct column values | Yes (admin) | No | No | Yes | Future |
| **Court Types** | Bilingual columns | Direct column values | Yes (admin) | No | No | Yes | Future |
| **Membership Plans** | Bilingual columns or translation keys for name/description | Direct or keys | Yes (admin) | No | No | Yes | Future |
| **Tournament Types** | Bilingual columns | Direct column values | Yes (admin) | No | No | Yes | Future |
| **Marketplace Categories** | Bilingual columns | Direct column values | Yes (admin) | No | No | Yes | Future |

### 7.2 Bilingual Column Pattern

For reference data that needs bilingual support but is NOT system text, use:

```sql
CREATE TABLE sports (
  id INT PRIMARY KEY,
  name_en VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100) NOT NULL,
  ...
);
```

This keeps reference data translations close to the data itself, rather than mixing them with system UI keys.

**Future migration path:** When more than 2-3 languages are needed, replace `name_en` + `name_ar` with a JSON column or a separate translation table.

---

## PART 8 — Future Expansion

All of the following can be implemented WITHOUT changing the existing translation architecture:

### 8.1 AI Translation

- When a new locale pack is created, call Google Translate / DeepL API for each key
- Store the result with `is_auto = 1`
- Admin reviews and edits via existing grid
- **No schema changes needed** — `is_auto` column already exists

### 8.2 Translation Review Workflow

- Add a `review_status` column to `translations` (values: `draft`, `reviewed`, `approved`)
- Admin grid filters by review status
- **Schema change needed** but `translations` table structure is unchanged

### 8.3 Draft / Published

- Add `status` column to `translations` (values: `draft`, `published`)
- Public bundle endpoint only returns published translations
- Admin sees draft + published in grid
- **Schema change needed** but core architecture is unchanged

### 8.4 Translation Memory

- A `translation_memory` table mapping source_hash → translation
- When a new key with similar English text is added, suggest the existing translation
- **Additive** — does not change existing tables

### 8.5 Bulk Import

- CSV/XLSX import of all translations for a locale
- Upsert logic matches the existing `POST /translations/upsert` pattern
- **No schema changes needed** — just a new endpoint

### 8.6 Bulk Export

- CSV/XLSX export of all keys + all locales
- Existing `GET /translations/export` already exists
- **No changes needed**

### 8.7 Context Preview

- Store a `component_path` in `translation_keys` (column already exists)
- Admin "Preview" button navigates to the component with the key highlighted
- **No schema changes needed** — column already exists

### 8.8 Missing Translation Dashboard

- SQL query: `SELECT k.key FROM translation_keys k LEFT JOIN translations t ON k.key = t.key AND t.locale = ? WHERE t.value IS NULL`
- Display in admin grid as empty cells (already works this way)
- **No schema changes needed**

### 8.9 Version History

- Add `translation_audit` table recording old/new values per edit
- Display diff in admin UI
- **Additive** — does not change existing tables

### 8.10 Translator Permissions

- The existing `translations.*` permission keys already support granular access
- Add a `translator` role with `translations.edit` but NOT `translations.sync` or `translations.delete`
- **No schema changes needed** — RBAC system already supports this

---

## PART 9 — Summary

### What already works

| Capability | Status |
|------------|--------|
| Key-value translation catalog | ✅ |
| English as the schema | ✅ |
| Locale-specific overrides | ✅ |
| Admin editing UI | ✅ |
| Permission-gated translation management | ✅ |
| Frontend t() function with variables | ✅ |
| Frontend fallback chain | ✅ |
| Language persistence (localStorage + user profile) | ✅ |
| RTL support | ✅ |
| Module-based key organization | ✅ |
| Key sync from frontend registry | ✅ |
| Public translation API | ✅ |

### What needs standardization

| Action | Priority |
|--------|----------|
| Add translation keys for tournament, academy, match, wallet, coach modules | High |
| Migrate notification templates to use translation keys | High |
| Add validation/error/success message keys | Medium |
| Add roles/permissions keys | Medium |
| Add report column/filter keys | Low |
| Add `code` field to API error responses | Medium |

### What needs future implementation

| Feature | Depends on |
|---------|-----------|
| Translation caching | Redis infrastructure |
| Pluralization | ICU message format parser |
| Import/export | New API endpoints (schema already supports it) |
| Review workflow | New `review_status` column |
| Version history | New audit table |
| AI translation | API integration + existing `is_auto` column |
| Locale detection middleware | Backend middleware (no schema change) |

### Never change

- English as the schema (`default_value` is the single source of truth)
- The override merge algorithm (defaults → non-empty overrides)
- The frontend bootstrap sequence (embedded English → async fetch)
- The key naming convention (`{module}.{screen}.{element}`)
- The fallback to key itself when missing
