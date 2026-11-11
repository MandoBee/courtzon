// ============================================================================
// CourtZon — DEFINER sanitizer unit tests
//
// SAFETY: no database, network, Docker, backup or restore. All files live in an
// isolated OS temp directory and contain fictitious identifiers only.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  existsSync,
  linkSync as realLinkSync,
  mkdtempSync,
  openSync as realOpenSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync as realWriteSync,
} from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import * as sanitizer from '../../../../scripts/sanitize-definers.js';
import { classifyCreateHeader, createDefinerGuard } from '../../../../scripts/restore.js';

let workDir: string;
let counter = 0;

const SAMPLE_SQL =
  'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\n' +
  'CREATE DEFINER=`u`@`h` EVENT `e` ON SCHEDULE EVERY 1 DAY DO SELECT 1;\n';

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'courtzon-sanitize-'));
});

afterAll(() => {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* best effort on Windows */
  }
});

function tempPath(name: string): string {
  counter += 1;
  return join(workDir, `${counter}-${name}`);
}

function writeTemp(name: string, content: string): string {
  const path = tempPath(name);
  writeFileSync(path, content);
  return path;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function runDefinerGuard(chunks: Buffer[]): Promise<string> {
  const output: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output.push(Buffer.from(chunk));
      callback();
    },
  });
  await pipeline(Readable.from(chunks), createDefinerGuard(), sink);
  return Buffer.concat(output).toString('utf8');
}

function runSanitizerProcess(inputPath: string, outputPath: string, manifestPath: string): Promise<number> {
  const moduleUrl = new URL('../../../../scripts/sanitize-definers.js', import.meta.url).href;
  const code = `
    import { sanitizeFile } from ${JSON.stringify(moduleUrl)};
    try {
      await sanitizeFile({
        inputPath: ${JSON.stringify(inputPath)},
        outputPath: ${JSON.stringify(outputPath)},
        manifestPath: ${JSON.stringify(manifestPath)},
      });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.on('error', reject);
    child.on('exit', (codeValue) => resolve(codeValue ?? -1));
  });
}

async function sanitized(sql: string): Promise<{
  sanitized: string;
  edits: Array<{ start: number; end: number }>;
  transformed: Record<string, number>;
  encountered: Record<string, number>;
}> {
  return sanitizer.sanitizeSql(sql);
}

// ── A. Basic syntax ─────────────────────────────────────────────────────────

describe('sanitizer — basic DEFINER syntax', () => {
  it('removes an inline DEFINER from a trigger', async () => {
    const result = await sanitized(
      'CREATE DEFINER=`root`@`localhost` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;',
    );
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('CREATE');
    expect(result.sanitized).toContain('TRIGGER');
    expect(result.edits).toHaveLength(1);
    expect(result.transformed.trigger).toBe(1);
  });

  it('removes quoted usernames and hosts', async () => {
    const result = await sanitized(
      "CREATE DEFINER='app user'@'%' PROCEDURE `p`() SELECT 1;",
    );
    expect(result.sanitized).not.toContain('app user');
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('PROCEDURE');
  });

  it('removes CURRENT_USER and CURRENT_USER() definers', async () => {
    for (const value of ['CURRENT_USER', 'CURRENT_USER()', 'current_user ( )']) {
      const result = await sanitized(`CREATE DEFINER=${value} FUNCTION \`f\`() RETURNS int RETURN 1;`);
      expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
      expect(result.sanitized).toContain('FUNCTION');
    }
  });

  it('handles mixed casing and whitespace', async () => {
    const result = await sanitized('create   definer = `u` @ `h`   trigger `t` before insert on `x` for each row set @a=1;');
    expect(result.sanitized).not.toMatch(/definer\s*=/i);
    expect(result.sanitized).toMatch(/trigger/i);
  });

  it('preserves SQL SECURITY DEFINER on views', async () => {
    const result = await sanitized(
      'CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v` AS SELECT 1;',
    );
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('SQL SECURITY DEFINER');
    expect(result.sanitized).toContain('VIEW');
    expect(result.transformed.view).toBe(1);
  });
});

// ── B. MySQL executable comments ────────────────────────────────────────────

describe('sanitizer — MySQL executable comments', () => {
  it('removes a DEFINER-only version comment from a mysqldump trigger', async () => {
    const sql =
      '/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1 */;;';
    const result = await sanitized(sql);
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('TRIGGER');
    expect(result.sanitized).not.toContain('50017');
  });

  it('preserves SQL SECURITY DEFINER while removing a version-comment DEFINER on a view', async () => {
    const sql = [
      '/*!50001 CREATE ALGORITHM=UNDEFINED */',
      '/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */',
      '/*!50001 VIEW `v` AS select 1 */;',
    ].join('\n');
    const result = await sanitized(sql);
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('SQL SECURITY DEFINER');
    expect(result.sanitized).toContain('VIEW');
  });

  it('leaves the word DEFINER inside ordinary comments untouched', async () => {
    const sql = '-- DEFINER=`root`@`localhost`\n/* DEFINER=`root`@`localhost` */\n# DEFINER=x\nSELECT 1;';
    const result = await sanitized(sql);
    expect(result.sanitized).toBe(sql);
    expect(result.edits).toHaveLength(0);
  });
});

// ── C. Lexer safety ─────────────────────────────────────────────────────────

describe('sanitizer — SQL lexer safety', () => {
  it('ignores DEFINER inside string literals', async () => {
    const sql = "INSERT INTO `x` VALUES ('CREATE DEFINER=`root`@`localhost` TRIGGER');";
    const result = await sanitized(sql);
    expect(result.sanitized).toBe(sql);
  });

  it('ignores DEFINER inside quoted identifiers', async () => {
    const sql = 'CREATE TABLE `DEFINER=`root`@`localhost`` (`id` int);';
    const result = await sanitized(sql);
    expect(result.sanitized).toBe(sql);
  });

  it('handles escaped quotes and backslashes', async () => {
    const sql = [
      "INSERT INTO `x` VALUES ('it\\'s', 'a\\\\b', 'DEFINER=`root`@`localhost`');",
      'CREATE DEFINER=`root`@`localhost` EVENT `e` ON SCHEDULE EVERY 1 DAY DO SELECT 1;',
    ].join('\n');
    const result = await sanitized(sql);
    expect(result.sanitized).not.toMatch(/CREATE\s+DEFINER/i);
    expect(result.sanitized).toContain("it\\'s");
    expect(result.transformed.event).toBe(1);
  });

  it('handles multiline statements and semicolons inside strings', async () => {
    const sql = [
      'CREATE',
      '  DEFINER=`root`@`localhost`',
      '  PROCEDURE `p`()',
      'BEGIN',
      "  SELECT 'a;b';",
      '  SELECT 1;',
      'END;',
    ].join('\n');
    const result = await sanitized(sql);
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain("'a;b'");
    expect(result.sanitized).toContain('END;');
  });

  it('ignores the word DEFINER inside a routine body', async () => {
    const sql = [
      'CREATE DEFINER=`root`@`localhost` PROCEDURE `p`()',
      'BEGIN',
      "  -- DEFINER=`root`@`localhost`",
      "  SELECT 'DEFINER=root';\nEND;",
    ].join('\n');
    const result = await sanitized(sql);
    expect(result.sanitized).not.toMatch(/CREATE DEFINER/i);
    expect(result.sanitized).toContain("-- DEFINER=`root`@`localhost`");
    expect(result.sanitized).toContain("'DEFINER=root'");
  });
});

// ── D. Supported object types ───────────────────────────────────────────────

describe('sanitizer — supported object types', () => {
  const cases: Array<[string, string]> = [
    ['view', 'CREATE DEFINER=`u`@`h` VIEW `v` AS SELECT 1;'],
    ['trigger', 'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;'],
    ['procedure', 'CREATE DEFINER=`u`@`h` PROCEDURE `p`() SELECT 1;'],
    ['function', 'CREATE DEFINER=`u`@`h` FUNCTION `f`() RETURNS int RETURN 1;'],
    ['event', 'CREATE DEFINER=`u`@`h` EVENT `e` ON SCHEDULE EVERY 1 DAY DO SELECT 1;'],
  ];

  for (const [kind, sql] of cases) {
    it(`removes DEFINER from ${kind}`, async () => {
      const result = await sanitized(sql);
      expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
      expect(result.transformed[kind]).toBe(1);
      expect(result.encountered[kind]).toBe(1);
    });
  }
});

// ── E. Fail-closed behaviour ────────────────────────────────────────────────

