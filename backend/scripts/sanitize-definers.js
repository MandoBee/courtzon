#!/usr/bin/env node
// ============================================================================
// CourtZon — parser-aware DEFINER sanitizer (standalone, offline)
//
// Produces a separate, sanitized copy of a plaintext SQL dump by removing only
// executable DEFINER clauses from supported CREATE statements. The original
// artifact is never modified. The restore engine stays fail-closed: the output
// is verified with the same DEFINER detector used by backend/scripts/restore.js
// and is refused if any executable DEFINER remains.
//
// SAFETY: this tool never connects to a database, never imports SQL, never
// invokes the restore engine, and never logs SQL contents.
// ============================================================================
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { isUtf8 } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  classifyCreateHeader,
  createDefinerGuard,
  RestoreDefinerHeaderIncompleteError,
  RestoreDefinerHeaderOversizeError,
  RestoreDefinerTruncatedError,
  utf8PrefixEnd,
} from './restore.js';

export const SANITIZER_VERSION = '1.0.0';
export const MANIFEST_SCHEMA = 'courtzon.definer-sanitizer.manifest';
export const MANIFEST_VERSION = 1;
export const DEFAULT_MAX_INPUT_BYTES = 512 * 1024 * 1024;

const HEADER_LIMIT = 64 * 1024; // UTF-8 bytes, not UTF-16 code units
const SUPPORTED_OBJECTS = new Set(['trigger', 'procedure', 'function', 'event', 'view']);
const OWNERSHIP_WARNING =
  'Removing a DEFINER clause makes MySQL assign the account executing CREATE as the ' +
  'definer. Under SQL SECURITY DEFINER, sanitized objects will therefore execute with ' +
  "the restore account's privileges; the original definer identity and security context " +
  'are NOT preserved.';

export class SanitizerError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'SanitizerError';
  }
}

export class SanitizerUsageError extends SanitizerError {
  constructor(message) {
    super(message);
    this.name = 'SanitizerUsageError';
  }
}

