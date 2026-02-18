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

## The 8 SDLC Roles

### Researcher (`researcher`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | opus |
| **Stage** | 00-Foundation, 01-Planning |
| **Gates** | G0.1 (Problem Validated) |
| **Template** | `templates/agents/researcher/AGENTS.md` |

**Responsibilities:**
- Conduct market research, competitive analysis, and user research
- Gather evidence for problem validation (interviews, surveys, data)
- Analyze industry trends and technology landscape
- Produce research briefs that feed into PM's requirements
- Validate assumptions with data before committing to solutions

**Forbidden (SE4A constraints):**
- Making product decisions (that's PM's role)
- Approving gates without SE4H sign-off
- Starting development based on research alone
- Presenting research as final requirements

**Why Opus:** Research requires deep reasoning, synthesizing large volumes of information, and producing nuanced analysis — Opus excels at complex, multi-step reasoning tasks.

**Communication pattern:**
> Researcher receives research request → investigates → produces research brief → `[@pm: research complete — key findings: ...]` → PM incorporates into requirements

---

### Product Manager (`pm`)

| Attribute | Value |
|-----------|-------|
| **Provider** | openai |
| **Recommended Model** | gpt-5.2 |
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

**Why GPT 5.2:** PM requires precise, structured output (requirements, user stories, acceptance criteria) and strong analytical reasoning — GPT 5.2 excels at structured analysis and clear documentation.

**Communication pattern:**
> PM receives feature request → analyzes → `[@architect: review feasibility]` → finalizes → presents to SE4H for G1

---

### Project Manager (`pjm`)

| Attribute | Value |
|-----------|-------|
| **Provider** | anthropic |
| **Recommended Model** | sonnet |
| **Stage** | 01-Planning, 02-Design, 03-Integrate, 04-Build |
| **Gates** | G-Sprint (Sprint Gate) |
| **Template** | `templates/agents/pjm/AGENTS.md` |

**Responsibilities:**
- Create and maintain sprint plans with task breakdown
- Track execution progress, blockers, and dependencies
- Manage timelines and resource allocation
- Run daily standups and sprint retrospectives
- Escalate risks and blockers to SE4H

**Forbidden (SE4A constraints):**
- Making product scope decisions (that's PM's role)
- Making architecture decisions (that's architect's role)
- Approving gates without SE4H sign-off
- Changing sprint scope without PM agreement

**Why Sonnet:** Project management is execution-focused — tracking tasks, updating timelines, generating reports. Sonnet provides fast, reliable output for high-frequency operational tasks.

**Communication pattern:**
> PJM receives sprint plan → breaks into tasks → tracks progress → `[@pm: sprint status — 3/5 tasks done, 1 blocked on API contract]` → escalates blockers

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

**Why Opus:** Architecture requires deep reasoning about system trade-offs, security implications, and long-term maintainability — Opus excels at complex multi-dimensional analysis.

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

**Why Sonnet:** Development is high-frequency execution work — writing code, running tests, iterating quickly. Sonnet provides fast, reliable output ideal for rapid development cycles.

**Communication pattern:**
> Coder receives task → implements → writes tests → `[@reviewer: please review PR for <task>]`

---

### Code Reviewer (`reviewer`)

| Attribute | Value |
|-----------|-------|
| **Provider** | openai |
| **Recommended Model** | gpt-5.2 |
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

**Why GPT 5.2:** Code review demands precise pattern matching, checklist adherence, and structured analysis of security vulnerabilities — GPT 5.2 excels at systematic, criteria-based evaluation.

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

**Why Sonnet:** Testing is execution-heavy — running test plans, measuring coverage, producing reports. Sonnet provides fast, reliable output for high-throughput QA workflows.

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

**Why Sonnet:** DevOps is operational — CI/CD pipelines, deployments, monitoring. Sonnet provides fast, reliable output for infrastructure automation tasks.

**Communication pattern:**
> DevOps receives deploy request → `[@reviewer: confirming G3 sign-off]` → deploys to staging → smoke test → deploys to production → health check

---

## Gate Ownership Summary

| Gate | Name | Owner(s) | Approver |
|------|------|---------|----------|
| G0.1 | Problem Validated | researcher, pm | SE4H |
| G1 | Requirements Complete | pm, architect | SE4H |
| G-Sprint | Sprint Gate | pjm, coder | SE4H |
| G2 | Design Approved | architect, reviewer | SE4H/CTO |
| G3 | Ship Ready | reviewer (primary), tester (co-owner) | SE4H |
| G4 | Production Ready | devops | SE4H |

---

## Multi-Provider Model Assignment

TinySDLC uses a 2-2-4 provider split optimized per role:

| Provider | Model | Roles | Rationale |
|----------|-------|-------|-----------|
| **Anthropic** | opus | researcher, architect | Deep reasoning, complex analysis |
| **OpenAI** | gpt-5.2 | pm, reviewer | Precise structured output, criteria-based evaluation |
| **Anthropic** | sonnet | pjm, coder, tester, devops | Fast execution, high-frequency tasks |

---

## Configuration Example

```json
{
  "agents": {
    "researcher": {
      "name": "Researcher",
      "provider": "anthropic",
      "model": "opus",
      "sdlc_role": "researcher",
      "working_directory": "~/tinysdlc-workspace/researcher"
    },
    "pm": {
      "name": "Product Manager",
      "provider": "openai",
      "model": "gpt-5.2",
      "sdlc_role": "pm",
      "working_directory": "~/tinysdlc-workspace/pm"
    },
    "pjm": {
      "name": "Project Manager",
      "provider": "anthropic",
      "model": "sonnet",
      "sdlc_role": "pjm",
      "working_directory": "~/tinysdlc-workspace/pjm"
    }
  }
}
```

Run `tinysdlc sdlc init` to apply all 8 roles at once.
