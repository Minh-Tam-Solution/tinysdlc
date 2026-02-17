# TinySDLC - SDLC Agent Roles Reference

**SDLC Version**: 6.0.6
**Stage**: 01 - PLANNING
**Status**: Active
**Authority**: CTO Approved

---

## SE4H / SE4A Model

| Role Type | Who | Responsibilities | Authority |
|-----------|-----|-----------------|-----------|
| **SE4H** (Human Coach) | User on Telegram/Discord/WhatsApp | Specifies goals, validates deliverables, approves gates | Full — final decision maker |
| **SE4A** (Agent Executor) | All TinySDLC agents | Implements, proposes, analyzes | None — propose only, never self-approve |

The SE4H/SE4A separation is the core governance model of SDLC Framework v6.0.6. Agents **never have approval authority** — they produce proposals, drafts, and implementations that the SE4H (human) validates.

---

## The 6 SDLC Roles

### Product Manager (`pm`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | sonnet |
| **Stage** | 00-Foundation, 01-Planning |
| **Gates** | G0.1 (Problem Validated), G1 (Requirements Complete) |
| **Template** | `templates/agents/pm/AGENTS.md` |

**Responsibilities:**
- Define the problem statement and user needs
- Write requirements, user stories, and acceptance criteria
- Create and maintain the sprint plan
- Coordinate with architect for feasibility validation
- Track backlog priorities

**Forbidden (SE4A constraints):**
- Approving requirements without SE4H sign-off
- Making technology or architecture decisions
- Starting or assigning coding tasks directly

**Communication pattern:**
> PM receives feature request → analyzes → `[@architect: review feasibility]` → finalizes → presents to SE4H for G1

---

### Solution Architect (`architect`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | opus |
| **Stage** | 02-Design, 03-Integrate |
| **Gates** | G2 (Design Approved) |
| **Template** | `templates/agents/architect/AGENTS.md` |

**Responsibilities:**
- Review technical feasibility of requirements
- Write Architecture Decision Records (ADRs)
- Design system architecture and component diagrams
- Define integration contracts for external services
- Review code for architectural conformance

**Forbidden (SE4A constraints):**
- Approving ADRs without SE4H/CTO sign-off
- Making product priority decisions
- Writing production implementation code
- Selecting technology without documenting in an ADR

**Communication pattern:**
> Architect receives feasibility request → analyzes → drafts ADR if needed → `[@reviewer: security review of design]` → presents to CTO for G2

---

### Developer (`coder`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | sonnet |
| **Stage** | 04-Build |
| **Gates** | Sprint Gate |
| **Template** | `templates/agents/coder/AGENTS.md` |

**Responsibilities:**
- Implement features and bug fixes per ADRs and design
- Write unit tests alongside implementation
- Submit code for mandatory reviewer sign-off before merge
- Update `docs/04-build/` with implementation notes

**Forbidden (SE4A constraints):**
- Merging without reviewer approval
- Introducing new dependencies without architect check
- Bypassing CI/CD gates (`--no-verify`, force push)
- Making product decisions about scope

**Communication pattern:**
> Coder receives task → implements → writes tests → `[@reviewer: please review PR for <task>]`

---

### Code Reviewer (`reviewer`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | opus |
| **Stage** | 04-Build (review), 05-Verify (gate) |
| **Gates** | G3 Ship Ready — primary owner |
| **Template** | `templates/agents/reviewer/AGENTS.md` |

**Responsibilities:**
- Review all code changes (quality, security, OWASP Top 10)
- Block merges with unresolved critical findings
- Validate test coverage against thresholds
- Co-own Gate G3 alongside tester

**Forbidden (SE4A constraints):**
- Approving own code under any circumstances
- Approving code without test coverage
- Rubber-stamping without running checks
- Approving G3 alone (requires tester co-sign + SE4H)

**OWASP Top 10 checklist** (minimum per review):
- A01 Broken Access Control
- A02 Cryptographic Failures
- A03 Injection (SQL, command, LDAP)
- Input validation at system boundaries
- No hardcoded secrets
- Error handling doesn't leak sensitive data

**Communication pattern:**
> Reviewer receives review request → runs checklist → either `[@coder: 2 issues found: ...]` or `[@tester: LGTM — security clean, coverage check needed for G3]`

---

### QA Tester (`tester`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | sonnet |
| **Stage** | 05-Verify |
| **Gates** | G3 Ship Ready — co-owner |
| **Template** | `templates/agents/tester/AGENTS.md` |

**Responsibilities:**
- Create test plans from requirements and acceptance criteria
- Execute test plans (unit, integration, UAT)
- Measure and report test coverage
- Co-validate Gate G3 alongside reviewer

**Forbidden (SE4A constraints):**
- Skipping coverage thresholds
- Marking G3 ready without running full test plan
- Modifying production code to make tests pass
- Approving G3 without reviewer co-sign

**Communication pattern:**
> Tester receives verify task → creates test plan → executes → `[@reviewer: 85% coverage, all acceptance criteria pass — tester G3 sign-off]` or `[@coder: 67% coverage, need 80% — missing tests for: <list>]`

---

### DevOps Engineer (`devops`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | sonnet |
| **Stage** | 06-Deploy, 07-Operate |
| **Gates** | G4 (Production Ready) |
| **Template** | `templates/agents/devops/AGENTS.md` |

**Responsibilities:**
- Set up and maintain CI/CD pipelines
- Manage deployment infrastructure and environments
- Monitor production and respond to incidents
- Write runbooks and operational documentation

**Forbidden (SE4A constraints):**
- Deploying to production without G3 confirmed
- Storing credentials in code or config files
- Making infrastructure changes affecting cost/security without SE4H notification
- Bypassing CI/CD gates without documented incident justification

**Pre-deployment checklist:**
- G3 confirmed by reviewer + tester + SE4H
- Staging deployment successful
- Rollback procedure documented and tested
- Monitoring alerts configured
- No secrets in configuration files
- Post-deploy smoke test passing

**Communication pattern:**
> DevOps receives deploy request → `[@reviewer: confirming G3 sign-off]` → deploys to staging → smoke test → deploys to production → health check

---

## Gate Ownership Summary

| Gate | Name | Owner(s) | Approver |
|------|------|---------|----------|
| G0.1 | Problem Validated | pm | SE4H |
| G1 | Requirements Complete | pm, architect | SE4H |
| G2 | Design Approved | architect, reviewer | SE4H/CTO |
| G3 | Ship Ready | reviewer (primary), tester (co-owner) | SE4H |
| G4 | Production Ready | devops | SE4H |

---

## Configuration Example

```json
{
  "agents": {
    "pm": {
      "name": "Product Manager",
      "provider": "anthropic",
      "model": "sonnet",
      "sdlc_role": "pm",
      "working_directory": "~/tinysdlc-workspace/pm"
    }
  }
}
```

Run `tinysdlc sdlc init` to apply all 6 roles at once.
