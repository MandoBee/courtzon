---
document_id: "TECH-MOD-24"
document_name: "Community Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-14", "TECH-MOD-22"]
---

# Community Module (TECH-MOD-24)

**Source:** `backend/src/modules/community/` (3 directories, 35+ routes)

## 1. Purpose

Social features: follow/unfollow, friends, events with RSVP, chat/messaging with group conversations, and ad placements/campaigns. All features gated by feature flags (`community.events_enabled`, `community.chat_enabled`). 84-line routes file with 3 scoped registrations.

## 2. Architecture

```
presentation/
  community.routes.ts       — 84 lines, 35+ endpoints in 3 scopes
  community.controller.ts   — 439 lines, request handlers
  community.dto.ts          — Zod validation schemas
application/
  community.service.ts      — Business logic orchestration
infrastructure/
  (repositories)
```

**Evidence:** `community.routes.ts:5-84`, `community.controller.ts:1-100`.

## 3. Routes (35+)

**Social/Events scope** (`community.routes.ts:9-28`, gated by `community.events_enabled`):
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | POST | `/community/follow/:followingId` | — | Follow user |
| 2 | DELETE | `/community/follow/:followingId` | — | Unfollow |
| 3 | GET | `/community/followers` | — | Get followers |
| 4 | GET | `/community/following` | — | Get following |
| 5 | POST | `/community/friends/request/:addresseeId` | — | Send friend request |
| 6 | POST | `/community/friends/accept/:requesterId` | — | Accept friend request |
| 7 | GET | `/community/friends` | — | List friends |
| 8 | GET | `/community/events` | — | List events |
| 9 | GET | `/community/events/:id` | — | Get event |
| 10 | POST | `/community/events` | `community.create_events` | Create event |
| 11 | POST | `/community/events/:id/rsvp` | — | RSVP to event |
| 12 | GET | `/admin/events` | adminGuard | Admin list events |
| 13 | PUT | `/community/events/:id` | adminGuard | Update event |
| 14 | DELETE | `/community/events/:id` | adminGuard | Delete event |

**Chat scope** (`community.routes.ts:31-57`, gated by `community.chat_enabled`):
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 15 | GET | `/community/conversations` | `community.chat.view` | List conversations |
| 16 | GET | `/community/conversations/invitations` | `community.chat.view` | Group invitations |
| 17 | PUT | `/community/conversations/invitations/:invitationId` | `community.chat.send` | Respond to invitation |
| 18 | POST | `/community/conversations/group` | `community.chat.send` | Create group |
| 19 | GET | `/community/users/lookup/phone/:phone` | `community.chat.view` | Lookup by phone |
| 20 | GET | `/community/conversations/with/phone/:phone` | `community.chat.view` | Get/create by phone |
| 21 | GET | `/community/conversations/with/:otherUserId` | `community.chat.view` | Get/create DM |
| 22 | GET | `/community/conversations/:conversationId/messages` | `community.chat.view` | Get messages |
| 23 | POST | `/community/conversations/:conversationId/messages` | `community.chat.send` | Send message |
| 24 | POST | `/community/conversations/:conversationId/invite` | `community.chat.send` | Invite to group |
| 25 | PUT | `/community/conversations/:conversationId/pin` | `community.chat.send` | Pin conversation |
| 26 | DELETE | `/community/conversations/:conversationId/pin` | `community.chat.send` | Unpin |
| 27 | PUT | `/community/conversations/:conversationId/read` | `community.chat.view` | Mark as read |
| 28 | GET | `/community/conversations/:conversationId/members` | `community.chat.view` | Group members |
| 29 | GET | `/community/conversations/:conversationId/info` | `community.chat.view` | Group info |
| 30 | GET | `/community/conversations/:conversationId/pending` | `community.chat.view` | Pending invitations |
| 31 | DELETE | `/community/conversations/:conversationId/pending/:invitationId` | `community.chat.send` | Cancel invitation |
| 32 | PUT | `/community/conversations/:conversationId` | `community.chat.send` | Update group |
| 33 | POST | `/community/conversations/:conversationId/members/remove` | `community.chat.send` | Remove member |
| 34 | POST | `/community/conversations/:conversationId/leave` | `community.chat.send` | Leave group |
| 35 | PUT | `/community/conversations/:conversationId/promote/:targetUserId` | `community.chat.send` | Promote admin |
| 36 | PUT | `/community/conversations/:conversationId/demote/:targetUserId` | `community.chat.send` | Demote admin |
| 37 | DELETE | `/community/conversations/:conversationId` | `community.chat.send` | Delete group |

**Ads scope** (`community.routes.ts:60-80`, gated by `community.events_enabled`):
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 38 | GET | `/ads/placements` | — | Get placements |
| 39 | GET | `/ads/placements/:placementId/active` | — | Active ads |
| 40 | POST | `/ads/campaigns` | `ads.create` | Create campaign |
| 41-51 | (9 admin routes) | `/ads/admin/*` | adminGuard | CRUD placements/campaigns/creatives |

**Admin/Audit** (`community.routes.ts:83`):
| 52 | POST | `/admin/revert/:auditLogId` | `audit.revert` | Revert action |

## 4. Feature Flag Gating

- `community.events_enabled` — Social features, events, ads
- `community.chat_enabled` — Chat/messaging

Scoped registrations use `opts.requireFeatureFlag(key)` at hook level.

## 5. Permissions

- `community.create_events` — Create events
- `community.chat.view` — View conversations/messages
- `community.chat.send` — Send messages, manage groups
- `ads.create` — Create ad campaigns
- `audit.revert` — Revert audit actions

## 6. Services

`community.service.ts` provides: `follow()`, `unfollow()`, `getFollowers()`, `getFollowing()`, `sendFriendRequest()`, `acceptFriendRequest()`, `getFriends()`, `listEvents()`, `createEvent()`, `rsvpEvent()`, `getOrCreateConversation()`, `sendMessage()`, `getMessages()`, `createGroup()`, `inviteToGroup()`, `lookupUserByPhone()`, etc.

## 7. Events

- Social events trigger notifications via `eventBusV2`
- Chat messages trigger real-time delivery via push notifications