/** Last identifier token in a CREATE header (the object keyword). */
function lastIdentifier(text) {
  const match = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(text);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Slice a bounded CREATE-header window by UTF-8 bytes without splitting a
 * decoded Unicode character. The extra character in the window lets the
 * classifier observe the exact boundary; utf8PrefixEnd() then trims to bytes.
 */
function boundedHeaderWindow(sql, start, maxBytes) {
  let end = Math.min(start + maxBytes + 1, sql.length);
  if (end < sql.length) {
    const previous = sql.charCodeAt(end - 1);
    if (previous >= 0xD800 && previous <= 0xDBFF) end -= 1;
  }
  const window = sql.slice(start, end);
  const prefixEnd = utf8PrefixEnd(window, maxBytes);
  return {
    header: window.slice(0, prefixEnd),
    truncated: prefixEnd < window.length || end < sql.length,
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute the removal span for a DEFINER clause.
 *
 * When the clause sits alone inside a MySQL executable version comment
 * (`/*!50017 DEFINER=...*\\/`), the whole comment is removed. Otherwise only
 * the clause is removed, together with one adjacent whitespace run.
 */
function buildRemovalSpan(sql, start, end, insideVersion, versionOpen) {
  if (
    insideVersion &&
    Number.isInteger(versionOpen) &&
    versionOpen >= 0 &&
    versionOpen < start &&
    sql.startsWith('/*!', versionOpen)
  ) {
    const close = sql.indexOf('*/', end);
    if (close >= 0) {
      const body = sql.slice(versionOpen + 3, close).replace(/^\d*\s*/, '');
      const clause = sql.slice(start, end);
      if (body.trim() === clause.trim()) {
        return { start: versionOpen, end: close + 2, closesVersion: true };
      }
    }
  }

  let from = start;
  let to = end;
  while (from > 0 && /[ \t\r\n]/.test(sql[from - 1])) from -= 1;
  if (from === start) {
    while (to < sql.length && /[ \t\r\n]/.test(sql[to])) to += 1;
  }
  return { start: from, end: to, closesVersion: false };
}

/**
 * Scan executable SQL (including the inside of MySQL version comments) for
 * CREATE headers carrying a DEFINER clause. Returns the removal spans and the
 * per-object-type transformation counts. Fails closed on ambiguity.
 */
export function planDefinerRemovals(sql) {
  if (typeof sql !== 'string') {
    throw new SanitizerError('Input must be text');
  }

  const edits = [];
  const transformed = { trigger: 0, procedure: 0, function: 0, event: 0, view: 0 };
  let index = 0;
  let mode = 'code';
  let quoteReturn = 'code';
  let lineReturn = 'code';
  let blockReturn = 'code';
  let token = '';
  let tokenStart = -1;
  let lastSignificantChar = '';
  let activeVersionOpen = -1;

  const resetToken = () => {
    token = '';
    tokenStart = -1;
  };

  while (index < sql.length) {
    const ch = sql[index];

    if (mode === 'single' || mode === 'double' || mode === 'backtick') {
      const quote = mode === 'single' ? "'" : mode === 'double' ? '"' : '`';
      if (quoteReturn === 'version' && ch === '*' && sql[index + 1] === '/') {
        throw new SanitizerError(
          'A comment terminator inside a quoted value in a version comment is ambiguous; refusing to transform.',
        );
      }
      if (ch === '\\' && mode !== 'backtick') {
        index += 2;
        continue;
      }
      if (ch === quote) {
        if (sql[index + 1] === quote) {
          index += 2;
          continue;
        }
        mode = quoteReturn;
      }
      index += 1;
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') mode = lineReturn;
      index += 1;
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && sql[index + 1] === '/') {
        mode = blockReturn;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(ch)) {
      if (token === '') tokenStart = index;
      token += ch;
      index += 1;
      continue;
    }

    if (token) {
      const create = token.toUpperCase() === 'CREATE';
      if (create && lastSignificantChar !== '@' && lastSignificantChar !== '.') {
        lastSignificantChar = '';
        const headerWindow = boundedHeaderWindow(sql, tokenStart, HEADER_LIMIT);
        const { header } = headerWindow;
        const decision = classifyCreateHeader(header, HEADER_LIMIT, mode);
        const resumeMode = decision.insideVersion === true ? 'version' : 'code';

        if (decision.status === 'definer') {
          if (typeof decision.start !== 'number' || typeof decision.end !== 'number') {
            throw new SanitizerError(
              'A DEFINER clause could not be parsed safely (malformed or ambiguous); refusing to transform.',
            );
          }

          const absoluteStart = tokenStart + decision.start;
          const absoluteEnd = tokenStart + decision.end;
          const versionOpen = decision.insideVersion === true
            ? (Number.isInteger(decision.versionOpen) && decision.versionOpen >= 0
              ? tokenStart + decision.versionOpen
              : activeVersionOpen)
            : -1;
          if (decision.insideVersion === true && (!Number.isInteger(versionOpen) || versionOpen < 0)) {
            throw new SanitizerError(
              'The active version-comment opener could not be identified; refusing to transform.',
            );
          }
          const span = buildRemovalSpan(
            sql,
            absoluteStart,
            absoluteEnd,
            decision.insideVersion === true,
            versionOpen,
          );
          edits.push({ start: span.start, end: span.end });

          const spliced = header.slice(0, decision.start) + header.slice(decision.end);
          const objectDecision = classifyCreateHeader(spliced, HEADER_LIMIT, mode);
          if (objectDecision.status !== 'object') {
            throw new SanitizerError(
              'Cannot determine the object type of a DEFINER statement; refusing to transform.',
            );
          }
          const kind = lastIdentifier(spliced.slice(0, objectDecision.end));
          if (!SUPPORTED_OBJECTS.has(kind)) {
            throw new SanitizerError(
              `Unsupported object type "${kind || 'unknown'}" with a DEFINER clause; refusing to transform.`,
            );
          }
          if (decision.requiresView === true && kind !== 'view') {
            throw new SanitizerError(
              'SQL SECURITY DEFINER after DEFINER is only valid for VIEW statements; refusing to transform.',
            );
          }
          transformed[kind] += 1;

          index = span.end;
          // Removing a complete version comment also removes its closing `*/`;
          // resume in code mode so the lexer does not carry stale version state.
          if (span.closesVersion) {
            activeVersionOpen = -1;
            mode = 'code';
          } else {
            mode = resumeMode;
          }
          resetToken();
          continue;
        }

        if (decision.status === 'object') {
          if (decision.insideVersion === true && Number.isInteger(decision.versionOpen) && decision.versionOpen >= 0) {
            activeVersionOpen = tokenStart + decision.versionOpen;
          }
          index = tokenStart + decision.end;
          mode = resumeMode;
          resetToken();
          continue;
        }

        if (decision.status === 'terminated') {
          index = tokenStart + token.length;
          resetToken();
          continue;
        }

        if (decision.status === 'oversize') {
          throw new SanitizerError(
            'The CREATE header exceeds the 65,536-byte limit; refusing to transform.',
          );
        }

        if (decision.status === 'incomplete') {
          if (headerWindow.truncated) {
            throw new SanitizerError(
              'The CREATE header exceeds the 65,536-byte limit; refusing to transform.',
            );
          }
          throw new SanitizerError('The CREATE header is incomplete; refusing to transform.');
        }

        throw new SanitizerError(
          'An unrecognised CREATE header was encountered; refusing to transform.',
        );
      }
      lastSignificantChar = token[token.length - 1] ?? lastSignificantChar;
      resetToken();
    }

    if (mode === 'version' && ch === '*' && sql[index + 1] === '/') {
      mode = 'code';
      activeVersionOpen = -1;
      index += 2;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      lastSignificantChar = ch;
      quoteReturn = mode;
      mode = ch === "'" ? 'single' : ch === '"' ? 'double' : 'backtick';
      index += 1;
      continue;
    }
    if (ch === '-' && sql[index + 1] === '-') {
      if (mode === 'version') {
        throw new SanitizerError(
          'A line comment inside a version comment is ambiguous; refusing to transform.',
        );
      }
      lastSignificantChar = '-';
      lineReturn = mode;
      mode = 'line';
      index += 2;
      continue;
    }
    if (ch === '#') {
      if (mode === 'version') {
        throw new SanitizerError(
          'A line comment inside a version comment is ambiguous; refusing to transform.',
        );
      }
      lastSignificantChar = '#';
      lineReturn = mode;
      mode = 'line';
      index += 1;
      continue;
    }
    if (ch === '/' && sql[index + 1] === '*') {
      lastSignificantChar = '/';
      if (sql[index + 2] === '!') {
        if (mode === 'version') {
          throw new SanitizerError(
            'A nested executable comment was encountered; refusing to transform.',
          );
        }
        activeVersionOpen = index;
        mode = 'version';
        index += 3;
      } else {
        if (mode === 'version') {
          throw new SanitizerError(
            'An ordinary comment inside a version comment is ambiguous; refusing to transform.',
          );
        }
        blockReturn = mode;
        mode = 'block';
        index += 2;
      }
      continue;
    }
    if (!/\s/.test(ch)) lastSignificantChar = ch;
    index += 1;
  }

  if (token && token.toUpperCase() === 'CREATE') {
    throw new SanitizerError('The input ends inside a CREATE header; refusing to transform.');
  }

  // An unterminated string or block/version comment makes the dump malformed;
  // transforming it could leave a partially executable artifact.
  if (mode === 'version' || mode === 'block' || mode === 'single' || mode === 'double' || mode === 'backtick') {
    throw new SanitizerError(
      'The input ends inside a quoted string or comment; refusing to transform.',
    );
  }

  return { edits, transformed };
}

/**
 * Validate and apply removal spans. Sorting is part of the contract; every
 * offset must be a safe integer inside the input, spans must be non-empty, and
 * overlaps are rejected. Offsets are never clamped.
 */
export function applyRemovals(sql, edits) {
  if (typeof sql !== 'string') {
    throw new SanitizerError('Input must be text');
  }
  if (!Array.isArray(edits)) {
    throw new SanitizerError('Removal spans must be an array');
  }

  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let lastEnd = 0;
  for (const edit of sorted) {
    if (
      !edit ||
      !Number.isSafeInteger(edit.start) ||
      !Number.isSafeInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < 0 ||
      edit.start >= sql.length ||
      edit.end > sql.length
    ) {
      throw new SanitizerError('Invalid DEFINER removal span; refusing to transform.');
    }
    if (edit.end <= edit.start) {
      throw new SanitizerError('Empty DEFINER removal span; refusing to transform.');
    }
    if (edit.start < lastEnd) {
      throw new SanitizerError('Overlapping DEFINER removal spans; refusing to transform.');
    }
    lastEnd = edit.end;
  }

  let output = sql;
  for (let position = sorted.length - 1; position >= 0; position -= 1) {
    output = output.slice(0, sorted[position].start) + output.slice(sorted[position].end);
  }
  return output;
}

const VERIFICATION_CHUNK_SIZE = 64 * 1024;

/**
 * Yield bounded views over an existing Buffer. subarray() does not copy the
 * underlying bytes; the guard's StringDecoder handles UTF-8 code points split
 * across chunk boundaries.
 */
function* byteChunks(bytes, chunkSize = VERIFICATION_CHUNK_SIZE) {
  for (let start = 0; start < bytes.length; start += chunkSize) {
    yield bytes.subarray(start, Math.min(start + chunkSize, bytes.length));
  }
}

/**
 * Yield bounded UTF-8 chunks without creating one full-size Buffer. Keep
 * surrogate pairs in the same chunk so each chunk encodes without replacement.
 */
function* utf8Chunks(text) {
  const chunkCharacters = VERIFICATION_CHUNK_SIZE;
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkCharacters, text.length);
    if (end < text.length) {
      const previous = text.charCodeAt(end - 1);
      if (previous >= 0xD800 && previous <= 0xDBFF) end -= 1;
    }
    yield Buffer.from(text.slice(start, end), 'utf8');
    start = end;
  }
}

async function verifySanitizedChunks(chunks) {
  const counts = { trigger: 0, procedure: 0, function: 0, event: 0, view: 0 };
  const guard = createDefinerGuard({
    onObjectKind(kind) {
      if (Object.prototype.hasOwnProperty.call(counts, kind)) counts[kind] += 1;
    },
  });
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  try {
    await pipeline(Readable.from(chunks), guard, sink);
  } catch (error) {
    if (error instanceof RestoreDefinerHeaderOversizeError) {
      throw new SanitizerError(
        'The sanitized output contains a CREATE header larger than the supported limit; refusing to publish.',
        { cause: error },
      );
    }
    if (error instanceof RestoreDefinerHeaderIncompleteError) {
      throw new SanitizerError(
        'The sanitized output ended inside an incomplete CREATE header; refusing to publish.',
        { cause: error },
      );
    }
    if (error instanceof RestoreDefinerTruncatedError) {
      throw new SanitizerError(
        'The sanitized output ended inside a quoted string or comment; refusing to publish.',
        { cause: error },
      );
    }
    throw new SanitizerError(
      'The sanitized output still contains executable DEFINER metadata; refusing to publish.',
      { cause: error },
    );
  }
  return counts;
}

/**
 * Verify transformed text with the restore engine's own DEFINER detector.
 * Throws (wrapped) if any executable DEFINER remains in a supported CREATE
 * header. Standalone DEFINER text outside a CREATE header is outside this
 * verification scope and is not transformed.
 */
export async function verifySanitizedSql(sql) {
  return verifySanitizedChunks(utf8Chunks(sql));
}

/**
 * Verify an already-encoded sanitized Buffer without decoding it as one
 * full-size string. The guard receives bounded byte views and maintains UTF-8
 * decoder state across chunk boundaries.
 *
 * Exported for the file-path regression suite; production callers should use
 * sanitizeFile().
 */
export async function verifySanitizedBytes(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new SanitizerError('Sanitized output must be a Buffer.');
  }
  return verifySanitizedChunks(byteChunks(bytes));
}

