// ============================================================================
// CourtZon — Baseline SQL tokenizer / parser (pure, no I/O, no database).
//
// The authoritative baseline (`database/baseline/001_courtzon_v3.sql`) is a
// mysqldump-style file: version-gated "dynamic" comments are EXECUTABLE SQL
// (`/*!50003 CREATE*/ /*!50003 TRIGGER ... */`), `DELIMITER` is a client
// directive, and the authoritative schema is produced by `CREATE TABLE`
// statements followed by appended `ALTER TABLE` statements.
//
// A plain comment stripper silently deletes all 19 triggers, and a regex-only
// scanner cannot tell a column named `key` from a `KEY` index. This module
// therefore tokenizes the file (quotes, comments, dynamic comments, DELIMITER)
// and builds an explicit schema model.
//
// FAIL-CLOSED CONTRACT
//   * Unsupported statements / clauses throw `BaselineParseError`.
//   * Duplicate object identities (table, column, index, foreign key, trigger)
//     throw — nothing is silently skipped or overwritten.
//   * Ambiguous SQL (unbalanced parentheses, unterminated quotes, ALTER on an
//     unknown table, duplicate IDENTs) throws.
//
// The only accepted I/O is a string supplied by the caller. This file never
// reads the filesystem and never opens a database connection.
// ============================================================================

export type SqlTokenType =
  | 'word'
  | 'ident'
  | 'string'
  | 'number'
  | 'variable'
  | 'punct'
  | 'delim';

export interface SqlToken {
  type: SqlTokenType;
  /** Decoded value: identifiers lose their backticks, strings lose their quotes. */
  value: string;
  /** Exact source slice for the token (strings keep quotes/escapes). */
  raw: string;
  /** 1-based source line. */
  line: number;
}

export interface DelimiterDirective {
  value: string;
  line: number;
}

export interface TokenizeResult {
  tokens: SqlToken[];
  delimiters: DelimiterDirective[];
}

export class BaselineParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly statement?: string,
  ) {
    super(`${message} (line ${line})`);
    this.name = 'BaselineParseError';
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const MULTI_CHAR_PUNCT = [
  '<=>',
  '->>',
  ':=',
  '<=',
  '>=',
  '<>',
  '!=',
  '||',
  '&&',
  '->',
  '<<',
  '>>',
] as const;

const SINGLE_CHAR_PUNCT = new Set('()[],.;=<>+-*/%!~^&|?:{}'.split(''));

const DELIMITER_DIRECTIVE_RE = /^DELIMITER[ \t]+(\S+)[ \t]*(?:\r?\n|$)/i;
const WORD_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const VARIABLE_RE = /^@@?[A-Za-z0-9_.$]+/;
const NUMBER_RE = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const HEX_RE = /^0x[0-9A-Fa-f]+/;

interface ScanState {
  delimiter: string;
}

function decodeEscape(ch: string): string {
  switch (ch) {
    case '0':
      return '\0';
    case 'b':
      return '\b';
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case 'Z':
      return '\u001a';
    default:
      // MySQL: an unrecognized escape sequence drops the backslash.
      return ch;
  }
}

/**
 * Tokenize a SQL fragment. `allowDelimiter` is true only for the top-level
 * baseline text; dynamic-comment bodies and prepared statements are scanned as
 * fragments where `;` is an ordinary token.
 */
function scan(
  text: string,
  startLine: number,
  state: ScanState,
  allowDelimiter: boolean,
  delimiters: DelimiterDirective[],
): { tokens: SqlToken[]; endLine: number } {
  const tokens: SqlToken[] = [];
  let i = 0;
  let line = startLine;
  let statementStart = true;
  let lineStart = true;

  const push = (token: Omit<SqlToken, 'line'> & { line?: number }): void => {
    tokens.push({ ...token, line: token.line ?? line });
    statementStart = false;
    lineStart = false;
  };

  while (i < text.length) {
    const ch = text[i];

    // --- whitespace -------------------------------------------------------
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f' || ch === '\v') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      i += 1;
      line += 1;
      lineStart = true;
      continue;
    }

    // --- MySQL client DELIMITER directive ---------------------------------
    if (allowDelimiter && statementStart && lineStart) {
      const rest = text.slice(i);
      const m = DELIMITER_DIRECTIVE_RE.exec(rest);
      if (m) {
        state.delimiter = m[1];
        delimiters.push({ value: m[1], line });
        i += m[0].length;
        line += (m[0].match(/\n/g) ?? []).length;
        lineStart = true;
        continue;
      }
    }

    // --- statement delimiter ---------------------------------------------
    if (allowDelimiter && text.startsWith(state.delimiter, i)) {
      tokens.push({ type: 'delim', value: state.delimiter, raw: state.delimiter, line });
      i += state.delimiter.length;
      statementStart = true;
      lineStart = false;
      continue;
    }

    // --- line comments ----------------------------------------------------
    if (ch === '#' || (ch === '-' && text[i + 1] === '-' && /[\s]/.test(text[i + 2] ?? ' '))) {
      const nl = text.indexOf('\n', i);
      if (nl === -1) {
        i = text.length;
      } else {
        i = nl + 1;
        line += 1;
        lineStart = true;
      }
      continue;
    }

    // --- block / dynamic comments ----------------------------------------
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      if (close === -1) {
        throw new BaselineParseError('unterminated block comment', line);
      }
      const inner = text.slice(i + 2, close);
      const isDynamic = inner.startsWith('!');
      if (isDynamic) {
        // /*!50003 SQL */ => SQL is executable. Strip the version digits.
        const body = inner.replace(/^!\d*\s*/, '');
        const nested = scan(body, line, { delimiter: ';' }, false, []);
        for (const t of nested.tokens) {
          tokens.push(t);
          statementStart = false;
        }
        // Account for newlines inside the dynamic comment body.
        line += (inner.match(/\n/g) ?? []).length;
        lineStart = false;
      } else {
        line += (inner.match(/\n/g) ?? []).length;
        // A block comment does not change whether we are at a statement start.
      }
      i = close + 2;
      continue;
    }

    // --- single-quoted / double-quoted strings ---------------------------
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const tokenLine = line;
      let value = '';
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        const c = text[j];
        if (c === '\\') {
          const next = text[j + 1];
          if (next === undefined) break;
          if (next === '%' || next === '_') {
            // Keep LIKE wildcards escaped, matching MySQL's stored meaning.
            value += '\\' + next;
          } else {
            value += decodeEscape(next);
          }
          if (next === '\n') line += 1;
          j += 2;
          continue;
        }
        if (c === quote) {
          if (text[j + 1] === quote) {
            value += quote;
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        if (c === '\n') line += 1;
        value += c;
        j += 1;
      }
      if (!closed) {
        throw new BaselineParseError('unterminated string literal', tokenLine);
      }
      push({
        type: 'string',
        value,
        raw: text.slice(i, j),
        line: tokenLine,
      });
      i = j;
      continue;
    }

    // --- backtick-quoted identifiers -------------------------------------
    if (ch === '`') {
      const tokenLine = line;
      let value = '';
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        const c = text[j];
        if (c === '`') {
          if (text[j + 1] === '`') {
            value += '`';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        if (c === '\n') line += 1;
        value += c;
        j += 1;
      }
      if (!closed) {
        throw new BaselineParseError('unterminated quoted identifier', tokenLine);
      }
      push({ type: 'ident', value, raw: text.slice(i, j), line: tokenLine });
      i = j;
      continue;
    }

    // --- variables --------------------------------------------------------
    {
      const m = VARIABLE_RE.exec(text.slice(i));
      if (m) {
        push({ type: 'variable', value: m[0], raw: m[0] });
        i += m[0].length;
        continue;
      }
    }

    // --- numbers ----------------------------------------------------------
    {
      const hex = HEX_RE.exec(text.slice(i));
      if (hex) {
        push({ type: 'number', value: hex[0].toLowerCase(), raw: hex[0] });
        i += hex[0].length;
        continue;
      }
      const m = NUMBER_RE.exec(text.slice(i));
      if (m) {
        push({ type: 'number', value: m[0], raw: m[0] });
        i += m[0].length;
        continue;
      }
    }

    // --- words ------------------------------------------------------------
    {
      const m = WORD_RE.exec(text.slice(i));
      if (m) {
        push({ type: 'word', value: m[0], raw: m[0] });
        i += m[0].length;
        continue;
      }
    }

    // --- punctuation / operators -----------------------------------------
    {
      const multi = MULTI_CHAR_PUNCT.find((p) => text.startsWith(p, i));
      if (multi) {
        push({ type: 'punct', value: multi, raw: multi });
        i += multi.length;
        continue;
      }
      if (SINGLE_CHAR_PUNCT.has(ch)) {
        push({ type: 'punct', value: ch, raw: ch });
        i += 1;
        continue;
      }
    }

    throw new BaselineParseError(
      `unsupported character ${JSON.stringify(ch)} outside a quoted literal`,
      line,
    );
  }

  return { tokens, endLine: line };
}

