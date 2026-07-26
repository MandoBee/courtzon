# CourtZon Content Lifecycle Standard (CLS)

## Purpose

This document defines the official lifecycle for every piece of system content in CourtZon. It governs how content is created, reviewed, translated, published, updated, deprecated, and archived — without requiring any changes to the existing CLP architecture.

---

## PART 1 — Content Lifecycle

### 1.1 The Full Lifecycle

```
Create → Draft → Review → Approve → Publish → (Update) → Deprecate → Archive → (Delete)
                                                ↓
                                          Stale detection
                                          (English changed)
                                                ↓
                                      Re-enter at Draft/Review
```

Not all content types need every stage. The applicable stages depend on the content's impact and ownership.

### 1.2 Lifecycle by Content Type

| Content Type | Create | Draft | Review | Approve | Publish | Stale Detect | Deprecate | Archive | Delete |
|-------------|--------|-------|--------|---------|---------|-------------|-----------|---------|--------|
| **UI Labels** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Validation Messages** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Error Messages** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Success Messages** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Notification Titles** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Notification Bodies** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Notification Templates** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ |
| **Email Templates** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ |
| **SMS Templates** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ |
| **Translations** | ❌ | ✅ Admin | ✅ Optional | ✅ Optional | ✅ Admin | ✅ When English changes | ❌ | ❌ | ✅ |
| **Campaigns** | ✅ Admin | ✅ Admin | ✅ Admin | ✅ Admin | ✅ Admin | ❌ | ✅ After end date | ✅ After retention | ✅ |
| **Reference Data** | ✅ Admin | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ |
| **Workflow Statuses** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Permission Labels** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Role Names** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Settings Labels** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Help Text** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |
| **Report Labels** | ✅ Developer | ❌ | ❌ | ❌ | ✅ Immediate | ❌ | ❌ | ❌ | ✅ (via key removal) |

### 1.3 Lifecycle Analysis

**Developer-created content (most system text):** Skipped lifecycle
- Created by developers in `translation-keys.registry.ts`
- Synced to database via sync script
- Published immediately (English is always immediately available)
- No draft/review/approve stages
- Deleted when the key is removed from the registry and the sync script prunes it

**Admin-created content (translations):** Full lifecycle
- Created by translators in the CLP admin grid
- English source already exists (created by developer)
- Translations can optionally go through draft → review → approve
- Published when the translator saves
- Stale detection: when the English source changes, translations are flagged

**Admin-created content (campaigns):** Full lifecycle
- Draft → Review → Approve → Publish → End → Archive
- Translations are per-locale (admin provides text for each locale)
- Campaign end date naturally deprecates the content

**Admin-created content (reference data):** Minimal lifecycle
- Created directly in the admin panel
- Published immediately
- No draft/review stages (low impact)
- Deleted when the entity is removed

---

## PART 2 — Content States

### 2.1 State Definitions

| State | Definition | Applicable To |
|-------|-----------|---------------|
| **Draft** | Content exists but is not yet visible to end users | Translations (optional), campaigns |
| **Published** | Content is visible to end users | All content types |
| **Stale** | The English source has changed since the translation was last updated | Translations |
| **Deprecated** | Content is still visible but scheduled for removal | Campaigns (after end date) |
| **Archived** | Content is hidden but preserved | Campaigns (after retention period) |
| **Deleted** | Content is permanently removed | All content types |

### 2.2 State Transitions

```
CREATED ──→ PUBLISHED (immediate, for developer-created content)
    │
    ├──→ DRAFT ──→ REVIEW ──→ APPROVE ──→ PUBLISHED (for admin translations with workflow)
    │
    └──→ DRAFT ──→ PUBLISHED (for admin translations without workflow)

PUBLISHED ──→ STALE (English changed, translation needs review)
    │
    ├──→ DRAFT (re-enter workflow to fix stale translation)
    │
    └──→ CONTINUES PUBLISHED (fallback to English used until fixed)

PUBLISHED (campaign) ──→ DEPRECATED (end date passed)
    │
    └──→ ARCHIVED (retention period passed)
    │
    └──→ DELETED (manual or automated cleanup)
```

