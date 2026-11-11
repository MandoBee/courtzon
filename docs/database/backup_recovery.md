# Database Backup & Recovery

## Overview

CourtZon's backup implementation supports **scheduled, encrypted full database backups** with configurable retention. Backups are taken via `mysqldump --single-transaction` to avoid locking production tables, then streamed through gzip and AES-256-GCM into `.sql.gz.enc2` artifacts with a SHA-256 sidecar.

> **This describes the architecture, not verified operational status.** Production backups become possible only after `BACKUP_ENCRYPTION_KEY` and a dedicated `DB_BACKUP_USER`/`DB_BACKUP_PASSWORD` pair are provisioned and the backup directory is writable by the container's runtime user. At the time of the last audit those credentials were **not** provisioned on the production host, and no recent backup artifact existed. Backup code or a configured schedule does not prove that backups are currently succeeding — verify with a dated local artifact (see *Monitoring Backup Success/Failure*).

---

## Backup Strategy

The primary backup path is the **in-process backup job** (`backend/src/infrastructure/backup/backup.service.ts`), registered as the BullMQ `database_backup` handler and scheduled daily at **00:00** (`0 0 * * *`) by `backend/src/server.ts`. The shell scripts under `scripts/` remain available for manual runs.

| Aspect              | Detail                                                     |
| ------------------- | ---------------------------------------------------------- |
| **Frequency**       | Daily full backup (`database_backup` worker, `0 0 * * *`)  |
| **Tool**            | `mysqldump --single-transaction --routines --triggers --events` |
| **Compression**     | gzip, streamed (never buffered in memory)                   |
| **Encryption**      | AES-256-GCM (`CZBAK2` format), extension `.sql.gz.enc2`     |
| **Integrity file**  | `<backup>.sha256` sidecar (`sha256sum -c` compatible)       |
| **Retention**       | Newest `BACKUP_RETENTION_COUNT` (30) kept; optional `BACKUP_RETENTION_DAYS` age rule |
| **Backup user**     | `DB_BACKUP_USER` + `DB_BACKUP_PASSWORD`; required in production, no fallback |
| **Output**          | `BACKUP_DIR` — `/app/backups` in Docker                     |
| **Remote**          | Optional S3/R2 upload (`S3_*`); off unless configured       |
| **Verification**    | Streaming size limit, GCM tag write, SHA-256 sidecar; no restore is performed |

### Retention

The job keeps the newest backup unconditionally and prunes older **GCM** artifacts (`.sql.gz.enc2` and their sidecars) once `BACKUP_RETENTION_COUNT` (default `30`) is exceeded. `BACKUP_RETENTION_DAYS` (default `0`) additionally spares anything younger than that many days; `0` disables the age rule. Legacy plaintext/CBC files are never pruned by this job.

Retention orders candidates by **modification time**; it does not decrypt or authenticate them. A corrupt newest artifact therefore does not prevent older copies from being pruned once they fall outside the count/day window, and a stale sidecar without its artifact is not collected. Treat retention as space management, not as a validity check — monitor backup age/size and run restore drills instead.

### Storage location and permissions

| Item | Value |
| ---- | ----- |
| Backup directory | `/app/backups` (`BACKUP_DIR`) |
| Directory ownership | `appuser:appgroup` |
| Directory permissions | `750` |
| Backup file and sidecar permissions | `600` (created by the job; never widened) |
| Volume | `backend_backups` (named Docker volume) |

The backend entrypoint runs as root **before dropping privileges** and initializes the backup volume:

1. creates `/app/backups` if it is missing;
2. sets ownership to `appuser:appgroup` and directory mode `750`;
3. leaves existing contents untouched — **no recursive `chown`/`chmod`**, so previously written `600` artifacts keep their owner and mode;
4. then switches to `appuser` via `su-exec`.

This step is **fail-closed**: if directory creation, `chown`, or `chmod` fails, the entrypoint writes an error to stderr and exits non-zero, so the container does **not** start with an unusable backup directory.

### Encryption key handling

`BACKUP_ENCRYPTION_KEY` must be exactly 64 hex characters (32 bytes) and is **required** — the job fails closed without it. **Escrow the key securely outside the production server.** Losing it makes every encrypted backup unrecoverable; the key is not stored in the backups and cannot be derived from them.

### Backup transport TLS

The dump client reuses the same policy as the application and the migration runner (`backend/scripts/db-tls.js`); there is no separate, weaker rule:

| `DB_TLS_MODE` | `mysqldump` arguments |
| --- | --- |
| `disable` | `--skip-ssl` |
| `require` | `--ssl --skip-ssl-verify-server-cert` |
| `verify-ca` | `--ssl --ssl-ca=<DB_TLS_CA_PATH> --ssl-verify-server-cert` |

`DB_TLS_MODE` must be set outside a local environment; an unset or unclassifiable environment fails the job rather than defaulting to plaintext. `verify-ca` requires a readable PEM CA. The database password is passed only through `MYSQL_PWD`.

### Local sidecar integrity

After the encrypted artifact is finalized, the job hashes it and writes `<artifact>.sha256` (mode `600`, `sha256sum -c` compatible).

- If the sidecar cannot be written, the **artifact is preserved** (never deleted), the result reports `integrity: 'degraded'`, and an error is logged.
- With `BACKUP_REQUIRE_SIDECAR=1` that condition **fails the job** instead of reporting success. It defaults to `0` (off).
- Retention never deletes an artifact because a sidecar is missing.

### Status

A backup job that writes a local artifact is **not** proof that the data can be restored. Restorability must be demonstrated by an actual restore drill (see *Testing Backups Regularly*). Restore now refuses unsafe TLS, Event Scheduler and binary-logging combinations by default (see *Restore transport TLS* and *Pre-import safety probes*), but the DEFINER policy, restore-account privileges and an end-to-end drill remain open. Implementing these guards does **not** approve production restore.


### Required MySQL Privileges (illustrative)

A dedicated backup account needs enough visibility to dump tables, views, routines, triggers, and events. The statement below is an **illustrative** grant for the production schema `courtzon_v3`:

