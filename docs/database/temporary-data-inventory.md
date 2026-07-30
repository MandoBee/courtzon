# CourtZon V3 — Temporary Data Inventory

**Source:** Canonical database manifest + actual database (Docker local, July 2026)
**Purpose:** Identify all tables holding disposable/temporary data across 12 categories
**Note:** Row counts are from the local Docker instance. Hostinger production counts will differ.

---

## Summary

| Category | Tables | Total Rows (local) |
|----------|--------|-------------------|
| Sessions | 1 | 65 |
| Authentication Tokens | 3 | 0 |
| Password Reset Tokens | 1 | 0 |
| Email Verification Tokens | 1 | 0 |
| OTP | 0 | — |
| Login History | 1 | 65 |
| Temporary Uploads | 2 | 14 |
| Queue Tables | 6 | 3 |
| Background Job Tables | 5 | 10 |
| Cache Tables | 0 | — |
| Cron Tables | 1 | 3 |
| Temporary Notifications | 4 | 89 |
| Temporary Integration Tables | 4 | 0 |
| **Total** | **27** | **249** |

---

## 1. Sessions

### `user_sessions`
| Field | Value |
|-------|-------|
| **Purpose** | Active user login sessions. Each row = one authenticated device/browser session. |
| **Current rows (local)** | 65 |
| **FK dependencies (incoming)** | NONE — no table references `user_sessions` |
| **FK dependencies (outgoing)** | NONE — no FK constraints to other tables |
| **Safe to DELETE ALL ROWS?** | **YES** (with note) |
| **Note** | Users will be forced to re-login. This is acceptable for a production cleanup. Protected users' sessions (super admin, Tarek Zaki) can be preserved if desired. |

---

## 2. Authentication Tokens

### `password_reset_tokens`
| Field | Value |
|-------|-------|
| **Purpose** | One-time password reset tokens with expiry. Used during forgot-password flow. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Tokens expire naturally. Safe to clear at any time. |

### `email_verification_tokens`
| Field | Value |
|-------|-------|
| **Purpose** | One-time email verification tokens. Used during registration. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Tokens expire naturally. Safe to clear at any time. |

---

## 3. Login History

Covered by `user_sessions` (see Sessions above). The `users` table has a `last_login_at` column but no separate login history table exists.

---

## 4. Temporary Uploads

### `uploads`
| Field | Value |
|-------|-------|
| **Purpose** | User uploads (avatars, images, files). May reference actual user content. |
| **Current rows (local)** | 14 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** with caution |
| **Reason** | Uploads may be referenced by user profiles, products, etc. via `attachable_type`/`attachable_id` columns. Only DELETE if protected users' uploads have been verified. |

### `media_uploads`
| Field | Value |
|-------|-------|
| **Purpose** | CMS media uploads (blog images, page assets). |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Empty in local DB. CMS content can be re-uploaded. |

---

## 5. Queue Tables

### `notification_queue`
| Field | Value |
|-------|-------|
| **Purpose** | Legacy MySQL-backed notification queue. Superseded by BullMQ (Redis). |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Modern notification system uses BullMQ; this table is legacy. |

### `dead_letter_entries`
| Field | Value |
|-------|-------|
| **Purpose** | Events/messages that failed processing after all retries. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Dead letters have no retry path. Safe to purge. |

### `notification_dead_letter_queue`
| Field | Value |
|-------|-------|
| **Purpose** | Undeliverable notification records. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Notifications that failed delivery. Safe to purge. |

### `processed_commands`
| Field | Value |
|-------|-------|
| **Purpose** | CQRS command audit trail. One row per processed command. |
| **Current rows (local)** | 1 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Historical command log. Not needed for operation. |

### `processed_events`
| Field | Value |
|-------|-------|
| **Purpose** | Event Bus processed event log. Deduplication tracking. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Event dedup state resets; events will be reprocessed if needed. |

### `published_events`
| Field | Value |
|-------|-------|
| **Purpose** | Outbox-pattern event publication log. |
| **Current rows (local)** | 2 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Outbox log. Future events will be published fresh. |

### `outbox_cursors`
| Field | Value |
|-------|-------|
| **Purpose** | Event Bus subscriber cursor positions for outbox polling. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Cursors reset; subscribers will re-read from start. Note: EventBus v2 will auto-recreate cursor rows on next poll cycle. |

---

## 6. Background Job Tables

### `scheduled_jobs`
| Field | Value |
|-------|-------|
| **Purpose** | Legacy scheduled job queue. Rows represent pending job executions. |
| **Current rows (local)** | 10 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Legacy scheduling system. Superseded by BullMQ cron jobs. |

### `workflow_instances`
| Field | Value |
|-------|-------|
| **Purpose** | Workflow engine execution instances. Tracks running/completed workflows. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | Has FK to `workflow_definitions`, `users`, `organisations` |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Empty in local DB. Completed workflows don't need retention. |

