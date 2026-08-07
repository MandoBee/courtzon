# CourtZon Business Information Architecture — Governing Document

**Document Type:** Platform Contract  
**Status:** FROZEN — Approved for Implementation  
**Version:** v1.0  
**Date:** 2026-08-07  

---

## 0. Preamble

This document defines the permanent Business Information Architecture of CourtZon. It is the authoritative reference for every business module, every feature decision, and every domain boundary in the platform. No business concept may be introduced, modified, or deprecated without reference to this document.

The Navigation Platform — Registry, Resolvers, Consumers, Workspace, Pipeline, and Governance — is complete and frozen. This document operates one layer above: it governs *what business the platform serves*, not *how the platform renders navigation*.

This document is binding on all future platform development.

---

## 1. Business Domains — Final Validation

Eight Business Domains. One Dashboard. Zero ambiguity.

---

### 1.1 Dashboard

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Operational command center — the first screen every user sees |
| **Business capability** | Cross-domain situational awareness. Aggregated visibility into all seven business domains. |
| **Bounded context** | Read-only aggregation. Owns nothing. Consumes everything. |
| **Boundary** | Dashboard displays business data. It never creates, edits, or deletes data. Every widget navigates to its owning domain. |
| **Owner** | COO / General Manager — the person accountable for the entire operation |
| **Responsibilities** | Today-at-a-glance KPIs, cross-domain summaries, alerts, quick actions, domain-navigating widgets |
| **Included** | KPI widgets (revenue, bookings, utilization, attendance), today's activity feed, alert panel, quick-action shortcuts |
| **Excluded** | Any CRUD operation. Any configuration. Any domain-specific management. Any data creation. |
| **Top-level justification** | Every platform on earth has a dashboard. It is the most-clicked item in the sidebar. It requires zero discovery effort. |
| **International** | "Dashboard" is universally understood — identical in French, Spanish, Italian; لوحة القيادة in Arabic |
| **Multi-sport** | Widgets are domain-derived. A tennis club sees tennis KPIs. A multi-sport facility sees all sports aggregated. |
| **Enterprise** | Regional dashboards aggregated per branch. Federation dashboards aggregated per member club. |
| **Federation** | Season-level participation summaries, ranking distributions, sanction compliance |
| **10-year** | Widgets are composition over configuration. Adding a domain adds a widget row. Removing one removes it. |
| **Future roadmap** | AI-generated daily briefing, anomaly detection, predictive utilization, mobile-first dashboard |
| **Junk drawer risk** | Very low. The rule is enforceable and binary: if it does CRUD, it is not Dashboard. |
| **Architectural justification** | Dashboard is the only read-only domain. This is not a design choice — it is the structural identity of the domain. Any future attempt to put management functionality in Dashboard violates this contract. |

---

### 1.2 People

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Every human being who interacts with the platform |
| **Business capability** | Identity management, role assignment, profile management, organizational relationships, human resource management |
| **Bounded context** | A person's identity, roles, profiles, membership status, and organizational relationships. "What someone IS" — not "what someone DOES." |
| **Boundary** | People owns identity. It does not own activity. A coach's profile (IS) lives in People. A coaching session (DOES) lives in Coaching. A tournament entry (DOES) lives in Competitions. A payment (DOES) lives in Commerce. |
| **Owner** | HR Director / Membership Director |
| **Responsibilities** | User CRUD, role assignment, player profiles, coach profiles, referee profiles, staff management, member management, CRM, HR tools |
| **Included** | All Users, Players, Coaches (profiles), Referees (profiles), Staff, Members, Roles, Membership Plans, CRM, HR |
| **Excluded** | Coaching sessions, tournament entries, bookings, payments, wallet balances, marketplace activity |
| **Top-level justification** | People is the substrate every other domain operates on. No domain exists without people. A club owner's first question is "who are my members?" A coaching director's first question is "which coaches are available?" |
| **International** | "People" — human, clear, works in every language. Personnes (FR), Personas (ES), Persone (IT), أشخاص (AR) |
| **Multi-sport** | A person can be a tennis player AND a padel coach under the same identity. Profiles are per-sport. Identity is singular. |
| **Enterprise** | Staff across branches. Role-based access per branch. Central HR for enterprise-wide management. |
| **Federation** | Licensed participant registry. Certification tracking. Multi-club player registrations. |
| **10-year** | New role types (nutritionist, physio, parent, sponsor, scout, agent). New profile types without schema changes. |
| **Future roadmap** | Parent dashboards for junior players, multi-sport identity aggregation, federation license integration, biometric identity verification |
| **Junk drawer risk** | Moderate — the most common antipattern. Mitigated by the IS/DOES boundary: if it describes what someone IS, it's People. If it describes what someone DOES, it belongs to the domain of that activity. This rule must be enforced at every feature review. |
| **Architectural justification** | People is the identity substrate. Every other domain references People. People references no other domain. This unidirectional dependency is deliberate — it makes People stable and every other domain independent of identity changes. |

