# pre-mortem-discussion

Scaffold the **pre-mortem discussion** skill into the project you run it from.

Supports Claude Code, Codex, and Antigravity.

## Install / run

```bash
npx pre-mortem-discussion
```

An interactive prompt asks which AI agents to install for. Use `↑`/`↓` to move, `Space` to toggle, `Enter` to confirm. Multiple agents can be selected.

```
Install for which AI agents? (Space = toggle, Enter = confirm)
> [x] Claude Code
  [ ] Codex
  [ ] Antigravity
```

## What it writes

Files are placed under the agent-specific skills folder:

| Agent | Path |
|-------|------|
| Claude Code | `.claude/skills/pre-mortem/` |
| Codex | `.codex/skills/pre-mortem/` |
| Antigravity | `.agent/skills/pre-mortem/` |

Files written per agent:

- `SKILL.md`
- `agent-template.md`
- `domains.md`
- `.scaffold-meta.json`

## Update policy (non-destructive)

Per file, on re-run:

- Missing file: write it.
- Previously scaffolded and unmodified: safe overwrite/update.
- User-modified (or provenance unknown): **do not overwrite**; write `*.incoming` next to it.

If any `*.incoming` files are created, the CLI exits with code **2**.

## Usage

After scaffolding, run the skill inside Claude Code:

```bash
# Automatic expert selection (Mode A)
/pre-mortem <topic or file>

# Manual expert override (Mode B)
/pre-mortem <topic or file> --experts <e1>, <e2>, ..., <eN>
```

**Examples:**
```bash
/pre-mortem proposal.md
/pre-mortem proposal.md --experts security, database, frontend
/pre-mortem "OAuth2 with JWT for mobile"
/pre-mortem "OAuth2 with JWT for mobile" --experts security, api
```

**Resume after context overflow:**

If a session stops due to context overflow (common with 5 agents × multiple rounds), resume with:

```bash
/pre-mortem resume {name}
```

Progress is saved continuously to `discussions/{name}/state.json`. Only incomplete work is re-run.

## Features

- **Two modes:** Automatic expert selection (Mode A) or manual override (Mode B)
- **Exactly 3 rounds:** Parallel discovery → Sequential debate → Parallel filter
- **15 domain experts:** tech, security, database, api, frontend, mobile, ux, scalability, devops, infra, legal, cost, integration, data
- **4-step finalization:** Creates approved.md, renames original, generates ADR, cleans up session
- **Architect dialogue:** Open-ended conversation to resolve all risks
- **Files-first architecture:** Crash recovery and resume capability

## Non-goals

- Scaffold-only: does not run any sessions.
- Does not write or modify `.claude/agents/*`.
