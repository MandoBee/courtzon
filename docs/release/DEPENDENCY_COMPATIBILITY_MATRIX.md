# Dependency Compatibility Matrix (Backend P2-03/P2-04 · Frontend P2-06)

| Field | Value |
|---|---|
| Document | `docs/release/DEPENDENCY_COMPATIBILITY_MATRIX.md` |
| Phase | 2 — Security Audit and Dependency Compatibility |
| Plan items | P2-03 / P2-04 (backend) · **P2-06 / P2-07 (frontend assessment + upgrades)** · **P2-10 (final audit & risk acceptance)** |
| Date | 2026-10-26 |
| Baseline commit | `184aa6e0b96c93b278f909d63eb7f4a88d28b424` |
| Mode | **Living document** — decision evidence (P2-03), executed results for P2-04 Stages A–D, frontend analysis and upgrades for P2-06/P2-07, and the final audit/risk acceptance for P2-10 (§10–§12) |
| Runtime | Local Node `v22.14.0`; Docker `node:22-alpine` (builder + runner) |
| Package manager | npm 11.7.0 |

> This document started as decision evidence for the backend upgrades (P2-03) and is updated in place
> as each stage executes. Sections 4.4–4.7, 5, 6, 7 and 9 include executed build/test/audit evidence.
> **§10 is the frontend compatibility assessment (P2-06) — analysis only, no installs or manifest
> changes.**

## 1. Method and evidence

Initial read-only evidence (P2-03, 2026-10-26); P2-04 adds executed build/test/audit evidence:

- Manifests: `backend/package.json`; lockfile: `backend/package-lock.json` (`lockfileVersion: 3`).
- Installed tree: `npm ls <pkg> --depth=0` in `backend/`.
- Registry metadata for current and target versions: `npm view <pkg>@<version> version engines
  peerDependencies dependencies devDependencies types --json`, plus `npm view <pkg>@<version> readme`.
- Advisories: `npm audit --json` (npm registry / GitHub Advisory Database), production and full trees.
- Code usage: repository-wide grep for imports/registration; registration read from `backend/src/app.ts`.
- No `.env` file was read; no database, Docker, or network-changing command was executed.

## 2. Baseline (declared vs locked)

| Package | Declared | Locked / installed | Target | Range change | Applied |
|---|---|---|---|---|---|
| fastify | `^5.0.0` | **5.12.7** | **5.12.7** | none (within range) | **Stage A** |
| zod | `^4.0.5` | **4.6.7** | **4.6.7** | none (within range) | **Stage A** |
| mysql2 | `^3.22.3` | **3.24.6** | **3.24.6** | none (within range) | **Stage A** |
| @fastify/static | `^10.1.7` | **10.1.7** | **10.1.7** | **major** | **Stage B** |
| @fastify/swagger-ui | `^6.1.2` | **6.1.2** | **6.1.2** | **major** | **Stage B** |
| nodemailer | `^10.2.1` | **10.2.1** | **10.2.1** | **major** (skips 9) | **Stage C** |
| sharp | `^0.34.5` | **0.35.5** | **0.35.5** | **major** (0.x) | **Stage D** |
| @fastify/swagger (supporting) | `^9.7.0` | **9.7.0** | 9.9.2 | none/minor | **not applied** (see §4.5a) |

All target versions were confirmed to exist in the registry:
`fastify 5.12.7`, `zod 4.6.7`, `mysql2 3.24.6`, `@fastify/static 10.1.7`,
`@fastify/swagger-ui 6.1.2`, `nodemailer 10.2.1`, `sharp 0.35.5`.

**Installed plugin tree after Stage B** (`npm ls @fastify/static @fastify/swagger-ui @fastify/swagger fastify-plugin --all`):

```
@fastify/static@10.1.7        -> fastify-plugin@6.0.1
@fastify/swagger-ui@6.1.2     -> @fastify/static@10.1.7 (deduped), fastify-plugin@6.0.1
@fastify/swagger@9.7.0        -> fastify-plugin@5.1.0 (deduped with cookie/cors/helmet/multipart/rate-limit)
```

There is exactly **one** `@fastify/static` copy (10.1.7) and **no** duplicate major. `fastify-plugin`
5.1.0 and 6.0.1 coexist — this is the documented, expected outcome for Fastify 5 plugin wrappers
and is not a compatibility fault.

**Stage C package state:** `nodemailer@10.2.1` is the single installed copy; `@types/nodemailer`
was **removed** from `devDependencies` and is absent from the lockfile. Nodemailer 10 ships its own
declarations (`dist/cjs/*.d.ts`, resolved through `main` under `module: NodeNext`), so the external
type stub is no longer required — confirmed by a clean `tsc` build.

**Stage D package state:** `sharp@0.35.5` is the single installed copy; the deprecated
`@types/sharp` stub was **removed** from `devDependencies` and is absent from the lockfile. Sharp
0.35.5 ships conditional declarations (`dist/index.d.mts` for `import`, `dist/index.d.cts` for
`require`), so the external stub is no longer required. Local runtime loaded the prebuilt
`win32-x64` binary with **libvips 8.18.7**; `npm ls sharp @types/sharp --depth=0` reports only
`sharp@0.35.5`.

## 3. Summary matrix

| Package | Advisory severity | Affected range (audit) | Node constraint | Peer/plugin constraint | Risk | Order |
|---|---|---|---|---|---|---|
| fastify | High | `<=5.12.4` | none declared; Fastify 5 supports Node 20+ | none | Low–Medium | 1 |
| zod | High | `<4.6.6` | none | none | Low | 1 |
| mysql2 | Moderate | `<=3.23.0` | `>= 8`; peer `@types/node >= 8` | none | Low | 1 |
| @fastify/static | High | `<=10.1.1` | none declared | Fastify `^5.x` (devDep `^5.1.0`) | Medium | 2 |
| @fastify/swagger-ui | Moderate (via static) | `<=6.1.0` | none declared | Fastify `^5.0.0`, `@fastify/swagger ^9`, `@fastify/static ^10.1.0` | Low–Medium | 2 |
| nodemailer | High | `<=10.1.3` | **`>= 20.0.0`** | none | Medium | 3 |
| sharp | High | `<=0.35.5-rc.1` | **`>= 20.9.0`** | prebuilt musl/glibc binaries | Medium–High | 4 |

## 4. Detailed findings

### 4.1 fastify → 5.12.7

1. **Versions:** declared `^5.0.0`; locked 5.8.5; target 5.12.7 (already inside the declared range).
2. **Advisories:** affected `<=5.12.4` (npm audit / GitHub Advisory DB):
   - #1158514 schema-validation bypass via root primitive coercion mismatch
   - #1158519 `X-Forwarded-*` spoofing under `trustProxy` hop-count
   - #1240639 HTTP/2 trailer unhandled-exception DoS
   - #1240641 request-body replacement via async validation-result collision
   - #1240642 authentication bypass via malformed URLs reaching not-found handlers
   - #1240643 request-validation bypass via skipped `false` schemas
   - #1240644 header-validation bypass via incomplete schema case normalization
3. **Node/peers:** no `engines`; Fastify 5 requires Node 20+; project runs Node 22.14 and Docker
   `node:22-alpine`. Dependencies: `pino ^9.14||^10.1`, `avvio ^9`, `find-my-way ^9.6.0`,
   `light-my-request ^6`.
4. **Behavior:** minor release; no documented breaking API in the 5.x line. The fixes change URL
   matching/validation edge cases, so CourtZon's custom empty-JSON parser and `trustProxy: true`
   deserve explicit regression checks. **Important:** 5.12.7 requires `find-my-way ^9.6.0`; the
   current lock has 9.6.0, which is *still inside the vulnerable `<=9.6.0` range*. The update must
   resolve `find-my-way >=9.6.1` (latest 9.10.0).
5. **Code locations:** `backend/src/app.ts:116-136` (Fastify options, `trustProxy`, JSON parser),
   `backend/src/server.ts`, 187 route/type imports of `fastify`.
6. **Tests:** `backend/src/tests/app.http.integration.spec.ts` (Testcontainers), auth/session and
   authorization-IDOR integration specs, `auth-route-rate-limit.spec.ts`, health endpoints.
   Add: malformed URL → 404/401 (not handler bypass), schema/header validation negative cases,
   `X-Forwarded-For` spoofing against rate limiting.
7. **Order/interactions:** upgrade first; then re-resolve `find-my-way`. `@fastify/busboy` is **not**
   fixed by this upgrade (it comes via `@fastify/multipart`).
8. **Risk/rollback:** Low–Medium. Roll back by reverting this package group's lockfile and running
   `npm ci`; no DB changes involved.

### 4.2 zod → 4.6.7

1. **Versions:** declared `^4.0.5`; locked 4.4.3; target 4.6.7 (within range).
2. **Advisory:** #1243066 — memory exhaustion while validating oversized constrained collections;
   affected `<4.6.6`.
3. **Node/peers:** none declared; no dependencies; no peer requirements.
4. **Behavior:** minor 4.x release. No public API removal identified; type inference and error
   formatting may tighten. CourtZon uses Zod in 52 files, including `backend/src/config/env.ts` and
   request DTOs.