---

### 1.3 Facilities

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Everything required to operate the physical venue |
| **Business capability** | Physical space management, resource allocation, daily operations, front-desk workflow, venue maintenance |
| **Bounded context** | Physical space, physical resources, and the operational workflows built on top of them. NOT merely "physical assets" — the full operational lifecycle of the venue. |
| **Boundary** | If it occupies square meters or enables a physical space to function, it is Facilities. If it is a program USING the space, it is Coaching or Competitions. |
| **Owner** | Facility Manager / Operations Director |
| **Responsibilities** | Branch management, court/resource configuration and pricing, reception and check-in, scheduling and availability, amenity management, maintenance, sports configuration |
| **Included** | Branches, Courts / Resources, Reception, Check-in / Check-out, Court Availability, Scheduling, Amenities, Maintenance, Sports Configuration |
| **Excluded** | Coaching sessions (Coaching — uses courts, doesn't own them), tournament brackets (Competitions), court booking payments (Commerce — the transaction), coach profiles (People) |
| **Top-level justification** | The physical world is the reason the platform exists. No courts = no business. Multi-branch operators need context-switching. Reception is the highest-frequency workflow in the platform and must be one click away. |
| **International** | "Facilities" — Installations (FR), Instalaciones (ES), Installazioni (IT), منشآت (AR). All mean "the physical places and resources we manage." |
| **Multi-sport** | Tennis courts, padel courts, swimming pools, cricket pitches — all configured under Sports, added as Resource types under Courts, scheduled under Scheduling. One domain, many sports. |
| **Enterprise** | Multi-branch management, branch switching, per-branch resource pools, regional facility management |
| **Federation** | Sanctioned venue registry, court specification compliance, facility certification tracking |
| **10-year** | New resource types (pools, gyms, studios, esports arenas, conference rooms), IoT integration (smart court sensors, environmental monitoring), equipment tracking, automated maintenance scheduling |
| **Future roadmap** | IoT court sensors, automated maintenance ticketing, dynamic resource allocation, capacity-aware scheduling, environmental condition monitoring |
| **Junk drawer risk** | Low. The physical-world boundary is sharp: square meters = Facilities. The primary risk is people placing "Event Management" here (no — that is Competitions with a facility booking), or "Equipment Inventory" here (yes — equipment is a physical resource at a facility). |
| **Architectural justification** | Facilities is the operational substrate of the platform. Courts are the atomic unit of business. Reception is the heartbeat. Scheduling is the pulse. These are not independent concerns — they are facets of the same operational domain. |

---

### 1.4 Coaching

| Attribute | Definition |
|-----------|------------|
| **Purpose** | The sale and delivery of instructional sports services |
| **Business capability** | Instructional program management, coach deployment, player development tracking, curriculum delivery |
| **Bounded context** | A coach's time × a player's development = a coaching service. Everything that defines, schedules, delivers, and measures that service. |
| **Boundary** | Coaching owns the WHAT (session type, package, camp, clinic, curriculum), the DELIVERY (scheduling, assignment, tracking), and the OUTCOME (progression). It owns neither the coach (People), the court (Facilities), nor the payment (Commerce). |
| **Owner** | Coaching Director / Head Coach / Academy Director |
| **Responsibilities** | Academy management, session scheduling, coach assignment, player progression tracking, curriculum management, camp and clinic organization, private coaching, coach packages, coach marketplace |
| **Included** | Academies, Coaching Sessions, Camps, Clinics, Private Coaching, Coach Packages, Coach Marketplace |
| **Excluded** | Coach profiles (People), court scheduling (Facilities), session payments (Commerce), competition entries (Competitions), coach certifications (People) |
| **Top-level justification** | Instructional services are a distinct revenue line (recurring, per-session), operational cadence (continuous, weekly), and stakeholder group (coaching director, not competition director). Real organizations separate these functions — a tennis academy sells coaching but participates in external tournaments it does not organize. |
| **International** | "Coaching" — Entrenamiento (ES), Entraînement (FR), Allenamento (IT), تدريب (AR). Universal sports industry terminology. |
| **Multi-sport** | A facility offering tennis coaching, padel coaching, and swimming instruction under the same Coaching domain. Academies per sport, coaches with multi-sport qualifications. |
| **Enterprise** | Central coaching curriculum, branch-level coach deployment, enterprise-wide coach utilization analytics |
| **Federation** | Coach certification tracking, national coaching standards compliance, coach-to-player ratio monitoring |
| **10-year** | AI coach matching, video analysis integration, player development tracking with machine learning, coach certification programs, parent dashboards for junior development, virtual coaching sessions |
| **Junk drawer risk** | Low. The boundary is clear: coach + player + instruction = Coaching. Player + opponent + rules = Competitions. The two domains diverge along this line. |
| **Architectural justification** | Coaching and Competitions were evaluated as a combined "Programs" domain — and rejected. They have different owners, different revenue models, different operational cadences, and different stakeholders. Separating them creates two crisp domains instead of one ambiguous one. |

---

### 1.5 Competitions

| Attribute | Definition |
|-----------|------------|
| **Purpose** | The organization and delivery of competitive sporting events |
| **Business capability** | Competition management, bracket and league operations, ranking systems, competitive event delivery |
| **Bounded context** | Competitors + format + rules = a competition. Everything that defines, organizes, runs, and ranks competitive events. |
| **Boundary** | Competitions owns the FORMAT (league, tournament, ladder, championship, national circuit) and the OUTCOME (brackets, standings, rankings, results, qualification paths). It owns neither the players (People), the courts (Facilities), nor the entry fees (Commerce). |
| **Owner** | Tournament Director / League Commissioner / Competition Manager |
| **Responsibilities** | League management, tournament organization, match scheduling and results, bracket management, ranking calculation, championship administration, ladder systems, national circuit coordination |
| **Included** | Leagues, Tournaments, Matches, Rankings, Brackets, Championships, Ladders, National Circuits |
| **Excluded** | Coaching sessions (Coaching), social events without competitive structure (Facilities), player profiles (People), entry fee collection (Commerce), venue booking (Facilities) |
| **Top-level justification** | Competitive events are a fundamentally different business from instructional services. Different owner (tournament director ≠ coaching director), different revenue model (entry fees ≠ recurring sessions), different cadence (event-based ≠ continuous). A tennis federation runs competitions but employs no coaches — the separation is real. |
| **International** | "Competitions" — Competiciones (ES), Compétitions (FR), Competizioni (IT), منافسات (AR). Precise, unambiguous, correctly translated in every major sports market. |
| **Multi-sport** | A multi-sport club runs tennis leagues, padel tournaments, and swimming competitions. Each sport has its own competition types. All managed under Competitions. |
| **Enterprise** | Cross-branch leagues, regional championships, enterprise-wide competition calendars |
| **Federation** | National circuit management, federation-sanctioned tournaments, ranking point systems, qualification path administration, referee assignment for sanctioned events |
| **10-year** | Live scoring infrastructure, spectator features, national ranking algorithms, cross-club league networks, federation qualification paths, esports competitions, AI-powered seeding and bracket generation |
| **Junk drawer risk** | Low. The format/outcome boundary is sharp. A social mixer uses courts (Facilities), a competitive event uses courts AND has a competitive format (Competitions). The distinction is structural. |
| **Architectural justification** | Rejected the "Programs" unification. Coaching and Competitions are separated because they serve different business owners, generate revenue through different models, operate on different cadences, and scale toward different futures. |

---

### 1.6 Commerce

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Every revenue-generating transaction and the marketplace that enables it |
| **Business capability** | Marketplace management, payment processing, subscription management, wallet services, pricing, settlements, advertising |
| **Bounded context** | A transaction is: product/service + price + buyer + payment method → completed payment. Commerce owns the transaction lifecycle. |
| **Boundary** | Commerce transacts. Finance records. Commerce owns the MARKETPLACE, PAYMENT PROCESSING, PRICING, WALLETS, SUBSCRIPTIONS, SETTLEMENTS, COUPONS, and ADVERTISING. Commerce never manages the chart of accounts, journal entries, or financial reports. |
| **Owner** | Commerce Manager / Revenue Director |
| **Responsibilities** | Marketplace management (products, categories, sellers, orders, reviews, approvals), payment processing (gateways, transaction history, refunds), subscription management (plans, billing, renewals), wallet management (balances, top-ups, withdrawals), settlement management (payouts to coaches, sellers), pricing configuration (court rates, session fees, membership pricing), coupon and promotion management, advertising management |
| **Included** | Marketplace, Products, Orders, Sellers, Categories, Brands, Tags, Reviews, Approvals, Payments, Subscriptions, Wallets, Settlements, Pricing, Coupons, Advertising |
| **Excluded** | Accounting (Finance), journal entries (Finance), tax configuration (Finance), bank management (Finance), financial reports (Finance), invoice generation (Finance) |
| **Top-level justification** | Commerce is the revenue engine. Every transaction flows through here. Separating Commerce from Finance reflects real organizational structure: the Commerce team generates revenue, the Finance team manages the books. These are different departments with different KPIs and different tools. |
| **International** | "Commerce" — professional, neutral, standard business terminology in every language. Commerce (FR), Comercio (ES), Commercio (IT), تجارة (AR). Better than "Marketplace" (too narrow), "Payments" (too narrow), "Revenue" (accounting term). |
| **Multi-sport** | Product categories for tennis equipment, padel gear, swimming accessories. Pricing per sport, per court type, per session type. All through the same Commerce engine. |
| **Enterprise** | Multi-branch pricing strategies, consolidated payment processing, enterprise-level settlement with per-branch breakdowns |
| **Federation** | Tournament entry fee collection, membership dues processing, federation-level seller marketplace for equipment partners |
| **10-year** | Multi-currency commerce, cross-border payments, affiliate programs, loyalty points, gift cards, dynamic pricing, revenue share for coaches and venues, subscription bundling across sports |
| **Junk drawer risk** | Very low. The boundary with Finance is the strongest in the IA: Commerce transacts, Finance records. If money changes hands, it is Commerce. If you are recording that money for accounting, it is Finance. Any module that does both is incorrectly bounded. |
| **Architectural justification** | The Commerce/Finance split is the most important boundary in the platform. It mirrors the organizational structure of every real sports business above a certain size. In a small club, the owner does both. In an enterprise, they are separate departments with separate people, processes, and software. The IA supports both. |

---

### 1.7 Finance

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Financial management, accounting, and compliance |
| **Business capability** | Double-entry accounting, financial period management, tax management, financial reporting, audit compliance |
| **Bounded context** | The financial record of the business. The books. What happened to the money after Commerce transacted it. |
| **Boundary** | Finance records what Commerce transacts. Finance never transacts. Finance manages the chart of accounts, journal entries, general ledger, financial periods, taxes, invoicing, financial reports, bank management, and audit trail. |
| **Owner** | Finance Director / CFO |
| **Responsibilities** | Chart of accounts management, journal entry tracking, general ledger maintenance, financial period management (month-end, year-end close), tax rate configuration and compliance, invoice generation and tracking, financial reporting (P&L, balance sheet, cash flow), bank and branch management, audit trail and financial compliance |
| **Included** | Accounting Dashboard, Chart of Accounts, Journal Entries, General Ledger, Invoices, Tax Rates, Financial Reports, Banks & Branches, Financial Periods, Audit Trail |
| **Excluded** | Marketplace transactions (Commerce), payment processing (Commerce), wallet balances (Commerce), subscription plans (Commerce), pricing rules (Commerce), settlements (Commerce) |
| **Top-level justification** | Finance is a regulated, professional discipline. It has its own profession, terminology, stakeholders, and compliance requirements. Burying it under Commerce or Platform would be architecturally incorrect and disrespectful to the financial professionals who use it. |
| **International** | "Finance" — universal, unambiguous, standard in every language. Finance (FR), Finanzas (ES), Finanza (IT), مالية (AR). |
| **Multi-sport** | Revenue per sport in financial reports. Cost allocation per sport, per branch. Multi-sport P&L consolidation. |
| **Enterprise** | Multi-entity consolidation, branch-level P&L, inter-branch accounting, consolidated financial reporting |
| **Federation** | Tournament financial reporting, grant and subsidy tracking, federation-level audit compliance |
| **10-year** | Multi-currency consolidation, tax jurisdiction management, external accounting software integration (Xero, QuickBooks), financial compliance automation, AI-powered anomaly detection in journal entries |
| **Junk drawer risk** | Very low. Finance is a professional discipline with internally defined boundaries that predate software by centuries. The double-entry system, chart of accounts, and financial period model are universal. |
| **Architectural justification** | Finance is the only domain defined by an external profession. Its boundaries are not ours to invent — they are inherited from accounting standards. This makes Finance the most stable domain in the platform. |

---

### 1.8 Platform

| Attribute | Definition |
|-----------|------------|
| **Purpose** | System administration, security, and platform-level configuration |
| **Business capability** | Platform security, audit, notification infrastructure, integration management, appearance, localization, system configuration |
| **Bounded context** | The platform manages itself. Platform owns the infrastructure that makes the other seven domains possible. |
| **Boundary** | Platform is the only domain that manages CourtZon as a software system — not the sports business running on it. If a feature is about CourtZon itself, it is Platform. If it is about the club, the court, the coach, or the tournament, it belongs to a business domain. |
| **Owner** | System Administrator / IT Director |
| **Responsibilities** | Security (sessions, failed logins, upload security, system health, feature flags), audit logging, notification system configuration, integration and webhook management, mobile app configuration, appearance and branding, localization (countries, currencies, languages, translations), payment method and gateway configuration, sidebar layout configuration, CMS, BI and analytics configuration |
| **Included** | Security Dashboard, Active Sessions, Failed Logins, Upload Security, System Health, Feature Flags, Audit Log, Notifications, Integrations & Webhooks, Mobile Settings, Appearance & Branding, Localization (Countries, Currencies, Languages, Translations), Payment Configuration (Methods, Gateways), Sidebar Layout, CMS, BI & Analytics Configuration |
| **Excluded** | User role assignment (People — Platform owns the permission registry, People manages role assignment), any business data, any domain-specific reports, any operational workflow |
| **Top-level justification** | Every platform needs system administration. The boundary is the sharpest in the IA: Platform manages CourtZon. Everything else manages the business. |
| **International** | "Platform" — standard SaaS terminology, understood by technical users globally. Plateforme (FR), Plataforma (ES), Piattaforma (IT), منصة (AR). |
| **Multi-sport** | Sports configuration lives in Facilities, not Platform. Platform manages the system. Facilities manages which sports are offered. |
| **Enterprise** | Enterprise-wide security policies, centralized notification configuration, enterprise appearance branding |
| **Federation** | Federation-level feature flags, federation-specific integrations, national-level localization settings |
| **10-year** | New integrations, new notification channels (WhatsApp, Telegram), multi-region deployment settings, AI model configuration, API versioning, developer portal |
| **Junk drawer risk** | **Moderate-High.** This is the most dangerous domain. The "system vs. business" boundary is theoretically clear but practically tempting — features that don't fit elsewhere gravitate here. Enforcement rule: if the module manages the sports BUSINESS, it CANNOT be Platform. If the module manages CourtZon ITSELF, it CAN be Platform. Every module proposed for Platform must pass a boundary review with explicit justification. |
| **Architectural justification** | Platform is the infrastructure layer. Its value is making the other seven domains possible while remaining invisible to business users. It should be role-gated so non-admins never see it. This is not a design preference — it is a structural requirement to prevent the junk drawer antipattern. |

---

## 2. Boundary Validation — Cross-Domain Review

Every domain pair validated for ownership, overlap, and dependency.

| Pair | Relationship | Verdict |
|------|-------------|---------|
| **People ↔ Coaching** | People owns coach identity. Coaching owns coach sessions. | ✅ No overlap. Clear IS/DOES boundary. |
| **People ↔ Competitions** | People owns player identity and referee profiles. Competitions owns tournament entries and referee assignments. | ✅ No overlap. |
| **People ↔ Facilities** | People owns staff identities. Facilities owns reception workflow. | ✅ No overlap. Staff identities ≠ front desk workflow. |
| **People ↔ Commerce** | People owns member identity. Commerce owns membership plans and billing. Connected by person ID. | ✅ No overlap. Two modules, one concept, different bounded contexts. |
| **People ↔ Finance** | No direct relationship. Finance records transactions involving people — the person is a dimension of the journal entry, not an owner. | ✅ No overlap. |
| **People ↔ Platform** | People assigns roles. Platform owns the permission registry. | ✅ Clear boundary: Platform defines WHAT permissions exist. People decides WHO gets them. |
| **Facilities ↔ Coaching** | Facilities owns courts and scheduling. Coaching books courts for sessions. | ✅ No overlap. Resource vs. program. Coaching consumes Facilities — it does not own courts. |
| **Facilities ↔ Competitions** | Facilities owns courts. Competitions books courts for matches. | ✅ No overlap. Same pattern — resource vs. program. |
| **Facilities ↔ Commerce** | Facilities owns the booking. Commerce owns the payment for the booking. | ✅ No overlap. Booking lifecycle ≠ payment lifecycle. |
| **Facilities ↔ Finance** | No direct relationship. Finance records facility-related journal entries. | ✅ No overlap. |
| **Facilities ↔ Platform** | Sports configuration lives in Facilities. Localization (translations of sport names) lives in Platform. | ✅ No overlap. What sports exist ≠ how their names are translated. |
| **Coaching ↔ Competitions** | Different owners, different revenue models, different cadences. | ✅ No overlap. The Programs merger was evaluated and rejected. |
| **Coaching ↔ Commerce** | Coaching defines sessions. Commerce prices them and collects payment. | ✅ No overlap. Delivery vs. transaction. |
| **Coaching ↔ Finance** | No direct relationship. Finance records coaching revenue in journal entries. | ✅ No overlap. |
| **Competitions ↔ Commerce** | Competitions defines events. Commerce collects entry fees. | ✅ No overlap. Same pattern as Coaching ↔ Commerce. |
| **Competitions ↔ Finance** | No direct relationship. Finance records competition revenue. | ✅ No overlap. |
| **Commerce ↔ Finance** | Commerce transacts. Finance records. | ✅ The strongest boundary in the IA. Transacting ≠ accounting. |
| **Commerce ↔ Platform** | Commerce owns pricing rules. Platform owns payment gateway configuration. | ✅ No overlap. What the price IS ≠ how the payment IS PROCESSED. |
| **Finance ↔ Platform** | No direct relationship. Finance is a business domain. Platform manages the system. | ✅ No overlap. |

**Result: Zero duplicated ownership. Zero ownership ambiguity. Zero orphaned capabilities. Zero artificial grouping.**

---

## 3. Permanent Architectural Rules

These rules are platform contracts. They are binding on all future development.

---

### Rule 1: Booking Ownership

**Booking belongs to Facilities.**

Booking is the reservation lifecycle of a physical resource. Facilities owns the full booking lifecycle: availability publication, allocation, reservation, confirmation, check-in, check-out, and cancellation.

Commerce owns the pricing and payment associated with the booking. Finance records the journal entry for the booking transaction.

A booking in CourtZon is always a booking of a court, not a booking of a coach, a tournament slot, or a product. Facility bookings are the only booking type. All other reservation concepts (coaching session booking, tournament registration, product order) use their domain's terminology — not "booking."

---

### Rule 2: Dashboard Read-Only

**Dashboard is an operational command center. Dashboard is read-only.**

Dashboard displays business data aggregated from other domains. It never creates, edits, or deletes data. Every dashboard widget must navigate to the owning Business Domain for any management action.

If a user wants to DO something, they click the widget and navigate to the domain. The domain owns the action. Dashboard only shows the state.

Any future feature that puts management functionality (CRUD, configuration, approval workflows) inside Dashboard violates this contract.

---

### Rule 3: Facilities Boundary

**Facilities owns everything required to operate the physical venue.**

This is NOT limited to physical assets. Facilities includes:

- Physical infrastructure (branches, courts, resources, amenities)
- Daily operations (reception, check-in, check-out)
- Scheduling and availability
- Maintenance
- Sports configuration

Any module that involves operating the physical space — whether it's a database record or a front-desk workflow — belongs to Facilities. The test: "Does this feature exist because there is a physical venue?" If yes, it is Facilities.

Facilities does NOT own: programs that USE the space (Coaching, Competitions), transactions FOR using the space (Commerce), or people who WORK in the space (People).

---

### Rule 4: Platform Anti-Junk-Drawer

**Platform manages CourtZon itself. It never manages the sports business.**

Platform is the only domain that operates on the platform as software: security, audit, notifications, integrations, appearance, localization, CMS, system configuration.

If a feature manages the sports business — players, courts, coaches, tournaments, products, revenue, accounting — it CANNOT belong to Platform. No exceptions.

Every module proposed for Platform must pass boundary review with explicit written justification. The default answer for any business feature is "which business domain owns this?" — not "put it in Platform."

---

### Rule 5: Domain Ownership

**Every feature has exactly ONE owning Business Domain.**

Other domains may reference, integrate with, or consume data from the feature. They may NEVER claim ownership of the same capability.

Ownership duplication is prohibited. If two domains appear to own the same thing, the boundary is wrong and must be resolved before implementation.

---

### Rule 6: Business Domain Governance

Every future feature must answer these questions before implementation begins:

| # | Question |
|---|----------|
| 1 | Which Business Domain owns this feature? |
| 2 | Why this domain and not another? |
| 3 | Does it violate an existing domain boundary? |
| 4 | Does it duplicate a capability already owned by another domain? |
| 5 | Does it require creating a new Business Domain? |
| 6 | Does it require an Architecture Decision Record? |
| 7 | Does it change domain ownership? |
| 8 | Does it change domain boundaries? |
| 9 | Does it require Business Architecture Review? |

If any applicable question cannot be answered definitively, implementation MUST NOT begin.

---

### Rule 7: Boundary Review

The following feature types must pass Boundary Review before implementation:

- Booking (any reservation concept)
- Membership (any status or plan concept)
- Wallet (any balance or credit concept)
- Payments (any money movement concept)
- Notifications (any outbound communication)
- Scheduling (any time-allocation concept)
- People (any human-entity concept)
- Marketplace (any buyer-seller concept)
- AI (any automated decision concept)
- Reporting (any multi-domain aggregation)

Boundary Review verifies that the feature's domain assignment is correct, its boundaries with neighboring domains are clear, and no ownership conflict exists.

---

### Rule 8: Domain Change Governance

Business Domains are platform contracts. The following changes require Architecture Review, an ADR, and business approval:

- Creating a new top-level Business Domain
- Removing an existing Business Domain
- Renaming a Business Domain
- Changing a domain's owner
- Changing a domain's boundary (moving modules between domains)
- Merging two Business Domains
- Splitting a Business Domain

Module-level changes (adding a module to an existing domain, removing a deprecated module from a domain) do not require full governance — only standard code review and the Business Domain Governance questionnaire.

---

### Rule 9: Implementation Strategy

The Information Architecture migration follows the Navigation Migration governance model:

- Commit-by-commit. Each domain = one commit.
- Independent reviews. Each commit is independently reviewable.
- Independent approvals. No domain authorizes the next.
- Independent revertibility. Reverting one domain does not affect others.
- Parity after every commit.
- Regression after every commit.
- Stop after every commit. Wait for approval before the next.

No monolithic migration. No combined commits.

---

### Rule 10: Final Freeze

After the IA migration is complete, the following become permanently frozen:

- Business Domain names
- Business Domain ownership assignments
- Business Domain boundaries
- Business Domain Governance (this document)

Future changes require Architecture Review, an ADR, and business approval. No exceptions.

---

## 4. Implementation Strategy — Commit Plan

| Commit | Phase | Scope | Gate |
|--------|-------|-------|------|
| 1 | Domain creation | Restructure `ADMIN_NAV` into 8 Business Domains. Domain sections + landing pages + icons. | 67 parity tests, build, CI |
| 2 | People | Migrate all People modules under the People domain. | Domain review, sidebar, workspace, search |
| 3 | Facilities | Migrate all Facilities modules. | Domain review, sidebar, workspace, search |
| 4 | Coaching | Migrate all Coaching modules. | Domain review, sidebar, workspace, search |
| 5 | Competitions | Migrate all Competitions modules. | Domain review, sidebar, workspace, search |
| 6 | Commerce | Migrate all Commerce modules. | Domain review, sidebar, workspace, search |
| 7 | Finance | Migrate all Finance modules. | Domain review, sidebar, workspace, search |
| 8 | Platform | Migrate all Platform modules. | Domain review, sidebar, workspace, search |
| 9 | Translations | Register all new domain/category translation keys. EN + AR. | Translation integrity test |
| 10 | Workspace | Verify DnD editor shows all 8 domains, drag-and-drop works. | Manual UAT + saved layout compatibility |
| 11 | Sidebar | Verify admin sidebar renders all 8 domains with correct permissions and flags. | Manual UAT |
| 12 | Search | Verify admin search finds items under new domain paths. | Manual UAT |
| 13 | Saved Layouts | Verify existing saved layouts survive migration (stale keys dropped). | Manual UAT |
| 14 | Regression | Full test suite, build, CI validation. | 67 tests, build, CI 222-baseline |
| 15 | Deployment | GitHub, Docker, Hostinger, smoke tests, final approval. | All gates green |

---

## 5. Acceptance Gates

A commit cannot be approved unless:

| Gate | Requirement |
|------|-------------|
| Business Review | Domain ownership correct. No boundary violation. |
| DDD Review | Bounded context respected. No cross-domain ownership leak. |
| Boundary Review | All neighboring domains verified for overlap. |
| Sidebar Review | Admin sidebar renders correctly. Permissions and flags work. |
| Workspace Review | DnD editor shows domains. Drag-and-drop works. |
| Search Review | All modules findable under new domain paths. |
| Translation Review | Every new key registered in EN + AR. |
| Saved Layout Review | Existing layouts backward-compatible. |
| Regression Tests | 67 parity tests pass. Full test suite passes. |
| Build | `npm run build` passes. |
| CI | `ci-validate.js` baseline unchanged. |
| Documentation | Tracker + ADR log updated. |

---

## 6. Final Deliverables

| # | Deliverable |
|---|-------------|
| 1 | Business Domain definitions (8 domains, fully validated) |
| 2 | Boundary validation (all 28 domain pairs) |
| 3 | Permanent Architectural Rules (10 rules) |
| 4 | Business Domain Governance questionnaire |
| 5 | Boundary Review process |
| 6 | Domain Change Governance |
| 7 | Implementation Strategy (commit-by-commit, 15 commits) |
| 8 | Acceptance Gates (12 gates per commit) |
| 9 | Final Freeze policy |
| 10 | Architecture approval status |

---

## 7. Final Freeze Declaration

Upon completion of the IA migration, this document becomes the governing Business Architecture of CourtZon.

- **Business Domains** — 8 domains, frozen.
- **Domain Names** — Frozen.
- **Domain Ownership** — Frozen.
- **Domain Boundaries** — Frozen.
- **Architectural Rules** — Permanent.
- **Governance Process** — Binding on all future development.

**No future business feature may be introduced, modified, or deprecated without reference to this document.**

---

## Status

**CourtZon Business Information Architecture v1.0**

**Status: APPROVED — AWAITING IMPLEMENTATION**

**Next: Await formal approval. Commit 1 begins after approval.**

---

```
1. Dashboard     → COO / GM                [Read-only aggregation]
2. People        → HR / Membership Dir     [Identity substrate]
3. Facilities    → Facility Manager        [Physical venue operations]
4. Coaching      → Coaching Director       [Instructional services]
5. Competitions  → Tournament Director     [Competitive events]
6. Commerce      → Revenue Director        [Revenue engine]
7. Finance       → Finance Director / CFO  [Accounting & compliance]
8. Platform      → System Admin / IT       [System infrastructure]
```