```sql
GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, PROCESS, REPLICATION CLIENT
  ON courtzon_v3.* TO 'courtzon_backup'@'%';
FLUSH PRIVILEGES;
```

> **Not applied.** No backup account existed in the audited production state. Provisioning the account and these grants requires explicit approval; this document does not claim they have been created. Restrict the host part to the deployment's actual client network where possible, and note that MySQL 8.0.20+ may additionally require the global `SHOW_ROUTINE` privilege (or `SELECT` on `mysql.proc` in older versions) for `mysqldump --routines` to succeed.

---

## Running Manual Backups

### Basic backup

```bash
./scripts/backup.sh
```

Output: `backups/courtzon_courtzon_v2_20260624_010000.sql.gz`

### Options

```bash
# Specify a different database
./scripts/backup.sh --db couritzon_v2_staging

# Custom output directory
./scripts/backup.sh --output /mnt/nfs/backups

# Disable compression
./scripts/backup.sh --no-compress

# Override retention (7 days)
./scripts/backup.sh --retention-days 7
```

### Logs

All backup operations are logged to `backups/backup.log`.

### Exit codes

| Code | Meaning  |
| ---- | -------- |
| `0`  | Success  |
| `1`  | Failure  |

---

## Restoring from Backup

### Entry points

There is **one** restore implementation: `backend/scripts/restore.js`.

| Entry point | Notes |
| --- | --- |
| `npm run db:restore -- …` (from `backend/`) | Runs the Node engine directly |
| `./scripts/restore.sh …` (repo root) | Compatibility wrapper; forwards all arguments to the Node engine and exits with its code |
| `node backend/scripts/restore.js …` | Direct invocation |

The shell wrapper contains no restore logic, does not default to
`courtzon_v3`, and never pipes backup data into `mysql` itself.

### Supported formats

| Format | Extension | Verification |
| --- | --- | --- |
| AES-256-GCM | `.sql.gz.enc2` | `CZBAK2` magic + 12-byte nonce + full GCM authentication before SQL |
| Legacy AES-256-CBC | `.sql.gz.enc` | IV + ciphertext; not authenticated (gzip CRC only) |
| Legacy plain gzip | `.sql.gz` | gzip CRC |
| Legacy plain SQL | `.sql` | No compression; no cryptographic integrity check |

### Required restore credentials

Restore requires an **explicit** `DB_USER` and `DB_PASSWORD`; there is no
implicit `root` fallback and the mysql client is never started without them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB_USER` | Yes | Restore account with schema-object DDL + DML privileges |
| `DB_PASSWORD` | Yes | Passed through `MYSQL_PWD`; never on the command line |
| `DB_HOST` / `DB_PORT` | No | Default `localhost` / `3306` |
| `DB_TLS_MODE` | Outside local | Shared policy: `disable` \| `require` \| `verify-ca` |
| `DB_TLS_CA_PATH` | For `verify-ca` | PEM CA used to verify the server certificate |
| `BACKUP_ENCRYPTION_KEY` | For `.enc2`/`.enc` | Exactly 64 hex characters |

`backend/scripts/restore.js` reads `process.env` directly. It does **not**
source `.env`/`.env.local`; export the variables in the shell (or via your
process manager) before invoking the restore.

Use `courtzon_migration` or an equivalent account. Per
`backend/scripts/setup-db-users.sql` it has `SELECT, INSERT, UPDATE, DELETE,
CREATE, DROP, ALTER, INDEX, REFERENCES, LOCK TABLES` on `courtzon_v3.*`.
`courtzon_app` has only DML and `courtzon_backup` is read-only; neither can
restore a full dump that contains `DROP TABLE`/`CREATE TABLE`.

> **WARNING:** the restore account must be authorized to create/drop/alter the
> target schema objects. Verify the target database and take a current backup
> before restoring anything important.

### Safe target and destructive confirmation

The default target is **`courtzon_restore_test`**. Any other target requires
the exact destructive confirmation flag, whose value must equal `--db`:

```bash
# Safe default target
DB_USER=courtzon_migration DB_PASSWORD='…' \
  ./scripts/restore.sh --file backups/example.sql.gz.enc2

# Any other target (exact confirmation required)
DB_USER=courtzon_migration DB_PASSWORD='…' BACKUP_ENCRYPTION_KEY='…' \
  ./scripts/restore.sh --file backups/example.sql.gz.enc2 \
    --db courtzon_v3 --confirm-destructive=courtzon_v3
```

`DB_NAME` is **not** used to select the restore target; use `--db`. Examples
elsewhere in this document that omit `--db` now restore into the safe default
`courtzon_restore_test`; add `--db <name> --confirm-destructive=<name>` for any
other database.

### Manual restore

```bash
# From backend/ — encrypted backup into the designated test database
DB_USER=courtzon_migration DB_PASSWORD='…' \
  BACKUP_ENCRYPTION_KEY='<64 hex characters>' \
  npm run db:restore -- --file backups/courtzon_….sql.gz.enc2
```

Take a fresh backup before overwriting an important database. The Node restore
engine does **not** create an automatic pre-restore backup; run
`scripts/backup.sh` (or the scheduled backup) first.

### Dry-run (plan only)

`--dry-run` is a planning aid. It validates arguments, configuration, target
selection and file accessibility, but it does **not** decrypt or authenticate
the backup, does **not** verify the GCM tag or gzip CRC, does **not** prove that
the backup can be restored, and does **not** execute SQL.

```bash
DB_USER=courtzon_migration DB_PASSWORD='…' BACKUP_ENCRYPTION_KEY='…' \
  npm run db:restore -- --file backups/example.sql.gz.enc2 --dry-run
