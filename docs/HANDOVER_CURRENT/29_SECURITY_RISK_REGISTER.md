# 29 — SECURITY RISK REGISTER

**Audit:** 2026-10-04 · Prioritized; only issues traceable to current code/config/behavior.

Legend: Sev = Critical/High/Medium/Low · Prio = P0..P3.

---

| Risk | Severity | Location | Attack/Failure scenario | Impact | Evidence | Recommended fix | Prio |
|---|---|---|---|---|---|---|---|
| Payment webhook unauthenticated | HIGH | `/payments/webhook` (`payment.routes.ts`) | Forged/absent HMAC → fake payment confirmed; channel dup | Money/ledger corruption | endpoint without authMiddleware; signature param passed | Verify HMAC path; reject on mismatch; add test | P0 |
| Sandbox-only payments in a "production clone" | HIGH | `.env` PAYMOB_SANDBOX=true | Real gateway misconfigured; refunds fail at scale | Revenue loss, outrage | provider=p.paymob, sandbox=true, 0 real tx | Gateway pilot + prod checklist gate | P0 |
| CSRF (no token) on cookie-session state changes | HIGH | Fastify app (cookie SameSite unverified) | Cross-site state-changing POST (booking/refund) | Unauthorized mutations | no CSRF mechanism found | SameSite=Strict + (optionally) origin check; re-verify cookies | P1 |
| Frontend hardcoded role gates | MED | `App.tsx` guards | Role-list says yes for accountant etc. | Access breadth; bypass of permission-first policy | code | permission-based guards | P1 |
| `financial.reconcile` over-broad | MED | `payment.routes.ts` | Insider refund/sync escalation | Refund unauthorized | single perm on many ops | split perms | P1 |
| Reliable SMS/Push "delivered" mock | MED | notification providers | Compliance/ops confusion; users misinformed | Trust/litigation | mock success note | real providers or mark unavailable | P2 |
| Rate-limit bypass risk if `RELAX_RATE_LIMIT=true` leaks to prod | HIGH | `app.ts` | Open CORS, 2000/min, non-Secure cookies | DoS, CSRF-friendly | env-dependent behavior | CI guard + docs | P1 |
| Cross-org scope mistakes | MED | route-guard + scopes | Unauthorized org data if scope lookup missed | Data leak | guards exist; surface = 1289 routes | automated route→perm→scope audit | P1 |
| Brute force login | LOW-MED | `login_attempts` + login route | Credential stuffing | Account takeover | 5/identifier lockout exists | keep; add geo/IP heuristics | P2 |
| Temporary password reset (email-only) | MED | auth temp routes | Account takeover if enabled + DB flag | Takeover | double-gated; off in prod | remove feature or attach OTP | P1 |
| Session token in DB only; no rotation on login | LOW | user_sessions | Lost token reuse post-logout? | — | is_revoked + refresh rotation | verify rotation completeness | P2 |
| `GIT_COMMIT: unknown` | LOW | Docker build | Untraceable artifact → supply-chain | Ops | `/health/version` | pass GIT_COMMIT; label images | P2 |
| Upload abuse | LOW-MED | upload module | Large/malicious files | Storage/DoS; stored XSS via SVG? | 6MB cap, hardening service | add malware scan/CDN policy | P2 |
| SQLi | LOW | repos | Injectable input | — | all params bound | keep; no dynamic SQL | P3 |
| XSS | LOW-MED | React+CSP | User content rendering | Depends on sanitizer | CSP set; rich text via tiptap (sanitize?) | verify rich-text sanitization | P2 |
| Notification webhook abuse | MED | notification_webhooks | Unauthorized webhook POST | Info leak | HMAC provider | config verification + test | P2 |
| Version-info leak | LOW | `/health/version` | Node/app version exposure | Recon | endpoint public | restrict to ops token in prod | P3 |

## Top 5 to fix first (P0/P1)
1. Verify & test payment webhook HMAC (P0).
2. Gateway production pilot + sandbox-off gate (P0).
3. CSRF/SameSite review (P1).
4. Permission-based admin guards (P1).
5. CI guardrail: forbid `RELAX_RATE_LIMIT=true` in production envs (P1).