5. **Code locations:** `backend/src/config/env.ts`, `backend/src/modules/**/presentation/*.dto.ts`;
   `z.ZodError` assertions exist (e.g. `academy/__tests__/g8-player-payment.service.spec.ts:187`).
6. **Tests:** DTO specs (e.g. `auth.dto.organization-registration.spec.ts`), env/config startup,
   full `tsc` build. Add: oversized-array/string rejection test near the advisory condition.
7. **Order/interactions:** independent; apply with the first group.
8. **Risk/rollback:** Low. Revert lockfile group and `npm ci`.

### 4.3 mysql2 → 3.24.6

1. **Versions:** declared `^3.22.3`; locked 3.22.3; target 3.24.6 (within range).
2. **Advisory:** #1158532 — unbounded zlib inflate in the compressed-protocol handler
   (decompression-bomb DoS); affected `<=3.23.0`. CourtZon does **not** enable `compress` in
   `backend/src/database/mysql.ts`, reducing exposure, but the fix is still required.
3. **Node/peers:** `engines.node >= 8`; peer `@types/node >= 8` (installed `@types/node 24.12.4`).
4. **Behavior:** minor 3.x; pool/query API stable. 429 source references (types + queries).
5. **Code locations:** `backend/src/database/mysql.ts` (pool creation); repositories/types across
   modules.
6. **Tests:** repository contract/integration suites, booking/payment/accounting integration,
   `app.http.integration.spec.ts`. Add no new protocol test unless compressed mode is enabled later.
7. **Order/interactions:** independent; first group.
8. **Risk/rollback:** Low. Lockfile revert.

### 4.4 @fastify/static → 10.1.7 (major) — **APPLIED (Stage B)**

1. **Versions:** declared `^9.1.3` → **`^10.1.7`**; locked 9.1.3 → **10.1.7** (major, applied
   2026-10-26).
2. **Advisories:** #1124285 authorization bypass via non-canonical URL paths; #1124286 route-guard
   bypass via path traversal; affected `<=10.1.1`. (`@fastify/swagger-ui` inherits the same via its
   dependency.)
3. **Node/peers:** no `engines`; official readme: plugin `>=8.x` supports Fastify `^5.x`; devDep
   `fastify ^5.1.0`. v10 depends on `fastify-plugin ^6.0.0`, `@fastify/send ^4`, `glob ^13`.
   Readme notes `import.meta.dirname` requires Node `>=20.11` (project: 22.14 / Docker 22).
4. **Behavior:** major release. CourtZon uses only `root`, `prefix`, `decorateReply: false`
   (`backend/src/app.ts:391-395`); all three remain supported per the v10 readme. v10 documents
   stricter case-sensitivity/wildcard 403 behavior; verify `/uploads/` serving and no regression for
   mixed-case filenames.
5. **Code locations:** `backend/src/app.ts:391-395` (serves the public `/uploads/` tree).
6. **Tests:** **previously none.** Stage B added `backend/src/tests/fastify-plugin-compat.spec.ts`,
   which registers the same options (`root`, `prefix: '/uploads/'`, `decorateReply: false`) against a
   temp static root and asserts: existing file 200, nested file 200, missing 404, four traversal /
   encoded-traversal URLs rejected, `reply.sendFile` absent, `/docs` 200 + OpenAPI 3 document, and
   the production docs gate. **PASS.**
7. **Order/interactions:** **must be upgraded together with `@fastify/swagger-ui` 6.1.2**, which
   requires `@fastify/static ^10.1.0`. Upgrading static alone while swagger-ui stays at 5.x would
   install two static majors (swagger-ui 5 needs `^9.1.2`). **Both were installed in one command;
   `npm ls` confirms a single `@fastify/static@10.1.7`.**
8. **Risk/rollback:** Medium (public file serving). Revert both plugin manifests/lockfile together.

### 4.5 @fastify/swagger-ui → 6.1.2 (major) — **APPLIED (Stage B)**

1. **Versions:** declared `^5.2.6` → **`^6.1.2`**; locked 5.2.6 → **6.1.2** (major, applied
   2026-10-26).