```

### Restore transport TLS

Restore reuses the **same** policy as migrations, backups and the application
pool (`backend/scripts/db-tls.js`). No separate or weaker rules exist.

| `DB_TLS_MODE` | Client arguments | Meaning |
| --- | --- | --- |
| `disable` | `--skip-ssl` | explicit plaintext (local development only) |
| `require` | `--ssl --skip-ssl-verify-server-cert` | encrypted, certificate **not** verified |
| `verify-ca` | `--ssl --ssl-ca=<DB_TLS_CA_PATH> --ssl-verify-server-cert` | encrypted + CA/hostname verified |

- `DB_TLS_MODE` **must** be set outside a local environment; an unset or
  unclassifiable environment is refused rather than defaulting to plaintext.
- `verify-ca` requires `DB_TLS_CA_PATH` to point at a readable PEM certificate
  (no whitespace in the path); a missing or invalid CA aborts the restore.
- The resolved arguments are applied to **both** the pre-import probe client and
  the import client. The password is still passed only through `MYSQL_PWD`.
- The policy never logs credentials, connection secrets or CA contents.

### Pre-import safety probes

After the artifact is authenticated and the private spool is verified, and
**before** any SQL is executed, the engine runs read-only `mysql -N -B -e`
statements and evaluates their results. It reads:

- `@@GLOBAL.event_scheduler`
- `@@GLOBAL.log_bin`
- `@@GLOBAL.log_bin_trust_function_creators`
- whether the target database exists
- how many events already exist in the target database

It also inspects the verified spool for `CREATE TRIGGER`, `CREATE PROCEDURE`,
`CREATE FUNCTION`, `CREATE EVENT` and `CREATE VIEW` statements using the same
SQL-aware lexer as the DEFINER guard.

The restore **fails closed** if the probe cannot run, returns malformed or
incomplete output, returns an unexpected scheduler value, or reports that the
target database does not exist. The tool never creates schemas.

#### Event visibility is established, not assumed

`information_schema.EVENTS` (like all `INFORMATION_SCHEMA` metadata) is
**filtered by privilege**: an account without the `EVENT` privilege receives
**zero rows and no error**. A count of zero therefore does **not** prove that
the target has no events.

To establish visibility the engine runs a second read-only statement through the
same client, TLS policy and `MYSQL_PWD` handling:

```sql
SHOW EVENTS FROM `<target-database>`;
```

- `SHOW EVENTS` is permitted only with the `EVENT` privilege, either globally or
  on the target schema. A successful execution therefore proves that every
  event in that schema is visible.
- The **server** evaluates the effective privileges, so `EVENT` granted through
  an **active role** is honoured without parsing any grant text.
- Any denial (`ERROR 1227 … EVENT privilege`), transport failure, or unexpected
  output marks visibility as **`unproven`** — never as "no events".
- When visibility is `proven`, the `information_schema.EVENTS` count is
  authoritative. When it is `unproven`, the count is treated as untrusted.

The two visibility states behave as follows:

| Scheduler | Visibility | Behavior |
| --- | --- | --- |
| `ON` | `proven`, events exist | **Refused** (unless the override is supplied) |
| `ON` | `proven`, no events | Safe; restore proceeds |
| `ON` | `unproven` | **Refused regardless of the reported count** (unless the override is supplied) |
| `OFF` / `DISABLED` | either | Proceeds; an `unproven` result is reported as a note |

The documented `courtzon_migration` account does **not** hold `EVENT`. Restoring
with it therefore yields `unproven` visibility; grant `EVENT` on the target
schema (or a global `EVENT` grant) before restoring into a database that may
contain events.

> **Verified applicability:** MySQL 8.0 (production runs 8.0.46; the local
> image is `mysql:8.0`) and MariaDB 10+/11.x server semantics. The backend image
> ships the MariaDB 11.4 client, which simply issues the statement. The
> `EVENT`-privilege rule for `SHOW EVENTS` is documented for these versions.
> If the database server **family** or **major version** changes, re-verify this
> privilege rule before relying on the guard; older or otherwise unverified
> server versions are not claimed to be compatible.

### Event Scheduler policy

The Event Scheduler is **never** enabled, disabled or otherwise modified by the
restore tool. The default is safe:

- If the scheduler is `ON` **and** either the target already has events or the
  artifact defines events, the restore is **refused**.
- If the scheduler is `ON` and event visibility is **`unproven`**, the restore is
  **refused even when the visible event count is zero**, because a
  privilege-filtered zero does not prove absence.
- `--allow-event-scheduler-risk` is the only override. It is an explicit
  acknowledgement of the risk, prints a warning, and still does not change the
  scheduler. Events — including hidden ones — may execute during or after the
  import.
- The override does **not** bypass TLS, probe-integrity, DEFINER or binary-logging
  checks.
- `--confirm-destructive` is **not** scheduler consent; it only acknowledges the
  target database name.
- When the scheduler is `OFF` (or `DISABLED`), the restore proceeds; a note is
  printed for `DISABLED`.

> **Probe-to-import race (not eliminated):** the probes and the import use
> separate connections. A privileged administrator could change
> `event_scheduler`, or create/drop events, between the probe and the import.
> The tool cannot prevent that without holding locks or altering the scheduler,
> which it never does. Re-check the scheduler immediately before a sensitive
> restore and avoid concurrent administrative changes.

### Binary logging and stored objects

When binary logging is enabled, creating triggers or stored functions requires
elevated privileges unless `log_bin_trust_function_creators=ON`.

- If `log_bin=ON`, `log_bin_trust_function_creators=OFF`, and the artifact
  creates triggers or functions, the restore is **refused** by default.
- `--allow-trigger-create-with-binlog` is the only override. Use it only when
  the restore account is known to hold `SET_USER_ID` (or deprecated `SUPER`).
  The tool never changes a global variable.
- `CREATE PROCEDURE` alone is unaffected by this rule; events are covered by the
  Event Scheduler policy above.
- `DEFINER` metadata remains **fail-closed**: it is rejected, never stripped or
  rewritten.

### Partial restore failures

If the `mysql` import fails **after it has started**, the target database may
already contain part of the dump:

- the engine prints that the target may be **partially modified**;
- the already-verified private spool is **retained** and its exact path is
  printed (directory `0700`, spool file `0600`);
- **no automatic retry** is attempted;
- the restore is reported as failed, never as successful.

Operator cleanup: inspect the target and the retained spool, then remove the
spool directory manually once it is no longer needed. On a **successful** import
the spool is removed automatically.

### Production restore is not approved

The guards above reduce risk; they do not constitute a production restore
approval. Before any real restore you still need: the encryption key, a
provisioned restore account with verified privileges, an approved DEFINER
policy for the production dump, an explicitly created target database, and a
successful end-to-end drill.

**Lower-level API boundary.** The supported operator flow is
`main()` → `restoreFromBackup()` → `prepareSpool()` →
`verifySpoolDefinerPolicy()` and only then `runMysqlRestore()`. The exported
`runMysqlRestore()` is a lower-level primitive and does **not** independently
perform the DEFINER policy scan. It must not be used as a standalone safe
restore entry point.

### Generated columns

Before rewriting any `roles` INSERT, the restore engine validates the dump's own
`CREATE TABLE \`roles\`` definition: it must declare exactly 11 columns, with
`org_id_normalized` last and declared `GENERATED`. A missing, malformed or
incompatible definition — or a tuple that does not have exactly 11 values —
fails before the mysql client starts.

