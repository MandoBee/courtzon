---
document_id: "TECH-DEV-08"
document_name: "Code Review Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 12
depends_on: ["TECH-DEV-07"]
related: ["TECH-DEV-01", "TECH-DEV-07", "TECH-DEV-09", "TECH-DEV-14"]
---

# CourtZon Code Review Standards

## 1. Purpose

Define mandatory code review expectations for all CourtZon pull requests. Reviews ensure correctness, security, performance, style compliance, and adequate test coverage.

## 2. Review Checklist

Every reviewer must check the following dimensions:

### 2.1 Correctness
- Does the code do what it claims?
- Are edge cases handled (null, empty, duplicates, boundary values)?
- Are error paths handled (DB failures, network errors)?
- Is the logic consistent with business requirements?

### 2.2 Security
- Is input validated with Zod schemas?
- Are SQL queries parameterized (no string concatenation)?
- Are permission gates applied via `<Can>` or `requirePermission`?
- Is audit logging added for all mutations?
- Are secrets, passwords, or PII never logged?
- Is file upload validated (type, size, path traversal)?

**Evidence:** `backend/src/modules/upload/application/upload.service.ts` validates file type and size.

### 2.3 Performance
- Are N+1 queries avoided? (Check that joins or eager loading are used)
- Are paginated queries using `LIMIT` and `OFFSET`?
- Is Redis caching applied for expensive or repeated queries?
- Are indexes present for new query patterns?

### 2.4 Style & Conventions
- Does the code follow TECH-DEV-01 (TypeScript) standards?
- Are imports grouped correctly?
- Are functions and variables named per TECH-DEV-04?
- Are there no debug logs, `console.log`, or commented-out code?

### 2.5 Test Coverage
- Are unit tests added for new services/functions?
- Are integration tests added for new endpoints?
- Do tests cover success paths AND error paths?
- Are edge cases tested?

### 2.6 Architecture
- Does the change follow the module structure (TECH-DEV-03)?
- Are concerns separated (controller vs service vs repository)?
- Is the change cohesive (single responsibility)?

## 3. Review Process

```
1. Reviewer is assigned (auto or manual)
2. Reviewer reads PR description for context
3. Reviewer inspects each file, leaving comments
4. Author responds to each comment (resolve or discuss)
5. Reviewer approves or requests changes
6. If changes requested, author pushes fixes
7. Reviewer re-reviews (only changed files)
8. Approve → squash merge
```

## 4. Comment Guidelines

| Type | Prefix | Example |
|------|--------|---------|
| Must fix | `[BLOCKER]` | `[BLOCKER] SQL injection risk — use parameterized query` |
| Should fix | `[IMPORTANT]` | `[IMPORTANT] Missing audit log for this mutation` |
| Suggestion | `[SUGGESTION]` | `[SUGGESTION] Consider extracting this to a helper` |
| Nitpick | `[NIT]` | `[NIT] Extra blank line` |
| Praise | (none) | `Clean solution, especially the validation extraction` |

## 5. Response Time Expectations

| Step | Time Limit |
|------|-----------|
| Initial review assigned | Within 24 hours of PR being opened |
| Reviewer completes review | Within 24 hours of assignment |
| Author addresses feedback | Within 24 hours of review |
| Re-review | Within 12 hours of push |
| Merge after approval | Within 4 hours of approval |

## 6. What NOT to Review

- Auto-generated files (lockfiles, build output)
- Third-party dependency changes (review only the version bump in `package.json`)
- Whitespace-only changes in unrelated files

## 7. Reviewing Your Own PR

Before requesting review, self-check:

```bash
# 1. Read the full diff
git diff master...HEAD

# 2. Run lint and tests
npx eslint .
npm test

# 3. Check for debug artifacts
rg 'console\.log|debugger|TODO|FIXME' --include '*.ts' --include '*.tsx'
```

## 8. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (style enforcement) |
| TECH-DEV-07 | Pull Request Standards (PR lifecycle) |
| TECH-DEV-09 | Testing Standards (coverage expectations) |
| TECH-DEV-14 | Security Coding Standards (security review items) |

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