describe('sanitizer — fail closed', () => {
  it('rejects a bare DEFINER without a value', async () => {
    await expect(sanitized('CREATE DEFINER TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;'))
      .rejects.toThrow(/could not be parsed safely/i);
  });

  it('rejects an empty DEFINER value', async () => {
    await expect(sanitized('CREATE DEFINER= TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;'))
      .rejects.toThrow(/Cannot determine the object type|could not be parsed safely/i);
  });

  it('rejects an incomplete version comment', async () => {
    await expect(sanitized('/*!50003 CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1'))
      .rejects.toThrow(/incomplete|parsed safely|ends inside a quoted string or comment/i);
  });

  it('rejects an oversize CREATE header', async () => {
    const sql = `CREATE ${'A '.repeat(70_000)}TRIGGER \`t\` BEFORE INSERT ON \`x\` FOR EACH ROW SET @a=1;`;
    await expect(sanitized(sql)).rejects.toThrow(/exceeds the 65,536-byte limit/i);
  });

  it('verifySanitizedSql rejects a remaining executable DEFINER', async () => {
    await expect(sanitizer.verifySanitizedSql(
      'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;',
    )).rejects.toThrow(/still contains executable DEFINER/i);
  });

  it('verifySanitizedSql detects a DEFINER split across chunk boundaries', async () => {
    const sql =
      'x'.repeat(65_529) +
      ' CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';
    await expect(sanitizer.verifySanitizedSql(sql))
      .rejects.toThrow(/still contains executable DEFINER/i);
  });

  it('rejects an empty input file', async () => {
    const input = writeTemp('empty.sql', '');
    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: tempPath('empty.out.sql'),
    })).rejects.toThrow(/empty/i);
  });

  it('rejects NUL bytes in the input', async () => {
    const input = tempPath('nul.sql');
    writeFileSync(input, Buffer.from([0x53, 0x45, 0x4c, 0x00, 0x3b]));
    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: tempPath('nul.out.sql'),
    })).rejects.toThrow(/NUL/i);
  });

  it('rejects a file larger than the configured limit before reading', async () => {
    const input = writeTemp('too-large.sql', 'x'.repeat(64));
    const output = tempPath('too-large.out.sql');
    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 16,
    })).rejects.toThrow(/maximum size/i);
    expect(existsSync(output)).toBe(false);
  });

  it('accepts exactly the configured maximum and handles partial chunk reads', async () => {
    const text = '-- x\nCREATE TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\n';
    const bytes = Buffer.from(text, 'utf8');
    const input = writeTemp('exact-max.sql', text);
    const output = tempPath('exact-max.out.sql');
    const stats = {
      isFile: () => true,
      size: bytes.length,
      dev: 1,
      ino: 2,
      mtimeMs: 3,
      ctimeMs: 4,
    };

    await sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: bytes.length,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => ({ ...stats }),
        readSync: (
          _fd: number,
          buffer: Buffer,
          offset: number,
          length: number,
          position: number,
        ) => {
          if (position >= bytes.length) return 0;
          const count = Math.min(1, length, bytes.length - position);
          bytes.copy(buffer, offset, position, position + count);
          return count;
        },
        closeSync: () => {},
      },
    });

    expect(readFileSync(output, 'utf8')).toBe(text);
  });

  it('rejects exactly maxInputBytes + 1', async () => {
    const input = writeTemp('max-plus-one.sql', 'x'.repeat(17));
    const output = tempPath('max-plus-one.out.sql');
    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 16,
    })).rejects.toThrow(/maximum size/i);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects input that shrinks to empty between fstat and read', async () => {
    const input = writeTemp('shrink-empty.sql', 'x');
    const output = tempPath('shrink-empty.out.sql');
    let closed = false;
    const stats = {
      isFile: () => true,
      size: 10,
      dev: 1,
      ino: 2,
      mtimeMs: 3,
      ctimeMs: 4,
    };

    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 32,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => ({ ...stats }),
        readSync: () => 0,
        closeSync: () => { closed = true; },
      },
    })).rejects.toThrow(/empty|changed/i);
    expect(closed).toBe(true);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects input that shrinks to a shorter non-empty buffer', async () => {
    const input = writeTemp('shrink-short.sql', 'x');
    const output = tempPath('shrink-short.out.sql');
    let calls = 0;
    let closed = false;
    let sent = false;
    const first = {
      isFile: () => true,
      size: 10,
      dev: 1,
      ino: 2,
      mtimeMs: 3,
      ctimeMs: 4,
    };
    const second = { ...first, size: 5, mtimeMs: 5, ctimeMs: 5 };

    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 32,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => (calls++ === 0 ? first : second),
        readSync: (_fd: number, buffer: Buffer, offset: number, length: number) => {
          if (sent) return 0;
          sent = true;
          const count = Math.min(5, length);
          buffer.fill(0x41, offset, offset + count);
          return count;
        },
        closeSync: () => { closed = true; },
      },
    })).rejects.toThrow(/changed/i);
    expect(closed).toBe(true);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects input whose metadata changes after the read', async () => {
    const input = writeTemp('metadata-change.sql', 'x');
    const output = tempPath('metadata-change.out.sql');
    let calls = 0;
    let closed = false;
    let sent = false;
    const first = {
      isFile: () => true,
      size: 10,
      dev: 1,
      ino: 2,
      mtimeMs: 3,
      ctimeMs: 4,
    };
    const second = { ...first, size: 11, mtimeMs: 5, ctimeMs: 5 };

    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 32,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => (calls++ === 0 ? first : second),
        readSync: (_fd: number, buffer: Buffer, offset: number, length: number) => {
          if (sent) return 0;
          sent = true;
          const count = Math.min(10, length);
          buffer.fill(0x41, offset, offset + count);
          return count;
        },
        closeSync: () => { closed = true; },
      },
    })).rejects.toThrow(/changed/i);
    expect(closed).toBe(true);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects a non-regular input descriptor', async () => {
    const input = writeTemp('non-regular-fd.sql', 'x');
    const output = tempPath('non-regular-fd.out.sql');
    let closed = false;
    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => ({ isFile: () => false, size: 1 }),
        closeSync: () => { closed = true; },
      },
    })).rejects.toThrow(/regular file/i);
    expect(closed).toBe(true);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects a FIFO input where the platform supports mkfifo', async () => {
    if (process.platform === 'win32') return;
    const fifo = tempPath('input.fifo');
    try {
      execFileSync('mkfifo', [fifo]);
    } catch {
      return; // mkfifo unavailable
    }
    const output = tempPath('fifo-input.out.sql');
    await expect(sanitizer.sanitizeFile({
      inputPath: fifo,
      outputPath: output,
    })).rejects.toThrow(/regular file/i);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects input that grows past the limit after metadata inspection', async () => {
    const input = writeTemp('grows.sql', 'x');
    const output = tempPath('grows.out.sql');
    let closed = false;
    let reads = 0;
    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 32,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => ({ isFile: () => true, size: 1 }),
        readSync: (
          _fd: number,
          buffer: Buffer,
          offset: number,
          length: number,
          position: number,
        ) => {
          reads += 1;
          if (position >= 64) return 0;
          const count = Math.min(length, 64 - position);
          buffer.fill(0x41, offset, offset + count);
          return count;
        },
        closeSync: () => { closed = true; },
      },
    })).rejects.toThrow(/maximum size|changed/i);
    expect(closed).toBe(true);
    expect(reads).toBeLessThanOrEqual(2);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects when final fstat inspection fails', async () => {
    const input = writeTemp('final-fstat.sql', 'x');
    const output = tempPath('final-fstat.out.sql');
    let calls = 0;
    let closed = false;
    const stats = {
      isFile: () => true,
      size: 1,
      dev: 1,
      ino: 2,
      mtimeMs: 3,
      ctimeMs: 4,
    };

    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 32,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => {
          if (calls++ === 0) return { ...stats };
          throw new Error('final fstat failure');
        },
        readSync: (
          _fd: number,
          buffer: Buffer,
          offset: number,
          _length: number,
          position: number,
        ) => {
          if (position !== 0) return 0;
          buffer[offset] = 0x78;
          return 1;
        },
        closeSync: () => { closed = true; },
      },
    })).rejects.toThrow(/inspected safely/i);
    expect(closed).toBe(true);
    expect(existsSync(output)).toBe(false);
  });

  it('documents same-size metadata-preserving replacement as undetected', async () => {
    const original = '-- a\nSELECT 1;\n';
    const replacement = '-- b\nSELECT 1;\n';
    expect(replacement.length).toBe(original.length);
    const input = writeTemp('same-size-replacement.sql', original);
    const output = tempPath('same-size-replacement.out.sql');
    const replacementBytes = Buffer.from(replacement, 'utf8');
    const stats = {
      isFile: () => true,
      size: replacementBytes.length,
      dev: 1,
      ino: 2,
      mtimeMs: 3,
      ctimeMs: 4,
    };

    await sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      maxInputBytes: 64,
      inputIo: {
        openSync: () => 123,
        fstatSync: () => ({ ...stats }),
        readSync: (
          _fd: number,
          buffer: Buffer,
          offset: number,
          _length: number,
          position: number,
        ) => {
          if (position !== 0) return 0;
          replacementBytes.copy(buffer, offset);
          return replacementBytes.length;
        },
        closeSync: () => {},
      },
    });

    // Metadata-only snapshot checking cannot prove byte identity against a
    // writer that preserves size/device/inode/mtime/ctime.
    expect(readFileSync(output)).toEqual(replacementBytes);
  });

  it('uses the input buffer without an extra copy when no spans are removed', () => {
    const input = Buffer.from('abcdef', 'utf8');
    expect(sanitizer.removeSpansToBuffer(input, 'abcdef', [])).toBe(input);
    expect(sanitizer.removeSpansToBuffer(input, 'abcdef', [{ start: 1, end: 3 }]).toString())
      .toBe('adef');
  });

  it('rejects a non-regular input path', async () => {
    const output = tempPath('directory-input.out.sql');
    await expect(sanitizer.sanitizeFile({
      inputPath: workDir,
      outputPath: output,
    })).rejects.toThrow(/regular file/i);
    expect(existsSync(output)).toBe(false);
  });


  it('rejects a symlink input when the platform permits creating one', async () => {
    const target = writeTemp('symlink-input-target.sql', SAMPLE_SQL);
    const link = tempPath('symlink-input.sql');
    try {
      symlinkSync(target, link);
    } catch {
      return; // filesystem does not permit symlinks
    }
    const output = tempPath('symlink-input.out.sql');
    await expect(sanitizer.sanitizeFile({
      inputPath: link,
      outputPath: output,
    })).rejects.toThrow(/regular file|symbolic link/i);
    expect(existsSync(output)).toBe(false);
  });

  it('closes the input descriptor when reading fails', async () => {
    const input = writeTemp('read-fail.sql', 'x');
    let closed = false;
    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: tempPath('read-fail.out.sql'),
      inputIo: {
        openSync: () => 123,
        fstatSync: () => ({ isFile: () => true, size: 1 }),
        readSync: () => { throw new Error('simulated read failure'); },
        closeSync: () => { closed = true; },
      },
    })).rejects.toThrow(/could not be read safely/i);
    expect(closed).toBe(true);
  });

  it('does not include SQL content in CLI errors', async () => {
    const marker = 'SENSITIVE-SQL-MARKER';
    const input = writeTemp('secret.sql', `${marker} CREATE DEFINER TRIGGER x;`);
    const errors: string[] = [];
    const code = await sanitizer.main(
      ['--input', input, '--output', tempPath('secret.out.sql')],
      { stdout: () => undefined, stderr: (line: string) => errors.push(line) },
    );
    expect(code).toBe(1);
    expect(errors.join('\n')).not.toContain(marker);
  });
});

// ── F. File and manifest safety ─────────────────────────────────────────────