### DEFINER metadata (fail closed)

The restore engine **rejects** backups that contain executable `DEFINER`
metadata in `CREATE TRIGGER`, `CREATE VIEW`, `CREATE PROCEDURE`,
`CREATE FUNCTION`, or `CREATE EVENT` statements. Detection runs only after
GCM authentication and gzip CRC verification, and before the `mysql` client is
started. It is SQL-aware: harmless occurrences inside string literals,
comments, column names and ordinary `INSERT` data are ignored, while executable
`DEFINER` clauses (including those inside MySQL version comments) abort the
restore.

- No `SUPER` or `SET_USER_ID` privilege is granted as a workaround, and the
  restore engine itself never transforms or strips `DEFINER` clauses.
- The repository baseline contains no `DEFINER` clauses, but production
  backups remain unverified until safely inspected; expect a rejection if the
  live schema contains triggers, views, routines or events with `DEFINER`
  metadata.
- A parser-aware, **standalone** sanitizer is available for controlled drills
  (see *Producing a sanitized copy* below). It writes a separate file and does
  not change the restore engine's fail-closed behaviour.
- Do **not** manually remove `DEFINER` text with broad search/replace; that can
  corrupt SQL or change security semantics.
- `--dry-run` remains plan-only and does not inspect or verify `DEFINER`
  metadata.

### Producing a sanitized copy (controlled drill)

The raw encrypted backup remains the **authoritative** artifact and must never
be modified. When a restore is blocked by `DEFINER` and no approved definer
policy exists, produce a separate sanitized plaintext copy with the standalone
tool:

```bash
# from backend/
npm run db:sanitize-definers -- \
  --input  /secure/tmp/courtzon_export.sql \
  --output /secure/tmp/courtzon_export.sanitized.sql \
  --manifest /secure/tmp/courtzon_export.sanitized.manifest.json
```

The tool:

1. reads a **plaintext** SQL dump (it never decrypts; the operator supplies the
   decrypted export through an approved process);
2. tokenizes the SQL and removes only executable `DEFINER` clauses from
   `CREATE TRIGGER`, `CREATE PROCEDURE`, `CREATE FUNCTION`, `CREATE EVENT` and
   `CREATE VIEW` statements — including clauses inside MySQL executable
   comments (`/*!50017 DEFINER=…*/`);
3. leaves strings, quoted identifiers, ordinary comments, bodies and
   `SQL SECURITY DEFINER` untouched;
4. verifies the result with the restore engine's own `DEFINER` detector and
   refuses to publish if an executable `DEFINER` remains in a supported `CREATE`
   header. Standalone executable `DEFINER` text outside a `CREATE` header is not
   scanned; it is invalid SQL and the restore engine/MySQL will reject it;
5. writes the output through an **atomic hard link** from a fully-written,
   fsynced temporary file with mode `0600`. Partial writes are completed in a
   loop; a zero-byte or invalid write count fails closed. After linking, the
   actual destination is reopened and its byte size and SHA-256 are verified
   against the intended output. If the filesystem cannot provide an atomic
   no-overwrite link, the tool **fails closed** and publishes nothing; there is
   no copy/rename fallback that could leave a partial destination;
6. writes the JSON manifest **only after** the output has been verified. The
   manifest contains the schema/version, sanitizer version, original and
   sanitized SHA-256 checksums and byte sizes, the input encoding (`utf-8`), the
   number of clauses removed, the object types encountered/transformed, the
   verification scope, a completion status, a timestamp, and the ownership
   warning. `output.verified` means the published file was re-read and verified.
   The manifest contains no SQL, no credentials and no connection details.

**UTF-8 input is mandatory.** The tool validates the input bytes strictly before
decoding and rejects invalid UTF-8 instead of replacing invalid sequences. The
decoded text must re-encode to the exact original bytes; BOM, CRLF and other
valid byte sequences are never normalized. After transformation, the output is
constructed by copying the original input byte ranges outside the approved
removal spans. Character offsets are converted to exact UTF-8 byte ranges; the
resulting output byte count must match the expected count. The published path is
then re-read and verified by byte size and SHA-256. No separate full sanitized
text string is constructed for a byte-for-byte comparison.

**Strict account parsing.** Only a complete `DEFINER = user[@host]` clause is
removed. The parser consumes entire tokens, supports ordinary comments as
whitespace between `=`, user, `@` and host, matches `CURRENT_USER` only as a
complete token, and requires a complete continuation keyword boundary.
Supported continuations are `TRIGGER`, `PROCEDURE`, `FUNCTION`, `EVENT`, `VIEW`,
and `SQL SECURITY {DEFINER|INVOKER} VIEW`; the final `VIEW` check is enforced for
`SQL SECURITY`. `ALGORITHM` is **not** accepted after `DEFINER` — MySQL requires
it before `DEFINER`. A version-comment close is accepted only when the lexer is
actually inside the version comment it closes. `--` is treated as a comment only
when followed by whitespace or a control character; `--x` is not trivia.
Executable (`/*! … */`) comments between `DEFINER` and `=` are rejected, never
skipped or removed as trivia.

