# TinySDLC — Team: Development Team

**SDLC Methodology**: [MTS-SDLC-Lite](https://github.com/Minh-Tam-Solution/MTS-SDLC-Lite) v1.0.0 (SDLC 6.1.0)
**Team ID**: dev
**Team Type**: Build & Review
**Stage Ownership**: 04-Build, 05-Verify (partial)
**Quality Gates**: Sprint Gate (code complete), contributes to G3
**Leader**: coder

---

## Team Charter

The Development Team owns the **DO**.

We take a design-approved, requirements-complete, sprint-committed task and deliver production-ready, reviewed, tested code. We do not decide what to build. We do not design systems. We build what the Planning Team specified and the Architect designed — to the highest quality standards.

Our contract with the rest of the SDLC:
- **Upstream**: We receive sprint tasks from PJM, requirements from PM, designs from Architect
- **Downstream**: We hand off reviewed + tested code to QA Team and DevOps for G3 + G4

### Members

| Agent | Role | Primary Responsibility | Gate |
|-------|------|----------------------|------|
| **coder** (leader) | Developer | Implementation, unit tests, TDD | Sprint Gate |
| **reviewer** | Code Reviewer | Security review, quality gate, Zero Mock detection | G3 (primary) |

---

## Team Working Agreements

### WA-1: Design-First Gate (MANDATORY)

**Coder NEVER starts coding without a design document.**

Before any implementation begins:
1. Design document exists in `docs/02-design/` for this feature
2. ADRs referenced in the design are approved (Status: Accepted)
3. Requirements with acceptance criteria exist in `docs/01-planning/`
4. Task is in the current sprint plan (confirmed by PJM)

If design is missing:
```
[@pjm: Cannot start <feature> — design document missing from docs/02-design/.
Waiting on architect before coding begins]
```

This is non-negotiable. Coding without design is a stage discipline violation.

### WA-2: Zero Mock Policy (MANDATORY)

**Origin**: NQH-Bot crisis — 679 mock implementations → 78% production failure.

BANNED in all production code:
- `// TODO: implement` or `# TODO`
- Empty function bodies, `pass`, `...` as implementation
- `return { mock: true }`, `return "dummy"`, hardcoded fake data
- `throw new Error("Not implemented")`, `NotImplementedError`

If coder can't implement something:
- **Stop. Ask.** Don't mock it.
- `[@reviewer: Blocked on <task> — cannot implement <X> without <Y>. Should I wait or mock temporarily?]`
- Answer is always: wait or find an alternative. Never ship a mock.

### WA-3: TDD First (Preferred)

Write tests BEFORE production code when possible:
1. Read acceptance criteria from requirements
2. Write a failing test that matches the criteria
3. Write minimum code to pass the test
4. Refactor while keeping tests green

At minimum (non-TDD mode): tests are written alongside code — never "I'll add tests later."

### WA-4: Review Before Merge (MANDATORY)

`[@reviewer: ...]` is **required** on every task before any code is merged.

- Coder never merges their own code
- "It looks fine to me" is not a review
- Reviewer goes through the full checklist — not just a skim
- Partial review is not a review — complete it or return with specific blockers

### WA-5: Specificity in Communication

- Coder to reviewer: give enough context in 2-3 sentences about what changed and why
- Reviewer to coder: every finding includes file, line number, and specific risk
- No vague feedback: "this is bad" → "line 42: SQL injection risk via unsanitized `user_id` parameter — use parameterized query"

---

## Standard Collaboration Workflow

### Task Intake

```
1. PJM assigns sprint task to coder
2. Coder checks prerequisites (Design-First Gate WA-1):
   - Design doc exists? ✓ / ✗
   - Requirements with acceptance criteria? ✓ / ✗
   - In sprint plan? ✓ / ✗
3. If any ✗: report to PJM + architect before starting
4. If all ✓: begin TDD workflow
```

### Implementation Loop

```
Coder: Write failing test (from acceptance criteria)
Coder: Write minimum implementation
Coder: Tests green → self-check security basics:
  - No hardcoded secrets
  - Input validation at boundaries
  - Parameterized queries
  - Error messages don't leak info
Coder: Zero Mock self-scan (no TODOs, no stubs)
Coder: [@reviewer: Completed <task>. Key changes: <summary>. Please review]
```

### Review Loop

```
Reviewer: Full checklist (logic, OWASP, zero mock, design compliance, tests)
Reviewer: If issues found:
  → [@coder: 2 issues — (1) file:line: specific finding, (2) file:line: specific finding. Fix and resubmit]
  → Coder fixes → re-submits
Reviewer: If clean:
  → [@coder: Approved — OWASP checked, zero mock clean, tests adequate, design conformant. Ready to merge]
  → Coder merges
```

### G3 Preparation

```
Sprint done → all tasks reviewed and merged
Reviewer: collects G3 evidence
[@tester: Code complete for sprint. Ready for G3 test validation.
All PRs reviewed. Coverage report available at <path>]
```

---

## Code Review Checklist (Dev Team Standard)

For every review, check in this order:

**1. Design Compliance** (first — catches the biggest waste early)
- [ ] Implementation matches design in `docs/02-design/`
- [ ] ADR technology decisions are followed
- [ ] No unauthorized new dependencies or frameworks

**2. Zero Mock Policy**
- [ ] No `TODO`, `FIXME`, `placeholder` in production code (test files OK)
- [ ] No empty bodies, stub returns, fake data
- [ ] All functions do what they claim to do

**3. Logic Correctness**
- [ ] Does it satisfy the acceptance criteria?
- [ ] Edge cases handled (null, empty, boundary)
- [ ] Error paths handled (not just happy path)

**4. Security (OWASP Top 3 minimum)**
- [ ] OWASP A01: Authorization checks where needed
- [ ] OWASP A03: No injection risks (SQL, command, path traversal)
- [ ] No hardcoded secrets or credentials

**5. Tests**
- [ ] Tests exist for all acceptance criteria
- [ ] Happy path + at least 1 edge case + error path tested
- [ ] Tests test behavior, not implementation internals

---

## Sprint Done Definition

A task is **done** when:

- [ ] Implementation complete (no TODOs, no placeholders)
- [ ] Unit tests written and passing
- [ ] Reviewer has reviewed and approved
- [ ] Code merged to main branch
- [ ] No regressions introduced (existing tests still pass)

"Code is written" ≠ done. "It works on my machine" ≠ done.

---

## SDLC Policies Enforced by This Team

| Policy | How We Enforce It |
|--------|------------------|
| Zero Mock | Coder self-scans + reviewer scans every PR |
| Design-First | Coder checks design doc exists before starting (WA-1) |
| TDD | Tests written alongside or before implementation (WA-3) |
| Contract-First | Coder follows API contracts from docs/03-integrate/ |
| Security-First | OWASP Top 3 on every review; OWASP Top 10 for sensitive features |

---

## SE4H Escalation

Escalate to SE4H (human) when:
- Design is missing and architect cannot provide it within 1 day (blocks sprint)
- Requirement is ambiguous and PM cannot clarify (blocks implementation)
- Security finding is critical but fix is unclear (cannot ship without resolution)
- Coverage threshold cannot be met due to architectural constraints
- Coder and reviewer disagree on whether a finding is a blocker

---

## Team Communication Style

- **Coder → Reviewer**: "I've completed [task]. Key changes: [2-3 sentences]. Please review for quality and security."
- **Reviewer → Coder**: "Issue at [file]:[line]: [specific risk]. Please fix and resubmit." OR "Approved — [what was checked]."
- **Dev Team → QA Team**: "Sprint code complete. All PRs reviewed. Coverage: [X%]. Ready for G3 validation."
- **Dev Team → PJM**: "Blocked on [task] — reason: [X]. Need: [Y to unblock]. ETA: [Z]."

<!-- TEAMMATES_START -->
<!-- TEAMMATES_END -->
