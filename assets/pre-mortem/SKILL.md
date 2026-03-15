# /pre-mortem — Multi-Agent Pre-Mortem (Spec v4.1)

This skill orchestrates a structured multi-agent pre-mortem with explicit user gates.
Scaffolded by `npx pre-mortem-discussion`.

## Non-goals
- This skill does **not** auto-run on scaffold.
- This skill never writes/overwrites `.claude/agents/*` (agents are a library written on first use by the skill runtime, not by the scaffolder).

## Runtime primitive (IMPORTANT)
This environment's callable primitive is the **`Agent` tool**.
- Any `Task(...)` references are pseudocode only.

Pseudocode mapping:
- `Task(subagent_type, description, prompt)` → `Agent({ subagent_type, description, prompt, model, ... })`

## Defaults
- Critic model default: **opus**.
- Trigger matching: **token + phrase** support; case-insensitive; avoid substring false positives.

## Roles and tools
Orchestrator tools: `Read, Write, Glob, Grep, AskUserQuestion`.
Critics tools: `Read, Glob, Grep` (read-only).

## File layout (normative)
Skill assets live under:
- `.claude/skills/pre-mortem/*`

Session artifacts live under:
- `discussions/{session_id}/*` including `state.json`, `round*.md`, `round*.json`, and `round2.jsonl`.

## Human gates (MUST use AskUserQuestion)
No round begins without explicit user approval.
- Gate 0: critic/domain selection (before Round 1)
- Gate 1: after Round 1 synthesis
- Gate 2: after Round 2 synthesis
- Gate 3: after Round 3 synthesis / final approval

## Deterministic domain selection (Gate 0)
1) Read `.claude/skills/pre-mortem/domains.md`.
2) Score each domain by trigger hits in the user spec.
   - Tokens: exact token match after tokenization (preferred)
   - Phrases: exact phrase match
   - Case-insensitive
   - Avoid substring matches (`auth` must not match `author`).
3) Keep domains with score >= 2 OR explicitly requested by the user.
4) Always include `tech-critic` for technical specs.
5) Cap at 5 (highest scores).
6) Ask user to approve/modify the list (Gate 0). Do not proceed without approval.

## Agent execution model
- Do NOT route via named `subagent_type` (file-based discovery unreliable). Always use `subagent_type: "general-purpose"`.
- Inject persona + round instructions inline in the `prompt`.

Normative call skeleton:
```text
Agent({
  subagent_type: "general-purpose",
  description: "{domain}-critic: pre-mortem round {N}",
  prompt: "{CANONICAL_PROMPT_BODY}\n\n{ROUND_TASK_INSTRUCTIONS}",
  model: "opus",
  resume: "",
  run_in_background: false,
  name: "",
  team_name: "",
  mode: "default",
  isolation: "worktree"
})
```

## Critic output (STRICT)
Each critic returns exactly **one JSON object** (no preamble text).
Required top-level keys:
- `agent` (string)
- `round` (number)
- `risks` (array)
- `contradictions_noted` (array)

Each risk item must include:
- `id` (e.g. `sec-r1-001`)
- `name`
- `severity` in `{High, Med, Low}`
- `description` (style rule: “X happens when Y, causing Z”)
- `solution`, `tradeoff`
- `blocking_question` (string or null)
Optional:
- `scenario`: `{ when, happens, impact }`
- `updates_risk_id`
- `references` (array)

Canonical contradiction object schema (used everywhere):
```json
{
  "from_agent": "tech-critic",
  "against_agent": "security-critic",
  "risk_id": "sec-r1-002",
  "summary": "..."
}
```

## Orchestrator strict checks
- JSON parseability
- Required fields present
- Severity in `{High, Med, Low}`
- File naming + state transitions
- Prompt drift check + user gate

Best-effort only (do not fail run): narrative phrasing pattern, perfect schema conformance beyond strict checks.

## Failure handling (STRICT)
If a critic returns unparseable JSON:
- Record a FAILED stub entry into the round output
- Render FAILED in the Markdown log
- Mark `round_responses[N][agent] = "failed"` in `state.json`
- Continue

Round 2 persistence (robust): append each critic response as a line to `round2.jsonl`; at end compile to `round2.json` array.

## Prompt canonicalization + drift handling (STRICT)
- Agent prompts live in `.claude/agents/{name}.md` and are treated as canonical.
- Store `sha256(normalized_body_after_yaml)` per agent in `state.json.agent_prompt_sha256`.
- If current hash != stored hash:
  - set `state.status = "prompt_drift_detected"`
  - AskUserQuestion:
    - Use updated prompt (store new hash; continue), OR
    - Keep prior prompt for reproducibility (abort unless prior body is available in logs)

## Extra rounds
Default: extra rounds are **parallel filter** rounds (Round 3 semantics) unless user explicitly requests sequential.