**SQL SECURITY ordering.** `SQL SECURITY {DEFINER|INVOKER}` establishes a
context that lasts until the object keyword. A `DEFINER` token followed by `=`
inside that context is rejected, including
`SQL SECURITY DEFINER DEFINER = …`,
`SQL SECURITY INVOKER DEFINER = …`, comments between tokens, and version-comment
forms. Valid `CREATE DEFINER=… SQL SECURITY DEFINER VIEW`,
`CREATE DEFINER=… SQL SECURITY INVOKER VIEW`, and
`CREATE SQL SECURITY {DEFINER|INVOKER} VIEW` remain supported. The same rejection
applies to TRIGGER, PROCEDURE, FUNCTION, and EVENT contexts.

**Nested executable comments.** MySQL comments do not nest. A second `/*!`
opener while the lexer is already inside a version comment is rejected before
any span is created. The active version-comment opener is tracked by lexer state
and passed to span construction; the sanitizer does not infer it with a raw
`lastIndexOf('/*!')`. Valid single-level trigger and view mysqldump forms remain
supported.

**Bare account characters.** The unquoted account policy is conservative and
explicit. User names allow ASCII `A-Z a-z 0-9 _ $` plus Unicode letters, numbers,
and combining marks. Host names additionally allow `.`, `%`, `:` and `-` for
hostnames, IPv4/IPv6 and wildcard forms. This preserves the project's prior ASCII
assumptions and valid Unicode identifiers. Quoted user/host identifiers may
contain other punctuation and are parsed by the quoted-account reader. Characters
such as `! * , + = [ ] { } | & ^ ~ \ < > /` are rejected in bare user or host
components. `CURRENT_USER` and `CURRENT_USER()` remain supported.

Any malformed, truncated, ambiguous, or unsupported **DEFINER-bearing
supported CREATE-header** form — `CURRENT_USER@host`, a quoted value followed by
stray characters, `TRIGGER1`/`VIEW1`/`SQL1`/`ALGORITHM1`, unsupported bare
account characters, `SQL SECURITY … DEFINER =`, nested executable comments,
multiple `DEFINER` clauses, unterminated comments, or a missing continuation —
is rejected before publication. Within this scope the tool never repairs or
guesses malformed SQL. Malformed **non-DEFINER** CREATE headers are not
rejected; they may pass through unchanged. This is **not** full SQL validation:
the remainder of a statement after the object keyword is not parsed, so a
truncated statement can still be published as e.g. `CREATE VIEW`; the restore
engine/MySQL will reject it.

**Supported CREATE-header tokens.** Before a DEFINER clause, the supported
header tokens are `CREATE`, optional `OR REPLACE`, optional
`ALGORITHM = {UNDEFINED|MERGE|TEMPTABLE}`, optional
`SQL SECURITY {DEFINER|INVOKER}`, and the object keyword. Unexpected strings,
quoted identifiers, numbers, punctuation, or duplicate/misordered modifiers
cause a DEFINER-bearing header to be rejected. Non-DEFINER CREATE headers, such
as `CREATE TEMPORARY TABLE`, are left unchanged because the sanitizer transforms
only supported DEFINER clauses; it does not validate their full grammar.
Consequently, malformed non-DEFINER headers — for example duplicate/misordered
`SQL SECURITY`, `ALGORITHM`, or `OR REPLACE` without a `DEFINER=` clause — may
pass through unchanged. They are not transformed and restore/MySQL will reject
them if invalid; this is not a DEFINER bypass.

**CREATE-header size limit.** A CREATE header — from `CREATE` through the object
keyword — is limited to **65,536 UTF-8 bytes**, not 65,536 UTF-16 code units.
Both the parser and the streaming guard measure UTF-8 bytes and never split a
decoded Unicode character. The guard divides large incoming chunks internally
and consumes only the remaining byte budget; the unconsumed remainder is
processed as ordinary SQL. A header truncated by the byte budget while more
source bytes remain is rejected with the oversized-header error; a header that
ends at EOF before the object keyword is rejected as incomplete. The limit is
not increased or relaxed for multibyte input.

**Executable-comment ambiguity.** MySQL comments do not nest: nested `/*!`
openers and unclosed version comments are rejected. Inside a MySQL version
comment, the sanitizer **conservatively rejects** `*/` appearing inside
single-quoted or double-quoted strings or backtick identifiers, and also rejects
ordinary block comments, `--` comments, and `#` comments inside version comments.
The exact MySQL 8.0.46 lexical treatment of these `*/`-inside-string/comment
forms was **not** independently verified without a database/parser runtime; the
sanitizer fails closed rather than claiming those forms are valid or invalid.
Valid single-level mysqldump trigger and view forms remain supported. Some valid
routine/view bodies containing comments or string literals with `*/` inside an
executable comment may therefore be rejected conservatively.

**Atomic publication and filesystem limits.** Publication requires hard-link
support in the destination directory. Local NTFS and POSIX filesystems support
it; network/overlay filesystems may not, in which case the command exits
non-zero and publishes nothing. On POSIX, files are created with mode `0600`.
On Windows/NTFS, POSIX mode bits are not ACLs: the file inherits the directory
ACL, so the destination must be placed in a directory with restrictive ACLs.
Directory `fsync` is best effort and is generally unavailable on Windows, so a
power loss immediately after a reported success may lose the directory entry.
For production drills, use a filesystem with verified hard-link and durability
behavior (preferably POSIX), and keep the output in a private directory.

**Orphan output is invalid.** The SQL and its manifest are published together;
if the manifest cannot be published, the SQL file created by that same run is
removed and the command fails. A process crash between the two publications can
leave a SQL file without a manifest. A crash after the hard link but before the
temporary name is removed can also leave a hidden `.tmp-*` hard link. **Such
files are invalid and must not be used or restored.** Recovery:

1. Confirm no `sanitize-definers` process is running.
2. Check that `<output>` exists while `<output>.manifest.json` does not, or that
   the manifest's `status` is not `complete`, its `output.verified` is not
   `true`, or its `output.sha256`/`output.bytes` do not match the file.
3. Delete only that orphan SQL file and any matching `.tmp-*` file, or re-run
   the tool with a **new** output path.