/**
 * Verify that decoding/re-encoding the input is byte-identical without
 * allocating another full-size Buffer. Chunks are bounded by utf8Chunks().
 */
function assertUtf8RoundTrip(inputBytes, sql) {
  let offset = 0;
  for (const chunk of utf8Chunks(sql)) {
    if (
      offset + chunk.length > inputBytes.length ||
      !chunk.equals(inputBytes.subarray(offset, offset + chunk.length))
    ) {
      throw new SanitizerError('Input bytes do not round-trip as UTF-8; refusing to transform.');
    }
    offset += chunk.length;
  }
  if (offset !== inputBytes.length) {
    throw new SanitizerError('Input bytes do not round-trip as UTF-8; refusing to transform.');
  }
}

/** Pure text-to-text transformation, verified before returning. */
export async function sanitizeSql(sql) {
  const { edits, transformed } = planDefinerRemovals(sql);
  const sanitized = applyRemovals(sql, edits);
  const encountered = await verifySanitizedSql(sanitized);
  return { sanitized, edits, transformed, encountered };
}

function assertPublishPath(targetPath, label) {
  let stats;
  try {
    stats = lstatSync(targetPath);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return;
    throw new SanitizerError(`Cannot inspect ${label} target: ${error.code ?? 'error'}`);
  }
  if (stats.isSymbolicLink()) {
    throw new SanitizerError(`Refusing to write ${label} through a symbolic link.`);
  }
  throw new SanitizerError(`Refusing to overwrite an existing ${label}.`);
}