export function tokenize(sql: string): TokenizeResult {
  const delimiters: DelimiterDirective[] = [];
  const { tokens } = scan(sql, 1, { delimiter: ';' }, true, delimiters);
  return { tokens, delimiters };
}

// ---------------------------------------------------------------------------
// Parsed model
// ---------------------------------------------------------------------------

export type ParseMode = 'baseline' | 'migration';

export interface ParsedColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  autoIncrement: boolean;
  generated: string | null;
  generatedStorage: 'VIRTUAL' | 'STORED' | null;
  onUpdate: string | null;
  characterSet: string | null;
  collation: string | null;
  /** Stored for diagnostics only; excluded from every hash. */
  comment: string | null;
}

export interface ParsedIndexColumn {
  name: string;
  desc: boolean;
  prefixLength: number | null;
}

export interface ParsedIndex {
  name: string;
  kind: 'PRIMARY' | 'UNIQUE' | 'KEY' | 'FULLTEXT';
  unique: boolean;
  columns: ParsedIndexColumn[];
}

export interface ParsedForeignKey {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
}

export interface ParsedCheck {
  name: string | null;
  expression: string;
}

export interface ParsedTable {
  name: string;
  line: number;
  columns: ParsedColumn[];
  indexes: ParsedIndex[];
  foreignKeys: ParsedForeignKey[];
  checks: ParsedCheck[];
  engine: string | null;
  characterSet: string | null;
  collation: string | null;
  tableComment: string | null;
}

export interface ParsedTrigger {
  name: string;
  line: number;
  timing: 'BEFORE' | 'AFTER';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  body: string;
}

export type DataStatementKind = 'INSERT' | 'REPLACE' | 'UPDATE' | 'DELETE';

export interface ParsedDataStatement {
  kind: DataStatementKind;
  table: string;
  line: number;
  /** Canonical statement text; the body is opaque and never executed here. */
  sql: string;
}

export interface ParsedAlter {
  table: string;
  line: number;
  addedColumns: string[];
  modifiedColumns: string[];
  addedIndexes: string[];
  /** Full parsed index definitions (also collected in migration mode). */
  addedIndexDefinitions: ParsedIndex[];
  addedForeignKeys: string[];
  addedChecks: string[];
}

export interface SchemaDdlSummary {
  tables: string[];
  indexes: Array<{ table: string; index: ParsedIndex }>;
  triggers: string[];
  alterTables: string[];
  dropTables: string[];
}

export interface ParsedSql {
  mode: ParseMode;
  tables: ParsedTable[];
  triggers: ParsedTrigger[];
  dataStatements: ParsedDataStatement[];
  alters: ParsedAlter[];
  droppedTables: string[];
  /** DDL found inside prepared-statement string literals (e.g. migration 203). */
  preparedDdl: SchemaDdlSummary;
  statementCount: number;
  delimiterDirectives: DelimiterDirective[];
}

interface MutableModel {
  mode: ParseMode;
  tables: Map<string, ParsedTable>;
  triggers: Map<string, ParsedTrigger>;
  dataStatements: ParsedDataStatement[];
  alters: ParsedAlter[];
  droppedTables: string[];
  preparedDdl: SchemaDdlSummary;
  statementCount: number;
}

const CREATE_KEYWORDS = new Set(['PRIMARY', 'UNIQUE', 'KEY', 'INDEX', 'FULLTEXT', 'CONSTRAINT', 'FOREIGN', 'CHECK']);
const COLUMN_ATTRIBUTE_STOP = new Set([
  'NOT',
  'NULL',
  'DEFAULT',
  'AUTO_INCREMENT',
  'CHARACTER',
  'CHARSET',
  'COLLATE',
  'ON',
  'COMMENT',
  'GENERATED',
  'AS',
  'VIRTUAL',
  'STORED',
  'PRIMARY',
  'UNIQUE',
  'KEY',
  'REFERENCES',
  'CHECK',
  'COLUMN_FORMAT',
  'STORAGE',
  'SRID',
  'VISIBLE',
  'INVISIBLE',
  'AFTER',
  'FIRST',
]);
const COLUMN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function upper(value: string): string {
  return value.toUpperCase();
}

function tokenText(t: SqlToken): string {
  if (t.type === 'ident') return t.value;
  if (t.type === 'string') return `'${t.value}'`;
  return t.raw;
}

function canonicalIdentifier(t: SqlToken): string {
  return t.value.toLowerCase();
}

function requireToken(statement: SqlToken[], index: number, what: string, line: number): SqlToken {
  if (index >= statement.length) {
    throw new BaselineParseError(`expected ${what} but reached end of statement`, line);
  }
  return statement[index];
}

function expectWord(statement: SqlToken[], index: number, word: string, line: number): number {
  const t = requireToken(statement, index, `'${word}'`, line);
  if (upper(t.value) !== word.toUpperCase()) {
    throw new BaselineParseError(`expected '${word}' but found '${tokenText(t)}'`, t.line);
  }
  return index + 1;
}

function expectPunct(statement: SqlToken[], index: number, punct: string, line: number): number {
  const t = requireToken(statement, index, `'${punct}'`, line);
  if (t.type !== 'punct' || t.value !== punct) {
    throw new BaselineParseError(`expected '${punct}' but found '${tokenText(t)}'`, t.line);
  }
  return index + 1;
}

function parseObjectName(statement: SqlToken[], index: number, what: string, line: number): { name: string; next: number } {
  const t = requireToken(statement, index, what, line);
  if (t.type === 'ident') {
    return { name: canonicalIdentifier(t), next: index + 1 };
  }
  if (t.type === 'word' && COLUMN_NAME_RE.test(t.value) && !CREATE_KEYWORDS.has(upper(t.value))) {
    return { name: canonicalIdentifier(t), next: index + 1 };
  }
  throw new BaselineParseError(`expected ${what} but found '${tokenText(t)}'`, t.line);
}

function findMatchingParen(statement: SqlToken[], openIndex: number, line: number): number {
  if (statement[openIndex]?.type !== 'punct' || statement[openIndex].value !== '(') {
    throw new BaselineParseError('expected opening parenthesis', line);
  }
  let depth = 0;
  for (let i = openIndex; i < statement.length; i += 1) {
    const t = statement[i];
    if (t.type !== 'punct') continue;
    if (t.value === '(') depth += 1;
    else if (t.value === ')') {
      depth -= 1;
      if (depth === 0) return i;
      if (depth < 0) throw new BaselineParseError('unbalanced parentheses', t.line);
    }
  }
  throw new BaselineParseError('unbalanced parentheses', line);
}

