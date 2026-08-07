# IA Migration — Implementation Decision Log

**Purpose:** Record implementation decisions during the IA Migration that do NOT modify architecture.  
**Status:** Append-only. Never edit historical entries.  

---

| Commit | Domain | Decision | Reason | Constitution Ref | ADR Ref |
|--------|--------|----------|--------|-----------------|---------|
| `6d42e4b` | All | Domain section path set to first child's path | Domain landing pages not yet implemented (Commits 2-8 scope). Temporary expedient. When landing pages are added, domain paths must be updated to point to the landing page per Business Constitution §1.1-1.8. | Business Constitution §1.1-1.8 | None — implementation detail |
| `6d42e4b` | Finance | Finance section extracted from Admin Settings → Finance domain | Business Constitution §1.7 assigns Finance ownership to the Finance domain. Admin Settings is a Platform concern. The Finance section was a legacy child of Admin Settings. This move aligns with the approved domain boundaries. | Business Constitution §1.7, §1.8 | None |
| `aef792f` | All | Saved layout: resolver extended to recursively apply layouts to nested sections within domains | After the 8-domain restructure, sections like `sidebar.organisations` became children of domain containers — no longer top-level. The original `resolveAdminNav` only applied saved layouts to top-level sections. Extended `applySavedLayout()` to recurse into child sections, ensuring within-domain saved layouts (Organisations, Marketplace, Security, etc.) continue to work. Existing saved layouts are preserved without user action except root-level domain order. | Navigation Constitution (ADR-005) | None |

| Commit 2 | People | People domain modules reordered: Users → Roles → Organisations → Membership → CRM → HR | Logical flow: fundamental entities → access control → organizational units → member management → customer relationships → staff. | Business Constitution §1.2 | None |
| Commit 3 | Facilities | Moved Sports, Amenities (from Admin Settings → Facilities) and All Bookings (from Organisations → Facilities). Domain order: Reception → All Bookings → Sports Engine → Sports → Amenities → Community Events → Inventory. | Per Business Constitution §1.3: Sports, Amenities, and Booking explicitly belong to Facilities. Domain paths updated to new first children. | Business Constitution §1.3, Permanent Rule 1 (Booking) | None |