/** SHA-256 and byte count of a file, read in bounded chunks. */
function hashFileSync(filePath, io) {
  const descriptor = io.openSync(filePath, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  try {
    for (;;) {
      const read = io.readSync(descriptor, buffer, 0, buffer.length, bytes);
      if (!Number.isSafeInteger(read) || read < 0) {
        throw new SanitizerError('Invalid read while verifying a published artifact.');
      }
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
      bytes += read;
    }
  } finally {
    try { io.closeSync(descriptor); } catch { /* best effort */ }
  }
  return { sha256: hash.digest('hex'), bytes };
}

/** Verify the actual published path, not the intended in-memory buffer. */
function verifyPublishedFile(targetPath, expectedBytes, expectedSha256, io) {
  const stats = io.lstatSync(targetPath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new SanitizerError('Published artifact is not a regular file.');
  }
  if (stats.size !== expectedBytes.length) {
    throw new SanitizerError('Published artifact size does not match the intended output.');
  }
  const actual = hashFileSync(targetPath, io);
  if (actual.bytes !== expectedBytes.length || actual.sha256 !== expectedSha256) {
    throw new SanitizerError('Published artifact SHA-256 does not match the intended output.');
  }
}

/** True when the platform/filesystem provides usable device/inode identity. */
function hasReliableIdentity(stats) {
  if (!stats) return false;
  const devOk = typeof stats.dev === 'bigint' || Number.isSafeInteger(stats.dev);
  const inoOk =
    typeof stats.ino === 'bigint'
      ? stats.ino !== 0n
      : Number.isSafeInteger(stats.ino) && stats.ino !== 0;
  return devOk && inoOk;
}

function identityOf(stats) {
  return { dev: stats.dev, ino: stats.ino };
}

function identitiesMatch(left, right) {
  if (!hasReliableIdentity(left) || !hasReliableIdentity(right)) return false;
  if (left.ino !== right.ino) return false;
  if (left.dev === right.dev) return true;
  // Windows reports a non-zero dev from fstat but 0 from lstat for the same
  // file. Treat a zero device on either side as "device unavailable" and rely
  // on the inode/file-id comparison.
  return left.dev === 0 || left.dev === 0n || right.dev === 0 || right.dev === 0n;
}

/** True only when targetPath still names the inode created by this invocation. */
function matchesIdentity(targetPath, identity, io) {
  if (!hasReliableIdentity(identity)) {
    return false;
  }
  try {
    const stats = io.lstatSync(targetPath, { bigint: true });
    return stats.isFile() && identitiesMatch(stats, identity);
  } catch {
    return false;
  }
}

/**
 * Publish a file without ever overwriting an existing path or exposing a
 * partial destination.
 *
 * The only accepted publication primitive is an atomic hard link from a
 * fully-written, fsynced temporary file in the same directory. The linked
 * destination is then reopened and verified by size and SHA-256 before the
 * caller is allowed to publish a manifest. If the filesystem cannot provide an
 * atomic no-overwrite link, publication fails closed; there is no copy/rename
 * fallback that could leave a partial artifact.
 *
 * Returns the device/inode identity of the published file so callers can avoid
 * deleting a replacement introduced by a hostile directory writer.
 */
export function publishExclusive(targetPath, data, expectedSha256, hooks = {}) {
  if (!Buffer.isBuffer(data)) {
    throw new SanitizerError('Publication data must be a Buffer.');
  }
  const expectedDigest = expectedSha256 ?? sha256(data);
  const directory = dirname(targetPath);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new SanitizerError(`Output directory does not exist: ${basename(directory)}`);
  }

  const io = {
    openSync,
    closeSync,
    writeSync,
    fsyncSync,
    linkSync,
    unlinkSync,
    lstatSync,
    fstatSync,
    readSync,
    ...hooks,
  };

  const temporary = join(
    directory,
    `.${basename(targetPath)}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`,
  );

  let descriptor = -1;
  let temporaryCreated = false;
  let temporaryIdentity = null;
  try {
    descriptor = io.openSync(temporary, 'wx', 0o600);
    temporaryCreated = true;

    let openedStats;
    try {
      openedStats = io.fstatSync(descriptor, { bigint: true });
    } catch {
      throw new SanitizerError('Temporary file identity could not be established; refusing to publish.');
    }
    if (!openedStats.isFile() || !hasReliableIdentity(openedStats)) {
      throw new SanitizerError('Temporary file identity could not be established; refusing to publish.');
    }
    temporaryIdentity = identityOf(openedStats);

    let offset = 0;
    while (offset < data.length) {
      const remaining = data.length - offset;
      const written = io.writeSync(descriptor, data, offset, remaining);
      if (!Number.isSafeInteger(written) || written <= 0 || written > remaining) {
        throw new SanitizerError(
          'A short or invalid write occurred while publishing the sanitized artifact; refusing to publish.',
        );
      }
      offset += written;
    }

    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = -1;

    try {
      io.linkSync(temporary, targetPath);
    } catch (linkError) {
      if (linkError && linkError.code === 'EEXIST') {
        throw new SanitizerError(`Refusing to overwrite an existing ${basename(targetPath)}.`);
      }
      throw new SanitizerError(
        `The filesystem cannot guarantee atomic no-overwrite publication for ${basename(targetPath)} ` +
          `(${linkError?.code ?? 'unknown error'}); refusing to publish. ` +
          'Use a filesystem that supports hard links (for example, a local NTFS or POSIX filesystem).',
      );
    }

    try {
      verifyPublishedFile(targetPath, data, expectedDigest, io);
    } catch (verificationError) {
      if (matchesIdentity(targetPath, temporaryIdentity, io)) {
        try { io.unlinkSync(targetPath); } catch { /* best effort */ }
      }
      throw new SanitizerError(
        `The published ${basename(targetPath)} failed size/SHA-256 verification; refusing to continue.`,
        { cause: verificationError },
      );
    }

    // The link is published and verified; the temporary name only references
    // the same inode.
    if (matchesIdentity(temporary, temporaryIdentity, io)) {
      try {
        io.unlinkSync(temporary);
        temporaryCreated = false;
      } catch {
        /* best effort; finally retries only if this invocation owns the file */
      }
    }
    try {
      (hooks.fsyncDirectory ?? fsyncDirectory)(directory);
    } catch {
      /* directory fsync is best effort on platforms that do not support it */
    }
  } finally {
    if (descriptor >= 0) {
      try { io.closeSync(descriptor); } catch { /* ignore */ }
    }
    if (temporaryCreated && matchesIdentity(temporary, temporaryIdentity, io)) {
      try { io.unlinkSync(temporary); } catch { /* best effort */ }
    }
  }

  return { identity: temporaryIdentity };
}