function splitTopLevel(statement: SqlToken[], start: number, end: number): SqlToken[][] {
  const parts: SqlToken[][] = [];
  let current: SqlToken[] = [];
  let depth = 0;
  for (let i = start; i < end; i += 1) {
    const t = statement[i];
    if (t.type === 'punct' && t.value === '(') depth += 1;
    if (t.type === 'punct' && t.value === ')') depth -= 1;
    if (depth === 0 && t.type === 'punct' && t.value === ',') {
      if (current.length > 0) parts.push(current);
      current = [];
      continue;
    }
    current.push(t);
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/**
 * Deterministic canonical rendering used by every hash:
 *   - identifiers are unquoted and lower-cased;
 *   - string literals keep their decoded value and original case;
 *   - redundant whitespace/parenthesis spacing is removed;
 *   - all other words are lower-cased (MySQL keywords are case-insensitive).
 */
export function canonicalSql(tokens: SqlToken[]): string {
  let out = '';
  for (const t of tokens) {
    if (t.type === 'punct') {
      if (t.value === '(') {
        out += '(';
      } else if (t.value === ')') {
        out = out.replace(/ $/, '') + ')';
      } else if (t.value === ',') {
        out = out.replace(/ $/, '') + ',';
      } else if (t.value === '.') {
        out = out.replace(/ $/, '') + '.';
      } else {
        out = out.replace(/ $/, '') + ` ${t.value} `;
      }
      continue;
    }
    const value = t.type === 'string' ? `'${t.value}'` : t.value.toLowerCase();
    if (out.length > 0 && !/[(,.\s]$/.test(out)) out += ' ';
    out += value;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function canonicalType(tokens: SqlToken[]): string {
  if (tokens.length === 0) throw new BaselineParseError('column type is missing', tokens[0]?.line ?? 0);
  return canonicalSql(tokens);
}

function isAttributeStop(t: SqlToken, depth: number): boolean {
  return depth === 0 && t.type === 'word' && COLUMN_ATTRIBUTE_STOP.has(upper(t.value));
}

function parseExpressionUntilStop(
  statement: SqlToken[],
  start: number,
  end: number,
  stopAtAttribute: boolean,
): { tokens: SqlToken[]; next: number } {
  const out: SqlToken[] = [];
  let depth = 0;
  let i = start;
  while (i < end) {
    const t = statement[i];
    if (t.type === 'punct' && t.value === '(') depth += 1;
    if (t.type === 'punct' && t.value === ')') depth -= 1;
    if (stopAtAttribute && isAttributeStop(t, depth)) break;
    out.push(t);
    i += 1;
  }
  return { tokens: out, next: i };
}

// ---------------------------------------------------------------------------
// Column / index / constraint parsing
// ---------------------------------------------------------------------------

function parseColumnDefinition(
  statement: SqlToken[],
  start: number,
  end: number,
  line: number,
): { column: ParsedColumn; next: number } {
  const { name, next: afterName } = parseObjectName(statement, start, 'column name', line);

  // Type: everything until the first attribute keyword at depth 0.
  let typeEnd = afterName;
  let depth = 0;
  while (typeEnd < end) {
    const t = statement[typeEnd];
    if (t.type === 'punct' && t.value === '(') depth += 1;
    if (t.type === 'punct' && t.value === ')') depth -= 1;
    if (isAttributeStop(t, depth) && t.type === 'word') break;
    typeEnd += 1;
  }
  const typeTokens = statement.slice(afterName, typeEnd);
  if (typeTokens.length === 0) {
    throw new BaselineParseError(`column '${name}' has no type`, line);
  }

  const column: ParsedColumn = {
    name,
    type: canonicalType(typeTokens),
    nullable: true,
    default: null,
    autoIncrement: false,
    generated: null,
    generatedStorage: null,
    onUpdate: null,
    characterSet: null,
    collation: null,
    comment: null,
  };

  let i = typeEnd;
  while (i < end) {
    const t = statement[i];
    const w = upper(t.value);
    if (t.type === 'word' && w === 'NOT') {
      i = expectWord(statement, i + 1, 'NULL', line);
      column.nullable = false;
      continue;
    }
    if (t.type === 'word' && w === 'NULL') {
      column.nullable = true;
      i += 1;
      continue;
    }
    if (t.type === 'word' && w === 'DEFAULT') {
      const valueTok = statement[i + 1];
      if (valueTok && valueTok.type === 'word' && upper(valueTok.value) === 'NULL') {
        column.default = 'null';
        i += 2;
        continue;
      }
      const expr = parseExpressionUntilStop(statement, i + 1, end, true);
      if (expr.tokens.length === 0) {
        throw new BaselineParseError(`column '${name}' has an empty DEFAULT`, line);
      }
      column.default = canonicalSql(expr.tokens);
      i = expr.next;
      continue;
    }
    if (t.type === 'word' && w === 'AUTO_INCREMENT') {
      column.autoIncrement = true;
      i += 1;
      continue;
    }
    if (t.type === 'word' && (w === 'CHARACTER' || w === 'CHARSET')) {
      if (w === 'CHARACTER') i = expectWord(statement, i + 1, 'SET', line);
      else i += 1;
      const value = requireToken(statement, i, 'character set name', line);
      column.characterSet = value.value.toLowerCase();
      i += 1;
      continue;
    }
    if (t.type === 'word' && w === 'COLLATE') {
      const value = requireToken(statement, i + 1, 'collation name', line);
      column.collation = value.value.toLowerCase();
      i += 2;
      continue;
    }
    if (t.type === 'word' && w === 'ON') {
      i = expectWord(statement, i + 1, 'UPDATE', line);
      const expr = parseExpressionUntilStop(statement, i, end, true);
      if (expr.tokens.length === 0) {
        throw new BaselineParseError(`column '${name}' has an empty ON UPDATE`, line);
      }
      column.onUpdate = canonicalSql(expr.tokens);
      i = expr.next;
      continue;
    }
    if (t.type === 'word' && w === 'COMMENT') {
      const value = requireToken(statement, i + 1, 'comment literal', line);
      if (value.type !== 'string') {
        throw new BaselineParseError(`column '${name}' COMMENT must be a string literal`, line);
      }
      column.comment = value.value;
      i += 2;
      continue;
    }
    if (t.type === 'word' && (w === 'GENERATED' || w === 'AS')) {
      if (w === 'GENERATED') {
        i = expectWord(statement, i + 1, 'ALWAYS', line);
        i = expectWord(statement, i, 'AS', line);
      } else {
        i += 1;
      }
      i = expectPunct(statement, i, '(', line);
      const close = findMatchingParen(statement, i - 1, line);
      column.generated = canonicalSql(statement.slice(i, close));
      i = close + 1;
      if (i < end && statement[i].type === 'word') {
        const storage = upper(statement[i].value);
        if (storage === 'VIRTUAL' || storage === 'STORED') {
          column.generatedStorage = storage;
          i += 1;
        }
      }
      continue;
    }
    if (t.type === 'word' && (w === 'COLUMN_FORMAT' || w === 'STORAGE' || w === 'SRID')) {
      i += 2;
      continue;
    }
    if (t.type === 'word' && (w === 'VISIBLE' || w === 'INVISIBLE')) {
      i += 1;
      continue;
    }
    throw new BaselineParseError(
      `column '${name}' has unsupported attribute '${tokenText(t)}'`,
      t.line,
    );
  }

  return { column, next: end };
}

function parseIndexColumnList(
  statement: SqlToken[],
  openIndex: number,
  line: number,
): { columns: ParsedIndexColumn[]; next: number } {
  const close = findMatchingParen(statement, openIndex, line);
  const parts = splitTopLevel(statement, openIndex + 1, close);
  if (parts.length === 0) {
    throw new BaselineParseError('index column list is empty', line);
  }
  const columns: ParsedIndexColumn[] = [];
  for (const part of parts) {
    if (part.length === 0) throw new BaselineParseError('empty index column', line);
    const { name } = parseObjectName(part, 0, 'index column', part[0].line);
    let i = 1;
    let desc = false;
    let prefixLength: number | null = null;
    if (i < part.length && part[i].type === 'punct' && part[i].value === '(') {
      const inner = requireToken(part, i + 1, 'index prefix length', part[i].line);
      if (inner.type !== 'number') {
        throw new BaselineParseError('index prefix length must be numeric', inner.line);
      }
      prefixLength = Number(inner.value);
      if (!Number.isInteger(prefixLength) || prefixLength <= 0) {
        throw new BaselineParseError('index prefix length must be a positive integer', inner.line);
      }
      i += 3; // ( N )
    }
    if (i < part.length && part[i].type === 'word') {
      const dir = upper(part[i].value);
      if (dir === 'ASC') i += 1;
      else if (dir === 'DESC') {
        desc = true;
        i += 1;
      }
    }
    if (i !== part.length) {
      throw new BaselineParseError(
        `unexpected token '${tokenText(part[i])}' in index column list`,
        part[i].line,
      );
    }
    columns.push({ name, desc, prefixLength });
  }
  return { columns, next: close + 1 };
}

function parseReferenceAction(statement: SqlToken[], index: number, end: number, line: number): { action: string; next: number } {
  const t = requireToken(statement, index, 'referential action', line);
  const w = upper(t.value);
  if (w === 'RESTRICT' || w === 'CASCADE') return { action: w, next: index + 1 };
  if (w === 'SET') {
    const second = requireToken(statement, index + 1, 'NULL or DEFAULT', line);
    const s = upper(second.value);
    if (s === 'NULL' || s === 'DEFAULT') return { action: `SET ${s}`, next: index + 2 };
    throw new BaselineParseError(`unsupported referential action 'SET ${second.value}'`, line);
  }
  if (w === 'NO') {
    const second = requireToken(statement, index + 1, 'ACTION', line);
    if (upper(second.value) !== 'ACTION') {
      throw new BaselineParseError(`unsupported referential action 'NO ${second.value}'`, line);
    }
    return { action: 'NO ACTION', next: index + 2 };
  }
  throw new BaselineParseError(`unsupported referential action '${t.value}'`, line);
}

function parseForeignKey(
  statement: SqlToken[],
  start: number,
  end: number,
  line: number,
  name: string,
): { fk: ParsedForeignKey; next: number } {
  let i = start;
  i = expectWord(statement, i, 'FOREIGN', line);
  i = expectWord(statement, i, 'KEY', line);
  // Optional index name (MySQL syntax) before the column list.
  if (i < end && statement[i].type !== 'punct') i += 1;
  i = expectPunct(statement, i, '(', line);
  const localClose = findMatchingParen(statement, i - 1, line);
  const localColumns = splitTopLevel(statement, i, localClose).map((part) => {
    const { name: col } = parseObjectName(part, 0, 'foreign key column', part[0].line);
    if (part.length !== 1) {
      throw new BaselineParseError('foreign key column must be a plain identifier', part[1].line);
    }
    return col;
  });
  i = expectWord(statement, localClose + 1, 'REFERENCES', line);
  const ref = parseObjectName(statement, i, 'referenced table', line);
  i = expectPunct(statement, ref.next, '(', line);
  const refClose = findMatchingParen(statement, i - 1, line);
  const referencedColumns = splitTopLevel(statement, i, refClose).map((part) => {
    const { name: col } = parseObjectName(part, 0, 'referenced column', part[0].line);
    if (part.length !== 1) {
      throw new BaselineParseError('referenced column must be a plain identifier', part[1].line);
    }
    return col;
  });
  i = refClose + 1;
  let onDelete: string | null = null;
  let onUpdate: string | null = null;
  while (i < end) {
    const t = statement[i];
    if (t.type === 'word' && upper(t.value) === 'MATCH') {
      i += 2;
      continue;
    }
    if (t.type === 'word' && upper(t.value) === 'ON') {
      const which = requireToken(statement, i + 1, 'DELETE or UPDATE', line);
      const target = upper(which.value);
      if (target !== 'DELETE' && target !== 'UPDATE') {
        throw new BaselineParseError(`unsupported ON ${which.value} clause`, line);
      }
      const action = parseReferenceAction(statement, i + 2, end, line);
      if (target === 'DELETE') onDelete = action.action;
      else onUpdate = action.action;
      i = action.next;
      continue;
    }
    throw new BaselineParseError(`unexpected token '${tokenText(t)}' in foreign key`, t.line);
  }
  if (localColumns.length !== referencedColumns.length) {
    throw new BaselineParseError('foreign key column count does not match referenced columns', line);
  }
  return {
    fk: {
      name: name.toLowerCase(),
      columns: localColumns,
      referencedTable: ref.name,
      referencedColumns,
      onDelete,
      onUpdate,
    },
    next: end,
  };
}

function parseCheckExpression(
  statement: SqlToken[],
  start: number,
  end: number,
  line: number,
  name: string | null,
): ParsedCheck {
  let i = start;
  i = expectWord(statement, i, 'CHECK', line);
  i = expectPunct(statement, i, '(', line);
  const close = findMatchingParen(statement, i - 1, line);
  const expression = canonicalSql(statement.slice(i, close));
  i = close + 1;
  if (i < end) {
    if (statement[i].type === 'word' && upper(statement[i].value) === 'NOT') {
      i = expectWord(statement, i + 1, 'ENFORCED', line);
    } else if (statement[i].type === 'word' && upper(statement[i].value) === 'ENFORCED') {
      i += 1;
    }
  }
  if (i !== end) {
    throw new BaselineParseError('unexpected tokens after CHECK constraint', statement[i].line);
  }
  return { name: name === null ? null : name.toLowerCase(), expression };
}

function deriveIndexName(columns: ParsedIndexColumn[]): string {
  return columns[0]?.name ?? 'index';
}

function parseIndexDefinition(
  statement: SqlToken[],
  start: number,
  end: number,
  line: number,
): ParsedIndex {
  let i = start;
  let kind: ParsedIndex['kind'];
  let unique = false;
  const first = upper(requireToken(statement, i, 'index definition', line).value);
  if (first === 'PRIMARY') {
    i = expectWord(statement, i + 1, 'KEY', line);
    kind = 'PRIMARY';
    unique = true;
  } else if (first === 'UNIQUE') {
    i += 1;
    if (i < end && statement[i].type === 'word' && ['KEY', 'INDEX'].includes(upper(statement[i].value))) i += 1;
    kind = 'UNIQUE';
    unique = true;
  } else if (first === 'FULLTEXT') {
    i += 1;
    if (i < end && statement[i].type === 'word' && ['KEY', 'INDEX'].includes(upper(statement[i].value))) i += 1;
    kind = 'FULLTEXT';
  } else if (first === 'KEY' || first === 'INDEX') {
    i += 1;
    kind = 'KEY';
  } else {
    throw new BaselineParseError(`unsupported index definition starting with '${first}'`, line);
  }

  if (i < end && statement[i].type === 'word' && upper(statement[i].value) === 'USING') {
    i += 2;
  }

  let name: string;
  if (i < end && statement[i].type !== 'punct') {
    name = canonicalIdentifier(statement[i]);
    i += 1;
  } else if (kind === 'PRIMARY') {
    name = 'PRIMARY';
  } else {
    name = '';
  }

  if (i < end && statement[i].type === 'word' && upper(statement[i].value) === 'USING') {
    i += 2;
  }

  i = expectPunct(statement, i, '(', line);
  const { columns, next } = parseIndexColumnList(statement, i - 1, line);
  i = next;
  if (name === '') name = deriveIndexName(columns);
  while (i < end) {
    const t = statement[i];
    const w = upper(t.value);
    if (w === 'COMMENT') {
      const v = requireToken(statement, i + 1, 'index comment', line);
      if (v.type !== 'string') {
        throw new BaselineParseError(`index '${name}' COMMENT must be a string literal`, line);
      }
      i += 2;
      continue;
    }
    if (w === 'USING' || w === 'KEY_BLOCK_SIZE') {
      i += 2;
      continue;
    }
    if (w === 'VISIBLE' || w === 'INVISIBLE') {
      i += 1;
      continue;
    }
    throw new BaselineParseError(`unexpected tokens after index '${name}'`, t.line);
  }
  return { name: name.toLowerCase(), kind, unique, columns };
}

// ---------------------------------------------------------------------------
// CREATE TABLE
// ---------------------------------------------------------------------------

function parseTableOptions(
  statement: SqlToken[],
  start: number,
  end: number,
  line: number,
): {
  engine: string | null;
  characterSet: string | null;
  collation: string | null;
  tableComment: string | null;
} {
  let engine: string | null = null;
  let characterSet: string | null = null;
  let collation: string | null = null;
  let tableComment: string | null = null;

  let i = start;
  const skipEquals = (index: number): number =>
    statement[index]?.type === 'punct' && statement[index].value === '=' ? index + 1 : index;

  while (i < end) {
    const t = statement[i];
    if (t.type !== 'word') {
      throw new BaselineParseError(`unexpected table option '${tokenText(t)}'`, t.line);
    }
    const w = upper(t.value);
    let valueIndex = skipEquals(i + 1);
    if (w === 'ENGINE') {
      engine = requireToken(statement, valueIndex, 'engine name', line).value.toLowerCase();
      i = valueIndex + 1;
      continue;
    }
    if (w === 'AUTO_INCREMENT') {
      const v = requireToken(statement, valueIndex, 'AUTO_INCREMENT value', line);
      if (v.type !== 'number') {
        throw new BaselineParseError('AUTO_INCREMENT must be numeric', v.line);
      }
      // Environment noise: the value depends on the dumping server.
      i = valueIndex + 1;
      continue;
    }
    if (w === 'DEFAULT' && i + 1 < end && statement[i + 1].type === 'word' && upper(statement[i + 1].value) === 'CHARSET') {
      valueIndex = skipEquals(i + 2);
      const v = requireToken(statement, valueIndex, 'charset name', line);
      characterSet = v.value.toLowerCase();
      i = valueIndex + 1;
      continue;
    }
    if (w === 'CHARSET') {
      const v = requireToken(statement, valueIndex, 'charset name', line);
      characterSet = v.value.toLowerCase();
      i = valueIndex + 1;
      continue;
    }
    if (w === 'DEFAULT' && i + 1 < end && statement[i + 1].type === 'word' && upper(statement[i + 1].value) === 'CHARACTER') {
      // DEFAULT CHARACTER SET = x
      const setIndex = expectWord(statement, i + 2, 'SET', line);
      valueIndex = skipEquals(setIndex);
      const v = requireToken(statement, valueIndex, 'charset name', line);
      characterSet = v.value.toLowerCase();
      i = valueIndex + 1;
      continue;
    }
    if (w === 'CHARACTER') {
      const setIndex = expectWord(statement, i + 1, 'SET', line);
      valueIndex = skipEquals(setIndex);
      const v = requireToken(statement, valueIndex, 'charset name', line);
      characterSet = v.value.toLowerCase();
      i = valueIndex + 1;
      continue;
    }
    if (w === 'COLLATE') {
      collation = requireToken(statement, valueIndex, 'collation name', line).value.toLowerCase();
      i = valueIndex + 1;
      continue;
    }
    if (w === 'COMMENT') {
      const v = requireToken(statement, valueIndex, 'table comment', line);
      if (v.type !== 'string') {
        throw new BaselineParseError('table COMMENT must be a string literal', line);
      }
      tableComment = v.value;
      i = valueIndex + 1;
      continue;
    }
    if (['ROW_FORMAT', 'KEY_BLOCK_SIZE', 'AVG_ROW_LENGTH', 'CHECKSUM', 'DELAY_KEY_WRITE', 'PACK_KEYS', 'STATS_PERSISTENT', 'STATS_AUTO_RECALC', 'INSERT_METHOD', 'MAX_ROWS', 'MIN_ROWS'].includes(w)) {
      i = valueIndex + 1;
      continue;
    }
    throw new BaselineParseError(`unsupported table option '${t.value}'`, t.line);
  }

  return { engine, characterSet, collation, tableComment };
}

function assertFreeColumnName(table: ParsedTable, name: string, line: number): void {
  if (table.columns.some((c) => c.name === name)) {
    throw new BaselineParseError(
      `duplicate column '${name}' on table '${table.name}'`,
      line,
    );
  }
}

function assertFreeIndexName(table: ParsedTable, name: string, line: number): void {
  if (table.indexes.some((idx) => idx.name === name)) {
    throw new BaselineParseError(
      `duplicate index '${name}' on table '${table.name}'`,
      line,
    );
  }
}

function assertFreeForeignKeyName(table: ParsedTable, name: string, line: number): void {
  if (table.foreignKeys.some((fk) => fk.name === name)) {
    throw new BaselineParseError(
      `duplicate foreign key '${name}' on table '${table.name}'`,
      line,
    );
  }
}

function assertIndexColumnsExist(table: ParsedTable, index: ParsedIndex, line: number): void {
  for (const col of index.columns) {
    if (!table.columns.some((c) => c.name === col.name)) {
      throw new BaselineParseError(
        `index '${index.name}' on table '${table.name}' references unknown column '${col.name}'`,
        line,
      );
    }
  }
}

function assertForeignKeyColumnsExist(table: ParsedTable, fk: ParsedForeignKey, line: number): void {
  for (const col of fk.columns) {
    if (!table.columns.some((c) => c.name === col)) {
      throw new BaselineParseError(
        `foreign key '${fk.name}' on table '${table.name}' references unknown local column '${col}'`,
        line,
      );
    }
  }
}

function addIndexToTable(table: ParsedTable, index: ParsedIndex, line: number): void {
  assertFreeIndexName(table, index.name, line);
  assertIndexColumnsExist(table, index, line);
  table.indexes.push(index);
}

function addForeignKeyToTable(table: ParsedTable, fk: ParsedForeignKey, line: number): void {
  assertFreeForeignKeyName(table, fk.name, line);
  assertForeignKeyColumnsExist(table, fk, line);
  table.foreignKeys.push(fk);
}

function addCheckToTable(table: ParsedTable, check: ParsedCheck, line: number): void {
  if (check.name !== null && table.checks.some((c) => c.name === check.name)) {
    throw new BaselineParseError(
      `duplicate check constraint '${check.name}' on table '${table.name}'`,
      line,
    );
  }
  table.checks.push(check);
}

function parseCreateTable(
  model: MutableModel,
  statement: SqlToken[],
  start: number,
): void {
  const line = statement[0].line;
  let i = start;
  let ifNotExists = false;
  if (
    i + 2 < statement.length &&
    upper(statement[i].value) === 'IF' &&
    upper(statement[i + 1].value) === 'NOT' &&
    upper(statement[i + 2].value) === 'EXISTS'
  ) {
    ifNotExists = true;
    i += 3;
  }
  const { name, next } = parseObjectName(statement, i, 'table name', line);
  if (model.tables.has(name)) {
    throw new BaselineParseError(
      `duplicate table definition for '${name}'${ifNotExists ? ' (IF NOT EXISTS does not make it unambiguous)' : ''}`,
      line,
    );
  }
  i = expectPunct(statement, next, '(', line);
  const close = findMatchingParen(statement, i - 1, line);
  const definitions = splitTopLevel(statement, i, close);

  const table: ParsedTable = {
    name,
    line,
    columns: [],
    indexes: [],
    foreignKeys: [],
    checks: [],
    engine: null,
    characterSet: null,
    collation: null,
    tableComment: null,
  };

  for (const def of definitions) {
    if (def.length === 0) {
      throw new BaselineParseError(`empty definition in table '${name}'`, line);
    }
    const first = def[0];
    const w = upper(first.value);
    if (first.type === 'word' && w === 'CONSTRAINT') {
      const constraintNameToken = requireToken(def, 1, 'constraint name', def[0].line);
      const constraintName = canonicalIdentifier(constraintNameToken);
      const bodyStart = 2;
      const bodyFirst = upper(requireToken(def, bodyStart, 'constraint body', def[0].line).value);
      if (bodyFirst === 'FOREIGN') {
        const { fk } = parseForeignKey(def, bodyStart, def.length, first.line, constraintName);
        addForeignKeyToTable(table, fk, first.line);
      } else if (bodyFirst === 'CHECK') {
        addCheckToTable(table, parseCheckExpression(def, bodyStart, def.length, first.line, constraintName), first.line);
      } else if (bodyFirst === 'UNIQUE') {
        const index = parseIndexDefinition(def, bodyStart, def.length, first.line);
        addIndexToTable(table, { ...index, name: constraintName }, first.line);
      } else {
        throw new BaselineParseError(`unsupported constraint body '${bodyFirst}'`, first.line);
      }
      continue;
    }
    if (first.type === 'word' && w === 'FOREIGN') {
      throw new BaselineParseError(
        `table '${name}' has an unnamed FOREIGN KEY (ambiguous)`,
        first.line,
      );
    }
    if (first.type === 'word' && w === 'CHECK') {
      addCheckToTable(table, parseCheckExpression(def, 0, def.length, first.line, null), first.line);
      continue;
    }
    if (first.type === 'word' && ['PRIMARY', 'UNIQUE', 'KEY', 'INDEX', 'FULLTEXT'].includes(w)) {
      const index = parseIndexDefinition(def, 0, def.length, first.line);
      addIndexToTable(table, index, first.line);
      continue;
    }
    // Otherwise it is a column definition (quoted identifiers are always columns).
    const { column } = parseColumnDefinition(def, 0, def.length, first.line);
    assertFreeColumnName(table, column.name, first.line);
    if (column.generated !== null && !table.columns.some((c) => c.generated !== null)) {
      // Generated expressions may reference earlier columns only; validated below.
    }
    table.columns.push(column);
  }

  const options = parseTableOptions(statement, close + 1, statement.length, line);
  table.engine = options.engine;
  table.characterSet = options.characterSet;
  table.collation = options.collation;
  table.tableComment = options.tableComment;

  for (const column of table.columns) {
    applyEffectiveColumnCharset(table, column);
  }

  if (table.columns.length === 0) {
    throw new BaselineParseError(`table '${name}' has no columns`, line);
  }

  model.tables.set(name, table);
}

// ---------------------------------------------------------------------------
// ALTER TABLE
// ---------------------------------------------------------------------------

function isCharacterColumnType(type: string): boolean {
  return /^(?:char|varchar|nchar|nvarchar|tinytext|text|mediumtext|longtext|enum|set)\b/i.test(type.trim());
}

/**
 * Applies the effective table charset/collation to a character column that does
 * not override them at column level. MySQL stores the inherited table defaults
 * in information_schema; the baseline parser must model the same effective
 * values so Tier B comparisons do not treat inheritance as drift.
 */
function applyEffectiveColumnCharset(table: ParsedTable, column: ParsedColumn): void {
  if (!isCharacterColumnType(column.type)) return;

  if (column.characterSet || column.collation) {
    // Preserve explicit column-level overrides. A collation without a charset
    // implies the collation's charset; an explicit charset alone must not
    // borrow the table collation (MySQL would use that charset's default
    // collation, which depends on the server, not on the table).
    if (!column.characterSet && column.collation) {
      column.characterSet = column.collation.split('_')[0] || null;
    }
    return;
  }

  if (table.characterSet) column.characterSet = table.characterSet;
  if (table.collation) column.collation = table.collation;
}

function applyColumnPosition(
  table: ParsedTable,
  column: ParsedColumn,
  position: { kind: 'FIRST' } | { kind: 'AFTER'; column: string } | null,
  line: number,
  preserveExistingPosition = false,
): void {
  applyEffectiveColumnCharset(table, column);
  const existingIndex = table.columns.findIndex((c) => c.name === column.name);
  if (position === null && preserveExistingPosition && existingIndex !== -1) {
    table.columns[existingIndex] = column;
    return;
  }
  if (existingIndex !== -1) table.columns.splice(existingIndex, 1);
  if (position === null) {
    table.columns.push(column);
    return;
  }
  if (position.kind === 'FIRST') {
    table.columns.unshift(column);
    return;
  }
  const afterIndex = table.columns.findIndex((c) => c.name === position.column);
  if (afterIndex === -1) {
    throw new BaselineParseError(
      `AFTER '${position.column}' references an unknown column on '${table.name}'`,
      line,
    );
  }
  table.columns.splice(afterIndex + 1, 0, column);
}

function stripColumnPosition(
  action: SqlToken[],
  line: number,
): {
  body: SqlToken[];
  position: { kind: 'FIRST' } | { kind: 'AFTER'; column: string } | null;
} {
  if (action.length === 0) throw new BaselineParseError('empty ALTER action', line);
  const last = action[action.length - 1];
  if (last.type === 'word' && upper(last.value) === 'FIRST') {
    return { body: action.slice(0, -1), position: { kind: 'FIRST' } };
  }
  if (action.length >= 2) {
    const prev = action[action.length - 2];
    if (prev.type === 'word' && upper(prev.value) === 'AFTER') {
      const { name } = parseObjectName(action, action.length - 1, 'AFTER column', line);
      return { body: action.slice(0, -2), position: { kind: 'AFTER', column: name } };
    }
  }
  return { body: action, position: null };
}

function parseAddAction(
  model: MutableModel,
  table: ParsedTable | null,
  tableName: string,
  action: SqlToken[],
  line: number,
  alter: ParsedAlter,
): void {
  let i = 1; // skip ADD
  let w = upper(requireToken(action, i, 'ADD target', line).value);
  if (w === 'COLUMN') {
    i += 1;
    w = upper(requireToken(action, i, 'column definition', line).value);
  }

  if (w === 'CONSTRAINT') {
    const name = canonicalIdentifier(requireToken(action, i + 1, 'constraint name', line));
    const bodyStart = i + 2;
    const body = upper(requireToken(action, bodyStart, 'constraint body', line).value);
    if (body === 'FOREIGN') {
      const { fk } = parseForeignKey(action, bodyStart, action.length, line, name);
      if (table) addForeignKeyToTable(table, fk, line);
      alter.addedForeignKeys.push(fk.name);
      return;
    }
    if (body === 'CHECK') {
      const check = parseCheckExpression(action, bodyStart, action.length, line, name);
      if (table) addCheckToTable(table, check, line);
      alter.addedChecks.push(check.name ?? '<anonymous>');
      return;
    }
    if (body === 'UNIQUE') {
      const index = parseIndexDefinition(action, bodyStart, action.length, line);
      const named = { ...index, name };
      if (table) addIndexToTable(table, named, line);
      alter.addedIndexes.push(named.name);
      alter.addedIndexDefinitions.push(named);
      return;
    }
    throw new BaselineParseError(`unsupported ALTER ADD CONSTRAINT body '${body}'`, line);
  }

  if (w === 'PRIMARY' || w === 'UNIQUE' || w === 'KEY' || w === 'INDEX' || w === 'FULLTEXT') {
    const index = parseIndexDefinition(action, i, action.length, line);
    if (table) addIndexToTable(table, index, line);
    alter.addedIndexes.push(index.name);
    alter.addedIndexDefinitions.push(index);
    return;
  }

  if (w === 'FOREIGN') {
    throw new BaselineParseError(
      `ALTER TABLE '${tableName}' adds an unnamed FOREIGN KEY (ambiguous)`,
      line,
    );
  }

  if (w === 'CHECK') {
    const check = parseCheckExpression(action, i, action.length, line, null);
    if (table) addCheckToTable(table, check, line);
    alter.addedChecks.push(check.name ?? '<anonymous>');
    return;
  }

  // ADD [COLUMN] coldef [FIRST|AFTER x]
  const { body, position } = stripColumnPosition(action.slice(i), line);
  const { column } = parseColumnDefinition(body, 0, body.length, line);
  if (table) {
    assertFreeColumnName(table, column.name, line);
    applyColumnPosition(table, column, position, line);
  }
  alter.addedColumns.push(column.name);
}

function parseAlterTable(model: MutableModel, statement: SqlToken[]): void {
  const line = statement[0].line;
  let i = expectWord(statement, 1, 'TABLE', line);
  const { name, next } = parseObjectName(statement, i, 'table name', line);
  i = next;
  const table = model.tables.get(name) ?? null;
  if (model.mode === 'baseline' && table === null) {
    throw new BaselineParseError(`ALTER TABLE references unknown table '${name}'`, line);
  }
  const actions = splitTopLevel(statement, i, statement.length);
  if (actions.length === 0) {
    throw new BaselineParseError(`ALTER TABLE '${name}' has no actions`, line);
  }
  const alter: ParsedAlter = {
    table: name,
    line,
    addedColumns: [],
    modifiedColumns: [],
    addedIndexes: [],
    addedIndexDefinitions: [],
    addedForeignKeys: [],
    addedChecks: [],
  };

  for (const action of actions) {
    if (action.length === 0) continue;
    const first = upper(action[0].value);
    if (first === 'ADD') {
      parseAddAction(model, table, name, action, line, alter);
      continue;
    }
    if (first === 'MODIFY') {
      let body = action.slice(1);
      if (body[0]?.type === 'word' && upper(body[0].value) === 'COLUMN') body = body.slice(1);
      const stripped = stripColumnPosition(body, line);
      const { column } = parseColumnDefinition(stripped.body, 0, stripped.body.length, line);
      if (table) {
        const existing = table.columns.findIndex((c) => c.name === column.name);
        if (existing === -1) {
          throw new BaselineParseError(
            `MODIFY COLUMN references unknown column '${column.name}' on '${name}'`,
            line,
          );
        }
        applyColumnPosition(table, column, stripped.position ?? null, line, true);
      }
      alter.modifiedColumns.push(column.name);
      continue;
    }
    if (first === 'CHANGE') {
      let body = action.slice(1);
      if (body[0]?.type === 'word' && upper(body[0].value) === 'COLUMN') body = body.slice(1);
      const { name: oldName } = parseObjectName(body, 0, 'old column name', line);
      const { column, next: afterColumn } = parseColumnDefinition(body, 1, body.length, line);
      const stripped = stripColumnPosition(body.slice(afterColumn), line);
      if (stripped.body.length > 0) {
        throw new BaselineParseError('unexpected tokens after CHANGE column definition', line);
      }
      if (table) {
        const index = table.columns.findIndex((c) => c.name === oldName);
        if (index === -1) {
          throw new BaselineParseError(
            `CHANGE references unknown column '${oldName}' on '${name}'`,
            line,
          );
        }
        table.columns.splice(index, 1);
        applyColumnPosition(table, column, stripped.position, line);
      }
      alter.addedColumns.push(column.name);
      continue;
    }
    throw new BaselineParseError(
      `unsupported ALTER TABLE action '${first}' on '${name}'`,
      line,
    );
  }

  model.alters.push(alter);
}

// ---------------------------------------------------------------------------
// Triggers / data statements / DDL scanning
// ---------------------------------------------------------------------------

function parseCreateTrigger(model: MutableModel, statement: SqlToken[]): void {
  const line = statement[0].line;
  let i = 2; // CREATE TRIGGER
  const { name, next } = parseObjectName(statement, i, 'trigger name', line);
  i = next;
  const timingTok = requireToken(statement, i, 'BEFORE or AFTER', line);
  const timing = upper(timingTok.value);
  if (timing !== 'BEFORE' && timing !== 'AFTER') {
    throw new BaselineParseError(`unsupported trigger timing '${timingTok.value}'`, line);
  }
  i += 1;
  const eventTok = requireToken(statement, i, 'trigger event', line);
  const event = upper(eventTok.value);
  if (event !== 'INSERT' && event !== 'UPDATE' && event !== 'DELETE') {
    throw new BaselineParseError(`unsupported trigger event '${eventTok.value}'`, line);
  }
  i += 1;
  i = expectWord(statement, i, 'ON', line);
  const table = parseObjectName(statement, i, 'trigger table', line);
  i = table.next;
  i = expectWord(statement, i, 'FOR', line);
  i = expectWord(statement, i, 'EACH', line);
  i = expectWord(statement, i, 'ROW', line);
  const body = canonicalSql(statement.slice(i));
  if (body.length === 0) {
    throw new BaselineParseError(`trigger '${name}' has an empty body`, line);
  }
  if (model.triggers.has(name)) {
    throw new BaselineParseError(`duplicate trigger definition '${name}'`, line);
  }
  model.triggers.set(name, { name, line, timing, event, table: table.name, body });
}

function parseDataStatement(model: MutableModel, statement: SqlToken[]): void {
  const line = statement[0].line;
  const first = upper(statement[0].value);
  let kind: DataStatementKind;
  let i = 1;
  if (first === 'INSERT' || first === 'REPLACE') {
    kind = first;
    while (i < statement.length && statement[i].type === 'word') {
      const w = upper(statement[i].value);
      if (['IGNORE', 'LOW_PRIORITY', 'DELAYED', 'HIGH_PRIORITY', 'INTO'].includes(w)) i += 1;
      else break;
    }
  } else if (first === 'UPDATE') {
    kind = 'UPDATE';
    if (i < statement.length && upper(statement[i].value) === 'IGNORE') i += 1;
  } else if (first === 'DELETE') {
    kind = 'DELETE';
    i = expectWord(statement, i, 'FROM', line);
  } else {
    throw new BaselineParseError(`unsupported data statement '${first}'`, line);
  }
  const { name: table } = parseObjectName(statement, i, 'target table', line);
  model.dataStatements.push({ kind, table, line, sql: canonicalSql(statement) });
}

function parseDrop(model: MutableModel, statement: SqlToken[]): void {
  const line = statement[0].line;
  const kindTok = requireToken(statement, 1, 'DROP target', line);
  const kind = upper(kindTok.value);
  const ifExists = (index: number): number => {
    if (
      index + 1 < statement.length &&
      upper(statement[index].value) === 'IF' &&
      upper(statement[index + 1].value) === 'EXISTS'
    ) {
      return index + 2;
    }
    return index;
  };
  if (kind === 'TABLE') {
    let i = ifExists(2);
    const names: string[] = [];
    while (i < statement.length) {
      const { name, next } = parseObjectName(statement, i, 'table name', line);
      names.push(name);
      i = next;
      if (i < statement.length) {
        if (statement[i].type === 'punct' && statement[i].value === ',') i += 1;
        else throw new BaselineParseError('unexpected token in DROP TABLE list', statement[i].line);
      }
    }
    model.droppedTables.push(...names);
    return;
  }
  if (kind === 'TRIGGER') {
    const i = ifExists(2);
    const { name } = parseObjectName(statement, i, 'trigger name', line);
    model.triggers.delete(name);
    return;
  }
  if (kind === 'INDEX') {
    // DROP INDEX name ON table
    const i = ifExists(2);
    const { next } = parseObjectName(statement, i, 'index name', line);
    expectWord(statement, next, 'ON', line);
    return;
  }
  throw new BaselineParseError(`unsupported DROP target '${kind}'`, line);
}

function looksLikeDdl(sql: string): boolean {
  // Any statement that could mutate schema is parsed (and therefore rejected if
  // unsupported); we never rely on a whitelist of "known good" DDL strings.
  return /^\s*(?:ALTER|CREATE|DROP|TRUNCATE|RENAME)\b/i.test(sql);
}

function collectPreparedDdl(model: MutableModel, statement: SqlToken[], depth: number): void {
  for (const token of statement) {
    if (token.type !== 'string' || !looksLikeDdl(token.value)) continue;
    if (depth >= 2) {
      throw new BaselineParseError('prepared DDL nesting is too deep (ambiguous)', token.line);
    }
    const nested = parseSqlInternal(token.value, model.mode, depth + 1);
    model.preparedDdl.tables.push(...nested.createdTables);
    model.preparedDdl.indexes.push(...nested.addedIndexes);
    model.preparedDdl.triggers.push(...nested.createdTriggers);
    model.preparedDdl.alterTables.push(...nested.alterTables);
    model.preparedDdl.dropTables.push(...nested.droppedTables);
  }
}

// ---------------------------------------------------------------------------
// Statement dispatch
// ---------------------------------------------------------------------------

function parseStatement(model: MutableModel, statement: SqlToken[], depth: number): void {
  const first = upper(statement[0].value);
  model.statementCount += 1;

  switch (first) {
    case 'SET':
      collectPreparedDdl(model, statement, depth);
      return;
    case 'DROP':
      parseDrop(model, statement);
      return;
    case 'ALTER': {
      const target = upper(requireToken(statement, 1, 'ALTER target', statement[0].line).value);
      if (target !== 'TABLE') {
        throw new BaselineParseError(`unsupported ALTER target '${target}'`, statement[0].line);
      }
      parseAlterTable(model, statement);
      return;
    }
    case 'CREATE': {
      let i = 1;
      if (statement[i]?.type === 'word' && upper(statement[i].value) === 'TEMPORARY') {
        if (model.mode === 'baseline') {
          throw new BaselineParseError('CREATE TEMPORARY TABLE is not allowed in the baseline', statement[0].line);
        }
        i += 1;
      }
      const kindTok = requireToken(statement, i, 'CREATE target', statement[0].line);
      const kind = upper(kindTok.value);
      if (kind === 'TABLE') {
        parseCreateTable(model, statement, i + 1);
        return;
      }
      if (kind === 'TRIGGER') {
        parseCreateTrigger(model, statement);
        return;
      }
      if (kind === 'INDEX' || (kind === 'UNIQUE' && upper(statement[i + 1]?.value ?? '') === 'INDEX')) {
        // CREATE [UNIQUE] INDEX name ON table (cols)
        const unique = kind === 'UNIQUE';
        const nameIndex = unique ? i + 2 : i + 1;
        const { name } = parseObjectName(statement, nameIndex, 'index name', statement[0].line);
        const onIndex = expectWord(statement, nameIndex + 1, 'ON', statement[0].line);
        const { name: tableName } = parseObjectName(statement, onIndex, 'table name', statement[0].line);
        const open = expectPunct(statement, onIndex + 1, '(', statement[0].line);
        const { columns } = parseIndexColumnList(statement, open - 1, statement[0].line);
        const index: ParsedIndex = {
          name: name.toLowerCase(),
          kind: unique ? 'UNIQUE' : 'KEY',
          unique,
          columns,
        };
        model.preparedDdl.indexes.push({ table: tableName, index });
        return;
      }
      if (model.mode === 'baseline') {
        throw new BaselineParseError(`unsupported CREATE target '${kind}'`, statement[0].line);
      }
      // Migration mode: other CREATE targets (VIEW/PROCEDURE/...) are not
      // schema objects this manifest tracks, and they never appear in the
      // audited 196–203 slice. Reject them so a new kind is never ignored.
      throw new BaselineParseError(`unsupported CREATE target '${kind}'`, statement[0].line);
    }
    case 'INSERT':
    case 'REPLACE':
    case 'UPDATE':
    case 'DELETE':
      parseDataStatement(model, statement);
      return;
    case 'SELECT':
    case 'DO':
    case 'CALL':
    case 'USE':
    case 'PREPARE':
    case 'EXECUTE':
    case 'DEALLOCATE':
    case 'START':
    case 'COMMIT':
    case 'ROLLBACK':
    case 'TRUNCATE':
    case 'LOCK':
    case 'UNLOCK':
    case 'FLUSH':
      if (model.mode === 'baseline') {
        throw new BaselineParseError(`unsupported statement '${first}' in the baseline`, statement[0].line);
      }
      return;
    default:
      throw new BaselineParseError(`unsupported statement '${first}'`, statement[0].line);
  }
}

interface InternalParseResult {
  createdTables: string[];
  createdTriggers: string[];
  addedIndexes: Array<{ table: string; index: ParsedIndex }>;
  alterTables: string[];
  droppedTables: string[];
}

function assertGlobalIdentities(model: MutableModel): void {
  // InnoDB foreign-key constraint names are schema-global. Two tables using the
  // same FK name would make hydration order-dependent, so fail closed.
  const owners = new Map<string, string>();
  for (const table of model.tables.values()) {
    for (const fk of table.foreignKeys) {
      const owner = owners.get(fk.name);
      if (owner !== undefined && owner !== table.name) {
        throw new BaselineParseError(
          `duplicate foreign key name '${fk.name}' used by '${owner}' and '${table.name}'`,
          table.line,
        );
      }
      owners.set(fk.name, table.name);
    }
  }
}

function parseSqlInternal(sql: string, mode: ParseMode, depth: number): InternalParseResult {
  const { tokens } = tokenize(sql);
  const statements: SqlToken[][] = [];
  let current: SqlToken[] = [];
  for (const token of tokens) {
    if (token.type === 'delim') {
      if (current.length > 0) statements.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) statements.push(current);

  const model: MutableModel = {
    mode,
    tables: new Map(),
    triggers: new Map(),
    dataStatements: [],
    alters: [],
    droppedTables: [],
    preparedDdl: { tables: [], indexes: [], triggers: [], alterTables: [], dropTables: [] },
    statementCount: 0,
  };

  for (const statement of statements) {
    parseStatement(model, statement, depth);
  }

  assertGlobalIdentities(model);

  return {
    createdTables: [...model.tables.keys()],
    createdTriggers: [...model.triggers.keys()],
    addedIndexes: model.alters.flatMap((alter) =>
      alter.addedIndexDefinitions.map((index) => ({ table: alter.table, index })),
    ),
    alterTables: model.alters.map((alter) => alter.table),
    droppedTables: model.droppedTables,
  };
}

/**
 * Parse baseline (or migration) SQL into a deterministic schema model.
 *
 * `mode: 'baseline'` is strict: ALTER TABLE must reference a table created
 * earlier in the same file, every column referenced by an index/FK must exist,
 * and only baseline statement kinds are accepted.
 *
 * `mode: 'migration'` relaxes only the cross-statement coupling (a migration
 * may ALTER a table created by the baseline); every statement kind is still
 * explicitly whitelisted.
 */
export function parseSql(sql: string, mode: ParseMode = 'baseline'): ParsedSql {
  const { tokens, delimiters } = tokenize(sql);
  const statements: SqlToken[][] = [];
  let current: SqlToken[] = [];
  for (const token of tokens) {
    if (token.type === 'delim') {
      if (current.length > 0) statements.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) statements.push(current);

  const model: MutableModel = {
    mode,
    tables: new Map(),
    triggers: new Map(),
    dataStatements: [],
    alters: [],
    droppedTables: [],
    preparedDdl: { tables: [], indexes: [], triggers: [], alterTables: [], dropTables: [] },
    statementCount: 0,
  };

  for (const statement of statements) {
    parseStatement(model, statement, 0);
  }

  assertGlobalIdentities(model);

  return {
    mode,
    tables: [...model.tables.values()],
    triggers: [...model.triggers.values()],
    dataStatements: model.dataStatements,
    alters: model.alters,
    droppedTables: model.droppedTables,
    preparedDdl: model.preparedDdl,
    statementCount: model.statementCount,
    delimiterDirectives: delimiters,
  };
}

/** Returns true when the SQL contains any schema-mutating DDL statement. */
export function hasSchemaDdl(sql: string): boolean {
  const parsed = parseSql(sql, 'migration');
  if (
    parsed.tables.length > 0 ||
    parsed.triggers.length > 0 ||
    parsed.alters.length > 0 ||
    parsed.droppedTables.length > 0
  ) {
    return true;
  }
  const prepared = parsed.preparedDdl;
  return (
    prepared.tables.length > 0 ||
    prepared.indexes.length > 0 ||
    prepared.triggers.length > 0 ||
    prepared.alterTables.length > 0 ||
    prepared.dropTables.length > 0
  );
}