describe('sanitizer — file and manifest safety', () => {
  const sql = SAMPLE_SQL;

  it('never changes the input file and produces matching manifest checksums', async () => {
    const input = writeTemp('ok.sql', sql);
    const before = sha256File(input);
    const output = tempPath('ok.sanitized.sql');
    const manifestPath = tempPath('ok.manifest.json');

    const result = await sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath });

    expect(sha256File(input)).toBe(before);
    expect(existsSync(output)).toBe(true);
    expect(existsSync(manifestPath)).toBe(true);
    expect(result.definersRemoved).toBe(2);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.schema).toBe('courtzon.definer-sanitizer.manifest');
    expect(manifest.status).toBe('complete');
    expect(manifest.input.sha256).toBe(before);
    expect(manifest.input.encoding).toBe('utf-8');
    expect(manifest.output.sha256).toBe(sha256File(output));
    expect(manifest.output.verified).toBe(true);
    expect(manifest.definersRemoved).toBe(2);
    expect(manifest.objectsTransformed).toEqual({ trigger: 1, event: 1 });
    expect(manifest.verificationScope).toMatch(/CREATE/i);
    expect(manifest.authenticity.signed).toBe(false);
    expect(manifest.warning).toMatch(/restore account/i);
    expect(JSON.stringify(manifest)).not.toContain('DEFINER=`u`');
  });

  it('writes the output with restrictive permissions', async () => {
    if (process.platform === 'win32') return;
    const input = writeTemp('perm.sql', sql);
    const output = tempPath('perm.out.sql');
    await sanitizer.sanitizeFile({ inputPath: input, outputPath: output });
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(statSync(`${output}.manifest.json`).mode & 0o777).toBe(0o600);
  });

  it('refuses to overwrite an existing output', async () => {
    const input = writeTemp('dup.sql', sql);
    const output = writeTemp('dup.out.sql', 'existing');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/refusing to overwrite/i);
    expect(readFileSync(output, 'utf8')).toBe('existing');
  });

  it('refuses to overwrite an existing manifest', async () => {
    const input = writeTemp('dupm.sql', sql);
    const output = tempPath('dupm.out.sql');
    const manifest = writeTemp('dupm.manifest.json', '{}');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath: manifest }))
      .rejects.toThrow(/refusing to overwrite/i);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects identical input and output paths', async () => {
    const input = writeTemp('same.sql', sql);
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: input }))
      .rejects.toThrow(/must differ/i);
  });

  it('rejects a manifest path that collides with the output', async () => {
    const input = writeTemp('collide.sql', sql);
    const output = tempPath('collide.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath: output }))
      .rejects.toThrow(/must differ/i);
  });

  it('rolls back the SQL output when the manifest cannot be published', async () => {
    const input = writeTemp('rollback.sql', sql);
    const output = tempPath('rollback.out.sql');
    const blocker = writeTemp('blocker', 'not a directory');
    const manifest = join(blocker, 'manifest.json');

    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath: manifest }))
      .rejects.toThrow(/output directory does not exist/i);

    expect(existsSync(output)).toBe(false);
    expect(existsSync(manifest)).toBe(false);
  });

  it('leaves the first artifact intact when a second run collides', async () => {
    const input = writeTemp('collide-run.sql', sql);
    const output = tempPath('collide-run.out.sql');
    const manifest = `${output}.manifest.json`;

    const first = await sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath: manifest });
    const firstSql = readFileSync(output, 'utf8');
    const firstManifest = readFileSync(manifest, 'utf8');

    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath: manifest }))
      .rejects.toThrow(/refusing to overwrite/i);

    expect(readFileSync(output, 'utf8')).toBe(firstSql);
    expect(readFileSync(manifest, 'utf8')).toBe(firstManifest);
    expect(first.definersRemoved).toBe(2);
  });

  it('rejects a symbolic-link output target on POSIX', async () => {
    if (process.platform === 'win32') return;
    const input = writeTemp('link.sql', sql);
    const target = writeTemp('link-target.sql', 'target');
    const output = tempPath('link.out.sql');
    try {
      symlinkSync(target, output);
    } catch {
      return; // filesystem does not permit symlinks
    }
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/symbolic link/i);
  });
});