/** Best-effort directory fsync: unsupported platforms simply skip it. */
function fsyncDirectory(directory) {
  let descriptor = -1;
  try {
    descriptor = openSync(directory, 'r');
    fsyncSync(descriptor);
  } catch {
    /* not supported on every platform/filesystem */
  } finally {
    if (descriptor >= 0) {
      try { closeSync(descriptor); } catch { /* ignore */ }
    }
  }
}

function assertDistinctPaths(inputPath, outputPath, manifestPath) {
  if (inputPath === outputPath) {
    throw new SanitizerUsageError('Input and output paths must differ.');
  }
  if (manifestPath === inputPath || manifestPath === outputPath) {
    throw new SanitizerUsageError('The manifest path must differ from input and output paths.');
  }
}

function utf8ByteLengthRange(text, start, end) {
  let bytes = 0;
  let index = start;
  while (index < end) {
    const codePoint = text.codePointAt(index);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
    index += codePoint > 0xffff ? 2 : 1;
  }
  return bytes;
}

function validateRemovalEdits(sql, edits) {
  if (!Array.isArray(edits)) {
    throw new SanitizerError('Removal spans must be an array');
  }
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let lastEnd = 0;
  for (const edit of sorted) {
    if (
      !edit ||
      !Number.isSafeInteger(edit.start) ||
      !Number.isSafeInteger(edit.end) ||
      edit.start < 0 ||
      edit.start < lastEnd ||
      edit.start >= edit.end ||
      edit.end > sql.length
    ) {
      throw new SanitizerError('Invalid DEFINER removal span; refusing to transform.');
    }
    lastEnd = edit.end;
  }
  return sorted;
}

