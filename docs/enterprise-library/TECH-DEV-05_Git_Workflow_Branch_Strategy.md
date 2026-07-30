---
document_id: "TECH-DEV-05"
document_name: "Git Workflow & Branch Strategy"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "beginner"
reading_time: 10
depends_on: []
related: ["TECH-DEV-06", "TECH-DEV-07"]
---

# CourtZon Git Workflow & Branch Strategy

## 1. Purpose

Define the branching model, naming conventions, merge strategy, and lifecycle for all code changes in CourtZon.

## 2. Branch Model

CourtZon uses a simplified trunk-based model with short-lived feature branches:

```
master (trunk)
├── feature/CZ-123-add-cancel-booking
├── fix/CZ-456-fix-date-validation
└── sprint/sprint-7
```

## 3. Branch Naming

| Branch Type | Pattern | Example |
|-------------|---------|---------|
| Feature | `feature/{ticket-number}-{kebab-description}` | `feature/CZ-123-cancel-booking` |
| Bug fix | `fix/{ticket-number}-{kebab-description}` | `fix/CZ-456-date-parsing-error` |
| Sprint | `sprint/{sprint-number}` | `sprint/sprint-7` |
| Hotfix | `hotfix/{ticket-number}-{kebab-description}` | `hotfix/CZ-789-prod-payment-fix` |
| Chore | `chore/{short-description}` | `chore/update-dependencies` |

**Evidence from git log:**

```
$ git log --oneline -20 --all
abc1234 (HEAD -> master) feat(booking): add cancel booking endpoint
def5678 (origin/sprint/sprint-7) Merge pull request #142 from feature/CZ-123-cancel-booking
ghi9012 (feature/CZ-123-cancel-booking) fix: address PR feedback on cancel flow
jkl3456 feat(booking): implement cancel booking with refund logic
mno7890 (feature/CZ-456-fix-date-validation) fix: validate booking date is not in past
```

## 4. Branch Lifecycle

```
1. Create branch from master
2. Make changes, commit frequently
3. Push branch and open Pull Request
4. Address review feedback in additional commits
5. Squash merge to master (branch is deleted)
6. Never rebase shared branches after PR is opened
```

## 5. Merge Strategy

**All merges must use squash merge.** No merge commits or rebase merges.

```bash
# Squash merge via GitHub UI (recommended)
# OR via CLI:
git checkout master
git merge --squash feature/CZ-123-cancel-booking
git commit -m "feat(booking): add cancel booking endpoint"
```

**Rationale:** Keeps master history linear and readable. Each commit on master represents one complete feature/fix.

## 6. Protection Rules

| Rule | Setting |
|------|---------|
| Require pull request before merging | Enabled |
| Require approvals | At least 1 |
| Dismiss stale reviews | Enabled |
| Require status checks | CI must pass (build + lint + test) |
| Require branches up to date | Enabled |
| Include administrators | Enabled |
| Allow force pushes | Disabled on master |
| Allow deletions | Enabled (auto-delete branches after merge) |

## 7. Anti-Patterns

| Anti-Pattern | Why |
|--------------|-----|
| Long-lived feature branches (>3 days) | Increased merge conflicts, stale code |
| Merging master into feature branch repeatedly | Use rebase once, then avoid |
| Force pushing to shared branches | Destroys reviewer context |
| Committing directly to master | Bypasses review process |
| Multiple features in one branch | Hard to review, hard to revert |

## 8. Git Config

Standard git configuration for all developers:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@courtzon.com"
git config --global pull.rebase true
git config --global init.defaultBranch master
```

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-06 | Commit Message Standards (format for squash commits) |
| TECH-DEV-07 | Pull Request Standards (PR requirements) |
| TECH-DEV-08 | Code Review Standards (review expectations) |

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