describe('sanitizer — publication and byte integrity', () => {
  const sql = SAMPLE_SQL;
  const data = Buffer.from('CREATE TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\n');

  it('completes publication across partial writeSync results', () => {
    const target = tempPath('partial.out.sql');
    sanitizer.publishExclusive(target, data, undefined, {
      writeSync: (fd: number, buffer: Buffer, offset: number, length: number) =>
        realWriteSync(fd, buffer, offset, Math.min(1, length)),
    });
    expect(readFileSync(target)).toEqual(data);
  });

  it('rejects a zero-byte write without publishing', () => {
    const target = tempPath('zero-write.out.sql');
    expect(() => sanitizer.publishExclusive(target, data, undefined, {
      writeSync: () => 0,
    })).toThrow(/short or invalid write/i);
    expect(existsSync(target)).toBe(false);
  });

  it('fails closed when hard links are unavailable', () => {
    const target = tempPath('no-link.out.sql');
    const error = new Error('hard links unavailable');
    (error as NodeJS.ErrnoException).code = 'EACCES';
    expect(() => sanitizer.publishExclusive(target, data, undefined, {
      linkSync: () => { throw error; },
    })).toThrow(/filesystem cannot guarantee atomic no-overwrite publication/i);
    expect(existsSync(target)).toBe(false);
  });

  it('never overwrites an existing destination', () => {
    const target = tempPath('existing.out.sql');
    writeFileSync(target, 'existing');
    expect(() => sanitizer.publishExclusive(target, data)).toThrow(/refusing to overwrite/i);
    expect(readFileSync(target, 'utf8')).toBe('existing');
  });

  it('allows exactly one of two concurrent runs to publish the same output', async () => {
    const input = writeTemp('race-same.sql', sql);
    const output = tempPath('race-same.out.sql');
    const manifest = `${output}.manifest.json`;

    const results = await Promise.allSettled([
      sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath: manifest }),
      sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath: manifest }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const published = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(published.output.sha256).toBe(sha256File(output));
    expect(published.output.verified).toBe(true);
  });

  it('handles two OS-level concurrent invocations for the same output', async () => {
    const input = writeTemp('process-race.sql', sql);
    const output = tempPath('process-race.out.sql');
    const manifest = `${output}.manifest.json`;

    const codes = await Promise.all([
      runSanitizerProcess(input, output, manifest),
      runSanitizerProcess(input, output, manifest),
    ]);

    expect(codes.filter((code) => code === 0)).toHaveLength(1);
    expect(codes.filter((code) => code !== 0)).toHaveLength(1);
    const published = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(published.output.sha256).toBe(sha256File(output));
    expect(published.output.verified).toBe(true);
  }, 20_000);

  it('handles two OS-level invocations that share only a manifest path', async () => {
    const input = writeTemp('process-shared-manifest.sql', sql);
    const outputA = tempPath('process-shared-a.out.sql');
    const outputB = tempPath('process-shared-b.out.sql');
    const manifest = tempPath('process-shared.manifest.json');

    const codes = await Promise.all([
      runSanitizerProcess(input, outputA, manifest),
      runSanitizerProcess(input, outputB, manifest),
    ]);

    expect(codes.filter((code) => code === 0)).toHaveLength(1);
    expect(codes.filter((code) => code !== 0)).toHaveLength(1);
    const published = JSON.parse(readFileSync(manifest, 'utf8'));
    const winner = join(workDir, published.output.file);
    const loser = winner === outputA ? outputB : outputA;
    expect(existsSync(winner)).toBe(true);
    expect(existsSync(loser)).toBe(false);
    expect(published.output.sha256).toBe(sha256File(winner));
  }, 20_000);

  it('keeps one consistent SQL/manifest pair when two runs share a manifest path', async () => {
    const input = writeTemp('race-shared.sql', sql);
    const outputA = tempPath('race-shared-a.out.sql');
    const outputB = tempPath('race-shared-b.out.sql');
    const manifest = tempPath('race-shared.manifest.json');

    const results = await Promise.allSettled([
      sanitizer.sanitizeFile({ inputPath: input, outputPath: outputA, manifestPath: manifest }),
      sanitizer.sanitizeFile({ inputPath: input, outputPath: outputB, manifestPath: manifest }),
    ]);

    const fulfilled = results.find((result) => result.status === 'fulfilled');
    expect(fulfilled).toBeDefined();
    if (!fulfilled || fulfilled.status !== 'fulfilled') throw new Error('no winner');

    const published = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(published.output.file).toBe(basename(fulfilled.value.outputPath));
    expect(existsSync(fulfilled.value.outputPath)).toBe(true);

    const loserOutput = fulfilled.value.outputPath === outputA ? outputB : outputA;
    expect(existsSync(loserOutput)).toBe(false);
  });

  it('reports failure and leaves an invalid orphan when rollback unlink fails', async () => {
    const input = writeTemp('rollback-fail.sql', sql);
    const output = tempPath('rollback-fail.out.sql');
    const blocker = writeTemp('rollback-fail-blocker', 'not a directory');
    const manifest = join(blocker, 'manifest.json');

    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      manifestPath: manifest,
      rollbackUnlink: () => { throw new Error('unlink denied'); },
    })).rejects.toThrow(/output directory does not exist/i);

    expect(existsSync(output)).toBe(true);
    expect(existsSync(manifest)).toBe(false);
  });

  it('publishes successfully when directory fsync is unsupported', () => {
    const target = tempPath('fsync-unsupported.out.sql');
    expect(() => sanitizer.publishExclusive(target, data, undefined, {
      fsyncDirectory: () => { throw new Error('directory fsync unsupported'); },
    })).not.toThrow();
    expect(readFileSync(target)).toEqual(data);
  });

  it('leaves an invalid orphan when interrupted before manifest publication', () => {
    const target = tempPath('orphan.out.sql');
    // Simulated interruption: publish SQL and deliberately do not publish a
    // manifest. This is not an OS-level crash; it tests the documented state.
    sanitizer.publishExclusive(target, data);
    expect(existsSync(target)).toBe(true);
    expect(existsSync(`${target}.manifest.json`)).toBe(false);
  });

  it('removes the destination when published bytes fail verification', () => {
    const target = tempPath('tampered.out.sql');
    const expected = Buffer.from('expected-published-bytes');
    expect(() => sanitizer.publishExclusive(target, expected, undefined, {
      linkSync: (from: string, to: string) => {
        realLinkSync(from, to);
        // Same length, different bytes: this must fail the SHA-256 check, not
        // merely the size check.
        writeFileSync(to, Buffer.alloc(expected.length, 0x41));
      },
    })).toThrow(/failed size\/SHA-256 verification/i);
    expect(existsSync(target)).toBe(false);
  });

  it('rejects invalid UTF-8 before publishing anything', async () => {
    const input = tempPath('invalid-utf8.sql');
    writeFileSync(input, Buffer.concat([
      Buffer.from('CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; -- '),
      Buffer.from([0x80]),
      Buffer.from('\n'),
    ]));
    const output = tempPath('invalid-utf8.out.sql');

    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/UTF-8/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
  });

  it('preserves multibyte UTF-8 and CRLF outside removal spans', async () => {
    const text =
      '-- \u00e9\r\n' +
      'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\r\n' +
      'DELIMITER ;\r\n';
    const input = writeTemp('utf8-preserve.sql', text);
    const output = tempPath('utf8-preserve.out.sql');
    const manifestPath = tempPath('utf8-preserve.manifest.json');

    await sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath });

    const expected = text.replace('DEFINER=`u`@`h` ', '');
    expect(readFileSync(output, 'utf8')).toBe(expected);
    const published = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(published.output.sha256).toBe(sha256File(output));
    expect(published.output.verified).toBe(true);
  });

  it('preserves multibyte UTF-8 across chunk boundaries', async () => {
    const prefix = '\u00e9'.repeat(40_000);
    const tail = 'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';
    const text = `${prefix}\n${tail}\n`;
    const input = writeTemp('utf8-chunk-boundary.sql', text);
    const output = tempPath('utf8-chunk-boundary.out.sql');

    await sanitizer.sanitizeFile({ inputPath: input, outputPath: output });

    expect(readFileSync(output, 'utf8')).toBe(`${prefix}\nCREATE TRIGGER \`t\` BEFORE INSERT ON \`x\` FOR EACH ROW SET @a=1;\n`);
  });

  describe('large-file verification (AUD-13-01)', () => {
    const trigger = 'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\n';
    const triggerWithoutDefiner = 'CREATE TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\n';
    const filler = (count: number) => 'INSERT INTO `t` (`id`) VALUES (1);\n'.repeat(count);

    function expectPublished(
      manifestPath: string,
      outputPath: string,
      expected: string,
    ): void {
      const published = JSON.parse(readFileSync(manifestPath, 'utf8'));
      expect(published.output.verified).toBe(true);
      expect(published.output.bytes).toBe(Buffer.byteLength(expected));
      expect(published.output.sha256).toBe(sha256File(outputPath));
      expect(readFileSync(outputPath).equals(Buffer.from(expected))).toBe(true);
    }

    it('publishes a >64 KiB file with CREATE at the beginning', async () => {
      const sql = 'CREATE TABLE `t` (`id` int);\n' + filler(3_000);
      expect(Buffer.byteLength(sql)).toBeGreaterThan(64 * 1024);
      const input = writeTemp('large-create-first.sql', sql);
      const output = tempPath('large-create-first.out.sql');
      const manifest = tempPath('large-create-first.manifest.json');

      const result = await sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      });

      expect(result.definersRemoved).toBe(0);
      expectPublished(manifest, output, sql);
    });

    it('removes a trigger before the final 64 KiB of a large file', async () => {
      const before = 'CREATE TABLE `t` (`id` int);\n';
      const after = filler(3_000);
      const sql = before + trigger + after;
      const expected = before + triggerWithoutDefiner + after;
      expect(Buffer.byteLength(sql)).toBeGreaterThan(64 * 1024);
      const input = writeTemp('large-trigger.sql', sql);
      const output = tempPath('large-trigger.out.sql');
      const manifest = tempPath('large-trigger.manifest.json');

      const result = await sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      });

      expect(result.definersRemoved).toBe(1);
      expect(readFileSync(output, 'utf8')).not.toMatch(/DEFINER\s*=/i);
      expectPublished(manifest, output, expected);
    });

    it('handles CREATE between the first and final chunks', async () => {
      const prefix = 'SELECT 1;\n'.repeat(8_000);
      const create = 'CREATE TABLE `t` (`id` int);\n';
      const suffix = 'SELECT 2;\n'.repeat(8_000);
      const sql = prefix + create + suffix;
      expect(Buffer.byteLength(prefix)).toBeGreaterThan(64 * 1024);
      expect(Buffer.byteLength(suffix)).toBeGreaterThan(64 * 1024);
      const input = writeTemp('large-create-middle.sql', sql);
      const output = tempPath('large-create-middle.out.sql');
      const manifest = tempPath('large-create-middle.manifest.json');

      const result = await sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      });

      expect(result.definersRemoved).toBe(0);
      expectPublished(manifest, output, sql);
    });

    it('classifies a CREATE header split across verification chunks', async () => {
      const prefix = ' '.repeat(65_533);
      const header = 'CREATE OR REPLACE ALGORITHM=UNDEFINED DEFINER=`u`@`h` VIEW `v` AS SELECT 1;\n';
      const sql = prefix + header + 'SELECT 1;\n';
      const expected = prefix + header.replace('DEFINER=`u`@`h` ', '') + 'SELECT 1;\n';
      expect(Buffer.byteLength(sql)).toBeGreaterThan(64 * 1024);
      const input = writeTemp('large-split-header.sql', sql);
      const output = tempPath('large-split-header.out.sql');
      const manifest = tempPath('large-split-header.manifest.json');

      const result = await sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      });

      expect(result.definersRemoved).toBe(1);
      expectPublished(manifest, output, expected);
    });

    it('classifies a DEFINER token split across verification chunks', async () => {
      const beforeDefiner = 'CREATE OR REPLACE ALGORITHM=UNDEFINED ';
      const prefix = ' '.repeat(65_533 - beforeDefiner.length);
      const header = beforeDefiner + 'DEFINER=`u`@`h` VIEW `v` AS SELECT 1;\n';
      const sql = prefix + header + 'SELECT 1;\n';
      const expected = prefix + header.replace('DEFINER=`u`@`h` ', '') + 'SELECT 1;\n';
      expect(Buffer.byteLength(sql)).toBeGreaterThan(64 * 1024);
      const input = writeTemp('large-split-definer.sql', sql);
      const output = tempPath('large-split-definer.out.sql');
      const manifest = tempPath('large-split-definer.manifest.json');

      const result = await sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      });

      expect(result.definersRemoved).toBe(1);
      expectPublished(manifest, output, expected);
    });

    it('rejects an oversized CREATE header without publishing', async () => {
      const sql = `CREATE ${'A '.repeat(70_000)}TRIGGER \`t\` BEFORE INSERT ON \`x\` FOR EACH ROW SET @a=1;`;
      const input = writeTemp('large-oversize-header.sql', sql);
      const output = tempPath('large-oversize-header.out.sql');
      const manifest = tempPath('large-oversize-header.manifest.json');

      await expect(sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      })).rejects.toThrow(/exceeds the 65,536-byte limit/i);

      expect(existsSync(output)).toBe(false);
      expect(existsSync(manifest)).toBe(false);
    });

    it('classifies oversized and incomplete verification headers distinctly', async () => {
      await expect(sanitizer.verifySanitizedBytes(Buffer.from(
        `CREATE ${'A '.repeat(70_000)}TRIGGER \`t\` BEFORE INSERT ON \`x\` FOR EACH ROW SET @a=1;`,
      ))).rejects.toThrow(/CREATE header larger than the supported limit/i);

      await expect(sanitizer.verifySanitizedBytes(Buffer.from('CREATE DEF')))
        .rejects.toThrow(/incomplete CREATE header/i);
    });

    it('keeps a genuine surviving DEFINER in the byte-verification path', async () => {
      await expect(sanitizer.verifySanitizedBytes(Buffer.from(
        'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;',
      ))).rejects.toThrow(/still contains executable DEFINER/i);
    });

    it('preserves multibyte UTF-8 and executable comments across large chunks', async () => {
      const prefix = '-- ' + 'a'.repeat(65_532) + 'é\n';
      const comment = '/*!50003 CREATE*/ /*!50017 DEFINER=`u`@`h`*/ /*!50003 TRIGGER `e` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1 */;\n';
      const suffix = filler(100);
      const sql = prefix + trigger + comment + suffix;
      const expected = prefix + triggerWithoutDefiner +
        comment.replace('/*!50017 DEFINER=`u`@`h`*/', '') + suffix;
      expect(Buffer.byteLength(sql)).toBeGreaterThan(64 * 1024);
      const input = writeTemp('large-utf8-comment.sql', sql);
      const output = tempPath('large-utf8-comment.out.sql');
      const manifest = tempPath('large-utf8-comment.manifest.json');

      const result = await sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      });

      expect(result.definersRemoved).toBe(2);
      expectPublished(manifest, output, expected);
    });
  });

  describe('header byte limit and direct guard chunking (AUD-15)', () => {
    it('accepts an ASCII header exactly at 65,536 UTF-8 bytes', () => {
      const header = 'CREATE ' + ' '.repeat(65_536 - 7 - 5) + 'TABLE';
      expect(Buffer.byteLength(header)).toBe(65_536);
      expect(classifyCreateHeader(header).status).toBe('object');
    });

    it('rejects an ASCII header exceeding 65,536 UTF-8 bytes by one byte', () => {
      const header = 'CREATE ' + ' '.repeat(65_537 - 7 - 5) + 'TABLE';
      expect(Buffer.byteLength(header)).toBe(65_537);
      expect(classifyCreateHeader(header).status).toBe('oversize');
    });

    it('accepts a multibyte header below 65,536 UTF-8 bytes', () => {
      const header = 'CREATE /* ' + '\u00e9'.repeat(1_000) + ' */ TABLE';
      expect(Buffer.byteLength(header)).toBeLessThan(65_536);
      expect(classifyCreateHeader(header).status).toBe('object');
    });

    it('rejects a multibyte header over 65,536 bytes with fewer than 65,536 characters', async () => {
      const header = 'CREATE /* ' + '\u00e9'.repeat(40_000) + ' */ TABLE';
      expect(header.length).toBeLessThan(65_536);
      expect(Buffer.byteLength(header)).toBeGreaterThan(65_536);
      expect(classifyCreateHeader(header).status).toBe('oversize');
      await expect(sanitizer.sanitizeSql(header)).rejects.toThrow(/exceeds|oversize/i);
    });

    it('classifies a byte-truncated multibyte header as oversized, not incomplete', async () => {
      const sql = 'CREATE ' + ' '.repeat(65_535 - 7) + '\u00e9' + ' TABLE `t` (`id` int);';
      expect(Buffer.byteLength(sql)).toBeGreaterThan(65_536);
      await expect(sanitizer.sanitizeSql(sql))
        .rejects.toThrow(/exceeds the 65,536-byte limit/i);
    });

    it('keeps a genuine incomplete header at EOF classified as incomplete', async () => {
      await expect(sanitizer.sanitizeSql('CREATE DEF'))
        .rejects.toThrow(/incomplete/i);
    });

    it('accepts a valid header exactly at the byte boundary through sanitizeSql', async () => {
      const header = 'CREATE ' + ' '.repeat(65_536 - 7 - 5) + 'TABLE';
      await expect(sanitizer.sanitizeSql(header + ' `t` (`id` int);'))
        .resolves.toBeDefined();
    });

    it('rejects the AUD-16-01 boundary through sanitizeFile without publishing', async () => {
      const sql = 'CREATE ' + ' '.repeat(65_535 - 7) + '\u00e9' + ' TABLE `t` (`id` int);';
      expect(Buffer.byteLength(sql)).toBeGreaterThan(65_536);
      const input = writeTemp('aud16-boundary.sql', sql);
      const output = tempPath('aud16-boundary.out.sql');
      const manifest = tempPath('aud16-boundary.manifest.json');

      await expect(sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      })).rejects.toThrow(/exceeds the 65,536-byte limit/i);

      expect(existsSync(output)).toBe(false);
      expect(existsSync(manifest)).toBe(false);
    });

    it('rejects a multibyte over-limit header through sanitizeFile', async () => {
      const sql = 'CREATE /* ' + '\u00e9'.repeat(40_000) + ' */ TABLE `t` (`id` int);\nSELECT 1;\n';
      expect(sql.length).toBeLessThan(65_536);
      expect(Buffer.byteLength(sql)).toBeGreaterThan(65_536);
      const input = writeTemp('multibyte-oversize.sql', sql);
      const output = tempPath('multibyte-oversize.out.sql');
      const manifest = tempPath('multibyte-oversize.manifest.json');

      await expect(sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      })).rejects.toThrow(/exceeds|oversize/i);

      expect(existsSync(output)).toBe(false);
      expect(existsSync(manifest)).toBe(false);
    });

    it('preserves a 4-byte surrogate-pair character split across input byte chunks', async () => {
      const character = '\u{1F600}';
      const sql = 'CREATE TABLE `t` (`id` int);\n-- ' + character.repeat(10) + '\nSELECT 1;\n';
      const bytes = Buffer.from(sql, 'utf8');
      const characterIndex = sql.indexOf(character);
      const split = Buffer.byteLength(sql.slice(0, characterIndex), 'utf8') + 2;
      expect(await runDefinerGuard([
        bytes.subarray(0, split),
        bytes.subarray(split),
      ])).toBe(sql);
    });

    it('rejects incomplete multibyte UTF-8 at EOF before publishing', async () => {
      const input = tempPath('incomplete-utf8.sql');
      const output = tempPath('incomplete-utf8.out.sql');
      const manifest = tempPath('incomplete-utf8.manifest.json');
      writeFileSync(input, Buffer.concat([
        Buffer.from('SELECT 1; -- ', 'utf8'),
        Buffer.from([0xC3]),
      ]));

      await expect(sanitizer.sanitizeFile({
        inputPath: input,
        outputPath: output,
        manifestPath: manifest,
      })).rejects.toThrow(/UTF-8/i);

      expect(existsSync(output)).toBe(false);
      expect(existsSync(manifest)).toBe(false);
    });

    it('processes a short CREATE TABLE followed by more than 64K characters in one guard chunk', async () => {
      const sql = 'CREATE TABLE `t` (`id` int);\n' + 'SELECT 1;\n'.repeat(10_000);
      expect(Buffer.byteLength(sql)).toBeGreaterThan(64 * 1024);
      expect(await runDefinerGuard([Buffer.from(sql)])).toBe(sql);
    });

    it('detects a genuine DEFINER in one large guard chunk', async () => {
      const sql = 'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\n' +
        'SELECT 1;\n'.repeat(10_000);
      await expect(runDefinerGuard([Buffer.from(sql)])).rejects.toThrow(/DEFINER metadata/i);
    });

    it('rejects an oversized header in one large guard chunk', async () => {
      const sql = `CREATE ${'A '.repeat(70_000)}TRIGGER \`t\` BEFORE INSERT ON \`x\` FOR EACH ROW SET @a=1;`;
      await expect(runDefinerGuard([Buffer.from(sql)]))
        .rejects.toThrow(/CREATE header larger than the supported limit/i);
    });

    it('rejects a multibyte over-limit header in one large guard chunk', async () => {
      const sql = 'CREATE /* ' + '\u00e9'.repeat(40_000) + ' */ TABLE `t` (`id` int);';
      expect(sql.length).toBeLessThan(65_536);
      expect(Buffer.byteLength(sql)).toBeGreaterThan(65_536);
      await expect(runDefinerGuard([Buffer.from(sql)]))
        .rejects.toThrow(/CREATE header larger than the supported limit/i);
    });

    it('rejects an incomplete header at EOF', async () => {
      await expect(runDefinerGuard([Buffer.from('CREATE DEF')]))
        .rejects.toThrow(/incomplete/i);
    });

    it('preserves exact output across multiple large direct guard chunks', async () => {
      const first = 'SELECT 1;\n'.repeat(20_000) + 'CREATE ';
      const second = 'TABLE `t` (`id` int);\n' + 'SELECT 2;\n'.repeat(20_000);
      const third = 'SELECT 3;\n'.repeat(20_000);
      expect(await runDefinerGuard([
        Buffer.from(first),
        Buffer.from(second),
        Buffer.from(third),
      ])).toBe(first + second + third);
    });

    it('preserves a body containing another CREATE after a large header tail', async () => {
      const first = 'CREATE TABLE `t` (`id` int);\n' + 'SELECT 1;\n'.repeat(10_000);
      const second = 'CREATE TABLE `u` (`id` int);\n' + 'SELECT 2;\n'.repeat(10_000);
      expect(await runDefinerGuard([
        Buffer.from(first),
        Buffer.from(second),
      ])).toBe(first + second);
    });

    it('detects a DEFINER after a large segmented body', async () => {
      const first = 'SELECT 1;\n'.repeat(20_000);
      const second = 'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\n';
      await expect(runDefinerGuard([
        Buffer.from(first),
        Buffer.from(second),
      ])).rejects.toThrow(/DEFINER metadata/i);
    });

    it('preserves a quoted identifier and modifier split across direct guard chunks', async () => {
      const sql = 'CREATE OR REPLACE ALGORITHM=UNDEFINED VIEW `sp lit` AS SELECT 1;\nSELECT 1;\n';
      const bytes = Buffer.from(sql);
      const identifierSplit = bytes.indexOf(Buffer.from('sp lit')) + 2;
      const modifierSplit = bytes.indexOf(Buffer.from('ALGORITHM')) + 4;

      expect(await runDefinerGuard([
        bytes.subarray(0, modifierSplit),
        bytes.subarray(modifierSplit, identifierSplit),
        bytes.subarray(identifierSplit),
      ])).toBe(sql);
    });
  });

  it('lets a consumer detect post-publication replacement by rehashing', async () => {
    const input = writeTemp('replacement.sql', sql);
    const output = tempPath('replacement.out.sql');
    const manifestPath = tempPath('replacement.manifest.json');

    await sanitizer.sanitizeFile({ inputPath: input, outputPath: output, manifestPath });
    const published = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(output, 'tampered after publication');

    expect(sha256File(output)).not.toBe(published.output.sha256);
  });

  it('does not delete a pre-existing temporary path when exclusive open fails', async () => {
    const input = writeTemp('temp-sentinel-input.sql', SAMPLE_SQL);
    const target = tempPath('temp-sentinel.out.sql');
    const manifest = `${target}.manifest.json`;
    const sentinel = Buffer.from('pre-existing sentinel');
    let sentinelPath = '';

    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: target,
      manifestPath: manifest,
      publishHooks: {
        openSync: (path: string) => {
          sentinelPath = path;
          writeFileSync(path, sentinel);
          const error = new Error('exists') as NodeJS.ErrnoException;
          error.code = 'EEXIST';
          throw error;
        },
      },
    })).rejects.toThrow(/exists/i);

    expect(sentinelPath).not.toBe('');
    expect(readFileSync(sentinelPath)).toEqual(sentinel);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(manifest)).toBe(false);
  });

  it('removes only its own temp file after a later publication failure', () => {
    const target = tempPath('temp-owned.out.sql');
    let temporary = '';

    expect(() => sanitizer.publishExclusive(target, Buffer.from('data'), undefined, {
      openSync: (path: string, flags: string | number, mode?: number) => {
        temporary = path;
        return realOpenSync(path, flags, mode);
      },
      linkSync: () => {
        const error = new Error('link failed') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      },
    })).toThrow(/filesystem cannot guarantee/i);

    expect(temporary).not.toBe('');
    expect(existsSync(temporary)).toBe(false);
    expect(existsSync(target)).toBe(false);
  });

  it('preserves a replacement destination when verification fails', () => {
    const target = tempPath('replacement-verify.out.sql');
    const replacement = Buffer.from('attacker replacement bytes');
    expect(() => sanitizer.publishExclusive(target, Buffer.from('expected bytes'), undefined, {
      linkSync: (from: string, to: string) => {
        realLinkSync(from, to);
        unlinkSync(to);
        writeFileSync(to, replacement);
      },
    })).toThrow(/failed size\/SHA-256 verification/i);
    expect(readFileSync(target)).toEqual(replacement);
  });

  it('preserves a replacement output when manifest publication fails', async () => {
    const input = writeTemp('replacement-manifest.sql', SAMPLE_SQL);
    const output = tempPath('replacement-manifest.out.sql');
    const manifest = `${output}.manifest.json`;
    const replacement = Buffer.from('replacement after output publish');
    let opens = 0;

    await expect(sanitizer.sanitizeFile({
      inputPath: input,
      outputPath: output,
      manifestPath: manifest,
      publishHooks: {
        openSync: (path: string, flags: string | number, mode?: number) => {
          if (opens++ === 0) return realOpenSync(path, flags, mode);
          try { unlinkSync(output); } catch { /* absent */ }
          writeFileSync(output, replacement);
          const error = new Error('manifest exists') as NodeJS.ErrnoException;
          error.code = 'EEXIST';
          throw error;
        },
      },
    })).rejects.toThrow(/exists|refusing/i);

    expect(readFileSync(output)).toEqual(replacement);
    expect(existsSync(manifest)).toBe(false);
  });

  it('fails closed when temporary file identity is unavailable', () => {
    const target = tempPath('no-identity.out.sql');
    expect(() => sanitizer.publishExclusive(target, Buffer.from('data'), undefined, {
      fstatSync: () => ({ isFile: () => true, dev: 0n, ino: 0n }),
    })).toThrow(/identity/i);
    expect(existsSync(target)).toBe(false);
  });

  it('keeps the published target when temporary cleanup fails', () => {
    const target = tempPath('temp-cleanup-fail.out.sql');
    const data = Buffer.from('published data');
    let temporary = '';

    const result = sanitizer.publishExclusive(target, data, undefined, {
      openSync: (path: string, flags: string | number, mode?: number) => {
        if (flags === 'wx') temporary = path;
        return realOpenSync(path, flags, mode);
      },
      unlinkSync: (path: string) => {
        if (path === temporary) throw new Error('temporary cleanup denied');
        return unlinkSync(path);
      },
    });

    expect(result.identity).toBeDefined();
    expect(readFileSync(target)).toEqual(data);
    expect(existsSync(temporary)).toBe(true);
  });

  it('preserves a temporary replacement introduced before cleanup', () => {
    const target = tempPath('temp-replacement.out.sql');
    const data = Buffer.from('published data');
    let temporary = '';

    sanitizer.publishExclusive(target, data, undefined, {
      openSync: (path: string, flags: string | number, mode?: number) => {
        if (flags === 'wx') temporary = path;
        return realOpenSync(path, flags, mode);
      },
      linkSync: (from: string, to: string) => {
        realLinkSync(from, to);
        unlinkSync(temporary);
        writeFileSync(temporary, 'temporary replacement');
      },
    });

    expect(readFileSync(target)).toEqual(data);
    expect(readFileSync(temporary, 'utf8')).toBe('temporary replacement');
  });

  it('documents POSIX/NTFS permission and directory-fsync limits', () => {
    const docs = readFileSync(
      new URL('../../../../../docs/database/backup_recovery.md', import.meta.url),
      'utf8',
    );
    expect(docs).toMatch(/POSIX/);
    expect(docs).toMatch(/NTFS/);
    expect(docs).toMatch(/ACL/);
    expect(docs).toMatch(/Directory `fsync`/);
  });
});