### 2.3 State Rules

| Rule | Statement |
|------|-----------|
| **R1** | Developer-created content is always Published immediately. There is no Draft state. |
| **R2** | Admin-created translations can optionally use Draft/Review/Approve stages. The default (current behavior) is Create → Publish immediately. |
| **R3** | A Stale translation remains Published (visible to users) but uses English as fallback. The stale indicator is for administrators, not a hard block. |
| **R4** | Campaigns transition from Published → Deprecated when their end date passes. They remain visible to users with a "ended" indicator. |
| **R5** | Campaigns transition from Deprecated → Archived when the retention period expires. They are hidden from users but preserved for analytics. |
| **R6** | Deletion is always a manual action for system content. Campaigns may have automated deletion after a configurable retention period. |

---

## PART 3 — Change Management

### 3.1 When English Changes

The English text in `translation_keys.default_value` is the source of truth. When it changes:

```
English updated (default_value modified)
    │
    ├──→ UI Labels: No action needed. English always matches the code.
    │
    ├──→ Notifications/Emails/SMS/Push: No action needed. English is the runtime default.
    │
    └──→ Translations: The existing translation for each locale may now be outdated.
         └──→ Stale Detection (future):
              • Compare `translation_keys.updated_at` with `translations.updated_at`
              • If key updated_at > translation updated_at → mark translation as STALE
              • Admin translation grid shows a "Stale" indicator
              • Users see the old translation (or English, depending on configuration)
```

### 3.2 Stale Translation Behavior

| Setting | Behavior | When to use |
|---------|----------|------------|
| **Show old translation** | Users see the previous translation until a new one is approved | Conservative — users always see translated content |
| **Fallback to English** | Users see the English text when the translation is stale | Progressive — users see the latest English meaning |
| **Recommendation** | Default to "Show old translation" with a "Needs review" indicator in the admin grid | Best UX for users; best visibility for translators |

### 3.3 Administrator Notifications

When translations become stale, administrators should be notified:

| Channel | Trigger | Priority |
|---------|---------|----------|
| Admin translation grid indicator | On page load | High (always visible) |
| Email digest (weekly) | Count of stale translations per locale | Medium |
| Dashboard widget | On admin login | High |

### 3.4 Fallback Rules When English Changes

| Scenario | User Experience |
|----------|----------------|
| English text updated, translation unchanged | User sees old translation (conservative mode) |
| English text updated, translation marked stale, no new translation available | User sees old translation |
| English text updated, translation deleted | User sees English (default fallback) |
| New translation key added, no translations exist for any locale | All users see English |
| Translation key removed from registry | All users see the key string (current behavior) |

---

## PART 4 — Version Policy

### 4.1 Versioning Requirements

| Entity | Needs Versioning? | Why |
|--------|------------------|-----|
| **Translation Keys** | **No** | The key itself is an identifier, not a versionable artifact. The `default_value` is the current text. History is not needed for system UI text. |
| **Translations** | **No** (optional future) | A translation is a simple key=value pair. Versioning adds complexity without proportional benefit for most UI text. Future: optional version history for audit. |
| **Notification Templates** | **Yes** | Templates define structure, routing, and keys. Changes to templates affect real user communications. Versioning enables rollback. (Currently implemented: `template_version` column exists.) |
| **Email Templates** | **Yes** | Same reasoning as notification templates. |
| **Campaigns** | **Yes** | Campaigns go through a formal lifecycle (draft → review → publish → archive). Versioning enables audit and rollback. |
| **Reference Data** | **No** | Reference data changes are infrequent and low-impact. Current state is sufficient. |
| **Validation Messages** | **No** | These are system text, versioning is unnecessary. |
| **Workflow Labels** | **No** | These are system text, versioning is unnecessary. |
| **Reports** | **No** | Report labels are system text. Report configuration may need versioning, but labels do not. |
| **Settings** | **No** | Setting labels are system text. Setting values may need audit logging, but that is separate from the CLP. |