### `workflow_events`
| Field | Value |
|-------|-------|
| **Purpose** | Workflow-scoped events within workflow instances. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | Has FK to `workflow_instances` |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Child of `workflow_instances`. Deleted when parent is deleted. |

### `workflow_branch_instances`
| Field | Value |
|-------|-------|
| **Purpose** | Parallel branch tracking within workflow instances. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | Has FK to `workflow_instances` |
| **Safe to DELETE ALL ROWS?** | **YES** |

---

## 7. Cache Tables

No dedicated MySQL cache tables. Caching is handled via Redis (ioredis).

---

## 8. Cron Tables

### `cron_jobs`
| Field | Value |
|-------|-------|
| **Purpose** | Legacy cron job definition/status table. Defines scheduled tasks and tracks last run. |
| **Current rows (local)** | 3 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Replaced by BullMQ workers. The rows are definitions (seeds), not runtime data. However, this table is classified as **Protected Master Data** in the cleanup spec because it defines cron schedule configurations. Verify no active system reads it before deleting. |

---

## 9. Temporary Notifications

### `notifications`
| Field | Value |
|-------|-------|
| **Purpose** | User-facing notification instances (in-app, email, push). |
| **Current rows (local)** | 31 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | Has FK to `users`, `notification_actions` |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Old notifications are not needed. Users will see a clean notification list. |

### `notification_delivery`
| Field | Value |
|-------|-------|
| **Purpose** | Delivery tracking for each notification channel. |
| **Current rows (local)** | 58 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | Has FK to `notifications` |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Delivery logs are temporary. Must delete AFTER `notifications` due to FK. |

### `notification_alerts`
| Field | Value |
|-------|-------|
| **Purpose** | System alert instances (monitoring threshold breaches). |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |

### `notification_replay_log`
| Field | Value |
|-------|-------|
| **Purpose** | Notification replay history (re-delivery attempts). |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |

---

## 10. Temporary Integration Tables

### `api_keys`
| Field | Value |
|-------|-------|
| **Purpose** | Integration platform API key assignments. |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | Has FK to `organisations`, `users` |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | API keys are regenerable. Empty in local DB. |

### `push_tokens`
| Field | Value |
|-------|-------|
| **Purpose** | Mobile device push notification tokens (FCM, APNs). |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | Has FK to `users`, `user_devices` |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Tokens are regenerated on next app launch. |

### `client_error_reports`
| Field | Value |
|-------|-------|
| **Purpose** | Client-side JavaScript error reports (monitoring). |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Error reports are diagnostic only. |

### `web_vitals_metrics`
| Field | Value |
|-------|-------|
| **Purpose** | Web Vitals performance metrics (LCP, CLS, FCP). |
| **Current rows (local)** | 0 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** |
| **Reason** | Performance metrics are diagnostic only. |

---

## 11. Notification Analytics (borderline temporary)

### `notification_analytics`
| Field | Value |
|-------|-------|
| **Purpose** | Aggregated notification delivery analytics. |
| **Current rows (local)** | 58 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** (debatable) |
| **Reason** | Analytics data. Regenerable from notification_delivery logs. If delivery logs are also cleared, analytics cannot be reconstructed. Consider EXPORT before DELETE if analytics history is valued. |

### `notification_audit_trail`
| Field | Value |
|-------|-------|
| **Purpose** | Full notification audit trail (compliance). |
| **Current rows (local)** | 162 |
| **FK dependencies (incoming)** | NONE |
| **FK dependencies (outgoing)** | NONE |
| **Safe to DELETE ALL ROWS?** | **YES** with caution |
| **Reason** | Audit trail may have compliance value. Consider EXPORT before DELETE if regulatory retention is required. |

---

## Deletion Order (FK-safe)

Due to FK constraints between some temporary tables, deletion must follow this order:

```
1. notification_delivery          (FK → notifications)
2. notifications                  (FK → users)
3. notification_analytics         (independent)
4. notification_audit_trail       (independent)
5. notification_queue             (independent)
6. notification_alerts            (independent)
7. notification_replay_log        (independent)
8. notification_dead_letter_queue (independent)
9. workflow_events                (FK → workflow_instances)
10. workflow_branch_instances     (FK → workflow_instances)
11. workflow_instances            (FK → users, organisations, workflow_definitions)
12. published_events              (FK → outbox_cursors, subscriptions)
13. outbox_cursors                (independent)
14. processed_events              (independent)
15. processed_commands            (independent)
16. dead_letter_entries           (independent)
17. push_tokens                   (FK → users, user_devices)
18. api_keys                      (FK → users, organisations)
19. user_sessions                 (independent — no FK)
20. email_verification_tokens     (independent)
21. password_reset_tokens         (independent)
22. uploads                       (independent)
23. media_uploads                 (independent)
24. scheduled_jobs                (independent)
25. cron_jobs                     (independent)
26. client_error_reports          (independent)
27. web_vitals_metrics            (independent)
```

**Total rows to delete (local):** ~249
**Tables to empty:** 27
**Tables with actual data:** ~9 (the rest are already empty)

---

*End of Temporary Data Inventory*
