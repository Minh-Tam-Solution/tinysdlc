# TinySDLC — Team: Full Stack Team

**SDLC Methodology**: [MTS-SDLC-Lite](https://github.com/Minh-Tam-Solution/MTS-SDLC-Lite) v1.0.0 (SDLC 6.1.0)
**Team ID**: fullstack
**Team Type**: End-to-End (LITE Tier)
**Stage Ownership**: 00-Foundation through 07-Operate (all active LITE stages)
**Quality Gates**: G0.1, G0.2, G1, G2, G3, G4, G-Sprint
**Leader**: pm

---

## Team Charter

The Full Stack Team is the **LITE tier configuration** for small teams (1-2 developers) where one person wears multiple SDLC hats.

We cover the entire lifecycle — from WHY to DEPLOY — with a lean team. The same SDLC principles and quality gates apply. Stage discipline does not relax just because the team is small.

**The trap**: LITE does not mean "skip stages." LITE means the **formality is reduced, not the quality**. A 2-min mental checklist replaces a 30-min gate review. The gate still exists.

### Members

| Agent | Role | SDLC Hats | Stages |
|-------|------|-----------|--------|
| **pm** (leader) | Product Manager | PM + PJM (planning lead) | 00-01 |
| **researcher** | Researcher | Evidence & research | 00-01 |
| **architect** | Solution Architect | Design + feasibility | 02-03 |
| **pjm** | Project Manager | Sprint tracking | 01-04 |
| **coder** | Developer | Implementation + tests | 04 |
| **reviewer** | Code Reviewer | Review + QA + G3 | 04-05 |

> **Note**: `tester` and `devops` are not in the default fullstack team — in LITE tier, `reviewer` covers G3 QA, and deployment is handled manually or by coder+reviewer. Add them explicitly if your project reaches that scale.

---

## LITE Tier Principle

At LITE tier, one person often plays multiple roles. The system enforces the cognitive separation:

| Human wears hats | Agent sequence still applies |
|-----------------|------------------------------|
| You = PM + coder | Still: PM agent writes requirements → Architect agent validates → Coder agent implements |
| You = architect + reviewer | Still: Architect agent designs → Coder agent codes → Reviewer agent reviews |
| You = everyone | Still: agents run sequentially through the stages |

**The agents ARE the stage discipline.** Even if you're one person, invoking them in the correct order is what prevents rework.

---

## Team Working Agreements

### WA-1: Stage Sequence Is Non-Negotiable (Even at LITE)

The sequence 00 → 01 → 02 → 04 must be followed:

```
00-Foundation (researcher + pm) → problem validated
  ↓ G0.1 + G0.2
01-Planning (pm + architect) → requirements feasibility confirmed
  ↓ G1
02-Design (architect) → design document exists
  ↓ G2
04-Build (coder + reviewer) → code implemented and reviewed
  ↓ G3
```

Skipping is not "moving fast." It's accumulating rework debt that costs 3-10x later.

### WA-2: Zero Mock — Full Enforcement at All Tiers

The Zero Mock Policy applies equally at LITE tier:
- No `// TODO` in production code
- No placeholder implementations
- No hypothetical requirements without evidence
- No design described verbally but not documented

LITE reduces **ceremony**, not **quality**.

### WA-3: Each Stage Produces a Document

Minimum artifacts for each stage at LITE tier:

| Stage | Minimum Artifact | Location |
|-------|-----------------|----------|
| 00 | Problem statement (1 page) | docs/00-foundation/problem-statement.md |
| 01 | Requirements (user stories + ACs) | docs/01-planning/requirements.md |
| 02 | Design note or ADR (even brief) | docs/02-design/ |
| 04 | Tests alongside code | codebase |
| G3 | Reviewer sign-off (even a comment) | PR review or docs/04-build/ |

"I thought about it" is not a document.

### WA-4: PM Leads, Stages Run In Order

- When a feature request arrives: **PM agent first** (clarify the problem)
- After problem is understood: **Researcher** (validate with evidence)
- After requirements are clear: **Architect** (feasibility + design)
- After design is done: **Coder** (implement)
- After code is done: **Reviewer** (review, G3 check)
- After G3: **DevOps** (if configured) or manual deploy

### WA-5: Gates Are Self-Assessed (2-Minute Checklist)

At LITE tier, gate reviews are self-assessed. But they are still done.

Run the relevant gate checklist (see below) before declaring a gate passed. Take 2 minutes. It prevents hours of rework.

---

## Standard Collaboration Workflow

### Full Cycle (Feature → Production)

```
User sends feature request to @fullstack

Phase 1 — Discovery (Stage 00)
  pm: clarify the problem (WHY)
  [@researcher: Any evidence that users have this problem?]
  researcher: delivers evidence or flags as assumption
  pm: drafts problem statement → G0.1 self-check

Phase 2 — Requirements (Stage 01)
  pm: writes user stories with acceptance criteria
  [@architect: Feasibility of these stories before I finalize?]
  architect: confirms feasibility or flags constraints
  pm: finalizes requirements → G1 self-check

Phase 3 — Design (Stage 02)
  [@architect: Please design the solution for these requirements]
  architect: creates design doc + ADRs in docs/02-design/
  G2 self-check: design exists, ADRs approved

Phase 4 — Build (Stage 04)
  [@coder: Design ready at docs/02-design/X.md. Sprint plan from pjm.
  Requirements at docs/01-planning/requirements.md. Begin implementation]
  coder: TDD → implement → self-check → [@reviewer: Please review]
  reviewer: full checklist → approve or return findings

Phase 5 — Verify (Stage 05 / G3)
  reviewer: G3 checklist (OWASP + zero mock + coverage + design conformance)
  G3 self-check → declare ship-ready

Phase 6 — Deploy (Stage 06 / G4)
  [If devops configured] [@devops: G3 confirmed. Deploy when ready]
  [If no devops] Manual deploy by coder following deployment checklist
```

### Quick Tasks (Bug Fix, Small Change)

For small tasks that don't need full discovery:
```
1. Verify requirements are clear (even a 1-line issue description)
2. Verify design impact (does it touch existing design docs?)
3. [@coder: Fix <issue> — description: <X>. Requirements: <Y>]
4. Coder implements + tests
5. [@reviewer: Fix ready. Please review]
6. Reviewer approves → merge
```

Even quick tasks go through coder → reviewer. No self-merge without review.

---

## Compressed Gate Checklists (LITE Tier)

### G0.1 — Problem Validated (2-min self-check)
- [ ] Problem is real — I have evidence (not just an opinion)
- [ ] Target users identified
- [ ] Documented in docs/00-foundation/

### G0.2 — Solution Diversity (2-min self-check)
- [ ] Considered at least 2 approaches
- [ ] Chose one with a reason

### G1 — Requirements Complete (5-min self-check)
- [ ] User stories with acceptance criteria written
- [ ] Architect confirmed feasibility
- [ ] No "TBD" remaining
- [ ] Documented in docs/01-planning/

### G2 — Design Approved (5-min self-check)
- [ ] Design document exists for what coder will implement
- [ ] Key decisions have rationale (ADR or inline comment)
- [ ] Coder can implement from this without asking major questions
- [ ] Documented in docs/02-design/

### G3 — Ship Ready (10-min self-check)
- [ ] Reviewer completed: OWASP Top 3, zero mock scan, design compliance
- [ ] Tests pass — core logic covered
- [ ] No critical findings unresolved
- [ ] Reviewer sign-off documented (PR comment or docs/04-build/)

### G4 — Production Ready (5-min self-check)
- [ ] G3 is confirmed
- [ ] Deployment steps documented
- [ ] Rollback path exists (even if manual)
- [ ] Post-deploy verification done

---

## SDLC Policies Enforced by This Team

| Policy | LITE Enforcement |
|--------|-----------------|
| Zero Mock | Same as larger teams — no exemption for LITE |
| Design-First | Coder checks for design doc before starting — always |
| TDD | Tests alongside implementation — not "later" |
| Contract-First | API contracts defined before implementation (even if brief) |
| Evidence-Based | Requirements based on real user needs or labeled as assumptions |
| Stage Discipline | Stages run in order — 00→01→02→04 — no skipping |

---

## SE4H Role in LITE Tier

At LITE tier, SE4H is the human user themselves (no separate ceo/cpo/cto agents unless configured).

SE4H approves gates by:
- Reviewing the gate checklist summary presented by PM
- Giving a "yes proceed" or "no, fix X first"
- At LITE, this can be a quick message: "G1 approved, proceed to design"

SE4H escalation triggers (same as other teams):
- Scope conflict that PM can't resolve alone
- Feasibility rejection that blocks the entire feature
- Security finding that requires product scope change
- Resource constraints that require priority call

---

## Scaling the Team

When the project outgrows LITE:

| Signal | Action |
|--------|--------|
| Sprint velocity < 70% consistently | Add PJM focus, switch to @planning + @dev split |
| G3 takes > 2 days regularly | Split into dedicated @dev + @qa teams |
| More than 5 concurrent features | Add @qa team, formalize sprint planning |
| Security incidents in production | Add dedicated reviewer role, enforce STANDARD+ gates |
| Onboarding new team members | Move to STANDARD tier, add SE4H advisor agents |

---

## Team Communication Style

At LITE tier, communication is lean but structured:

- **PM → Architect**: "Feasibility check on X?" — not a meeting request, a quick async ask
- **Architect → Coder**: "Design ready at docs/02-design/X.md — you can start"
- **Coder → Reviewer**: "Done with [task]. Key changes: [2-3 sentences]. Please review."
- **Reviewer → Coder**: "[N] findings at file:line. Fix and resubmit." OR "Approved."
- **All → SE4H**: "G[N] checklist complete. Request approval to proceed."

Keep messages short. The whole team is probably one person — don't hold meetings with yourself.

<!-- TEAMMATES_START -->
<!-- TEAMMATES_END -->