### 4.2 Versioning Strategy

| Entity | Strategy | Implementation |
|--------|----------|----------------|
| **Notification Templates** | Integer version, incremented on each save | Already exists: `notification_templates.template_version` |
| **Email Templates** | Integer version, incremented on each save | Same pattern as notification templates |
| **Campaigns** | Immutable published versions + editable draft | Campaign record has `status` field. Published campaigns create a snapshot. Edits create a new draft version. |
| **Translations (future)** | Optional audit table | `translation_audit` table records old/new values. The `translations` table itself is not versioned. |

### 4.3 Versioning Rules

| Rule | Statement |
|------|-----------|
| **V1** | Translation keys and translations are NOT versioned. The current value is the only value. |
| **V2** | Notification and email templates ARE versioned. Each save increments the version. |
| **V3** | Campaigns use a status-based version model: Draft → Published creates a snapshot. Edits to published campaigns create a new draft. |
| **V4** | Reference data is NOT versioned. Changes overwrite the current value. |
| **V5** | System text (UI labels, validation, errors, etc.) is NOT versioned. The English `default_value` and the `translations.value` are always the latest. |

---

## PART 5 — Audit Policy

### 5.1 What Must Be Audited

| Entity | Audit Event | Fields to Capture | Required? |
|--------|------------|-------------------|-----------|
| **Translation Keys** | Created | actor_id, timestamp, key, default_value | ✅ Yes |
| **Translation Keys** | default_value changed | actor_id, timestamp, key, old_value, new_value | ✅ Yes |
| **Translations** | Created / Updated | actor_id, timestamp, key, locale, old_value, new_value | ✅ Yes |
| **Notification Templates** | Created / Updated | actor_id, timestamp, template_id, changed_fields | ✅ Yes (already exists via `recordAudit`) |
| **Campaigns** | Created | actor_id, timestamp, campaign_id, title | ✅ Yes |
| **Campaigns** | Status change | actor_id, timestamp, campaign_id, old_status, new_status | ✅ Yes |
| **Campaigns** | Published | actor_id, timestamp, campaign_id, approval | ✅ Yes |
| **Reference Data** | Created / Updated | actor_id, timestamp, entity_type, entity_id, changed_fields | ⚠ Recommended |
| **Reference Data** | Deleted | actor_id, timestamp, entity_type, entity_id | ⚠ Recommended |

### 5.2 Audit Storage

Two approaches, both compatible with the existing architecture:

**Approach A: Existing `recordAudit()` function (recommended)**

The existing `recordAudit()` function in `backend/src/modules/audit-log/` already captures audit events. CLP audit events should use this same function.

```typescript
recordAudit({
  actorId: userId,
  action: 'TRANSLATION.UPDATED',
  entityType: 'translation',
  entityId: translationId,
  beforeState: { value: oldValue },
  afterState: { value: newValue, locale },
});
```

**Approach B: Dedicated `translation_audit` table (optional)**

A separate table for translation-specific audit events, useful if the volume of translation edits is high and would pollute the main audit log.

### 5.3 Audit Rules

| Rule | Statement |
|------|-----------|
| **A1** | Every create/update/delete of a translation value MUST be audited. |
| **A2** | Every create/update of a notification template MUST be audited. |
| **A3** | Every campaign status change (Draft → Published → Archived) MUST be audited. |
| **A4** | Reference data changes SHOULD be audited (recommended but not required). |
| **A5** | Audit events MUST capture who made the change, when, and what changed. |
| **A6** | The existing `recordAudit()` function should be used for all CLP audit events. |

---

## PART 6 — Review Workflow

### 6.1 Workflow by Content Type