/**
 * Build the exact output bytes by copying original input byte ranges around the
 * approved removal spans. This avoids a second full-size "expected output"
 * buffer while proving that bytes outside spans are unchanged.
 */
export function removeSpansToBuffer(inputBytes, sql, edits) {
  if (!Buffer.isBuffer(inputBytes)) {
    throw new SanitizerError('Input bytes must be a Buffer.');
  }
  if (typeof sql !== 'string') {
    throw new SanitizerError('Input must be text');
  }
  const sorted = validateRemovalEdits(sql, edits);
  if (sorted.length === 0) return inputBytes;

  let characterCursor = 0;
  let inputByteCursor = 0;
  let removedBytes = 0;
  for (const edit of sorted) {
    const gapBytes = utf8ByteLengthRange(sql, characterCursor, edit.start);
    const removed = utf8ByteLengthRange(sql, edit.start, edit.end);
    inputByteCursor += gapBytes + removed;
    if (inputByteCursor > inputBytes.length) {
      throw new SanitizerError('Invalid DEFINER removal span; refusing to transform.');
    }
    removedBytes += removed;
    characterCursor = edit.end;
  }
  const tailBytes = utf8ByteLengthRange(sql, characterCursor, sql.length);
  if (inputByteCursor + tailBytes !== inputBytes.length) {
    throw new SanitizerError('Invalid DEFINER removal span; refusing to transform.');
  }

  const output = Buffer.allocUnsafe(inputBytes.length - removedBytes);
  let inputOffset = 0;
  let outputOffset = 0;
  characterCursor = 0;
  for (const edit of sorted) {
    const gapBytes = utf8ByteLengthRange(sql, characterCursor, edit.start);
    if (gapBytes > 0) {
      inputBytes.copy(output, outputOffset, inputOffset, inputOffset + gapBytes);
      inputOffset += gapBytes;
      outputOffset += gapBytes;
    }
    inputOffset += utf8ByteLengthRange(sql, edit.start, edit.end);
    characterCursor = edit.end;
  }
  const tail = utf8ByteLengthRange(sql, characterCursor, sql.length);
  if (tail > 0) {
    inputBytes.copy(output, outputOffset, inputOffset, inputOffset + tail);
  }
  return output;
}

/**
 * Compatibility wrapper for callers/tests that need the exact output bytes.
 * Delegates to removeSpansToBuffer(), which avoids the intermediate full-size
 * chunk concatenation and reuses the input buffer when no spans are removed.
 */
export function removeSpansFromBuffer(inputBytes, sql, edits) {
  return removeSpansToBuffer(inputBytes, sql, edits);
}

/**
 * Sanitize a plaintext SQL file into a new output file plus a JSON manifest.
 * The input is only ever read.
 */
