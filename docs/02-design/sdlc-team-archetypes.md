# TinySDLC - SDLC Team Archetypes

**SDLC Version**: 6.1.0
**Stage**: 02 - DESIGN
**Status**: Active
**Authority**: CTO Approved

---

## Overview

SDLC 6.1.0 defines 6 team archetypes: 4 core teams (active at LITE tier) and 2 STANDARD+ teams. TinySDLC provides the 4 core teams pre-configured. Each archetype defines which agents collaborate, who leads the team, and what stage of the SDLC it covers.

```
User (SE4H)
    │
    ├── @planning   → [researcher → pm → pjm → architect]                 Stage 00-01
    ├── @dev        → [coder → reviewer]                                   Stage 04-05
    ├── @qa         → [tester → reviewer]                                  Stage 05
    ├── @fullstack  → [researcher → pm → pjm → architect → coder → reviewer]  All stages (LITE)
    │
    │  STANDARD+ tier (3+ developers):
    ├── @executive  → [ceo → cpo → cto]                                   Strategic
    └── @support    → [assistant]                                          Routing
```

---

## Team 1: `planning` — Foundation & Planning

```json
{
  "name": "Planning Team",
  "agents": ["researcher", "pm", "pjm", "architect"],
  "leader_agent": "pm",
  "description": "Foundation & Planning — Stage 00-01 — Gates G0.1, G1"
}
```

### Stage Coverage
- Stage 00: Foundation (problem statement, stakeholder analysis, market research)
- Stage 01: Planning (requirements, user stories, sprint plan, execution timeline)

### Activation
```
@planning I want to add voice message support to Telegram
```

### Interaction Flow
```
User: @planning <feature request>
  └── pm: analyzes scope, assigns research
        └── [@researcher: investigate market need and technical landscape]
              └── researcher: produces research brief
                    └── [@pm: research complete — key findings: ...]
                          └── pm: writes requirements
                                └── [@architect: review technical feasibility]
                                      └── architect: confirms feasibility, flags constraints
                                            └── [@pjm: create sprint plan for implementation]
                                                  └── pjm: creates timeline → pm presents to SE4H
```

### Quality Gate Outputs
- **G0.1**: Problem statement + research brief in `docs/00-foundation/`
- **G1**: Requirements document in `docs/01-planning/requirements.md`
- **Sprint Plan**: Timeline and task breakdown from PJM

### When to Use
- Starting a new project or feature
- Clarifying requirements before development
- Prioritizing backlog items
- Creating sprint plans
- Conducting market or technical research

---

## Team 2: `dev` — Build & Review

```json
{
  "name": "Development Team",
  "agents": ["coder", "reviewer"],
  "leader_agent": "coder",
  "description": "Build & Review — Stage 04-05 — Sprint Gate"
}
```

### Stage Coverage
- Stage 04: Build (implementation, unit tests)
- Stage 05: Verify (code review, security check)

### Activation
```
@dev fix the authentication bug in pairing.ts
@dev implement the OAuth2 login flow per the ADR
```

### Interaction Flow
```
User: @dev <task>
  └── coder: implements, writes tests
        └── [@reviewer: please review PR for <task>]
              └── reviewer: OWASP check, coverage check
                    ├── if issues: [@coder: 2 issues found — fix and resubmit]
                    │     └── coder: fixes → reviewer re-checks
                    └── if clean: LGTM → ready for G3
```

### Quality Gate Outputs
- **Sprint Gate**: Reviewed, tested, merged code
- **G3 contribution**: Reviewer sign-off + coverage confirmation

### When to Use
- Implementing features from sprint plan
- Fixing bugs
- Code review requests
- Pair programming workflows

---

## Team 3: `qa` — Quality Assurance

```json
{
  "name": "QA Team",
  "agents": ["tester", "reviewer"],
  "leader_agent": "tester",
  "description": "Quality Assurance — Stage 05 — Gate G3 (required for Ship Ready)"
}
```

> **Note**: This team is **required** when targeting Gate G3 Ship Ready. It is not optional.

### Stage Coverage
- Stage 05: Verify (test plans, coverage, UAT, security validation)

### Activation
```
@qa validate the authentication module for G3
@qa run full regression for v0.2.0
```

### Interaction Flow
```
User: @qa <validation request>
  └── tester: creates test plan, executes tests, measures coverage
        ├── if coverage insufficient: [@coder: need 15% more coverage — missing: X, Y, Z]
        └── if coverage met: [@reviewer: 85% coverage, acceptance criteria pass — tester G3 sign-off]
              └── reviewer: OWASP check, security scan
                    └── both sign-off → presents to SE4H for G3 approval
```

### Quality Gate Outputs
- **G3 Ship Ready**: Tester + Reviewer co-sign-off → SE4H approval
- Test results report
- Coverage report

### When to Use
- End-of-sprint validation
- Pre-release verification
- Security audit requests
- Regression testing

---

## Team 4: `fullstack` — End-to-End (LITE Tier)

```json
{
  "name": "Full Stack Team",
  "agents": ["researcher", "pm", "pjm", "architect", "coder", "reviewer"],
  "leader_agent": "pm",
  "description": "End-to-End — all stages — LITE tier for small projects"
}
```

### Stage Coverage
- All stages (00 through 05) — simplified pipeline with 8 SE4A roles

### Activation
```
@fullstack add a new /status command to the Telegram bot
```

### Interaction Flow
```
User: @fullstack <task>
  └── pm: analyzes, defines scope
        └── [@researcher: quick research on approach]
        └── [@architect: quick feasibility check]
        └── [@pjm: create task breakdown]
        └── [@coder: implement: <spec>]
              └── [@reviewer: review when ready]
```

### When to Use
- Small projects (1-2 developers, LITE tier)
- Tasks that don't warrant separate planning/dev/qa phases
- Rapid prototyping where full SDLC overhead isn't needed

### Limitation
- Does not include `tester` or `devops` — cannot fulfill G3 or G4 formally
- Suitable for internal tools or early-stage projects
- Upgrade to separate `planning`/`dev`/`qa` teams when project matures

---

## Standalone Agents

Some agents work best as standalone (not in a team) for specific queries:

| Agent | Usage |
|-------|-------|
| `@researcher <topic>` | Quick research or competitive analysis |
| `@architect <question>` | Quick architectural consultation |
| `@reviewer <code snippet>` | Ad-hoc security review |
| `@devops <question>` | Infrastructure/deployment questions |

---

## Team Routing Rules

1. `@team_id <message>` → routes to `leader_agent`
2. Leader can mention teammates: `[@coder: ...]`
3. Teammates can mention each other within the same team
4. Cross-team mentions are not supported in this version (roadmap item)
5. Max 50 messages per conversation (loop prevention)

---

## Quick Setup

```bash
# Apply all 4 teams + 8 agents at once
tinysdlc sdlc init

# Verify
tinysdlc sdlc status

# Check role mapping
tinysdlc sdlc roles
```