2. **Advisories:** affected `<=6.1.0`, via `@fastify/static` (#1124285/#1124286). **Cleared** by the
   installed 6.1.2.
3. **Node/peers:** no engines. Target devDependencies: `fastify ^5.0.0`, `@fastify/swagger ^9.0.0`;
   runtime dependency `@fastify/static ^10.1.0`, `fastify-plugin ^6`.
   **RESOLVED:** although the package readme compatibility table still omits the 6.x row (stale
   doc), the Stage B `/docs` smoke test passes on Fastify 5.12.7 with `@fastify/swagger 9.7.0`, and
   `npm ls` shows no peer warnings. Fastify 5 compatibility is now **verified at runtime**.
4. **Behavior:** major; registration options used (`routePrefix: '/docs'`, `uiConfig`,
   `app.swagger()`) work unchanged in v6. The custom CSP override for `/docs`
   (`backend/src/app.ts:432-439`) is unchanged in source and remains gated by `enableApiDocs`.
5. **Code locations:** `backend/src/app.ts:397-439`; docs disabled in production unless
   `ENABLE_API_DOCS=true`.
6. **Tests:** **none existed.** `fastify-plugin-compat.spec.ts` now asserts `/docs` returns 200
   `text/html`, the OpenAPI document is `openapi 3.x`, and a static source check proves the
   production gate (`isDev || ENABLE_API_DOCS === 'true'`) and the exact `/uploads` registration are
   preserved. **PASS.**
7. **Order/interactions:** same stage as `@fastify/static` 10.1.7. `@fastify/swagger` was evaluated
   at 9.9.2 and **deliberately not upgraded** — see §4.5a.
8. **Risk/rollback:** Low–Medium (dev/ops surface only). Revert with the static pair.

### 4.5a `@fastify/swagger` 9.7.0 → 9.9.2 — **EVALUATED, NOT APPLIED**

Decision: **keep 9.7.0.** Evidence:

1. **No advisory:** `npm audit` reports nothing for `@fastify/swagger` before or after Stage B; the
   package is not in the vulnerable set and is not a transitive path to one.
2. **Peer requirement satisfied:** `@fastify/swagger-ui@6.1.2` declares `@fastify/swagger ^9.0.0`
   (devDependency) — 9.7.0 is inside that range. No peer conflict or `npm ls` warning.
3. **Runtime verified:** `/docs` and `app.swagger()` work against 9.7.0 (see §4.5.6).
4. **Only benefit is cosmetic alignment:** 9.7.0 uses `fastify-plugin ^5`, while static 10 and
   swagger-ui 6 use `^6`. Both majors coexist by design; upgrading swagger would only align the
   wrapper version, with **zero security delta** and added regression surface.
5. **Scope discipline:** Stage B's approved objective is the compatible Fastify plugin group that
   carries advisories. A non-security major/minor bump is deferred and can be revisited in a
   maintenance pass if upstream requires it.

### 4.6 nodemailer → 10.2.1 (major) — **APPLIED (Stage C)**

1. **Versions:** declared `^8.0.7` → **`^10.2.1`**; locked 8.0.7 → **10.2.1** (major, applied
   2026-10-26).
2. **Advisories (affected `<=10.1.3`):** #1120795 CRLF header injection; #1120796 `jsonTransport`
   file/URL access bypass; #1158513 raw-message bypass → arbitrary file read/SSRF; #1193741 legacy
   `resolveContent` bypass; #1193770 IDN recipient allow-list bypass; #1193778 addressparser DoS;
   #1193779 recipient-domain validation bypass; #1239931 cross-tenant TLS `servername` cache;
   #1240033 nested recipient array stack exhaustion; #1240114 addressparser quadratic DoS;
   #1241195 OAuth2 TLS validation; #1242826 DKIM header unfolding DoS; #1243091/#1243092/#1243093
   addressparser boundary bugs.
3. **Node/peers:** `engines.node >= 20.0.0` (local 22.14, Docker 22). Package is `"type": "module"`
   with dual ESM/CJS exports; the used `const { default: nodemailer } = await import('nodemailer')`
   resolves and works — verified by the real-module smoke test.
4. **Behavior:** major jump 8→10; Node 20 requirement; bundled TypeScript declarations confirmed
   present at `dist/cjs/*.d.ts` (no `types` field, resolved via `main` under NodeNext). The external
   `@types/nodemailer` was **removed** from `devDependencies`; the backend `tsc` build passes with
   no type errors. CourtZon uses `createTransport` + `sendMail` with attachments; API unchanged.
   Mail is only sent when `MAIL_TRANSPORT=smtp`; the default remains the log transport.
5. **Code locations:** `backend/src/shared/services/mailer.service.ts` (dynamic import, SMTP
   options, attachments); call sites unchanged: `backend/src/server.ts:82` (`send_email` queue
   handler), `backend/src/modules/notifications/infrastructure/providers/email.provider.ts`,
   `backend/src/modules/cms/application/contact-submission.service.ts:206`.
6. **Tests:** **added in Stage C** (two files, 10 tests, no DB/network):
   - `backend/src/shared/services/__tests__/mailer.service.spec.ts` — SMTP defaults
     (`localhost:587`, empty auth, `noreply@courtzon.com`), `MAIL_*` overrides, html fallback,
     attachment mapping, error propagation, and the log path (no import/send, `[LOG MAILER]`,
     attachment count without paths).
   - `backend/src/shared/services/__tests__/mailer.nodemailer-esm.spec.ts` — real
     `import('nodemailer')` default export, `jsonTransport` message composition, SMTP-shaped
     transport construction.
   **Result: 10/10 PASS.**
7. **Order/interactions:** independent; after the Fastify plugin group. No other package change was
   needed; removing `@types/nodemailer` leaves no dangling references.
8. **Risk/rollback:** Medium (only SMTP path affected; Node/type shift). Revert manifest/lockfile.

### 4.7 sharp → 0.35.5 (major, 0.x) — **APPLIED (Stage D)**

1. **Versions:** declared `^0.34.5` → **`^0.35.5`**; locked 0.34.5 → **0.35.5** (major, applied
   2026-10-26). A single copy is installed.
2. **Advisories (affected `<=0.35.5-rc.1`):** #1124066, #1193725, #1241331; libvips
   CVE-2026-33327 / CVE-2026-33328 / CVE-2026-35590 / CVE-2026-35591, plus libheif
   GHSA-g89c-p67h-r497 / GHSA-2jg2-4ch7-h545. **Cleared** — `npm audit` no longer lists `sharp`
   in either the production or the full tree.
3. **Node/peers:** `engines.node >= 20.9.0` (local 22.14 / Docker 22). Optional prebuilt binaries
   include `@img/sharp-linuxmusl-x64@0.35.5` and `@img/sharp-libvips-linux-x64@1.3.4` →
   Alpine-compatible; the local install loaded prebuilt `win32-x64` with **libvips 8.18.7**.
   Musl/Alpine runtime proof remains a Phase 9 item.
4. **Behavior / breaking changes reviewed:** Node 18 support dropped (not used); the npm `install`
   script was removed (prebuilt-only — `npm ci` behaviour unchanged); libvips upgraded to 8.18.x.
   Removed deprecated features (`failOnError`, `paletteBitDepth`, legacy `sharpen` properties,
   `format.jp2k` → `jp2`) are **not used anywhere in CourtZon**. The new
   `limitInputChannels` default (5) accepts every image type the upload service allows
   (JPEG/PNG/WebP/GIF/AVIF/HEIC). The used API (`sharp()`, `metadata()`, `rotate()`, `resize()`,
   `withMetadata()`, `webp()`, `png()`, `gif()`, `toBuffer()`) is stable and type-verified.
5. **Bundled types:** sharp 0.35.5 declares `types: ./dist/index.d.mts` with conditional exports
   (`import` → `dist/index.d.mts`, `require` → `dist/index.d.cts`). `@types/sharp@0.31.1` (a
   deprecated stub, present in **devDependencies**) was **removed**; `tsc --traceResolution`
   resolves `sharp` to `node_modules/sharp/dist/index.d.mts@0.35.5` and the backend build passes.
6. **Code locations:** `backend/src/modules/upload/infrastructure/sharp-processor.ts`,
   `backend/src/shared/services/media.service.ts`,
   `backend/src/modules/app-settings/application/app-settings.service.ts` (`metadata()` only).
7. **Tests:** `sharp-processor.spec.ts` extended **7 → 10** tests — added transparent-PNG alpha
   preservation through lossless WebP, opaque PNG output, and the brand-image favicon spec applied
   through the same processor; existing resize/passthrough/GIF/EXIF/corrupt-input cases retained.
   `brand-image.spec.ts` (8 validation tests) and the upload RBAC integration spec (15 tests) re-run
   unchanged. **18/18 unit + 15/15 integration PASS**; backend build **PASS**.
8. **Order/interactions:** independent; executed **last** (highest output risk). Removing
   `@types/sharp` leaves no dangling references (manifest + lockfile clean). No Nodemailer or other
   dependency was touched in this stage.
9. **Risk/rollback:** Medium–High (all user image uploads). Revert manifest/lockfile; no schema
   impact (previously stored files are unaffected). Encoded bytes may differ across libvips
   versions, so acceptance is dimensions/format/alpha — not byte-identical output.

## 5. Dependency interactions (must be respected)

1. **`@fastify/swagger-ui@6.1.2` requires `@fastify/static ^10.1.0`.** Former swagger-ui 5.2.6
   required `@fastify/static ^9.1.2`. **Resolved:** both were upgraded together and static is pinned
   to `^10.1.7` (the fixed version), not 10.1.0. Only one static copy is installed.
2. **`fastify@5.12.7` declares `find-my-way ^9.6.0`.** The lock currently has **9.10.0**, inside
   the fixed range (`>= 9.6.1`). Verified.
3. **`@fastify/busboy` is not fixed by the fastify update.** It comes via `@fastify/multipart`
   (`^3.0.0`, locked 3.2.0; advisory `<=3.2.1`). A transitive refresh (`npm update @fastify/busboy`)
   or a multipart update belongs in P2-04/P2-10, otherwise the audit stays red.
4. **Plugin wrapper majors:** `@fastify/swagger-ui` 6 and `@fastify/static` 10 use
   `fastify-plugin ^6`; `@fastify/swagger` 9.7.0 uses `^5`. Coexistence is allowed and verified by
   build + `/docs` tests; `@fastify/swagger` was **not** bumped (see §4.5a).
5. **Type packages:** `@types/nodemailer` was removed in Stage C — nodemailer 10's bundled
   declarations satisfy `tsc`. `@types/sharp` (deprecated stub) was **removed in Stage D** —
   sharp 0.35.5's bundled conditional declarations satisfy `tsc` (verified by trace resolution).
   (Separate cleanup: deprecated `@types/socket.io`.)

## 6. Staged upgrade sequence (for P2-04) — Stages A–D **executed**

Each stage is one reviewable change with its own build/test evidence and rollback point.

**Stage A — within-range security group (lockfile-only, no manifest range changes) — ✅ EXECUTED**

```bash
cd backend
npm update fastify zod mysql2
npm ls fastify zod mysql2 find-my-way
npm update find-my-way        # only if it remains 9.6.0
npm run build
npm test                      # unit suite (302 spec files)
```

Acceptance met: build PASS; focused unit 70/70; `find-my-way` **9.10.0**; `npm audit --omit=dev` no
longer reports fastify/zod/mysql2. Full suite 3705/3713 — the 8 failures are pre-existing dated
fixtures / suite-load timeouts (B8), unrelated to the upgraded packages.

**Stage B — coupled Fastify plugins (major) — ✅ EXECUTED (2026-10-26)**

```bash
cd backend
npm install @fastify/static@^10.1.7 @fastify/swagger-ui@^6.1.2
npm ls @fastify/static @fastify/swagger-ui @fastify/swagger fastify-plugin
npm run build
npx vitest run src/tests/fastify-plugin-compat.spec.ts src/modules/auth/__tests__/auth-route-rate-limit.spec.ts
npx vitest run --config vitest.integration.config.ts \
  src/modules/upload/__tests__/upload-routes-rbac.integration.spec.ts \
  src/modules/activities/__tests__/coach-profile-save.integration.spec.ts
```

`@fastify/swagger@^9.9.2` was **evaluated and deliberately excluded** (§4.5a).

Acceptance met:

| Check | Result |
|---|---|
| `/uploads/` existing file | **200**, `text/plain`, body intact |
| Nested `/uploads/nested/…` | **200** |
| Missing file | **404** |
| Traversal (`..`, `%2e%2e`, `..%2f`, `....//`) | **rejected** (not 200) |
| `decorateReply: false` honored | `app.sendFile` undefined |
| `/docs` | **200**, `text/html` |
| OpenAPI document | **200**, `openapi 3.x` |
| Production docs gate | source-asserted `isDev \|\| ENABLE_API_DOCS==='true'`; no docs route registered otherwise |
| Duplicate `@fastify/static` majors | **none** (single 10.1.7) |
| Audit | `@fastify/static` + `@fastify/swagger-ui` **cleared** |

Test evidence: `fastify-plugin-compat` + auth route rate-limit → **15/15 PASS**; upload RBAC +
coach-profile integration → **24/24 PASS**; build **PASS**.

**Stage C — mailer (major) — ✅ EXECUTED (2026-10-26)**

```bash
cd backend
npm install nodemailer@^10.2.1
npm uninstall @types/nodemailer
npm run build
npx vitest run src/shared/services/__tests__/mailer.service.spec.ts \
                  src/shared/services/__tests__/mailer.nodemailer-esm.spec.ts
```

Acceptance met:

| Check | Result |
|---|---|
| Installed version / single copy | `nodemailer@10.2.1`, no `@types/nodemailer` anywhere in the lock |
| Bundled types | `tsc` build **PASS** after removing the stub |
| Default ESM import | real `import('nodemailer')` default export exposes `createTransport` |
| SMTP option mapping | `host`/`port`/`auth` defaults and `MAIL_*` overrides asserted |
| Message mapping | `from`/`to`/`subject`/`text`/`html` fallback/attachments asserted |
| Transport error path | `sendMail` rejection propagates to the caller |
| Default log transport | no import, no `sendMail`, `[LOG MAILER]` with attachment count only |
| Audit | `nodemailer` **cleared** (prod 8 → **7**, full 22 → **21**) |

Test evidence: mailer files **10/10 PASS**; mailer + notification dispatch/contract + Stage B
regression set → **36/36 PASS**; build **PASS**.

**Stage D — image pipeline (major, last) — ✅ EXECUTED (2026-10-26)**

```bash
cd backend
npm install sharp@^0.35.5
npm uninstall @types/sharp
npm run build
npx vitest run src/modules/upload/__tests__/sharp-processor.spec.ts \
                  src/modules/app-settings/domain/brand-image.spec.ts
npx vitest run --config vitest.integration.config.ts \
  src/modules/upload/__tests__/upload-routes-rbac.integration.spec.ts
npm audit --omit=dev
npm audit
```

Acceptance met:

| Check | Result |
|---|---|
| Installed version / single copy | `sharp@0.35.5`, no `@types/sharp` in manifest or lock |
| Type resolution | `tsc --traceResolution` → `sharp/dist/index.d.mts@0.35.5` (bundled), not `@types/sharp` |
| Backend build | **PASS** (`node scripts/generate-translation-artifact.js && tsc`) |
| Local runtime | prebuilt `win32-x64`, **libvips 8.18.7** |
| Large JPEG → bounded WebP | **PASS** (existing 7-test coverage retained) |
| WebP passthrough / oversized re-encode | **PASS** |
| Animated GIF passthrough | **PASS** |
| EXIF orientation normalization | **PASS** |
| Transparent PNG alpha via lossless WebP | **PASS** (new) — output `webp`, `hasAlpha=true`, 300×200 |
| PNG output for opaque input | **PASS** (new) — output `png`, `hasAlpha=false`, 500×400 |
| Brand-image favicon spec through processor | **PASS** (new) — 128×128 PNG from `BRAND_IMAGE_SPECS.favicon.process` |
| Corrupt/empty input rejection | **PASS** |
| Upload RBAC integration (reviewed scoped cleanup) | **15/15 PASS** |
| Audit | `sharp` **cleared** (prod 7 → **6**, full 21 → **20**) |

Test evidence: `sharp-processor` + `brand-image` → **18/18 PASS**; upload RBAC integration →
**15/15 PASS**; build **PASS**. The integration run reused accounting period `#12245` and performed
only its reviewed, test-owned, FK-ordered cleanup (no `TRUNCATE`/`DROP`/broad delete).

Remaining audit after Stage D: backend production **6** (5 high, 1 moderate), backend full **20**
(13 high, 6 moderate, 1 low). Remaining production entries are all transitive:
`@fastify/busboy` (via `@fastify/multipart`), `brace-expansion`, `engine.io`, `fast-uri`,
`socket.io-parser`, and moderate `fast-copy`. These are tracked for P2-10 / a later transitive pass,
not Stage D scope. Alpine/musl runtime verification remains a Phase 9 item.

## 7. Existing and required tests

| Area | Existing evidence | Required after upgrade |
|---|---|---|
| Fastify app/plugins | `src/tests/app.http.integration.spec.ts` (Testcontainers) | malformed URL/auth-bypass, header/schema validation, `trustProxy` spoofing |
| Zod | DTO specs, `g8-player-payment.service.spec.ts` | oversized-collection rejection, full `tsc` |
| mysql2 | repository contract + booking/payment/accounting integration | connection/pool smoke, transaction path |
| @fastify/static | `src/tests/fastify-plugin-compat.spec.ts` (7 assertions: 200/nested/404/traversal×4/`sendFile`) | **DONE** — PASS with 10.1.7 |
| @fastify/swagger-ui | `src/tests/fastify-plugin-compat.spec.ts` (`/docs` 200, OpenAPI 3, production gate) | **DONE** — PASS with 6.1.2 |
| nodemailer | `src/shared/services/__tests__/mailer.service.spec.ts` (7) + `mailer.nodemailer-esm.spec.ts` (3) | **DONE** — PASS with 10.2.1 |
| sharp | `sharp-processor.spec.ts` (**10**: existing 7 + alpha/PNG/brand-image spec), brand-image spec (8), upload RBAC integration (15) | **DONE** — PASS with 0.35.5; Alpine container smoke remains Phase 9 |

## 8. Rollback strategy

- Apply each stage as a separate decision/commit (commit only when authorized); roll back by
  reverting that stage's `package.json`/`package-lock.json` and running `npm ci`.
- No database schema/data is touched by any dependency upgrade; stored files remain valid.
- Do not rebuild Docker images until Phase 9; local Node 22 validation is sufficient for P2-04/P2-05.
- If Stage B fails, revert `@fastify/static` and `@fastify/swagger-ui` together (they are coupled).
- If Stage D fails on Alpine, revert sharp and document the blocker; do not ship a partially tested
  image pipeline.

## 9. Verified results, remaining limitations

**Now verified by execution (2026-10-26):**

- Stage A packages installed and exercised (build, unit, integration, audit) — see §6.
- Stage B installed (`@fastify/static 10.1.7`, `@fastify/swagger-ui 6.1.2`) with Fastify 5.12.7;
  `/uploads` serving, traversal rejection, `decorateReply:false`, `/docs`, OpenAPI generation, and
  the production docs gate all confirmed by `fastify-plugin-compat.spec.ts`.
- `@fastify/swagger 9.7.0` retained; no advisory, peer-satisfied, runtime-verified (§4.5a).
- The stale swagger-ui readme table is no longer a blocker: 6.x on Fastify 5 is runtime-verified.
- Stage C: `nodemailer 10.2.1` installed, stub types removed, real ESM default import and both
  transport paths verified by 10 tests; build passes.
- Stage D: `sharp 0.35.5` installed, `@types/sharp` removed, bundled conditional declarations
  verified by `tsc --traceResolution`; resize/passthrough/GIF/EXIF/alpha/PNG/brand-spec paths
  verified by 18 unit tests + 15 upload integration tests; build passes. Audit cleared `sharp`.

**Remaining limitations:**

- Testcontainers-based suites (32) remain unrun under the no-container decision; they are not
  required for Stage B/Stage C/Stage D acceptance but stay listed for later phases.
- Alpine (musl) runtime proof for `sharp 0.35.5` is deferred to Phase 9; the optional musl prebuilt
  packages exist and are locked, but no Docker build was performed in this stage.
- `sharp` encoded output can differ even with a stable API; byte-level snapshots are not a valid
  acceptance criterion — dimensions/format/alpha behavior are.
- The audit is time-sensitive; advisories were read on 2026-10-26. Backend production **6**
  (5 high, 1 moderate) and full **20** (13 high, 6 moderate, 1 low) remain, all transitive/dev-only
  except the tracked transitive production entries listed in §6.

---

## 10. Frontend compatibility matrix (P2-06 assessment → P2-07 executed)

Status: **P2-06 assessment complete; P2-07 upgrades executed and verified (2026-10-26).** See §10.11
for the execution record. §10.1–§10.10 remain the pre-upgrade analysis and are kept as decision
evidence.

### 10.1 Method and evidence

Read-only evidence gathered on 2026-10-26:

- Manifests/lockfile: `frontend/package.json`, `frontend/package-lock.json` (`lockfileVersion: 3`,
  every `resolved` URL on `registry.npmjs.org`).
- Installed tree: `npm ls <pkg> --depth=0`, `npm ls @tiptap/core @tiptap/pm`, `npm explain <pkg>`,
  `npm ls --omit=dev --all --parseable`.
- Registry + migration notes: `npm view <pkg>@<target> version engines peerDependencies dependencies`,
  `npm view <pkg> time --json`, axios `CHANGELOG.md`/GitHub release v1.20.0, React Router
  `packages/react-router/CHANGELOG.md`, Vite `packages/vite/CHANGELOG.md`, PostCSS `CHANGELOG.md`,
  Zod 4.6.x release notes.
- Code usage: repository-wide import/config grep over `frontend/src`, `frontend/scripts`,
  `frontend/vite.config.ts`, `frontend/postcss.config.js`, `frontend/vitest.config.ts`.
- Build-runtime evidence: existing `frontend/dist` (emitted by the documented build script) inspected
  for bundled/unbundled markers; `frontend/Dockerfile`; CI workflow install commands.
- Advisories: `npm audit --json` and `npm audit --omit=dev --json`.
- No `.env` read; no database, container, or network-mutating command executed.

### 10.2 Snapshot — declared vs installed vs target

| Package | Declared | Installed (lock) | Target | Range change | Breaking? | Exposure |
|---|---|---|---|---|---|---|
| axios | `^1.16.1` | **1.16.1** | **1.20.0** | same major (minor) | No — one documented behavior change (§10.5) | **Production runtime** (browser bundle) |
| zod | `^4.4.3` | **4.4.3** | **4.6.7** | same major (minor) | No — additive; patch fixes | **Production runtime** (client-side validation) |
| react-router-dom | `^7.15.1` | **7.15.1** | **7.18.4** | same major (minor) | No — advisory + URL-normalization fixes | **Production runtime** |
| @tiptap/react, starter-kit, extension-image, extension-link, extension-placeholder | `^3.23.5` (all five) | **3.23.5** | **3.32.0** | same major (minor) | No — but **exact peer pins require all-at-once** | **Declared production, never imported → not bundled** (§10.6) |
| postcss | `^8.5.14` | **8.5.14** | **8.5.31** | same major (patch) | No | Build-time only (devDependency; also in prod tree via PWA→Vite peer) |
| vite | `^8.0.12` | **8.0.13** | **8.3.5** | same major (minor) | No — additive features/fixes | Build + dev server only (devDependency) |
| vite-plugin-pwa | `^1.3.0` | **1.3.0** | not scheduled (latest is 2.0.0 — out of scope) | none | n/a | **Misclassified as production; belongs in devDependencies** (§10.7) |

Registry existence verified for every target (all are the current `latest`, published 2026-08-26 –
2026-10-21):

```
axios@1.20.0         published 2026-08-26
react-router-dom@7.18.4 published 2026-09-15
zod@4.6.7            published 2026-10-12
@tiptap/react@3.32.0 published 2026-10-13   (all five @tiptap targets + @tiptap/pm 3.32.0 exist)
postcss@8.5.31       published 2026-10-18
vite@8.3.5           published 2026-10-21
```

### 10.3 Actual application usage (what must not break)

| Area | Evidence |
|---|---|
| axios | 3 importing files: `frontend/src/services/api.ts` (the only `axios.create`, request/response interceptors, 401 single-flight refresh, FormData `Content-Type` deletion, `X-Device-Fingerprint` header), `frontend/src/types/api.ts`, `frontend/src/utils/errors.ts`. Usage counts: `AxiosError` 11, `isAxiosError` 9, `FormData` 50, `responseType: 'blob'` 3. **No** custom `paramsSerializer`, `transformRequest`, `validateStatus`, adapters, or progress callbacks. |
| zod | 10 files: 4 auth pages, `BookingFormPage`, `ContactFormBlock`, `WalletPage`, `ProfilePage`, `TournamentCreatePage`, `utils/phone.ts`. API surface is basic: `z.object` 9, `z.string` 46, `z.enum` 4, `z.infer` 8, `.refine` 7, `.superRefine` 1, `zodResolver` 18 (`@hookform/resolvers` 5.2.2). No `z.record`, `z.coerce`, `z.preprocess`, or discriminated unions. |
| react-router-dom | 225 importing files. Declarative SPA only: one `BrowserRouter` (`src/App.tsx:941`), `Routes`/`Route`, `Link` 749, `Navigate` 414, `useNavigate` 137, `useParams` 157, `useLocation` 31, `useSearchParams` 27, `NavLink` 25, `Outlet` 18. **No** `createBrowserRouter`, `RouterProvider`, loaders/actions, `useNavigation`, RSC, or middleware. No `useHistory`/`Switch`/`Redirect`/`withRouter` legacy APIs. |
| @tiptap | **Zero imports** in `frontend/src` (and in `packages/shared`). `prosemirror`/`tiptap` markers are **absent from every `frontend/dist/assets/*.js`**, i.e. the editors are tree-shaken out and never shipped. |
| postcss | `frontend/postcss.config.js` = `tailwindcss` + `autoprefixer` only. Tailwind is v3.4.17, so the PostCSS 8 contract is unchanged. |
| vite | `frontend/vite.config.ts` (215 lines): `@vitejs/plugin-react`, build-only `VitePWA(...)`, an inline `spa-fallback` plugin using `configureServer`, `resolve.alias` for `@courtzon/shared`, ~90 `server.proxy` prefixes, `server.headers`. Build script: `copy-flags.js && tsc -b && vite build && inject-push-sw.js`. |
| vite-plugin-pwa | Imported **only** by `frontend/vite.config.ts`. Runtime touchpoint is the generated virtual module `virtual:pwa-register` (declared manually in `src/vite-env.d.ts`, dynamically imported in `src/components/pwa/PWAUpdatePrompt.tsx`). `vitest.config.ts` does not load the plugin. |

### 10.4 Peer, engine and toolchain compatibility

| Constraint | Required by target | Project state | Verdict |
|---|---|---|---|
| Node for Vite 8.3.5 | `^20.19.0 \|\| >=22.12.0` | `frontend` engines `>=22.12.0`; local v22.14.0; Docker builder `node:22-alpine` | PASS |
| Node for react-router 7.18.4 | `>=20.0.0` | v22.14.0 | PASS |
| React for react-router 7.18.4 | `>=18` | react/react-dom `^19.2.6` | PASS |
| `@vitejs/plugin-react` 6.0.2 | peer `vite ^8.0.0` | target 8.3.5 | PASS |
| `vitest` 4.1.8 | peer `vite ^6 \|\| ^7 \|\| ^8` | target 8.3.5 | PASS |
| `vite-plugin-pwa` 1.3.0 | peer `vite ^3.1 \|\| … \|\| ^8.0.0`; `workbox-build`/`workbox-window ^7.4.1` | target 8.3.5; workbox 7.4.1 installed | PASS |
| `@tiptap/react` 3.32.0 | **exact** peers `@tiptap/core 3.32.0`, `@tiptap/pm 3.32.0`; react `^17 \|\| ^18 \|\| ^19` | react 19 OK; core/pm are transitive at 3.23.5 → must move together | CONDITIONAL (§10.6) |
| PostCSS target dependency floor | Vite 8.3.5 wants `postcss ^8.5.30`; postcss 8.5.31 wants `nanoid ^3.3.20`, `source-map-js ^1.2.2` | all available (nanoid 3.3.20, source-map-js 1.2.2 published) | PASS |
| TypeScript | `~6.0.2` (installed 6.0.3), `moduleResolution: bundler`, `skipLibCheck: true` | supported by all targets | PASS |

### 10.5 Per-package risk and the exact checks required before any installation

**axios 1.20.0** — production runtime, 21 advisories cleared by the bump.
- Documented behavior change that can affect this app: **XHR requests cancelled by navigation now
  reject with `ECONNABORTED` instead of resolving with `status: 0`**. Nothing in the codebase relies
  on `status === 0` today, but the response interceptor (`error.response?.status !== 401`) and the
  `isAxiosError` branches in `utils/errors.ts` must be re-read against it.
- Hardening changes touch exactly what this app uses: inherited/prototype header reads, interceptor
  replacement objects, `toFormData`/`formDataToJSON` recursion, duplicate-header handling, `baseURL`
  trailing-slash normalization, and synchronous-interceptor failure dispatch.
- Node-only dependencies (`form-data` → 4.0.6, `follow-redirects` → 1.16.2) are **not** in the
  browser bundle (axios maps `lib/adapters/http.js` and the Node platform to browser stubs), so their
  advisories are build/install-surface only.
- Required checks: `tsc -b`; `vite build`; the existing 133-file frontend unit suite; a **new focused
  test for `services/api.ts`** (FormData `Content-Type` removal + fingerprint header; 401 → single
  refresh → replay; refresh failure → `auth:logout` event; `responseType: 'blob'` CSV/Bi export), or
  documented manual UAT if a test is deferred. Manual: one multipart upload (avatar/product/brand
  image) and one CSV/BI download.

**zod 4.6.7** — production runtime (client-side only; the backend validates independently).
- Additive minor (`.validate`, `z.iban`, `z.instanceof().properties()`, `fromJSONSchema`,
  `z.withParser`) plus patch fixes; `.refine`/`.superRefine`/`z.infer` signatures used here are stable.
- Required checks: `tsc -b`; unit tests for `BookingFormPage` and the landing contact form (the only
  zod pages with direct tests today); manual validation pass on the 4 auth pages, `WalletPage`,
  `ProfilePage`, `TournamentCreatePage` (error text in EN + AR, because messages now surface from
  zod 4.6 internals).

**react-router-dom 7.18.4** — production runtime, 225 files.
- Clears the open-redirect (`GHSA-wrjc-x8rr-h8h6`), RSC/hydration XSS, and route-matching DoS
  advisories (vulnerable `<= 7.18.1`). 7.18.0 also **consolidates URL normalization and mixed-slash
  handling**, which is precisely the surface this SPA exercises through `Link`/`navigate`.
- Required checks: `tsc -b`; `vite build`; the 31 router-touching test files; manual deep-link matrix —
  `/app?tab=…#…`, trailing slash, `%20`, backslash (`\`) in `to`/`navigate`, unknown route → 404,
  `Navigate` redirects after login/logout, permission-gated route fallbacks, browser back/forward,
  and a push-notification deep link (`notificationclick` → `/notifications/...`).

**@tiptap/* 3.32.0** — declared production, **not shipped**.
- Advisory surface (`@tiptap/core` high; 27 moderate package entries; `prosemirror-view` high) is
  entirely non-runtime for this app because nothing imports Tiptap and no ProseMirror code reaches
  `dist`. The bump is therefore an audit-hygiene action, not a functional risk.
- Required checks: install must resolve to **one** `@tiptap/core`, `@tiptap/pm`, `@tiptap/extensions`
  at 3.32.0 (`npm ls @tiptap/core @tiptap/pm`); `tsc -b`; `vite build`; confirm the bundle stays
  tiptap-free (`prosemirror|tiptap` grep over `dist/assets/*.js`) and the gzip size does not grow.

**postcss 8.5.31** — build-time.
- 8.5.23 stopped loading source maps without `opts.from`; 8.5.27–8.5.31 fix `</style>` escaping, comments
  in `list.comma/space`, custom-property semicolons, and 8.5.28 fixed a types regression. No API change
  is used by Tailwind 3.4.17 or Autoprefixer 10.5.0.
- Required checks: `vite build`; compare emitted CSS bytes/hash and verify Tailwind utilities, dark-mode
  variables, and RTL logical properties are unchanged; confirm no `sourceMappingURL` warnings.

**vite 8.3.5** — build/dev only.
- 8.2.0/8.3.0 add features (PostCSS config typings, CSS chunk import maps, style-tag minification,
  `import.meta.ROLLDOWN_FILE_URL_*` asset URLs); 8.3.1–8.3.5 are fixes. No plugin API used here changed.
- Because output encoding changed, the check is **artifact equality, not just exit code**: `vite build`
  must reproduce `dist/index.html` asset references, hashed chunks, `sw.js` + `workbox-*.js` chunks,
  `manifest.webmanifest`, and the post-build `inject-push-sw.js` injection. Then `vite dev` smoke:
  proxy to the backend, `spa-fallback` middleware, `/favicon.ico` rewrite, and `vitest run`.

### 10.6 Tiptap coordination — required, and a scope decision for the user

`@tiptap/react`, `@tiptap/core`, `@tiptap/extension-*` all pin **exact** peers (`3.32.0`), and
`@tiptap/starter-kit` pins exact `3.32.0` dependencies for 20+ sub-packages. A partial bump therefore
fails with `ERESOLVE` or silently installs two core copies. **All five declared packages must move in
one command**, letting `@tiptap/pm`/`@tiptap/core`/`@tiptap/extensions` follow transitively.

Open decision (not actioned here): the five packages are **unused**. Removing them would delete 29 of
the 46 production audit entries and shrink `node_modules`, but removal is a manifest change beyond the
P2-07 "upgrade" wording and needs explicit user approval recorded as a plan note. Default path for
P2-07 unless told otherwise: **coordinated upgrade to 3.32.0**, with conditional removal logged as
technical debt (P8-09/P2-10).

### 10.7 `vite-plugin-pwa` classification — **devDependency**

Evidence that it is build-time only:

1. Its only import is `frontend/vite.config.ts` (Node config evaluation).
2. `registration` is emitted by the plugin at build time; `src/components/pwa/PWAUpdatePrompt.tsx`
   imports the **generated virtual module** `virtual:pwa-register`, not the package.
3. The runtime half (`workbox-window`) is bundled into the artifact:
   `dist/assets/workbox-window.prod.es5-DGMtIXHc.js` + `dist/assets/virtual_pwa-register-DtgL7W3f.js`.
4. `frontend/Dockerfile` builder runs `npm ci --ignore-scripts` (full install, dev included) and the
   runner stage copies only `dist/` into `nginx:1.27-alpine`; nothing resolves the package at runtime.
5. All CI workflows and both Dockerfiles use plain `npm ci`; the only `--omit=dev` install in the repo
   is the **backend** runner (`backend/Dockerfile:27`).

Consequence today: because it sits in `dependencies`, its peer `vite` and the `workbox-build` chain are
part of the **production** tree — `npm ls --omit=dev` lists `vite`, `postcss`, `workbox-build`,
`browserslist`, `filelist`, `minimatch`, `brace-expansion`. That inflates the production audit by five
entries (`@babel/core`, `baseline-browser-mapping`, `browserslist`, `fast-uri`,
`serialize-javascript`) plus `vite`/`postcss`/`nanoid`/`source-map-js`/`brace-expansion`.

Residual risk of reclassification: any environment that builds the frontend with
`npm ci --omit=dev` would fail (`Cannot find package 'vite-plugin-pwa'`). No such path exists in the
repository; this must be re-verified in P2-07 before the move and in Phase 9 for the Docker build.

### 10.8 Audit baseline and expected outcome (expectation, not result)

Current frontend audit (2026-10-26): **full 50** (16 high, 32 moderate, 2 low) and
**production 46** (15 high, 29 moderate, 2 low).

> The prediction below was written before P2-07. The **actual** measured result after execution was
> **production 2 / full 12** — see §10.11. The difference is explained by npm pruning the Workbox build
> chain on reinstall (the estimates assumed only reclassification would remove it).

Attribution of the 46 production entries:

| Group | Entries | Cleared by |
|---|---|---|
| `@tiptap/*` + `prosemirror-view` | 29 | tiptap 3.32.0 (or removal) |
| Direct targets `axios`, `zod`, `react-router-dom`/`react-router`, `vite`, `postcss` | 6 | respective bumps |
| axios transitives `form-data`, `follow-redirects` | 2 | axios 1.20.0 floors (4.0.6 / 1.16.2) |
| postcss transitives `nanoid`, `source-map-js` | 2 | postcss 8.5.31 floors (3.3.20 / 1.2.2) |
| PWA→Vite chain `@babel/core`, `baseline-browser-mapping`, `browserslist`, `fast-uri`, `serialize-javascript`, `brace-expansion` | 6 | `vite-plugin-pwa` → devDependencies |
| **Expected remainder** `socket.io-parser` (via `socket.io-client 4.8.3`, runtime) | **1** | not in P2-06 targets; transitive pass (P2-10) — `socket.io-parser` 4.2.7+ exists |

So P2-07/P2-08 should take production from 46 → ~1 and full from 50 → ~5: the single production
remainder is `socket.io-parser`, and the four dev-only entries measured today are `@vitest/mocker`,
`vitest`, `postcss-selector-parser`, and `undici`. These numbers are **predictions to verify** in
P2-08/P2-10, not results.

### 10.9 Unresolved questions / constraints for P2-07

1. **Tiptap**: upgrade (default) vs remove (needs approval) — see §10.6.
2. **`socket.io-parser`** will remain after P2-07; it is a `socket.io-client` transitive. Do not widen
   P2-07 scope to fix it; track for P2-10's transitive pass.
3. **Axios transport has no automated coverage** (50 test files mock `services/api`; only one test even
   references `axios`, and only as a mocked error shape). P2-07 should add the focused
   `services/api` test rather than rely on mocks that bypass the library.
4. **Plan text correction**: P2-07 currently says "drop deprecated `@types/socket.io`/`@types/sharp`".
   In reality neither exists in the frontend (`@types/sharp` was removed from **backend** in Stage D;
   `@types/socket.io ^3.0.1` is a **backend** devDependency). The frontend item should be replaced by
   the `vite-plugin-pwa` reclassification; the `@types/socket.io` cleanup belongs to a backend pass.
5. **Alpine/musl**: none of these targets are native modules, so there is no musl-specific risk; Phase 9
   still owns the container build proof.

### 10.10 Planned P2-07 order (for the next task, not executed here)

1. `vite-plugin-pwa` → `devDependencies` (manifest-only, zero code change) + `axios`, `zod`,
   `react-router-dom`, `postcss`, `vite` within their existing ranges + **one** coordinated
   `@tiptap/*@3.32.0` install.
2. Add the focused `services/api.ts` test **before** or with the axios bump.
3. `npm run build` in `frontend/` (runs `tsc -b` + `vite build` + SW injection) and `npm test`.
4. Verify: single tiptap core/pm; tiptap/prosemirror absent from `dist`; `sw.js`,
   `workbox-*.js`, `manifest.webmanifest` present; asset hashes/`index.html` consistent; CSS bytes
   compared; bundle size re-measured against P8-01.
5. Re-run `npm audit` (prod + full) and record exact counts in the progress file; then P2-08 verifies
   the frontend build/tests post-upgrade and P2-10 closes the whole Phase 2 audit.
6. No Docker rebuild, no commit/push/deploy in P2-06 or P2-07 unless separately authorized.

---

## 11. P2-07 execution record — frontend upgrades (2026-10-26)

Status: **executed**. Scope respected: only `frontend/package.json`, `frontend/package-lock.json`, the
new `frontend/src/services/api.test.ts`, and the two release documents changed. Backend manifests,
database, Docker and deployment were untouched.

### 11.1 Commands actually run (`frontend/`)

```bash
npm install vite-plugin-pwa@^1.3.0 --save-dev          # move runtime → dev, version preserved
npm install axios@^1.20.0 zod@^4.6.7 react-router-dom@^7.18.4 postcss@^8.5.31 vite@^8.3.5
# combined tiptap install failed with ERESOLVE (exact peers) → clean re-add instead of --force:
npm uninstall @tiptap/react @tiptap/starter-kit @tiptap/extension-image \
              @tiptap/extension-link @tiptap/extension-placeholder
npm install @tiptap/react@^3.32.0 @tiptap/starter-kit@^3.32.0 \
            @tiptap/extension-image@^3.32.0 @tiptap/extension-link@^3.32.0 \
            @tiptap/extension-placeholder@^3.32.0
npm run build
npm test
npm audit --omit=dev
npm audit
```

**Deviation (documented, no workaround flags):** the single combined install of the six target groups
failed with `ERESOLVE` on the exact Tiptap peers (`@tiptap/core@3.32.0`), exactly as predicted in
§10.6. It was resolved by removing the five Tiptap packages and re-installing all five at `^3.32.0`
together — **not** with `--force` or `--legacy-peer-deps`. The final manifest contains the same five
packages at `^3.32.0`; no package was added or dropped.

### 11.2 Final installed state

| Package | Before | After | Declared |
|---|---|---|---|
| axios | 1.16.1 | **1.20.0** | `^1.20.0` |
| zod | 4.4.3 | **4.6.7** | `^4.6.7` |
| react-router-dom / react-router | 7.15.1 | **7.18.4 / 7.18.4** | `^7.18.4` |
| @tiptap/react, starter-kit, extension-image, extension-link, extension-placeholder | 3.23.5 | **3.32.0** (all five) | `^3.32.0` |
| @tiptap/core, @tiptap/pm, @tiptap/extensions (transitive) | 3.23.5 | **3.32.0** single copy each | — |
| postcss | 8.5.14 | **8.5.31** | `^8.5.31` (dev) |
| vite | 8.0.13 | **8.3.5** | `^8.3.5` (dev) |
| vite-plugin-pwa | 1.3.0 (runtime) | **1.3.0 (devDependency)** | `^1.3.0` (dev) |
| form-data / nanoid / source-map-js (transitive floors) | 4.0.5 / 3.3.12 / 1.2.1 | **4.0.6 / 3.3.20 / 1.2.2** | — |

`npm ls` confirms one copy of every Tiptap core/pm/extensions. Production tree no longer contains
`vite`, `postcss`, `vite-plugin-pwa`, or `workbox-build`.

### 11.3 Build and artifact verification (`npm run build` → PASS)

| Check | Result |
|---|---|
| `tsc -b` + `vite build` + `inject-push-sw.js` | **PASS** (`built in 8.66s`; PWA `generateSW`, 651 precache entries) |
| Main entry `index-RtqPQNXQ.js` | **782.97 kB / 223.43 kB gzip** (764.6 KiB on disk) — P8-01 recorded **1,287.8 KB / 311.3 KB gzip**; improvement comes from Vite 8.3/Rolldown splitting (`i18n`, `api`, `schemas` chunks) |
| New split chunks | `i18n-BImfiuSz.js` 423.63 kB (57.54 kB gzip), `api-CpD7VdNR.js` 58.79 kB, `schemas-C8MG67Wg.js` 84.34 kB |
| CSS | `index-BVD3x4LX.css` **98.4 KB, identical filename hash to the pre-upgrade build** (byte-identical output) |
| JS chunk count | 323 → **340** (better chunking; no functional change) |
| `dist/sw.js` | present, **44.7 KB**, contains the injected `CourtZon Notification Platform` handlers (line 3) |
| Workbox asset | `dist/workbox-5b3f2944.js` 22.6 KB |
| Manifest | `dist/manifest.webmanifest` 1,408 B + `dist/manifest.json` 1,636 B |
| Tiptap/ProseMirror in production assets | **ABSENT — 0 matches** across all 340 JS chunks (expected outcome confirmed) |

### 11.4 Tests (actual)

| Run | Result |
|---|---|
| New `src/services/api.test.ts` | **11 / 11 PASS** — request interceptor (JSON content-type, device fingerprint add/omit), FormData kept as `FormData` instead of JSON-serialized, `responseType: 'blob'` passthrough, 401 → single shared refresh → replay, no refresh for `/auth/me` & `/auth/refresh`, `INVALID_REFRESH_TOKEN`/`SESSION_EXPIRED` → clear session + `auth:logout` event, other refresh failures keep session, non-401 propagated without refresh |
| Full suite run 1 | **1347 / 1356** (134 files; 9 failures) |
| Full suite run 2 | **1346 / 1356** (10 failures) |
| `src/pages/tournaments/__tests__/TournamentCreatePage.spec.tsx` in isolation | **46 / 46 PASS** (34.4 s) |
| `src/services/api.test.ts` in isolation | **11 / 11 PASS** |

**Full-suite failures are not upgrade regressions** (triage in §11.6).

### 11.5 Audit result (actual, measured after installation)

| Tree | Before (P2-06) | After P2-07 | Entries remaining |
|---|---|---|---|
| Production (`--omit=dev`) | 46 (15 high, 29 moderate, 2 low) | **2** (2 high, 0 moderate, 0 low) | `follow-redirects@1.16.0` (axios transitive, not in the browser bundle), `socket.io-parser@4.2.6` (socket.io-client transitive, inside the runtime bundle) |
| Full | 50 (16 high, 32 moderate, 2 low) | **12** (6 high, 4 moderate, 2 low) | the two above + dev-only: `browserslist`, `brace-expansion`, `fast-uri`, `undici`, `@babel/core`, `baseline-browser-mapping`, `serialize-javascript`, `postcss-selector-parser`, `vitest`, `@vitest/mocker` |

Cleared by this task: `axios`, `zod`, `react-router-dom`/`react-router`, `postcss`, `vite`, all
`@tiptap/*`, `prosemirror-view`, `form-data`, `nanoid`, `source-map-js`, and the whole PWA/Workbox
production-tree inflation (`vite`, `browserslist`, `@babel/core`, `fast-uri`, `serialize-javascript`,
`baseline-browser-mapping`, `filelist`, `minimatch`, `brace-expansion` from production).

Remedies for the two production residuals (both in-range, **no manifest change**, deferred to P2-10 /
a transitive pass): `npm update follow-redirects` → 1.16.2; `npm update socket.io-parser` → 4.2.7.

### 11.6 Failure triage (full suite, P2-07 baseline run)

> All items below were resolved in **P2-08** (test-source fixes only) — see §11.8.

| Failure | Count | Analysis | Attribution |
|---|---|---|---|
| `src/navigation/parity/parity.test.ts` — org/player nav parity + nav id mapping | 7 (both runs) | Deterministic data comparison (`root: length 8 vs 7`): the navigation registry and the legacy builders disagree in **source**. The nav modules import no upgraded package (only app i18n/registry code), and the files are unmodified in the working tree, so the drift exists independently of this upgrade. | Pre-existing source drift (test debt) |
| `src/pages/org/OrgSubscriptionPage.test.tsx` — "shows current plan name, price and dates" | 1 (both runs) | Fixture `endDate: '2026-09-22'` is in the past relative to 2026-10-26, so the UI renders "Renew (Expired)" instead of "Expires:". Time-dependent fixture, same class as backend B8. | Pre-existing date-expired fixture |
| `src/pages/tournaments/__tests__/TournamentCreatePage.spec.tsx` — Step 4B wizard cases | 1 (run 1), 2 (run 2) | Fail with `Test timed out in 5000ms`; the same file passes **46/46** in isolation. A heavy 46-test wizard suite contending with 134 parallel test files. | Load-sensitive timeout (flaky ordering), not an assertion failure |

No assertion failure related to axios, zod, react-router, PostCSS, Vite or Tiptap was observed. The
new API tests replace the previous zero coverage of the axios transport (B11).

### 11.7 Residual risks after P2-07

1. **`follow-redirects@1.16.0`** (high, production audit): axios Node-adapter dependency, mapped out of
   the browser build (confirmed absent from `dist`), so install-surface only for this SPA. Fix: in-range
   `npm update`.
2. **`socket.io-parser@4.2.6`** (high, production audit): bundled inside `socket.io-client` and therefore
   runtime-reachable. Advisory `GHSA-2m8v-j782-fhvr` (zero-attachment memory exhaustion); 4.2.7 fixes it
   within `socket.io-client`'s `~4.2.4` range. Fix: in-range `npm update`.
3. **Date-expired and source-drift tests** (§11.6) remain failing in the full suite; they are tracked as
   test debt for P2-08/P7-02 and must not be reported as upgrade regressions.
4. **Bundle composition changed** (1,287.8 KB → 782.97 kB main entry, +17 chunks, identical CSS): the
   improvement comes from Vite 8.3/Rolldown splitting, not from code changes. Re-measure in P8-10.
5. **`vite-plugin-pwa` is now a devDependency**: any future pipeline that builds the frontend with
   `npm ci --omit=dev` would fail. None exists in the repo (Docker builder and all CI use full `npm ci`);
   Phase 9 must keep it that way.

### 11.8 P2-08 test stabilization (post-upgrade verification)

Result: **full frontend suite 1356/1356 across 134 files, PASS twice consecutively** (96.96 s and
97.19 s), `tsc -b` clean. No test was skipped, deleted, or weakened; no global timeout was changed.

| Failure | Root cause | Fix |
|---|---|---|
| Org parity ×3 (registry root 8 vs legacy 7) | The authoritative `ORG_NAV` registry gained the Membership domain (plans/settings/subscriptions) for the org subscription feature; the parity *fixture* (`parity/legacy/org-sidebar.ts`) was never updated. Production `OrgSidebar` already renders from the registry. | Added the Membership section to the legacy fixture (labels/icons/paths/permissions identical to the registry). Registry untouched. |
| Player more-items ×2 (18 vs 17) | `PLAYER_MORE_ITEMS` gained **My Memberships** (`/my/membership/subscriptions`, `membership.view`); the legacy player fixture lacked it. Production `BottomNav` already renders from the registry. | Added the item at the same position in `parity/legacy/player-nav.ts`. |
| Nav id integrity ×2 | Hard-coded counts reflected the pre-Membership structure (org 42 ids / 36 maps; player 20 ids / 14 maps). | Updated to the authoritative values: org **46 / 39**, player **21 / 15**. The assertions stay exact. |
| `OrgSubscriptionPage` "Expires:" | Fixture `endDate: '2026-09-22'` is in the past, so the page correctly rendered `Expired:` — a date-expired fixture, not a product defect. | `startDate`/`endDate` now use a local `localDateOffset(-30 / +30)` helper; production expiry logic untouched. |
| `TournamentCreatePage` timeouts (2 heavy Step 4B cases) | `walkTo(n)` walked to Review and then stepped back for every earlier target — up to 5 redundant round-trips per call — pushing 2 s tests past the 5 s default when 134 files run in parallel. | `walkTo` now stops at the requested step (no overshoot). Not a timeout bump. |

This is test-fixture drift, not dependency incompatibility: none of the upgraded packages (axios, zod,
react-router, postcss, vite, Tiptap) is imported by the navigation fixtures, and the failing assertions
were deterministic source comparisons plus one expired date.

---

## 12. P2-10 final audit and risk acceptance (2026-10-26)

### 12.1 Targeted in-range updates (frontend lockfile only)

| Package | Before | After | Parent constraint | Satisfied? | Advisories cleared |
|---|---|---|---|---|---|
| `follow-redirects` | 1.16.0 | **1.16.2** | `axios@1.20.0` → `^1.16.0` | Yes (in-range) | `GHSA-q3jh-wrc6-jgq8` (array-form headers bypass credential stripping), `GHSA-8r9p-f939-6h3c` (sensitiveHeaders regex escaping) |
| `socket.io-parser` | 4.2.6 | **4.2.7** | `socket.io-client@4.8.3` → `~4.2.4` | Yes (in-range) | `GHSA-2m8v-j782-fhvr` (zero-attachment memory exhaustion) |

Commands (no `--force`, no `--legacy-peer-deps`, **no manifest change**):

```bash
cd frontend
npm update follow-redirects
npm update socket.io-parser
```

Tree verification: exactly one copy of each (`axios → follow-redirects@1.16.2`,
`socket.io-client → socket.io-parser@4.2.7`), `npm ls --depth=0` exits 0, no `invalid`/`UNMET`/
`extraneous` entries. `frontend/package.json` was **not** edited in P2-10 — these two transitive
resolutions are the only intended dependency changes in this task.

### 12.2 Audit result by scope (actual, 2026-10-26)

| Scope | Total | High | Moderate | Low | Critical |
|---|---|---|---|---|---|
| Frontend production (`--omit=dev`) | **0** | 0 | 0 | 0 | 0 |
| Frontend full | **10** | 4 | 4 | 2 | 0 |
| Backend production (`--omit=dev`) | **6** | 5 | 1 | 0 | 0 |
| Backend full | **20** | 13 | 6 | 1 | 0 |
| Root (extra evidence) | **0** | 0 | 0 | 0 | 0 |

Frontend production went **2 → 0** in this task. No production dependency in the deployed SPA now
carries an advisory.

### 12.3 Remaining advisories — backend production (transitive, deferred)

| Package | Installed | Advisories | Severity | Path | In-range fix | Exposure |
|---|---|---|---|---|---|---|
| `@fastify/busboy` | 3.2.0 | 3 | High | `@fastify/multipart@10.0.0` | 3.2.4 (`^3.0.0`) | Multipart parsing DoS |
| `brace-expansion` | 5.0.6 | 6 | High | `@fastify/static@10.1.7` → `glob@13` → `minimatch@10` | 5.0.12 (`^5.0.5`) | Glob expansion DoS at startup/build |
| `engine.io` | 6.6.9 | 1 | High | `socket.io@4.8.3` | 6.6.11 (`~6.6.0`) | WebSocket protocol-mismatch DoS |
| `fast-copy` | 4.0.3 | 1 | Moderate | `pino-pretty@13.1.3` | 4.3.1 (`^4.0.0`) | Stack exhaustion with deeply nested values |
| `fast-uri` | 3.1.2 | 11 | High | `fastify` → `@fastify/ajv-compiler` / `json-schema-resolver` | 3.1.9 (`^3.0.0`) | URI parsing/SSRF-class issues in schema `$id` handling |
| `socket.io-parser` | 4.2.6 | 1 | High | `socket.io@4.8.3` | 4.2.7 (`~4.2.4`) | Zero-attachment memory exhaustion |

All six have **in-range, non-breaking** fixes; none requires a major upgrade. They were **not** applied
in P2-10 because the task scope is limited to the two frontend targets (see B13).

### 12.4 Remaining advisories — frontend full (dev/build-time, accepted)

| Package | Installed | Advisories | Severity | Path | In-range fix |
|---|---|---|---|---|---|
| `@babel/core` | 7.29.0 | 1 | Low | `vite-plugin-pwa` → `workbox-build` → `@babel/preset-env` | 7.29.7 |
| `@vitest/mocker` + `vitest` | 4.1.8 | 2 + 1 | Moderate | root devDependency | 4.1.12 (declared `^4.1.6`) |
| `baseline-browser-mapping` | 2.10.29 | 1 | Moderate | `browserslist` ← `autoprefixer`/`@babel` | 2.11.33 |
| `brace-expansion` | 2.1.0 and 5.0.6 | 12 (two copies) | High | `minimatch@9` / `minimatch@10` (eslint, workbox) | 2.1.7 / 5.0.12 |
| `browserslist` | 4.28.2 | 2 | High | `autoprefixer`, `@babel/helper-compilation-targets` | 4.29.5 |
| `fast-uri` | 3.1.2 | 11 | High | `vite-plugin-pwa` → `workbox-build` → `ajv` | 3.1.9 |
| `postcss-selector-parser` | 6.1.2 | 2 | Moderate | `tailwindcss@3.4.17` / `postcss-nested` | 6.1.5 |
| `serialize-javascript` | 7.0.5 | 1 | Low | `vite-plugin-pwa` → `workbox-build` → `@rollup/plugin-terser` | 7.1.4 |
| `undici` | 7.27.0 | 24 | High | `jsdom@28` (test environment only) | 7.30.1 |

None is shipped in `dist` (all are build/test-time); all fixes are in-range, no breaking upgrade needed.
Recorded as accepted for Phase 2 and tracked as B14.

### 12.5 De-duplication (no double counting)

`npm audit` counts **vulnerable packages**, not advisories, and the same package/advisory can appear in
both npm projects. Reconciled figures:

| Metric | Production | Full |
|---|---|---|
| Packages per scope | backend 6 + frontend 0 | backend 20 + frontend 10 |
| Unique packages across both trees | **6** (no overlap) | **25** (backend 20 + frontend 10 − 5 shared: `@vitest/mocker`, `brace-expansion`, `fast-uri`, `undici`, `vitest`) |
| Unique package + GHSA pairs | **23** (16 high, 5 moderate, 2 low) | **79** (36 high, 30 moderate, 13 low) |
| Unique GHSA advisories | **23** | **78** |

The earlier "32 = 20 + 12" figure in the progress file double-counted the 5 shared packages; it is
superseded by the numbers above.

### 12.6 Verification after the update

| Check | Result |
|---|---|
| Frontend focused (api + realtime/socket stores) | **103 / 103 PASS** (6 files) |
| Frontend `npm test` (full) | **1356 / 1356 PASS**, 134/134 files (98.15 s) |
| Backend `npm run build` | **PASS** |
| Backend focused realtime/notification units | **20 / 20 PASS** (4 files) |
| Frontend tree consistency | single copies; `npm ls` exit 0; no invalid peers |

No application code, manifest, schema, `.env`, Docker or deployment change was made.

### 12.7 Phase 2 acceptance decision

**ACCEPTED — criteria met for the Phase 2 scope:** relevant security findings are fixed or explicitly
documented, and builds plus affected tests pass (frontend 1356/1356, backend build + focused 20/20).

| Item | Status |
|---|---|
| Direct vulnerable production packages (backend + frontend) | **Fixed** (Stages A–D, P2-07, P2-10) |
| Frontend production advisories | **0** |
| Backend production transitives (6 packages) | **Deferred, documented** — in-range non-breaking fixes exist (B13) |
| Frontend dev/build-only advisories (10 packages) | **Accepted, documented** — no production exposure (B14) |
| Alpine/musl runtime proof for upgraded native modules | **Deferred to Phase 9** (Docker rebuild/verification) |
| Hostinger/production deployment verification | **Deferred to Phase 9/10** (requires authorization) |

Phase 2 is therefore **DONE at 10/10 with explicit deferrals**; it is **not** claimed as fully
runtime-verified until Phase 9 completes the container proof.

