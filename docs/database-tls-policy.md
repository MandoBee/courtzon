# Database TLS Policy (`DB_TLS_MODE`)

CourtZon uses **one** database TLS policy for every process that opens a MySQL
connection. The policy is defined in exactly two cooperating files:

| Runtime | File | Consumed by |
|---|---|---|
| Shell / MariaDB CLI | `backend/scripts/db-tls.sh` | `backend/docker-entrypoint.sh`, `scripts/migrate.sh`, `scripts/seed.sh` |
| Node / `mysql2` | `backend/scripts/db-tls.js` | `backend/src/database/mysql.ts`, `backend/scripts/migrate.js`, `backend/scripts/sync-role-permissions.mjs` |

Both implement the identical mode table. Change them together, and change
`scripts/tests/db-tls.test.sh` + `backend/src/database/__tests__/db-tls.spec.ts`
with them.

## Modes

| `DB_TLS_MODE` | CLI flags | `mysql2` option | Encrypted | Server cert verified | Identity (hostname) verified |
|---|---|---|---|---|---|
| `disable` | `--skip-ssl` | (no `ssl` key) | No | No | No |
| `require` | `--ssl --skip-ssl-verify-server-cert` | `{ ssl: { rejectUnauthorized: false } }` | Yes | No | No |
| `verify-ca` | `--ssl --ssl-ca=$DB_TLS_CA_PATH --ssl-verify-server-cert` | `{ ssl: { ca: [pem], rejectUnauthorized: true, verifyIdentity: true } }` | Yes | Yes | Yes |

Notes:

- `require` **must not** be described as secure transport. It encrypts the
  session but accepts any certificate, so an active man-in-the-middle can
  terminate TLS and read the plaintext. Use it only to stop passive sniffing on
  a network you already control.
- MariaDB's client verifies the server certificate **by default**
  (`--ssl-verify-server-cert` defaults to on), which is why `require` has to
  disable identity verification explicitly.
- `mysql2` only performs hostname checks when `ssl.verifyIdentity` is `true`;
  `rejectUnauthorized: true` alone validates the chain but not the identity.
  The policy always sets both for `verify-ca`.

## Defaults and environment detection

`DB_TLS_MODE` unset resolves to `disable` **only** in an explicitly classified
local environment. Classification is identical in `backend/scripts/db-tls.js`
(`classifyDatabaseEnvironment`) and `backend/scripts/db-tls.sh`
(`db_tls_environment`):

| `COURTZON_MIGRATION_ENV` | `NODE_ENV` | Class | Unset `DB_TLS_MODE` |
|---|---|---|---|
| `local` | (any) | `local` | → `disable` (compatibility default) |
| any other non-empty value | (any) | `non-local` | **startup failure** |
| unset/empty | `development` or `test` | `local` | → `disable` |
| unset/empty | `production` or any other value | `non-local` | **startup failure** |
| unset/empty | unset/empty | `unknown` | **startup failure** |

Precedence: an explicit `COURTZON_MIGRATION_ENV` always wins, even when
`NODE_ENV` disagrees. Only when it is unset/empty does `NODE_ENV` decide.

**UNKNOWN is not local.** Missing environment variables are never read as
"probably development". In an unclassified environment the policy fails closed
and asks for explicit configuration:

```
DB_TLS_MODE is not set and the deployment environment cannot be classified
(COURTZON_MIGRATION_ENV and NODE_ENV are both unset). Set DB_TLS_MODE explicitly
to one of: disable, require, verify-ca. Refusing to infer local plaintext from
missing environment variables.
```

An explicit valid `DB_TLS_MODE` is accepted in **any** class, including
`unknown`. Explicit `disable` outside `local` keeps working but emits a loud
warning on every startup (with a distinct message for `non-local` versus
`unknown`).

