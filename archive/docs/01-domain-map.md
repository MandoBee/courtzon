# DOMAIN MAP — BOUNDED CONTEXTS & DOMAINS

## Identity & Auth Context
- **Core Entity**: `User` (players, staff, coaches, admins)
- **Value Objects**: PasswordHash, Email, Phone, DeviceFingerprint, SessionToken
- **Subdomains**: Registration, Authentication, Session Management, Device Tracking, Email/Phone Verification
- **Events**: user.registered, user.logged_in, user.verified, user.suspended

## Organization Context (Multi-Tenant)
- **Core Entity**: `Organization` (clubs, academies, complexes — any sports facility)
- **Hierarchy**: Organization → Branches → Resources
- **Subdomains**: Organization Management, Branch Management, Resource Catalog, Settings Cascade, Operating Hours
- **Settings Engine**: Parent bounds → child tightens only
- **Events**: org.created, org.verified, branch.activated, resource.maintenance_scheduled

## RBAC & Security Context
- **Core Entities**: Role, Permission, UserRole, RoleScope
- **Pattern**: Role-based with row-level scope enforcement (WHERE clauses auto-injected)
- **System Roles**: Super Admin (global), Admin (platform), Player (self-service)
- **Subdomains**: Role Management, Permission Registry, Scope Enforcement, Access Requests

## Booking Context (Core Domain)
- **Core Entities**: Booking, BookingSlot, Participant, Invitation, Cancellation, QRCode, PricingRule
- **Concurrency**: Redis distributed locks (per slot) + MySQL UNIQUE constraint (court_id, date, slot_start)
- **State Machine**: pending → confirmed/cancelled → completed/expired
- **Subdomains**: Slot Management, Booking Lifecycle, Invitations, Check-in (QR Scan), Cancellation & Refund, Pricing Engine
- **Events**: booking.created, booking.confirmed, booking.cancelled, booking.completed, booking.expired

## Marketplace Context
- **Core Entities**: SellerProfile, Product, ProductCategory, CartItem, Order, OrderItem
- **Subdomains**: Seller Onboarding, Product Catalog, Shopping Cart, Order Fulfillment, Seller Subscriptions
- **Events**: product.listed, order.placed, order.shipped, order.delivered, order.cancelled

## Tournament Context
- **Core Entities**: Tournament, Registration, Match, Score, BracketType
- **Bracket Types**: round_robin, knockout, double_elimination, groups_and_knockout, swiss
- **State Machine**: draft → registration_open → ongoing → completed/cancelled
- **Events**: tournament.created, tournament.registration_opened, match.scheduled, match.completed, tournament.completed

## Academy Context
- **Core Entities**: AcademyProgram, Enrollment, Session, Attendance, Evaluation
- **Subdomains**: Program Management, Enrollment Lifecycle, Session Scheduling, Attendance Tracking, Skill Evaluation

## Coaching Context
- **Core Entities**: CoachProfile, OrgAgreement, CoachSession, CoachReview
- **Subdomains**: Coach Onboarding, Session Booking, Review & Rating, Revenue Share

## Community & Social Context
- **Core Entities**: Follow, Friend, Event, EventParticipant, Announcement, Comment, Like, Conversation, Message, PlayerRating
- **Subdomains**: Social Graph (follow/friend), Community Events, Announcements (with comments/likes), Direct Messaging, Player Reputation

## Advertising Context
- **Core Entities**: Placement, Campaign, Creative, Targeting, Impression, Click, AdPricing
- **Subdomains**: Inventory Management (placements), Campaign Management, Ad Serving, Analytics (impressions/clicks), Billing
- **Pricing Models**: CPM, CPC, Flat Fee per Period

## CMS Context
- **Core Entities**: Page, Section, Blog
- **Subdomains**: Page Builder (JSON sections), Blog Publishing, SEO (meta tags)

## Notification Context
- **Core Entities**: Notification, NotificationPreference, NotificationQueue
- **Channels**: in_app, email, SMS, push
- **Subdomains**: Template Management, Delivery Queue (with retries), Preference Management, Real-time Delivery (Socket.IO)

## Financial Context
- **Core Entities**: Wallet, WalletTransaction, PaymentTransaction, CommissionRule, CommissionTransaction, Payout, Settlement, JournalEntry, Invoice
- **Subdomains**: Wallet Management, Payment Processing (Paymob/Fawry), Commission Engine, Payout Engine, Settlement & Reconciliation, Journaling (Double-Entry), Subscription Invoicing

## Audit & Compliance Context
- **Core Entities**: AuditLog, ActivityLog, SyncEvent
- **Pattern**: MySQL triggers auto-log critical changes; application-level logging for activities
- **Capabilities**: Full diff tracking (old/new values), revert actions with reason, activity stream for UI

## Media Context
- **Core Entity**: MediaUpload (polymorphic — attaches to any entity)
- **Subdomains**: Upload Pipeline, File Storage, MIME Validation, Thumbnail Generation
