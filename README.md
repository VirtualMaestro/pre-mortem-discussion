# pre-mortem-discussion

Scaffold Claude Code **pre-mortem discussion** skills into the project you run it from.

Two skills are available:
- `/pre-mortem` — Manual mode with human gates and approval loops
- `/pre-mortem-auto` — Automatic mode with minimal interruption

## Install / run

```bash
# Scaffold both skills (default)
npx pre-mortem-discussion

# Scaffold only one skill
npx pre-mortem-discussion --skill pre-mortem
npx pre-mortem-discussion --skill pre-mortem-auto
```

## What it writes

By default, scaffolds both skills into the target project:

**`/pre-mortem` skill:**
- `.claude/skills/pre-mortem/SKILL.md`
- `.claude/skills/pre-mortem/agent-template.md`
- `.claude/skills/pre-mortem/domains.md`
- `.claude/skills/pre-mortem/domains.generated.md`
- `.claude/skills/pre-mortem/.scaffold-meta.json`

**`/pre-mortem-auto` skill:**
- `.claude/skills/pre-mortem-auto/SKILL.md`
- `.claude/skills/pre-mortem-auto/agent-template.md`
- `.claude/skills/pre-mortem-auto/domains.md`
- `.claude/skills/pre-mortem-auto/domains.generated.md`
- `.claude/skills/pre-mortem-auto/.scaffold-meta.json`

## Update policy (non-destructive)

Per file, on re-run:

- Missing file: write it.
- Previously scaffolded and unmodified: safe overwrite/update.
- User-modified (or provenance unknown): **do not overwrite**; write `*.incoming` next to it.

If any `*.incoming` files are created, the CLI exits with code **2**.

## Skill comparison

| Feature | `/pre-mortem` | `/pre-mortem-auto` |
|---------|---------------|-------------------|
| Domain selection | User approves expert panel | Auto-selected, printed |
| Max rounds | 3 + optional 2 more (user gate) | 5 automatic |
| Consensus check | After round 3, user decides | Automatic early stop |
| Architect decisions | User approval required | Autonomous (escalates only blockers) |
| Best for | Critical decisions, high stakes | Rapid iteration, exploratory work |

## Next step

After scaffolding, run either skill inside Claude Code:

- `/pre-mortem <topic or file>` — manual mode
- `/pre-mortem-auto <topic or file>` — automatic mode

## Non-goals

- Scaffold-only: does not run any sessions.
- Does not write or modify `.claude/agents/*`.