The local Docker stack supplies the signal explicitly:
`docker-compose.yml` sets `COURTZON_MIGRATION_ENV: ${COURTZON_MIGRATION_ENV:-local}`
and `.env` sets `COURTZON_MIGRATION_ENV=local`, so this environment stays on the
`disable` default by declaration, not by inference. Production (Coolify /
Hostinger) must set the variable to `production` and set `DB_TLS_MODE`
explicitly.

### Whitespace and case normalisation

Every variable this policy reads (`DB_TLS_MODE`, `COURTZON_MIGRATION_ENV`,
`NODE_ENV`) is normalised the same way in both runtimes:

1. strip **leading and trailing** whitespace (`trim` / `sed 's/^[[:space:]]*//; s/[[:space:]]*$//'`),
2. lowercase the result.

Internal whitespace is preserved on purpose so a typo cannot silently become a
valid mode:

| Input | Result |
|---|---|
| `" disAble "` | `disable` |
| `"\tREQUIRE\n"` | `require` |
| `"Verify-CA "` | `verify-ca` |
| `"dis able"` | **rejected** — `Invalid DB_TLS_MODE "dis able"` |
| `"ver ify-ca"` | **rejected** |

Unknown values, an unreadable CA, a non-PEM CA or a CA path containing
whitespace all fail fast before the first connection attempt.

## `verify-ca` prerequisites

`verify-ca` requires `DB_TLS_CA_PATH` to point at the PEM CA certificate that
signed the server certificate. Both the CLI and `mysql2` read the same file, so
the backend image must contain it (mount it, or `COPY` it) and the path must not
contain whitespace.

**The current local MySQL server cannot satisfy `verify-ca`.** The bundled
MySQL 8 container auto-generates a private CA and a server certificate with:

- no `subjectAltName` extension, and
- a common name (`MySQL_Server_..._Auto_Generated_Server_Certificate`) that does
  not match the Docker hostname `mysql`.

Chain validation would succeed with the CA supplied, but hostname verification
cannot. Before this mode can be used, the MySQL service must be provisioned with
a CA-signed certificate whose SAN matches the host used by the clients
(`DNS:mysql` for the Compose network).

## Production rollout

Non-local deployments must set `DB_TLS_MODE` explicitly **before** deploying an
image that contains this policy. `require` is the minimum for a remote database;
`verify-ca` is the end state once the server certificate has a correct SAN.

```dotenv
# production (managed / remote MySQL)
DB_TLS_MODE=verify-ca
DB_TLS_CA_PATH=/certs/mysql-ca.pem
```

## Known limitations

- **Coexisting legacy TLS variables.** The unmerged read-only baseline tooling
  (`backend/src/infrastructure/migrations/baseline/connection-config.ts`, used
  by `backend/scripts/preflight-bootstrap.ts` and
  `backend/scripts/verify-baseline-live.ts`) parses its own `DB_SSL_MODE`
  (`disabled` | `verify-ca` | `verify-full`), `DB_SSL_CA` and
  `DB_SSL_SERVER_NAME` for diagnostic CLIs. Those CLIs are not runtime paths and
  are not wired to this policy yet. They must be reconciled into `DB_TLS_*` (or
  mapped onto it) when that work is merged — do not let both mechanisms become
  configurable for the same connection.
- Ad-hoc standalone seeding scripts under `backend/scripts/` (the `seed-*.js`
  fixtures, backfills, e2e harnesses) still build their own `mysql2` connections
  with hard-coded local targets. They are operator tools, not runtime paths, and
  are not yet wired to this policy. Do not use them against a production
  database. The **canonical seed engine is wired**: `node backend/scripts/seed.js`
  → `scripts/seed.sh` sources `db-tls.sh` and uses exactly the same flags as the
  migration runner (`disable` → `--skip-ssl`, `require` → `--ssl
  --skip-ssl-verify-server-cert`, `verify-ca` → `--ssl --ssl-ca=… 
  --ssl-verify-server-cert`).
- The integration-test harness (`src/tests/**`) creates pools directly against
  Testcontainers; it inherits `NODE_ENV=test` (local → `disable`).
- Redis is out of scope; this policy covers MySQL only.
