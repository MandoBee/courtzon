# ENTERPRISE TABLE AUDIT: `warehouses`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Inventory warehouse/storage location |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   warehouses  —  EXECUTIVE SNAPSHOT                                  │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Inventory entity                                 │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        10/10 — Clean, full CRUD with audit                 │
│  PK:             id (int unsigned)                                    │
│  FK:             1 — organisations CASCADE                            │
│  CHILDREN:       2 — purchase_orders SET NULL, stock_transfers×2 SET NULL |
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   34 across 2 files                                    │
│  FRONTEND REFS:  63 across 6 files                                    │
│  FINDINGS:       None                                                 │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — warehouse locations for inventory management (purchase orders, stock transfers, adjustments) |
| Evidence | Full CRUD with audit logging; 4 API routes; consumed by purchase orders, stock transfers, and inventory logs; frontend warehouses page + integration in purchase orders + stock transfer pages |

---

## 3. PRODUCTION SCHEMA (7 columns)

```
id                int unsigned AUTO_INCREMENT PK
organisation_id   int unsigned NOT NULL      → organisations(id) ON DELETE CASCADE
name              varchar(200) NOT NULL
location          text DEFAULT NULL
status            enum('active','inactive','archived') NOT NULL DEFAULT 'active'
created_at        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: idx_org
```

Created by M067 — not in baseline.

---

## 4. APPLICATION CODE REFERENCES

**Controller** (`inventory.controller.ts`):
| Method | SQL | Correct? |
|---|---|---|
| `listWarehousesHandler` | `SELECT * FROM warehouses WHERE organisation_id = ? ORDER BY name ASC` | ✅ |
| `createWarehouseHandler` | `INSERT INTO warehouses (organisation_id, name, location, status) VALUES (?, ?, ?, ?)` | ✅ |
| `updateWarehouseHandler` | `UPDATE warehouses SET name = ?, location = ?, status = ? WHERE id = ? AND organisation_id = ?` | ✅ |
| `deleteWarehouseHandler` | `DELETE FROM warehouses WHERE id = ? AND organisation_id = ?` | ✅ |

All INSERT/SELECT/UPDATE/DELETE statements reference only columns that exist in production. ✅

**Frontend:** `WarehousesPage.tsx` (full CRUD UI), integrated into `PurchaseOrdersPage.tsx` (dropdown), `InventoryPage.tsx` (transfer dropdowns). 4 routes, 2 permission keys, 12 i18n keys.

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **The review identified three foreign key references** involving warehouse columns: `purchase_orders.warehouse_id`, `stock_transfers.from_warehouse_id`, and `stock_transfers.to_warehouse_id`. The reviewed production schema applies SET NULL actions to those foreign keys.
- **Full inventory lifecycle:** warehouses serve as source/destination for purchase orders and stock transfers, with inventory logs tracking warehouse-level stock movement.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | (None required) | — |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (7 cols, 1 FK, 1 index) |
| Migration verified | ✅ (M067) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (organisations CASCADE) |
| Child tables verified | ✅ (2: purchase_orders SET NULL, stock_transfers×2 SET NULL) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `warehouses` ✅

**Next table: `web_vitals_metrics` — proceed?**
