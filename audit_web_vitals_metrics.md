# ENTERPRISE TABLE AUDIT: `web_vitals_metrics`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Client-side Web Vitals performance metrics |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   web_vitals_metrics  —  EXECUTIVE SNAPSHOT                          │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           3 — Monitoring analytics entity                      │
│  HEALTH:         4/10 — Schema sound, INSERT works, SELECT broken    │
│  QUALITY:        4/10 — BI controller references non-existent columns│
│  PK:             id (bigint unsigned)                                  │
│  FK:             0                                                     │
│  CHILDREN:       0                                                     │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   2 SQL queries (1 correct INSERT, 1 broken SELECT)    │
│  FRONTEND REFS:  1 page (API call)                                    │
│  FINDINGS:       1 — WVM-001 (Critical)                               │
│  RECOMMENDATION: Rewrite BI controller SELECT to match generic schema │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — client-side performance monitoring (LCP, CLS, FCP, TTFB) |
| Evidence | INSERT via POST /client/web-vitals in monitoring controller; SELECT via GET /bi/web-vitals in BI controller; frontend ObservabilityPage |

---

## 3. PRODUCTION SCHEMA (7 columns)

```
id              bigint unsigned AUTO_INCREMENT PK
metric_name     varchar(20) NOT NULL            e.g. 'LCP', 'CLS', 'FCP', 'TTFB'
metric_value    decimal(10,2) NOT NULL
metric_rating   varchar(10) DEFAULT NULL        'good', 'needs-improvement', 'poor'
page_url        varchar(500) DEFAULT NULL
user_id         int unsigned DEFAULT NULL
created_at      timestamp NULL DEFAULT CURRENT_TIMESTAMP

Indexes: idx_vitals_metric (metric_name, created_at)
```

Created by M016 — not in baseline (SF-002 consistent). Charset `utf8mb4_0900_ai_ci`.

---

## 4. APPLICATION CODE REFERENCES

**Write path** — `monitoring.controller.ts:36-42` (WORKS):
```sql
INSERT INTO web_vitals_metrics (metric_name, metric_value, metric_rating, page_url, user_id)
VALUES (?, ?, ?, ?, ?)
```
All 5 columns exist in production. ✅

**Read path** — `bi.controller.ts:339-346` (BROKEN):
```sql
SELECT DATE(recorded_at) AS date,
  AVG(lcp) AS avg_lcp, AVG(cls) AS avg_cls, AVG(fcp) AS avg_fcp,
  COUNT(*) AS sample_count
FROM web_vitals_metrics ${where}
GROUP BY DATE(recorded_at)
ORDER BY date DESC
```
References `recorded_at`, `lcp`, `cls`, `fcp` — none of these columns exist.

---

## 5. FINDINGS

---

### WVM-001: BI controller SELECT references non-existent pivoted columns

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema uses generic `metric_name`/`metric_value`/`metric_rating` design — one row per metric
2. `bi.controller.ts:333-334` — WHERE clause references `recorded_at` (column does not exist; production has `created_at`)
3. `bi.controller.ts:340-341` — SELECT references `lcp`, `cls`, `fcp` as columns (these are values stored in `metric_name`, not separate columns)
4. `monitoring.controller.ts:36-42` — INSERT uses correct columns ✅

**Root Cause:**
The BI controller query was written for a different schema design where each Web Vital (LCP, CLS, FCP) was stored as a separate column and `recorded_at` was the timestamp. The production schema uses a generic design where `metric_name` holds the metric identifier and `metric_value` holds its value. The INSERT code was updated to match the generic schema, but the SELECT was not.

**Impact:**
- Fact: The reviewed SQL statements reference columns that are not present in the reviewed production schema. If those statements are executed, the database is expected to reject them.
- Expected: 0 production rows were observed during the review. Whether these code paths are executed in production was not established.

**Recommendation:**
Rewrite the BI controller SELECT to work with the generic schema:
```sql
SELECT DATE(created_at) AS date,
  AVG(CASE WHEN metric_name = 'LCP' THEN metric_value END) AS avg_lcp,
  AVG(CASE WHEN metric_name = 'CLS' THEN metric_value END) AS avg_cls,
  AVG(CASE WHEN metric_name = 'FCP' THEN metric_value END) AS avg_fcp,
  COUNT(*) AS sample_count
FROM web_vitals_metrics
WHERE created_at >= ? AND created_at <= ?
GROUP BY DATE(created_at)
ORDER BY date DESC
```

---

## 6. OBSERVATIONS

- **Generic metric schema** (`metric_name` + `metric_value`) is more scalable than pivoted columns — adding new metrics requires no DDL changes.
- **Composite index `idx_vitals_metric`** on `(metric_name, created_at)` supports the aggregation query pattern.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Rewrite BI controller SELECT to match production schema | Critical | WVM-001 |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (7 cols, 0 FK, 1 index) |
| Migration verified | ✅ (M016) |
| Write path verified | ✅ (INSERT columns correct) |
| Read path verified | ⚠️ (SELECT columns broken — WVM-001) |
| FK integrity verified | ✅ (0 FKs) |
| Code vs schema alignment | ⚠️ Partial — INSERT aligned, SELECT broken |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `web_vitals_metrics` ✅

**Next table: `wishlist_items` — proceed?**