| Content Type | Draft | Review | Approve | Publish | Immediate Publish |
|-------------|-------|--------|---------|---------|------------------|
| **UI Labels** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate |
| **Validation Messages** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate |
| **Notification Titles** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate |
| **Notification Bodies** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate |
| **Notification Templates** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate (changes are code-deployed) |
| **Email Templates** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate |
| **SMS Templates** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate |
| **Translations** | ✅ Optional | ✅ Optional | ✅ Optional | ✅ Admin | ✅ Current default |
| **Campaigns** | ✅ Required | ✅ Required | ✅ Required | ✅ Admin | ❌ Must go through workflow |
| **Reference Data** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate |
| **Permissions/Roles** | ❌ | ❌ | ❌ | ❌ | ✅ Immediate (code-deployed) |

### 6.2 Translation Workflow (Optional)

The current translation system publishes immediately. An optional review workflow could be added:

```
Admin saves translation → DRAFT
    ↓
Reviewer reviews → marks as APPROVED
    ↓
Translation becomes PUBLISHED (visible to end users)
    ↓
OR Admin with "translations.publish" permission can skip review and publish immediately
```

**This workflow is OPTIONAL.** The default (current) behavior is publish immediately. The workflow is only activated if the admin configures review requirements per locale.

### 6.3 Campaign Workflow

```
Admin creates campaign → DRAFT
    ↓
Admin edits content, targeting, schedule
    ↓
Admin submits for review → IN REVIEW
    ↓
Approver reviews → APPROVED
    ↓
OR Admin requests changes → back to DRAFT
    ↓
Campaign goes live at scheduled date → PUBLISHED
    ↓
Campaign ends → DEPRECATED
    ↓
Retention period passes → ARCHIVED
```

### 6.4 Workflow Rules

| Rule | Statement |
|------|-----------|
| **W1** | System text (developer-created) NEVER goes through a review workflow. Changes take effect immediately on deploy. |
| **W2** | Translations MAY optionally go through a Draft → Review → Approve workflow. The default is immediate publish. |
| **W3** | Campaigns MUST go through a formal workflow: Draft → Review → Approve → Publish. This is enforced because campaigns contain marketing content that may need legal/compliance review. |
| **W4** | Reference data changes are immediate (no workflow). Low impact. |
| **W5** | The review workflow adds no new database tables. States are tracked via a `status` column on the relevant entity. |

---

## PART 7 — Enterprise Lifecycle Policy

### 7.1 The Official CLS Policy

The following lifecycle policies are binding for all future CourtZon modules that create system content.

#### Policy 1: Content Classification

Every piece of text in CourtZon MUST be classified into exactly one category:

| Category | Lifecycle | Stages |
|----------|-----------|--------|
| **System Text** | Simple | Create → Publish → Delete |
| **Translation** | Managed | Create → (Draft → Review → Approve →) Publish → Stale → Update |
| **Campaign** | Full | Create → Draft → Review → Approve → Publish → Deprecate → Archive → Delete |
| **Reference Data** | Simple | Create → Publish → Delete |
| **User Content** | None | Not managed by CLP |

#### Policy 2: Source of Truth

| Rule | Statement |
|------|-----------|
| **CLS-01** | English (`translation_keys.default_value`) is the single source of truth for ALL system text. |
| **CLS-02** | The `translations` table is the source of truth for non-English variants of system text. |
| **CLS-03** | Campaign records are the source of truth for campaign-specific marketing text. |
| **CLS-04** | Reference data entities (with `translation_key` column) resolve display names through the CLP. |

#### Policy 3: Lifecycle Stages

| Rule | Statement |
|------|-----------|
| **CLS-05** | System text bypasses all lifecycle stages except Create and Publish. Changes are immediate. |
| **CLS-06** | Translations are published immediately by default. The Draft → Review → Approve workflow is available but not required. |
| **CLS-07** | Campaigns MUST pass through the full lifecycle: Draft → Review → Approve → Publish → Deprecate → Archive. |
| **CLS-08** | Reference data changes are immediate. No staged lifecycle. |