describe('sanitizer — SQL SECURITY context (NEW-01)', () => {
  const objects: Array<[string, string]> = [
    ['trigger', 'TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;'],
    ['view', 'VIEW `v` AS SELECT 1;'],
    ['procedure', 'PROCEDURE `p`() SELECT 1;'],
    ['function', 'FUNCTION `f`() RETURNS int RETURN 1;'],
    ['event', 'EVENT `e` ON SCHEDULE EVERY 1 DAY DO SELECT 1;'],
  ];

  it('rejects SQL SECURITY DEFINER followed by DEFINER=', async () => {
    await expect(sanitized('CREATE SQL SECURITY DEFINER = u@h VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE SQL SECURITY DEFINER DEFINER = u@h VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
  });

  it('rejects SQL SECURITY INVOKER followed by DEFINER=', async () => {
    await expect(sanitized('CREATE SQL SECURITY INVOKER DEFINER = u@h VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
  });

  it('rejects DEFINER= after a SECURITY token without a complete SQL SECURITY clause', async () => {
    await expect(sanitized('CREATE SECURITY INVOKER DEFINER = u@h VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE SQL FOO SECURITY INVOKER DEFINER = u@h VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
  });

  it('rejects both forms with comments between tokens', async () => {
    await expect(sanitized(
      'CREATE SQL SECURITY /*a*/ INVOKER /*b*/ DEFINER = u@h VIEW `v` AS SELECT 1;',
    )).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(
      'CREATE SQL SECURITY -- a\n INVOKER DEFINER = u@h VIEW `v` AS SELECT 1;',
    )).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(
      'CREATE SQL SECURITY # a\n DEFINER = u@h VIEW `v` AS SELECT 1;',
    )).rejects.toThrow(/parsed safely/i);
  });

  it('rejects both forms for every supported object type', async () => {
    for (const [, tail] of objects) {
      await expect(sanitized(`CREATE SQL SECURITY DEFINER = u@h ${tail}`))
        .rejects.toThrow(/parsed safely/i);
      await expect(sanitized(`CREATE SQL SECURITY INVOKER DEFINER = u@h ${tail}`))
        .rejects.toThrow(/parsed safely/i);
    }
  });

  it('rejects version-comment SQL SECURITY followed by DEFINER=', async () => {
    await expect(sanitized(
      '/*!50003 CREATE SQL SECURITY INVOKER DEFINER = u@h VIEW `v` AS SELECT 1; */;',
    )).rejects.toThrow(/parsed safely/i);
  });

  it('preserves valid DEFINER-before-SQL-SECURITY forms', async () => {
    expect((await sanitized('CREATE DEFINER=u SQL SECURITY DEFINER VIEW `v` AS SELECT 1;')).sanitized)
      .toBe('CREATE SQL SECURITY DEFINER VIEW `v` AS SELECT 1;');
    expect((await sanitized(
      'CREATE ALGORITHM=UNDEFINED DEFINER=u SQL SECURITY INVOKER VIEW `v` AS SELECT 1;',
    )).sanitized)
      .toBe('CREATE ALGORITHM=UNDEFINED SQL SECURITY INVOKER VIEW `v` AS SELECT 1;');
    expect((await sanitized('CREATE SQL SECURITY DEFINER VIEW `v` AS SELECT 1;')).sanitized)
      .toBe('CREATE SQL SECURITY DEFINER VIEW `v` AS SELECT 1;');
    expect((await sanitized('CREATE SQL SECURITY INVOKER VIEW `v` AS SELECT 1;')).sanitized)
      .toBe('CREATE SQL SECURITY INVOKER VIEW `v` AS SELECT 1;');
  });

  it('publishes nothing for malformed SQL SECURITY context', async () => {
    const input = writeTemp(
      'sql-security-context-bad.sql',
      'CREATE SQL SECURITY INVOKER DEFINER = u@h VIEW `v` AS SELECT 1;',
    );
    const output = tempPath('sql-security-context-bad.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/parsed safely/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
  });
});

describe('sanitizer — nested executable comments (NEW-02)', () => {
  it('rejects a nested /*! before DEFINER', async () => {
    await expect(sanitized(
      '/*!50003 CREATE /*!50017 DEFINER=`u`@`h`*/ TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; */;',
    )).rejects.toThrow(/parsed safely|nested executable comment/i);
  });

  it('rejects a nested /*! before CREATE', async () => {
    await expect(sanitized(
      '/*!50003 /*!50017 DEFINER=`u`@`h`*/ TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; */;',
    )).rejects.toThrow(/nested executable comment|parsed safely/i);
  });

  it('rejects a nested /*! inside account syntax', async () => {
    await expect(sanitized(
      'CREATE DEFINER=/*!50017 u*/@h TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;',
    )).rejects.toThrow(/parsed safely/i);
  });

  it('rejects a nested /*! after DEFINER and before the object keyword', async () => {
    await expect(sanitized(
      'CREATE DEFINER=u@h /*!50000 TRIGGER*/ `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;',
    )).rejects.toThrow(/parsed safely/i);
  });

  it('preserves valid single-level version-comment dumps', async () => {
    const trigger = await sanitized(
      '/*!50003 CREATE*/ /*!50017 DEFINER=`u`@`h`*/ /*!50003 TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; */;',
    );
    expect(trigger.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(trigger.sanitized).toContain('TRIGGER');

    const view = await sanitized(
      '/*!50001 CREATE ALGORITHM=UNDEFINED */\n' +
      '/*!50013 DEFINER=`u`@`h` SQL SECURITY DEFINER */\n' +
      '/*!50001 VIEW `v` AS SELECT 1 */;',
    );
    expect(view.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(view.sanitized).toContain('SQL SECURITY DEFINER');

    const sameComment = await sanitized(
      '/*!50003 CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; */;',
    );
    expect(sameComment.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(sameComment.sanitized).toContain('CREATE TRIGGER');
  });

  it('handles multiple independent version comments in one dump', async () => {
    const result = await sanitized(
      '/*!50003 CREATE*/ /*!50017 DEFINER=`u`@`h`*/ /*!50003 TRIGGER `a` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; */;\n' +
      '/*!50003 CREATE*/ /*!50017 DEFINER=`u`@`h`*/ /*!50003 TRIGGER `b` BEFORE INSERT ON `x` FOR EACH ROW SET @b=1; */;',
    );
    expect(result.edits).toHaveLength(2);
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
  });

  it('handles mixed ordinary and version comments', async () => {
    const result = await sanitized(
      '/* ordinary preface */\n' +
      '/*!50003 CREATE*/ /*!50017 DEFINER=`u`@`h`*/ /* ordinary between */ /*!50003 TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; */;',
    );
    expect(result.edits).toHaveLength(1);
    expect(result.sanitized).toContain('/* ordinary preface */');
    expect(result.sanitized).toContain('/* ordinary between */');
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
  });

  it('publishes nothing for nested-comment input', async () => {
    const input = writeTemp(
      'nested-comment-bad.sql',
      '/*!50003 CREATE /*!50017 DEFINER=`u`@`h`*/ TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1; */;',
    );
    const output = tempPath('nested-comment-bad.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/parsed safely|nested executable comment/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
  });
});

describe('sanitizer — bare account character policy (NEW-03)', () => {
  const tail = 'TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';
  const rejected = ['!', '*', ',', '+', '=', '[', ']', '{', '}', '|', '&', '^', '~', '\\', '<', '>', '/'];

  it('rejects unsupported characters in user and host components', async () => {
    for (const character of rejected) {
      await expect(sanitized(`CREATE DEFINER=u${character}@h ${tail}`))
        .rejects.toThrow(/parsed safely/i);
      await expect(sanitized(`CREATE DEFINER=u@h${character} ${tail}`))
        .rejects.toThrow(/parsed safely/i);
    }
  });

  it('rejects host-only separators in the user component', async () => {
    for (const character of ['.', '%', ':', '-']) {
      await expect(sanitized(`CREATE DEFINER=u${character}@h ${tail}`))
        .rejects.toThrow(/parsed safely/i);
    }
  });

  it('accepts valid ASCII, Unicode, underscore, and digit account names', async () => {
    expect((await sanitized('CREATE DEFINER=user_1@host_1 ' + tail)).sanitized).toBe(`CREATE ${tail}`);
    expect((await sanitized(`CREATE DEFINER=us\u00e9r@h\u00f6st ${tail}`)).sanitized).toBe(`CREATE ${tail}`);
    expect((await sanitized('CREATE DEFINER=user_1@127.0.0.1 ' + tail)).sanitized).toBe(`CREATE ${tail}`);
    expect((await sanitized('CREATE DEFINER=user@% ' + tail)).sanitized).toBe(`CREATE ${tail}`);
  });

  it('accepts quoted identifiers containing punctuation', async () => {
    expect((await sanitized("CREATE DEFINER='u!*'@'h!*' " + tail)).sanitized).toBe(`CREATE ${tail}`);
    expect((await sanitized('CREATE DEFINER=`u.ser`@`127.0.0.1` ' + tail)).sanitized).toBe(`CREATE ${tail}`);
    expect((await sanitized('CREATE DEFINER=`u``x`@`h` ' + tail)).sanitized).toBe(`CREATE ${tail}`);
  });

  it('preserves CURRENT_USER and empty-component rejection', async () => {
    expect((await sanitized(`CREATE DEFINER=CURRENT_USER ${tail}`)).sanitized).toBe(`CREATE ${tail}`);
    expect((await sanitized(`CREATE DEFINER=CURRENT_USER() ${tail}`)).sanitized).toBe(`CREATE ${tail}`);
    await expect(sanitized(`CREATE DEFINER=@h ${tail}`)).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE DEFINER=u@ ${tail}`)).rejects.toThrow(/parsed safely/i);
  });

  it('publishes nothing for an unsupported bare account character', async () => {
    const input = writeTemp('bare-char-bad.sql', `CREATE DEFINER=u!@h ${tail}`);
    const output = tempPath('bare-char-bad.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/parsed safely/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
  });
});

describe('sanitizer — executable comment ambiguity (ADD-05)', () => {
  const tail = 'TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';

  it('rejects */ inside single-quoted strings in a version comment', async () => {
    await expect(sanitized(
      `/*!50003 CREATE '*/' DEFINER=\`u\`@\`h\` ${tail} */;`,
    )).rejects.toThrow(/parsed safely|ambiguous/i);
  });

  it('rejects */ inside double-quoted strings in a version comment', async () => {
    await expect(sanitized(
      `/*!50003 CREATE "*/" DEFINER=\`u\`@\`h\` ${tail} */;`,
    )).rejects.toThrow(/parsed safely|ambiguous/i);
  });

  it('rejects */ inside backtick identifiers in a version comment', async () => {
    await expect(sanitized(
      `/*!50003 CREATE \`*/\` DEFINER=\`u\`@\`h\` ${tail} */;`,
    )).rejects.toThrow(/parsed safely|ambiguous/i);
  });

  it('rejects */ in a quoted value after DEFINER in a version comment', async () => {
    await expect(sanitized(
      `/*!50003 CREATE DEFINER=\`u\`@\`h\` '*/' ${tail} */;`,
    )).rejects.toThrow(/parsed safely|ambiguous/i);
  });

  it('rejects ordinary block comments in a version comment', async () => {
    await expect(sanitized(
      `/*!50003 CREATE /* c */ DEFINER=\`u\`@\`h\` ${tail} */;`,
    )).rejects.toThrow(/parsed safely|ambiguous/i);
  });

  it('rejects line and hash comments in a version comment', async () => {
    await expect(sanitized(
      `/*!50003 CREATE -- c\n DEFINER=\`u\`@\`h\` ${tail} */;`,
    )).rejects.toThrow(/parsed safely|ambiguous/i);
    await expect(sanitized(
      `/*!50003 CREATE # c\n DEFINER=\`u\`@\`h\` ${tail} */;`,
    )).rejects.toThrow(/parsed safely|ambiguous/i);
  });

  it('preserves a valid executable-comment closure', async () => {
    const result = await sanitized(
      `/*!50003 CREATE*/ /*!50017 DEFINER=\`u\`@\`h\`*/ /*!50003 ${tail} */;`,
    );
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('TRIGGER');
  });

  it('rejects an unclosed executable comment', async () => {
    await expect(sanitized(
      `/*!50003 CREATE DEFINER=\`u\`@\`h\` ${tail}`,
    )).rejects.toThrow(/ends inside|parsed safely/i);
  });

  it('publishes nothing for ambiguous comment content', async () => {
    const input = writeTemp(
      'ambiguous-comment.sql',
      `/*!50003 CREATE '*/' DEFINER=\`u\`@\`h\` ${tail} */;`,
    );
    const output = tempPath('ambiguous-comment.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/parsed safely|ambiguous/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
  });
});

describe('sanitizer — unexpected header tokens (ADD-06)', () => {
  const tail = 'TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';

  it('rejects string and quoted-identifier tokens before DEFINER', async () => {
    await expect(sanitized(`CREATE 'x' DEFINER=\`u\`@\`h\` ${tail}`))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE \`x\` DEFINER=\`u\`@\`h\` ${tail}`))
      .rejects.toThrow(/parsed safely/i);
  });

  it('rejects numeric and punctuation tokens before DEFINER', async () => {
    await expect(sanitized(`CREATE 123 DEFINER=\`u\`@\`h\` ${tail}`))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE , DEFINER=\`u\`@\`h\` ${tail}`))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE = DEFINER=\`u\`@\`h\` ${tail}`))
      .rejects.toThrow(/parsed safely/i);
  });

  it('preserves valid CREATE modifiers before DEFINER', async () => {
    expect((await sanitized(`CREATE OR REPLACE DEFINER=\`u\`@\`h\` VIEW \`v\` AS SELECT 1;`)).sanitized)
      .toBe('CREATE OR REPLACE VIEW `v` AS SELECT 1;');
    expect((await sanitized(`CREATE ALGORITHM=UNDEFINED DEFINER=\`u\`@\`h\` VIEW \`v\` AS SELECT 1;`)).sanitized)
      .toBe('CREATE ALGORITHM=UNDEFINED VIEW `v` AS SELECT 1;');
    expect((await sanitized(
      `CREATE OR REPLACE ALGORITHM=UNDEFINED DEFINER=\`u\`@\`h\` VIEW \`v\` AS SELECT 1;`,
    )).sanitized)
      .toBe('CREATE OR REPLACE ALGORITHM=UNDEFINED VIEW `v` AS SELECT 1;');
    expect((await sanitized(
      'CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v` AS SELECT 1;',
    )).sanitized)
      .toBe('CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v` AS SELECT 1;');
    expect((await sanitized(
      'CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v` AS SELECT 1;',
    )).sanitized)
      .toBe('CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v` AS SELECT 1;');
    expect((await sanitized(`CREATE /* c */ DEFINER=\`u\`@\`h\` ${tail}`)).sanitized)
      .toBe(`CREATE /* c */ ${tail}`);
  });

  it('does not reject non-DEFINER CREATE headers such as TEMPORARY TABLE', async () => {
    const sql = 'CREATE TEMPORARY TABLE `t` (`i` int);';
    expect((await sanitized(sql)).sanitized).toBe(sql);
  });

  it('preserves valid version-comment forms', async () => {
    const result = await sanitized(
      `/*!50003 CREATE*/ /*!50017 DEFINER=\`u\`@\`h\`*/ /*!50003 ${tail} */;`,
    );
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('TRIGGER');
  });

  it('fails closed when one of multiple statements has an unexpected header token', async () => {
    await expect(sanitized(
      `CREATE ${tail}\nCREATE 'x' DEFINER=\`u\`@\`h\` ${tail}`,
    )).rejects.toThrow(/parsed safely/i);
  });

  it('ignores CREATE-like text inside strings and ordinary comments', async () => {
    const result = await sanitized(
      `SELECT 'CREATE DEFINER=x@y TRIGGER';\n/* CREATE DEFINER=x@y TRIGGER */\nCREATE DEFINER=\`u\`@\`h\` ${tail}`,
    );
    expect(result.sanitized).toContain("'CREATE DEFINER=x@y TRIGGER'");
    expect(result.sanitized).toContain('/* CREATE DEFINER=x@y TRIGGER */');
    expect(result.sanitized).not.toMatch(/DEFINER\s*=\s*\`u\`/i);
  });

  it('leaves malformed non-DEFINER duplicate/misordered headers unchanged', async () => {
    const fixtures = [
      'CREATE SQL SECURITY DEFINER SQL SECURITY INVOKER VIEW `v` AS SELECT 1;',
      'CREATE SQL SECURITY DEFINER OR REPLACE VIEW `v` AS SELECT 1;',
      'CREATE ALGORITHM=UNDEFINED ALGORITHM=MERGE VIEW `v` AS SELECT 1;',
    ];
    for (const sql of fixtures) {
      expect((await sanitized(sql)).sanitized).toBe(sql);
    }
  });

  it('rejects DEFINER-bearing duplicate/misordered modifiers', async () => {
    await expect(sanitized(
      'CREATE SQL SECURITY DEFINER SQL SECURITY INVOKER DEFINER=`u`@`h` VIEW `v` AS SELECT 1;',
    )).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(
      'CREATE ALGORITHM=UNDEFINED ALGORITHM=MERGE DEFINER=`u`@`h` VIEW `v` AS SELECT 1;',
    )).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(
      'CREATE SQL SECURITY DEFINER OR REPLACE DEFINER=`u`@`h` VIEW `v` AS SELECT 1;',
    )).rejects.toThrow(/parsed safely/i);
  });

  it('publishes nothing for an unexpected header token', async () => {
    const input = writeTemp('unexpected-header.sql', `CREATE 'x' DEFINER=\`u\`@\`h\` ${tail}`);
    const output = tempPath('unexpected-header.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/parsed safely/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
  });
});

// ── F2. Strict account boundaries (F1 regressions) ─────────────────────────

describe('sanitizer — strict account boundaries', () => {
  const tail = 'TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';
  const expected = `CREATE ${tail}`;

  it('fully removes a non-ASCII bare user', async () => {
    const result = await sanitized(`CREATE DEFINER=us\u00e9r@host ${tail}`);
    expect(result.sanitized).toBe(expected);
  });

  it('fully removes a non-ASCII bare host', async () => {
    const result = await sanitized(`CREATE DEFINER=u@h\u00f6st ${tail}`);
    expect(result.sanitized).toBe(expected);
  });

  it('supports comments between =, user, @ and host', async () => {
    const result = await sanitized(
      `CREATE DEFINER=/*a*/\`u\`/*b*/@/*c*/\`h\` /*d*/ ${tail}`,
    );
    expect(result.sanitized).not.toMatch(/DEFINER/i);
    expect(result.sanitized).toContain('TRIGGER');
    expect(result.sanitized).toContain('/*d*/');
  });

  it('supports comments between the user and a bare host', async () => {
    const result = await sanitized(`CREATE DEFINER=u/*x*/@h ${tail}`);
    expect(result.sanitized).toBe(expected);
  });

  it('rejects CURRENT_USER@host', async () => {
    await expect(sanitized(`CREATE DEFINER=CURRENT_USER@host ${tail}`))
      .rejects.toThrow(/parsed safely|object type/i);
  });

  it('treats CURRENT_USERx as a complete bare username', async () => {
    const result = await sanitized(`CREATE DEFINER=CURRENT_USERx ${tail}`);
    expect(result.sanitized).toBe(expected);
  });

  it('rejects a quoted host followed by garbage', async () => {
    await expect(sanitized(`CREATE DEFINER=\`u\`@\`h\`x ${tail}`))
      .rejects.toThrow(/parsed safely/i);
  });

  it('rejects a quoted username followed by garbage', async () => {
    await expect(sanitized(`CREATE DEFINER=\`u\`x@\`h\` ${tail}`))
      .rejects.toThrow(/parsed safely/i);
  });

  it('accepts CURRENT_USER() with valid parentheses only', async () => {
    expect((await sanitized(`CREATE DEFINER=CURRENT_USER() ${tail}`)).sanitized).toBe(expected);
    expect((await sanitized(`CREATE DEFINER=CURRENT_USER ( ) ${tail}`)).sanitized).toBe(expected);
    await expect(sanitized(`CREATE DEFINER=CURRENT_USER(@) ${tail}`)).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE DEFINER=CURRENT_USER( ${tail}`)).rejects.toThrow(/parsed safely/i);
  });

  it('treats CURRENT_USER2 as a complete bare username', async () => {
    const result = await sanitized(`CREATE DEFINER=CURRENT_USER2 ${tail}`);
    expect(result.sanitized).toBe(expected);
  });

  it('rejects an unterminated comment between tokens', async () => {
    await expect(sanitized(`CREATE DEFINER=u/*unterminated@h ${tail}`))
      .rejects.toThrow(/parsed safely/i);
  });

  it('rejects unsupported characters after the host', async () => {
    await expect(sanitized(`CREATE DEFINER=u@h)x ${tail}`)).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE DEFINER=u@h(x ${tail}`)).rejects.toThrow(/parsed safely/i);
  });

  it('rejects multiple DEFINER clauses in one header', async () => {
    await expect(sanitized(`CREATE DEFINER=\`a\`@\`b\` DEFINER=\`c\`@\`d\` ${tail}`))
      .rejects.toThrow(/parsed safely|object type/i);
  });

  it('rejects a version-comment close outside a version comment', async () => {
    await expect(sanitized(`CREATE DEFINER=u*/ ${tail}`)).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE DEFINER=u */ ${tail}`)).rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE DEFINER=\`u\`@\`h\`*/ ${tail}`)).rejects.toThrow(/parsed safely/i);
  });

  it('accepts a version-comment close inside its version comment', async () => {
    const result = await sanitized(
      `/*!50003 CREATE*/ /*!50017 DEFINER=\`u\`@\`h\`*/ /*!50003 ${tail} */;`,
    );
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('TRIGGER');
  });

  it('rejects continuation keywords with identifier suffixes', async () => {
    await expect(sanitized(`CREATE DEFINER=u TRIGGER1 TRIGGER \`t\` BEFORE INSERT ON \`x\` FOR EACH ROW SET @a=1;`))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE DEFINER=u VIEW1 VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE DEFINER=u SQL1 VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE DEFINER=u ALGORITHM1 VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE DEFINER=u TRIGGER$ ${tail}`))
      .rejects.toThrow(/parsed safely|object type/i);
  });

  it('rejects ALGORITHM after DEFINER', async () => {
    await expect(sanitized('CREATE DEFINER=u ALGORITHM=MERGE VIEW `v` AS SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized(`CREATE DEFINER=u ALGORITHM=MERGE ${tail}`))
      .rejects.toThrow(/parsed safely/i);
  });

  it('rejects SQL SECURITY after DEFINER for non-VIEW objects', async () => {
    await expect(sanitized(`CREATE DEFINER=u SQL SECURITY DEFINER ${tail}`))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE DEFINER=u SQL SECURITY DEFINER PROCEDURE `p`() SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE DEFINER=u SQL SECURITY DEFINER FUNCTION `f`() RETURNS int RETURN 1;'))
      .rejects.toThrow(/parsed safely/i);
    await expect(sanitized('CREATE DEFINER=u SQL SECURITY DEFINER EVENT `e` ON SCHEDULE EVERY 1 DAY DO SELECT 1;'))
      .rejects.toThrow(/parsed safely/i);
  });

  it('accepts SQL SECURITY only in a VIEW context', async () => {
    expect((await sanitized('CREATE DEFINER=u SQL SECURITY DEFINER VIEW `v` AS SELECT 1;')).sanitized)
      .toBe('CREATE SQL SECURITY DEFINER VIEW `v` AS SELECT 1;');
    expect((await sanitized('CREATE DEFINER=u SQL SECURITY INVOKER VIEW `v` AS SELECT 1;')).sanitized)
      .toBe('CREATE SQL SECURITY INVOKER VIEW `v` AS SELECT 1;');
    await expect(sanitized(
      `/*!50003 CREATE*/ /*!50017 DEFINER=\`u\`@\`h\` SQL SECURITY DEFINER */ /*!50003 ${tail} */;`,
    )).rejects.toThrow(/only valid for VIEW/i);
  });

  it('rejects -- without the whitespace MySQL requires', async () => {
    await expect(sanitized(`CREATE DEFINER=u--x\n${tail}`))
      .rejects.toThrow(/parsed safely/i);
    const result = await sanitized(`CREATE DEFINER=u-- comment\n${tail}`);
    expect(result.sanitized).not.toMatch(/DEFINER\s*=/i);
    expect(result.sanitized).toContain('TRIGGER');
  });

  it('rejects an executable comment between DEFINER and =', async () => {
    await expect(sanitized(`CREATE DEFINER /*!50000 x */ = \`u\`@\`h\` ${tail}`))
      .rejects.toThrow(/parsed safely/i);
  });

  it('does not let comment text affect CREATE token boundaries', async () => {
    const result = await sanitized(`-- @todo\nCREATE DEFINER=u@h ${tail}`);
    expect(result.sanitized).toBe(`-- @todo\n${expected}`);
    expect(result.edits).toHaveLength(1);
  });

  it('publishes nothing when the parser rejects the input', async () => {
    const input = writeTemp('boundary-bad.sql', `CREATE DEFINER=CURRENT_USER@host ${tail}`);
    const output = tempPath('boundary-bad.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/parsed safely|object type/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
    expect(readFileSync(input, 'utf8')).toContain('CURRENT_USER@host');
  });

  it('publishes nothing for a malformed continuation', async () => {
    const input = writeTemp('continuation-bad.sql', `CREATE DEFINER=u*/ ${tail}`);
    const output = tempPath('continuation-bad.out.sql');
    await expect(sanitizer.sanitizeFile({ inputPath: input, outputPath: output }))
      .rejects.toThrow(/parsed safely/i);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.manifest.json`)).toBe(false);
    expect(readFileSync(input, 'utf8')).toContain('DEFINER=u*/');
  });
});

describe('sanitizer — span and format safety', () => {
  it('rejects overlapping removal spans', () => {
    expect(() => sanitizer.applyRemovals('abcdef', [
      { start: 1, end: 4 },
      { start: 3, end: 5 },
    ])).toThrow(/Overlapping/i);
  });

  it('rejects every invalid span range without clamping', () => {
    const cases: Array<Array<{ start: number; end: number }>> = [
      [{ start: -1, end: 3 }],
      [{ start: 1, end: -1 }],
      [{ start: 3, end: 3 }],
      [{ start: 4, end: 3 }],
      [{ start: 2, end: 99 }],
      [{ start: 99, end: 100 }],
      [{ start: 1.5, end: 3 }],
      [{ start: 1, end: 2.5 }],
      [{ start: Number.NaN, end: 3 }],
    ];
    for (const spans of cases) {
      expect(() => sanitizer.applyRemovals('abcdef', spans))
        .toThrow(/Invalid DEFINER removal span|Empty DEFINER removal span/i);
    }
  });

  it('applies unsorted non-overlapping spans in order (sorting is contractual)', () => {
    expect(sanitizer.applyRemovals('abcdef', [
      { start: 3, end: 5 },
      { start: 1, end: 3 },
    ])).toBe('af');
  });

  it('changes exactly the recorded span and preserves surrounding bytes', async () => {
    const input = 'PREFIX\nCREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\nSUFFIX\n';
    const result = await sanitized(input);
    const expectedOutput = input.slice(0, result.edits[0].start) + input.slice(result.edits[0].end);
    expect(result.sanitized).toBe(expectedOutput);
    expect(result.sanitized).toContain('PREFIX');
    expect(result.sanitized).toContain('SUFFIX');
  });

  it('preserves CRLF line endings outside the removed span', async () => {
    const input =
      'CREATE DEFINER=`u`@`h` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\r\n' +
      'CREATE TABLE `y` (`i` int);\r\n';
    const result = await sanitized(input);
    expect(result.sanitized).not.toMatch(/DEFINER/i);
    expect(result.sanitized).toContain('\r\nCREATE TABLE `y`');
    expect(result.sanitized.startsWith('CREATE ')).toBe(true);
  });

  it('leaves DELIMITER lines untouched', async () => {
    const input =
      'DELIMITER ;;\n' +
      'CREATE DEFINER=`u`@`h` PROCEDURE `p`() BEGIN SELECT 1; END;;\n' +
      'DELIMITER ;\n';
    const result = await sanitized(input);
    expect(result.sanitized).toContain('DELIMITER ;;');
    expect(result.sanitized).toContain('DELIMITER ;');
    expect(result.sanitized).not.toMatch(/DEFINER/i);
  });
});

// ── G. CLI contract ─────────────────────────────────────────────────────────
describe('sanitizer — CLI contract', () => {
  it('prints usage with --help', async () => {
    const output: string[] = [];
    const code = await sanitizer.main(['--help'], {
      stdout: (line: string) => output.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(output.join('\n')).toContain('DEFINER sanitizer');
  });

  it('returns a usage error when arguments are missing', async () => {
    const errors: string[] = [];
    const code = await sanitizer.main(['--input', 'x.sql'], {
      stdout: () => undefined,
      stderr: (line: string) => errors.push(line),
    });
    expect(code).toBe(2);
    expect(errors.join('\n')).toMatch(/--input and --output are required/);
  });

  it('rejects unknown arguments', async () => {
    const errors: string[] = [];
    const code = await sanitizer.main(['--input', 'a', '--output', 'b', '--force'], {
      stdout: () => undefined,
      stderr: (line: string) => errors.push(line),
    });
    expect(code).toBe(2);
    expect(errors.join('\n')).toMatch(/Unknown argument/);
  });

  it('succeeds end-to-end and reports both checksums', async () => {
    const input = writeTemp('cli.sql', SAMPLE_SQL);
    const output = tempPath('cli.out.sql');
    const lines: string[] = [];
    const code = await sanitizer.main(['--input', input, '--output', output], {
      stdout: (line: string) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('DEFINER clauses removed: 2');
    expect(lines.join('\n')).toContain('Original SHA-256');
    expect(lines.join('\n')).toContain('does not authorize a production restore');
  });
});