4. Never reuse or restore an artifact whose manifest is missing, whose
   `output.verified` is not `true`, or whose checksum does not match.

The tool never automatically deletes arbitrary files. It removes a temporary
path only when the exclusive open in the current invocation succeeded and the
current path still matches the owned device/inode identity. A pre-existing path
at the random temporary name is never treated as owned. Rollback and
verification-failure cleanup also compare identity and preserve a replacement
file if the replacement is present at the time of the identity check. Identity
checking and unlink are separate operations; a writer that replaces the path
**after** the check but before unlink can still have its replacement removed.
Node.js does not expose an atomic identity-conditioned unlink primitive, so this
residual check-then-unlink window cannot be eliminated with the current API.
Require restrictive ownership/permissions on the output directory and do not
run the sanitizer in a directory writable by untrusted users. Where the
platform/filesystem cannot provide a reliable inode identity, the tool fails
closed and leaves the file rather than deleting an unverified path. On Windows,
`lstat` may report a zero device while `fstat` reports a non-zero device for the
same file; the identity check treats a zero device as unavailable and uses the
file ID/inode. Filesystem file IDs/inodes can be reused after deletion, so a
replacement that receives the same identity is indistinguishable; identity
checking is best-effort ownership evidence, not an atomic or unique ownership
token.

**Manifest integrity is not authenticity.** The manifest is not signed. The
SHA-256 checksums detect accidental corruption and allow a consumer to verify
the artifact, but a writer with access to the directory can replace both the SQL
and the manifest. Consumers **must** recompute the sanitized SQL SHA-256 (and
byte size) and compare it with the manifest before use. No HMAC key or new
secret-management dependency is introduced by this tool.

**Input size, snapshot integrity, and memory.** The maximum input is `512 MiB`
(`DEFAULT_MAX_INPUT_BYTES`), rejected from the file metadata before reading.
The input is opened read-only with `O_NOFOLLOW` and, where supported, `O_NONBLOCK`;
the descriptor is verified with `fstat` to be a regular file. Reading is
bounded/chunked: the reader allocates a buffer from the opened-file size (plus
one byte, capped at `maxInputBytes + 1`) and never retains more than
`maxInputBytes + 1` bytes before rejecting an oversized or changed input. A
file that supplies more bytes than the opened size is rejected without reading
the entire growth; no buffer-growth reallocation is performed.

After reading, the tool rejects empty input, compares the number of bytes read
with the opened-file size, and rechecks `fstat` metadata (size, device/inode,
mtime, ctime). A changed or truncated input is rejected before parsing or
publication. Size/metadata checks cannot prove byte identity against a writer
that deliberately preserves metadata; they are a practical snapshot check, not
a cryptographic immutable-snapshot guarantee.

Symlink inputs are rejected by the `lstat` precheck and, where supported, by
`O_NOFOLLOW`. `O_NOFOLLOW` is not available on every platform (notably Windows);
on those platforms symlink-race protection is **unverified** and only the
`lstat` precheck applies. `O_NONBLOCK` prevents an indefinite block on a FIFO
where supported, but a path replaced by a FIFO/device between `lstat` and
`open` can still be opened before `fstat` rejects it; this residual path-race
limitation is not fully preventable with the current Node.js APIs. A path
replaced by a different regular file between `lstat` and `open` is read through
the verified descriptor; the tool does not compare the pre-open `lstat` identity
with the opened descriptor and therefore does not detect that substitution.
Descriptor-based reading prevents path replacement **after** open, subject to
the input file’s own content being stable.

**Memory requirements.** `512 MiB` (`DEFAULT_MAX_INPUT_BYTES`) is the input-file
limit, **not** a total process-memory limit. The file path retains the input
Buffer, a decoded input JavaScript string, and (when DEFINER clauses are removed)
one output Buffer. V8 may store the decoded string as one-byte or two-byte; a
two-byte string can be up to about 2× the input bytes for ASCII-heavy mixed
content. Verification is bounded: it uses 64 KiB `Buffer.subarray()` views,
decodes each chunk through `StringDecoder`, and retains at most a bounded guard
output and a CREATE header capped at 65,536 UTF-8 bytes. It does **not** create a
full-size verification string, a full-file chunking copy, or an expected-output
buffer. A CREATE statement near the beginning of a large file is no longer
mistaken for a header extending to the end of the chunk; the guard leaves the
remainder of the chunk as ordinary SQL.

Approximate retained-data peaks (excluding V8/allocator overhead):

| Input | No removals | With removals |
|---|---|---|
| ASCII | ~2× input (input + one-byte string; output reuses input) | ~3× input (input + string + output Buffer) |
| Multibyte UTF-8 | ~3× input (input + two-byte string) | ~3×–4× input (input + string + output Buffer, with representation/GC overhead) |

These are conservative estimates, **not guaranteed upper bounds**. V8 may use
one-byte or two-byte string representations, may flatten or copy strings, and
garbage collection is not deterministic; parser/span metadata, stream chunks,
manifest JSON, hashes, allocator overhead, and temporary slices add more. Plan
for roughly **2–3 GiB of available memory for a near-limit 512 MiB file**, and
more under memory pressure. `sanitizeSql()` is a direct string API and has a
different peak-memory profile than the file path.

The failure path is also bounded: an oversized CREATE header is rejected after
at most 65,536 UTF-8 header bytes; an attempt to add more is rejected without
exceeding that byte budget. The complete SQL body is never retained in the
header variable. This is not a constant-memory guarantee: the lexer still
accumulates a token until a delimiter, so a pathological single unquoted token
can grow token state beyond one chunk; the retained input and output Buffers are
also still in memory.

The streaming guard keeps a queue of segment references for post-header body
text. It no longer concatenates a header tail with the remaining large pending
string, avoiding that full-body copy. Direct guard callers still supply the
chunks that remain referenced until processed; current `sanitizeFile()` and
restore callers use bounded chunks, and direct callers should do the same for
predictable peak memory.

The default backend container is configured with
`BACKEND_MEM_LIMIT:-512M` in `docker-compose.yml`. That is not sufficient for
near-limit sanitizer input. Do not run near-limit sanitization inside the
default backend container; run it on a host/container with an appropriate
memory budget or use a lower input cap.

