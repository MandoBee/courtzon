---
document_id: "TECH-DEV-07"
document_name: "Pull Request Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "beginner"
reading_time: 10
depends_on: ["TECH-DEV-05", "TECH-DEV-06"]
related: ["TECH-DEV-05", "TECH-DEV-06", "TECH-DEV-08"]
---

# CourtZon Pull Request Standards

## 1. Purpose

Define mandatory requirements for creating, reviewing, and merging pull requests in CourtZon.

## 2. PR Size Guidelines

- **Maximum:** 400 lines changed (excluding generated files, lockfiles, configs)
- **Maximum files:** 20 files
- **Single concern:** One PR = one feature or one fix
- **Exceptions:** Schema changes, auto-generated files, dependency updates

## 3. PR Title

PR title must match the final squash commit message format:

```
<type>(<scope>): <description>
```

Example: `feat(booking): add cancel booking endpoint`

## 4. PR Description Template

Every PR must include:

```markdown
## Description
<!-- What does this PR do? Why is it needed? -->

## Related Issues
<!-- Closes CZ-123, References CZ-456 -->

## Type of Change
- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — code change with no functional change
- [ ] test — adding tests
- [ ] docs — documentation
- [ ] chore — build, CI, dependencies
- [ ] perf — performance improvement

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Security
- [ ] Permission gating applied
- [ ] Audit logging added for mutations
- [ ] Input validation via Zod
- [ ] No secrets/credentials exposed

## Checklist
- [ ] Code follows project conventions
- [ ] Lint passes (`npx eslint`)
- [ ] Build succeeds (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Self-review completed
- [ ] Documentation updated if needed

## Screenshots (if UI change)
```

## 5. Review Requirements

| Requirement | Setting |
|-------------|---------|
| Minimum approvals | 1 |
| Required reviewers | At least 1 senior developer for backend changes |
| Self-review | Author must self-review before requesting reviews |
| Stale reviews | Dismissed when new commits are pushed |
| Review assignment | Automatic by code ownership (CODEOWNERS) |

## 6. CI Check Requirements

All checks must pass before merge:

```yaml
# .github/workflows/pr.yml
checks:
  - build: npm run build
  - lint: npx eslint
  - test: npm test
  - typecheck: npx tsc --noEmit
  - ci-validate: node scripts/ci-validate.js
```

**Evidence:** `.github/workflows/pr.yml` defines these checks for every PR.

## 7. Merge Requirements

| Criterion | Requirement |
|-----------|-------------|
| CI passing | All status checks green |
| Approvals | ≥1 approved review |
| Branch up to date | Must be rebased on latest master |
| No merge conflicts | Must be resolved |
| Linear history | Squash merge only |

## 8. PR Lifecycle

```
1. Author: Create branch, make changes, push
2. Author: Open PR with completed template
3. Author: Request reviewers
4. Reviewer: Review within 24 hours
5. Author: Address feedback (additional commits)
6. Reviewer: Approve
7. Author or Reviewer: Squash merge to master
8. Branch is auto-deleted
```

## 9. Labels

Every PR must have at least one label:

| Label | Meaning |
|-------|---------|
| `feature` | New functionality |
| `bug` | Bug fix |
| `refactor` | Code restructuring |
| `documentation` | Docs-only changes |
| `dependencies` | Dependency updates |
| `do-not-merge` | Blocked / work in progress |

## 10. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-05 | Git Workflow & Branch Strategy (branch lifecycle) |
| TECH-DEV-06 | Commit Message Standards (squash commit format) |
| TECH-DEV-08 | Code Review Standards (review expectations and process) |

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