export async function sanitizeFile(options) {
  const {
    inputPath,
    outputPath,
    manifestPath,
    maxInputBytes = DEFAULT_MAX_INPUT_BYTES,
    publishHooks = {},
    rollbackUnlink = unlinkSync,
    inputIo = {},
  } = options ?? {};

  if (typeof inputPath !== 'string' || inputPath === '') {
    throw new SanitizerUsageError('--input is required.');
  }
  if (typeof outputPath !== 'string' || outputPath === '') {
    throw new SanitizerUsageError('--output is required.');
  }

  const resolvedInput = resolve(inputPath);
  const resolvedOutput = resolve(outputPath);
  const resolvedManifest = resolve(manifestPath ?? `${resolvedOutput}.manifest.json`);
  const fileIo = { openSync, fstatSync, readSync, closeSync, ...inputIo };

  assertDistinctPaths(resolvedInput, resolvedOutput, resolvedManifest);
  assertPublishPath(resolvedOutput, 'output');
  assertPublishPath(resolvedManifest, 'manifest');

  let inputStats;
  try {
    inputStats = lstatSync(resolvedInput);
  } catch {
    throw new SanitizerError('Input file does not exist.');
  }
  if (!inputStats.isFile()) {
    throw new SanitizerError('Input must be a regular file.');
  }
  if (inputStats.size === 0) {
    throw new SanitizerError('Input file is empty.');
  }
  if (!Number.isSafeInteger(maxInputBytes) || inputStats.size > maxInputBytes) {
    throw new SanitizerError('Input file exceeds the configured maximum size.');
  }

  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  const nonBlock = typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0;
  let descriptor = -1;
  let inputBytes;
  try {
    try {
      descriptor = fileIo.openSync(
        resolvedInput,
        fsConstants.O_RDONLY | noFollow | nonBlock,
      );
    } catch (error) {
      if (error?.code === 'ELOOP') {
        throw new SanitizerError('Input must not be a symbolic link.');
      }
      if (error?.code === 'ENOENT') {
        throw new SanitizerError('Input file does not exist.');
      }
      throw new SanitizerError('Input file could not be opened safely.');
    }

    let openedStats;
    try {
      openedStats = fileIo.fstatSync(descriptor);
    } catch {
      throw new SanitizerError('Input file could not be inspected safely.');
    }
    if (!openedStats.isFile()) {
      throw new SanitizerError('Input must be a regular file.');
    }
    if (openedStats.size === 0) {
      throw new SanitizerError('Input file is empty.');
    }
    if (!Number.isSafeInteger(openedStats.size) || !Number.isSafeInteger(maxInputBytes) || openedStats.size > maxInputBytes) {
      throw new SanitizerError('Input file exceeds the configured maximum size.');
    }

    const maxReadBytes = maxInputBytes + 1;
    const buffer = Buffer.alloc(Math.min(openedStats.size + 1, maxReadBytes));
    let total = 0;

    while (total < buffer.length) {
      const remaining = buffer.length - total;
      const readSize = Math.min(remaining, 64 * 1024);
      let bytesRead;
      try {
        bytesRead = fileIo.readSync(descriptor, buffer, total, readSize, total);
      } catch {
        throw new SanitizerError('Input file could not be read safely.');
      }
      if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > readSize) {
        throw new SanitizerError('Input file could not be read safely.');
      }
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxInputBytes) {
        throw new SanitizerError('Input file exceeds the configured maximum size.');
      }
    }

    // A full buffer means the file supplied more bytes than its opened size
    // (or than the limit). It changed while being read; fail closed.
    if (total === buffer.length && total <= maxInputBytes) {
      throw new SanitizerError('Input changed while being read; refusing to transform.');
    }

    if (total === 0) {
      throw new SanitizerError('Input file is empty.');
    }

    let finalStats;
    try {
      finalStats = fileIo.fstatSync(descriptor);
    } catch {
      throw new SanitizerError('Input file could not be inspected safely.');
    }
    if (
      !finalStats.isFile() ||
      finalStats.size !== openedStats.size ||
      finalStats.dev !== openedStats.dev ||
      finalStats.ino !== openedStats.ino ||
      finalStats.mtimeMs !== openedStats.mtimeMs ||
      finalStats.ctimeMs !== openedStats.ctimeMs
    ) {
      throw new SanitizerError('Input changed while being read; refusing to transform.');
    }
    if (total !== openedStats.size) {
      throw new SanitizerError('Input changed while being read; refusing to transform.');
    }

    inputBytes = total === buffer.length ? buffer : buffer.subarray(0, total);
  } finally {
    if (descriptor >= 0) {
      try { fileIo.closeSync(descriptor); } catch { /* best effort */ }
    }
  }

  if (!isUtf8(inputBytes)) {
    throw new SanitizerError('Input is not valid UTF-8; refusing to transform.');
  }
  if (inputBytes.includes(0)) {
    throw new SanitizerError('Input contains NUL bytes and is not valid SQL text.');
  }

  const sql = inputBytes.toString('utf8');
  assertUtf8RoundTrip(inputBytes, sql);
  const originalSha256 = sha256(inputBytes);

  const { edits, transformed } = planDefinerRemovals(sql);
  const sanitizedBytes = removeSpansToBuffer(inputBytes, sql, edits);
  const encountered = await verifySanitizedBytes(sanitizedBytes);

  // Publication order: SQL first, manifest second. If the manifest fails, the
  // just-published SQL is removed so no artifact can appear without a manifest.
  const manifest = {
    schema: MANIFEST_SCHEMA,
    manifestVersion: MANIFEST_VERSION,
    sanitizerVersion: SANITIZER_VERSION,
    createdAt: new Date().toISOString(),
    input: {
      file: basename(resolvedInput),
      sha256: originalSha256,
      bytes: inputBytes.length,
      encoding: 'utf-8',
    },
    output: {
      file: basename(resolvedOutput),
      sha256: sha256(sanitizedBytes),
      bytes: sanitizedBytes.length,
      verified: false,
    },
    definersRemoved: edits.length,
    objectTypesEncountered: Object.keys(encountered).filter((kind) => encountered[kind] > 0).sort(),
    objectsTransformed: Object.fromEntries(
      Object.entries(transformed).filter(([, count]) => count > 0),
    ),
    scope: 'supported CREATE statements (TRIGGER, PROCEDURE, FUNCTION, EVENT, VIEW)',
    verificationScope:
      'DEFINER clauses in supported CREATE headers; standalone executable DEFINER outside a CREATE header is not scanned',
    authenticity: {
      signed: false,
      note:
        'SHA-256 checksums detect accidental corruption, not deliberate replacement. A writer with ' +
        'directory access can replace both artifacts; recompute output.sha256 before use.',
    },
    status: 'complete',
    warning: OWNERSHIP_WARNING,
  };

  // The output is verified from the actual published path before the manifest
  // is built or published. `output.verified` therefore describes the file, not
  // the intended in-memory buffer.
  const outputPublication = publishExclusive(
    resolvedOutput,
    sanitizedBytes,
    manifest.output.sha256,
    publishHooks,
  );
  const outputIdentity = outputPublication.identity;
  manifest.output.verified = true;
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const manifestSha256 = sha256(manifestBytes);

  let manifestPublished = false;
  try {
    publishExclusive(resolvedManifest, manifestBytes, manifestSha256, publishHooks);
    manifestPublished = true;
  } finally {
    if (!manifestPublished) {
      if (matchesIdentity(resolvedOutput, outputIdentity, { lstatSync })) {
        try { rollbackUnlink(resolvedOutput); } catch { /* best effort */ }
      }
    }
  }

  return {
    outputPath: resolvedOutput,
    manifestPath: resolvedManifest,
    originalSha256,
    sanitizedSha256: manifest.output.sha256,
    definersRemoved: edits.length,
    objectsTransformed: manifest.objectsTransformed,
    manifest,
  };
}