A reliable adaptive cap is not implemented. The sanitizer does not attempt to
infer container/cgroup available memory, because that limit is deployment
specific and does not account for V8 heap behavior, GC, allocator overhead, or
other processes. The internal `sanitizeFile({ maxInputBytes })` option can be
set by controlled callers, but the CLI has no lower-cap flag. A lower
configurable CLI cap (for example via an environment variable or
`--max-input-bytes`) is a future operational decision; it should not be an
arbitrary lower default. Until then, keep the 512 MiB cap, provision adequate
memory, and treat OOM as a documented operational limitation.

**Platform-specific test coverage.** POSIX permission, symlink, FIFO,
`O_NOFOLLOW`, and `O_NONBLOCK` tests are conditionally skipped on Windows or when
the platform cannot create the fixture. A skipped/no-op test is reported as
platform-unverified, not as evidence of protection. Windows does not expose
`O_NOFOLLOW`/`O_NONBLOCK`; POSIX behavior must be verified on a POSIX host.

**Security semantics:** removing a `DEFINER` clause makes MySQL assign the
account executing the `CREATE` — the **restore account** — as the definer.
Under `SQL SECURITY DEFINER`, restored views/triggers/routines/events will
therefore execute with the restore account's privileges. Original ownership and
security context are **not** preserved. The sanitized file is a sensitive
database export: keep it at `0600`, in a private directory, and delete it after
the drill according to policy.

Sanitization does **not** authorize a production restore. A controlled,
isolated restore drill (and the prerequisites in *Production restore is not
approved*) remains mandatory.

### Post-restore verification

```bash
# Quick row count sanity check
mysql -e "USE couritzon_v2; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM bookings;"

# Check recent data
mysql -e "USE couritzon_v2; SELECT MAX(created_at) FROM users;"
```

### Pre-restore safety backup

The Node restore engine does **not** create an automatic pre-restore backup.
Create one explicitly with `scripts/backup.sh` before restoring. Pre-restore
files produced by older shell restores (`backups/pre_restore_*.sql.gz`) remain
restorable through the same engine.

---

## Point-in-Time Recovery (PITR)

If binary logging (`log_bin`) is enabled on the MySQL server, you can recover to any point in time between backups.

### Prerequisites

```sql
-- Check if binary logs are enabled
SHOW VARIABLES LIKE 'log_bin';
-- List available binary logs
SHOW BINARY LOGS;
```

### Recovery steps

```bash
# 1. Restore the most recent full backup
./scripts/restore.sh --file backups/courtzon_courtzon_v2_20260624_010000.sql.gz

# 2. Apply binary logs from the backup time to the target time
mysqlbinlog --start-datetime="2026-06-24 01:00:00" \
            --stop-datetime="2026-06-24 14:30:00" \
            /var/lib/mysql/mysql-bin.000001 \
            /var/lib/mysql/mysql-bin.000002 \
  | mysql -u couritzon_backup -p couritzon_v2
```

### Finding the right binary log position

```bash
# Extract the GTID or position from the backup file header
head -n 50 couritzon_courtzon_v2_20260624_010000.sql | grep -i "GTID\|CHANGE MASTER\|POSITION"
```

---

## Disaster Recovery Procedure

### Scenario: Complete data loss

```bash
# 1. Ensure MySQL is running and the target database exists
mysql -e "CREATE DATABASE IF NOT EXISTS couritzon_v2"

# 2. Find the latest backup
LATEST=$(ls -t backups/courtzon_courtzon_v2_*.sql.gz | head -1)
echo "Restoring from: $LATEST"

# 3. Restore (explicit production target + destructive confirmation)
DB_USER=courtzon_migration DB_PASSWORD='…' \
  ./scripts/restore.sh --file "$LATEST" \
    --db couritzon_v2 --confirm-destructive=couritzon_v2

# 4. Apply any remaining binary logs (if available)
# See Point-in-Time Recovery section above

# 5. Verify application connectivity
curl -f http://localhost:3000/health
```

### Scenario: Corrupted backup

If the latest backup is corrupted, try the previous one:

```bash
ls -t backups/courtzon_courtzon_v2_*.sql.gz
# Pick the second-most-recent
./scripts/restore.sh --file backups/courtzon_courtzon_v2_20260623_010000.sql.gz
```

### Scenario: S3 remote backup needed

```bash
# Download the encrypted artifact and its checksum sidecar (key prefix: backups/)
aws s3 cp s3://<bucket>/backups/courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2 ./backups/
aws s3 cp s3://<bucket>/backups/courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2.sha256 ./backups/

# Verify the file against its sidecar before restoring
cd backups && sha256sum -c courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2.sha256 && cd ..

# Restore (the engine authenticates GCM before executing any SQL)
DB_USER=courtzon_migration DB_PASSWORD='…' \
  ./scripts/restore.sh --file backups/courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2
```

A matching sidecar proves file integrity only — it does not prove GCM authentication, gzip integrity, or a successful restore. The restore engine verifies GCM and gzip before it spawns MySQL.

---

## Testing Backups Regularly

Backups are only as good as their last successful restore test. Follow this schedule:

### Monthly restore drill

1. **Spin up a staging database** (or use a Docker MySQL container):

   ```bash
   docker run -d --name couritzon_staging \
     -e MYSQL_ROOT_PASSWORD=test \
     -e MYSQL_DATABASE=courtzon_v2_staging \
     -p 3308:3306 mysql:8
   ```

2. **Restore the latest backup** into staging:

   ```bash
   DB_HOST=localhost DB_PORT=3308 \
     DB_USER=courtzon_migration DB_PASSWORD='…' \
     ./scripts/restore.sh --file backups/courtzon_courtzon_v2_latest.sql.gz \
       --db couritzon_v2_staging --confirm-destructive=couritzon_v2_staging
   ```

