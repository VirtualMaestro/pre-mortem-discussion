# pre-mortem-discussion

Scaffold the Claude Code **pre-mortem discussion** skill assets into the project you run it from.

## Install / run

```bash
npx pre-mortem-discussion
```

Optional target directory:

```bash
npx pre-mortem-discussion --dir /path/to/project
```

## What it writes

Into the target project:

- `.claude/skills/pre-mortem/SKILL.md`
- `.claude/skills/pre-mortem/agent-template.md`
- `.claude/skills/pre-mortem/domains.md`
- `.claude/skills/pre-mortem/domains.generated.md`
- `.claude/skills/pre-mortem/.scaffold-meta.json`

## Update policy (non-destructive)

Per file, on re-run:

- Missing file: write it.
- Previously scaffolded and unmodified: safe overwrite/update.
- User-modified (or provenance unknown): **do not overwrite**; write `*.incoming` next to it.

If any `*.incoming` files are created, the CLI exits with code **2**.

## Next step

After scaffolding, run the skill inside Claude Code:

- `/pre-mortem`

## Non-goals

- Scaffold-only: does not run any sessions.
- Does not write or modify `.claude/agents/*`.
