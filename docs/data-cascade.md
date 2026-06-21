# Data cascade strategy (CourtZon)

## Two delete models

| Model | How | FK `ON DELETE CASCADE` |
|--------|-----|-------------------------|
| **Soft delete** | `deleted_at = NOW()` on parent | Does **not** run — children stay in DB |
| **Hard delete** | `DELETE FROM …` | Runs — MySQL removes child rows |

Most domain tables (`organisations`, `branches`, `resources`, `products`, `users`, `roles`, `sports`, `tournaments`, `academies`, `coach_profiles`) use **soft delete**. Foreign keys still reference live row IDs.

## Rule

**Every soft-delete of a parent must run an application cascade** (see `backend/src/shared/cascade/`) that:

1. Soft-deletes or cancels children that should disappear from admin/UI lists  
2. Cancels pending workflows (subscriptions, upgrade requests, bookings, coach agreements)  
3. Deactivates flags (`is_active`, `is_verified`, `account_status`) where appropriate  

Do not rely on `ON DELETE CASCADE` alone unless the feature performs a hard delete.

## Implemented cascades

| Parent | Helper | Wired in |
|--------|--------|----------|
| Organisation | `cascadeOrganisationSoftDelete` | `organisation.service.deleteOrganisation` |
| User | `cascadeUserSoftDelete` | `rbac.service.deleteUser` |
| Branch | `cascadeBranchSoftDelete` | `organisation.service.deleteBranch` |
| Resource | `cascadeResourceSoftDelete` | `organisation.service.deleteResource` |
| Sport | `cascadeSportSoftDelete` | `organisation.service.deleteSport` |
| Role | `cascadeRoleSoftDelete` | `rbac.service.deleteRole` |
| Product | `cascadeProductSoftDelete` | `marketplace.service` seller + admin delete |
| Subscription plan (hard) | `cascadeSubscriptionPlanDelete` | `organisation.service.deletePlan` |
| Tournament | `cascadeTournamentSoftDelete` | `activities.repository.softDeleteTournament` |
| Academy | `cascadeAcademySoftDelete` | `activities.repository.softDeleteAcademy` |
| Coach profile | `cascadeCoachProfileSoftDelete` | `activities.repository.softDeleteCoach` |

Shared booking helper: `cancelActiveBookingsWhere` — cancels `pending`, `confirmed`, `checked_in` bookings.

## Organisation delete (summary)

`DELETE /organisations/:id` → transaction: cascade → `organisations.deleted_at`:

- Subscriptions → `cancelled`
- Upgrade requests (pending) → `rejected`
- Coach org agreements (pending) → `rejected`
- Bookings (active) → `cancelled`
- Branches / resources / products / tournaments / academies → soft-deleted or deactivated
- Org marked inactive + unverified

**View Assignments** lists only `active` / `pending` subscriptions on non-deleted orgs (`INNER JOIN`).

## List-query hygiene

Admin/list queries should exclude soft-deleted parents, for example:

- `branch_player_access` admin list: non-deleted branch, org, and user
- Tournament/academy admin lists: hide rows whose org was soft-deleted
- Subscriptions assignment view: `INNER JOIN organisations … deleted_at IS NULL`

## Database reset vs soft-delete

**Full reset** (empty schema + baseline config):

```bash
node backend/scripts/migrate.js --fresh --seed
```

This reloads `database/seed/003_baseline_snapshot.sql` (reference data, RBAC, CMS, plans, users, etc.). It does **not** restore transactional tables (bookings, orders, sessions). Refresh the snapshot after admin changes: `node backend/scripts/export-baseline-seed.mjs`. See `database/seed/README.md`.

Soft-delete cascades apply when removing entities in a running system, not during `--fresh`.

## Adding a new parent entity

1. Add `backend/src/shared/cascade/<entity>.cascade.ts`
2. Export from `backend/src/shared/cascade/index.ts`
3. Call from the delete service inside a transaction **before** setting `deleted_at`
4. Update any admin list SQL that could still show orphaned children
5. Document the cascade in this file