3. **Run integrity checks**:

   ```bash
   # Check for expected tables
   DB_PORT=3308 mysql -u root -ptest couritzon_v2_staging -e "SHOW TABLES"

   # Validate row counts against known baselines
   DB_PORT=3308 mysql -u root -ptest couritzon_v2_staging -e "
     SELECT 'users' AS tbl, COUNT(*) FROM users
     UNION SELECT 'bookings', COUNT(*) FROM bookings
     UNION SELECT 'courts', COUNT(*) FROM courts"
   ```

4. **Clean up**:

   ```bash
   docker stop couritzon_staging && docker rm couritzon_staging
   ```

### Automated integrity check

The backup script already verifies file size. For deeper verification, extend the backup cron with:

```bash
# Test restore to a temporary database
mysql -e "CREATE DATABASE IF NOT EXISTS couritzon_v2_backup_test"
zcat backups/courtzon_courtzon_v2_20260624_010000.sql.gz \
  | mysql couritzon_v2_backup_test
mysql -e "DROP DATABASE couritzon_v2_backup_test"
```

---

## Monitoring Backup Success/Failure

### Logs

All backup results are written to `backups/backup.log`:

```
[2026-06-24 01:00:01] [INFO] Starting backup of database 'courtzon_v2' on localhost:3306
[2026-06-24 01:00:45] [INFO] Backup completed successfully: /opt/courtzon/backups/courtzon_courtzon_v2_20260624_010000.sql.gz (234.56 MB)
[2026-06-24 01:00:46] [INFO] Auto-rotation: removed 2 backup(s) older than 30 days
```

### Cron health check

The cron entry at `scripts/backup-cron.sh` runs daily at 01:00. To verify it's active:

```bash
crontab -l | grep backup
```

Configure email alerting on cron failure by adding `MAILTO` to the crontab:

```
MAILTO=admin@courtzon.com
0 1 * * * /opt/courtzon/scripts/backup-cron.sh
```

### Alerting (optional)

For production monitoring, check the backup age via a health endpoint or external monitoring (e.g., UptimeRobot, Grafana):

```bash
# Warn if the latest backup is older than 26 hours
LATEST=$(ls -t /opt/courtzon/backups/courtzon_courtzon_v2_*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ] || [ $(($(date +%s) - $(stat -c %Y "$LATEST"))) -gt 93600 ]; then
  echo "ALERT: No recent database backup found"
  exit 2
fi
```

### Prometheus / Grafana (optional)

If the `node_exporter` or a custom exporter is deployed, expose backup metrics:

- `courtzon_backup_success_timestamp_seconds` — last successful backup Unix timestamp
- `courtzon_backup_size_bytes` — last backup file size
- `courtzon_backup_age_seconds` — seconds since last backup

---

## Environment Variables

| Variable                  | Default          | Description                            |
| ------------------------- | ---------------- | -------------------------------------- |
| `DB_HOST`                 | `localhost`      | MySQL host (backup and restore)        |
| `DB_PORT`                 | `3306`           | MySQL port                             |
| `DB_NAME`                 | `courtzon_v3`    | Backup source database; **restore ignores it** (use `--db`) |
| `BACKUP_DIR`              | `cwd/backups` (`/app/backups` in Docker) | Directory for `.enc2` artifacts and sidecars |
| `DB_BACKUP_USER`          | production: **required**; non-production: `DB_USER`, then `courtzon_app` | Backup/dump user (read-only; **not** a restore credential). No default in production and no fallback to the application credentials |
| `DB_BACKUP_PASSWORD`      | *(empty)*        | Backup/dump password. Must be set together with `DB_BACKUP_USER` |
| `DB_USER`                 | *(required)*     | Restore account (no implicit `root`; use `courtzon_migration` or equivalent) |
| `DB_PASSWORD`             | *(required)*     | Restore password, passed via `MYSQL_PWD` only |
| `BACKUP_ENCRYPTION_KEY`   | *(empty)*        | **Required.** Exactly 64 hex characters; escrow it offline — losing it makes `.enc2` backups unrecoverable |
| `BACKUP_ENCRYPTION_FORMAT`| `gcm`            | Only `gcm` is supported; any other value fails closed |
| `BACKUP_RETENTION_COUNT`  | `30`             | Number of newest GCM backups kept (newest always preserved) |
| `BACKUP_RETENTION_DAYS`   | `0`              | Spare artifacts younger than D days; `0` disables the age rule |
| `BACKUP_MAX_BYTES`        | `68719476736` (64 GiB) | Streaming size ceiling |
| `BACKUP_REQUIRE_SIDECAR`  | `0`              | `"1"` = fail the job when the local SHA-256 sidecar cannot be written |
| `S3_BUCKET`               | *(empty)*        | Offsite bucket. All four `S3_*` credentials/endpoint must be set together |
| `S3_ACCESS_KEY`           | *(empty)*        | S3 access key                          |
| `S3_SECRET_KEY`           | *(empty)*        | S3 secret key                          |
| `S3_ENDPOINT`             | *(empty)*        | S3-compatible endpoint (e.g. R2)       |
| `S3_REGION`               | `auto`           | S3 region                              |
| `S3_REQUIRED`             | *(off)*          | `"1"` = a skipped/failed upload fails the job; `"0"` = local-only success |

> Offsite upload is **optional** unless `S3_REQUIRED=1`. Without `S3_*` configuration the job writes a local artifact only. The upload key prefix is `backups/<filename>`.
>
> If the artifact uploads but its **sidecar** upload fails, the job reports `s3: 'partial'`; with `S3_REQUIRED=1` that failure fails the job. The local artifact and its local sidecar are always retained.


---

## Files

| File                      | Purpose                           |
| ------------------------- | --------------------------------- |
| `scripts/backup.sh`       | Manual / cron database backup     |
| `scripts/backup-cron.sh`  | Production cron wrapper (Hostinger)|
| `scripts/restore.sh`      | Compatibility wrapper → `backend/scripts/restore.js` |
| `backend/scripts/restore.js` | The single restore engine (GCM, legacy CBC, plaintext) |
| `backups/`                | Local backup storage directory     |
| `backups/backup.log`      | Backup operation logs              |
| `backups/restore.log`     | Logs from older shell restore versions (no longer written by the Node engine) |