function printUsage(write) {
  write(`CourtZon DEFINER sanitizer (offline, parser-aware)

Usage:
  node backend/scripts/sanitize-definers.js --input <plaintext.sql> --output <sanitized.sql> [--manifest <manifest.json>]

Options:
  --input <path>     Plaintext UTF-8 SQL dump to read (never modified)
  --output <path>    New sanitized SQL file (must not exist)
  --manifest <path>  Manifest path (default: <output>.manifest.json; must not exist)
  --help             Show this help

The tool removes executable DEFINER clauses from CREATE TRIGGER / PROCEDURE /
FUNCTION / EVENT / VIEW statements, verifies the result with the restore
engine's DEFINER detector, verifies the published output by size and SHA-256,
and writes it atomically through a hard link (mode 0600 on POSIX).

It never connects to a database, never imports SQL, never runs the restore
engine, and never modifies the input or an existing output.

Removing a DEFINER clause makes the executing account (the restore account)
the definer. Under SQL SECURITY DEFINER, restored objects run with that
account's privileges; original ownership is NOT preserved.
`);
}

function parseArgs(argv) {
  const parsed = { input: null, output: null, manifest: null, help: false };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (typeof raw !== 'string' || raw === '') {
      throw new SanitizerUsageError('Empty argument is not allowed.');
    }
    if (raw === '--help' || raw === '-h') {
      parsed.help = true;
      continue;
    }
    if (!raw.startsWith('--')) {
      throw new SanitizerUsageError(`Unexpected positional argument: ${raw}`);
    }

    const equals = raw.indexOf('=');
    const name = equals >= 0 ? raw.slice(0, equals) : raw;
    let value = equals >= 0 ? raw.slice(equals + 1) : argv[index + 1];

    if (!['--input', '--output', '--manifest'].includes(name)) {
      throw new SanitizerUsageError(`Unknown argument: ${name}`);
    }
    if (seen.has(name)) {
      throw new SanitizerUsageError(`Duplicate argument: ${name}`);
    }
    seen.add(name);

    if (value === undefined || value === '') {
      throw new SanitizerUsageError(`Missing value for ${name}`);
    }
    if (equals < 0) index += 1;
    parsed[name.slice(2)] = value;
  }

  return parsed;
}

function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export async function main(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => console.log(line));
  const stderr = io.stderr ?? ((line) => console.error(line));

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    stderr(`ERROR: ${error.message}`);
    return 2;
  }

  if (parsed.help) {
    printUsage(stdout);
    return 0;
  }

  try {
    if (!parsed.input || !parsed.output) {
      throw new SanitizerUsageError('--input and --output are required.');
    }
    const result = await sanitizeFile({
      inputPath: parsed.input,
      outputPath: parsed.output,
      manifestPath: parsed.manifest ?? undefined,
    });
    stdout(`DEFINER clauses removed: ${result.definersRemoved}`);
    stdout(`Output:   ${result.outputPath}`);
    stdout(`Manifest: ${result.manifestPath}`);
    stdout(`Original SHA-256:  ${result.originalSha256}`);
    stdout(`Sanitized SHA-256: ${result.sanitizedSha256}`);
    stdout('Original artifact unchanged. This does not authorize a production restore.');
    return 0;
  } catch (error) {
    if (error instanceof SanitizerUsageError) {
      stderr(`ERROR: ${error.message}`);
      return 2;
    }
    stderr(`ERROR: ${error?.message ?? 'sanitization failed'}`);
    return 1;
  }
}

if (isInvokedDirectly()) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