#### Policy 4: Change Management

| Rule | Statement |
|------|-----------|
| **CLS-09** | When English `default_value` changes, existing translations are marked as Stale. |
| **CLS-10** | Stale translations continue to be served to users (conservative mode). The old translation is shown until a new one is approved. |
| **CLS-11** | The admin translation grid MUST display a visual indicator for stale translations. |
| **CLS-12** | Translation keys removed from the frontend registry MUST be deprecated in the database (not deleted immediately) for a grace period of 30 days. |

#### Policy 5: Versioning

| Rule | Statement |
|------|-----------|
| **CLS-13** | Translation keys and translation values are NOT versioned. The current value is authoritative. |
| **CLS-14** | Notification and email templates ARE versioned. Each save increments `template_version`. |
| **CLS-15** | Campaigns use a status-based version model. Published campaigns are immutable snapshots. |

#### Policy 6: Audit

| Rule | Statement |
|------|-----------|
| **CLS-16** | Every create, update, and delete of a translation value MUST be audited via `recordAudit()`. |
| **CLS-17** | Every change to a notification template MUST be audited. |
| **CLS-18** | Every campaign status change MUST be audited. |
| **CLS-19** | Audit events MUST capture the actor ID, timestamp, entity type, entity ID, and before/after state. |

#### Policy 7: Review Workflow

| Rule | Statement |
|------|-----------|
| **CLS-20** | The translation review workflow (Draft → Review → Approve) is OPTIONAL. Default is immediate publish. |
| **CLS-21** | The campaign workflow (Draft → Review → Approve → Publish) is MANDATORY. |
| **CLS-22** | Only users with the `translations.publish` permission may bypass the translation review workflow. |
| **CLS-23** | Only users with the `campaigns.publish` permission may publish campaigns. |

#### Policy 8: Deletion

| Rule | Statement |
|------|-----------|
| **CLS-24** | System text (translation keys) MUST NOT be deleted from the database on registry removal. Keys are soft-deprecated for 30 days, then archived. |
| **CLS-25** | Translations are deleted when the parent key is archived (cascade). |
| **CLS-26** | Campaigns are hard-deleted only after the archive retention period expires (configurable per organisation, default 90 days). |
| **CLS-27** | Reference data entities may be hard-deleted immediately. There is no soft-delete requirement. |
| **CLS-28** | User content is NEVER deleted by the CLP. Deletion is handled by the owning module. |

### 7.2 Backward Compatibility

This CLS document is 100% backward compatible with the existing CLP architecture because:

| Existing Behavior | CLS Policy | Compatible? |
|-------------------|-----------|-------------|
| Translation keys created by developers, synced to DB | CLS-01, CLS-05 | ✅ Identical |
| Translations saved immediately in admin grid | CLS-06 (default) | ✅ Identical |
| English as default_value, never in translations table | CLS-01 | ✅ Identical |
| Frontend t() function with three-level fallback | CLS-10 (fallback) | ✅ Identical |
| Notification templates with `template_version` | CLS-14 | ✅ Already exists |
| No review workflow for translations | CLS-20 (optional) | ✅ Default behavior unchanged |
| Admin can edit any translation at any time | CLS-06 | ✅ Unchanged |

### 7.3 New Capabilities (Additive, Not Breaking)

| New Capability | CLS Policy | What Changes |
|---------------|-----------|-------------|
| Stale translation detection | CLS-09, CLS-10, CLS-11 | New `status` column on `translations` (future), new admin UI indicator |
| Campaign lifecycle | CLS-07, CLS-21, CLS-23 | Uses existing campaign architecture; enforces workflow rules |
| Translation audit | CLS-16 | New calls to existing `recordAudit()` |
| 30-day key deprecation | CLS-24 | New cleanup job; no schema change |
| Optional review workflow | CLS-20, CLS-22 | New `status` column on `translations` (future), permission check |
