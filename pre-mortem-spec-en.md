# Spec: Multi-Agent Pre-Mortem for Claude Code

**Version:** 4.1
**Status:** Ready for Implementation
**Based on:** Claude Code native subagents API + Skills

---

## Changelog from v4.0

- **#runtime** Clarified that `Task(...)` in this doc is pseudocode; added an explicit mapping to the real Claude Code runtime primitive (`Agent` tool in this environment).
- **#contradictions** Canonicalized contradictions schema across outputs + state.
- **#risklinks** Added risk linkage fields (`updates_risk_id`, `references`) + merge rules into `risk_register`.
- **#scenario** Made “X happens when Y, causing Z” a style rule; added optional structured `scenario` for soft-validation.
- **#promptdrift** Added deterministic prompt-drift detection + user gate.
- **#routing** Improved trigger matching from substring to token/word-boundary matching.
- **#roundorder** Clarified `round_order` is only meaningful for sequential rounds.
- **#extrarounds** Extra rounds default to **parallel filter** (unless user explicitly chooses sequential).
- **#persistence** Round 2 streaming persistence changed from “append to JSON array” to JSONL (robust if interrupted).
- **#pointers** Normalized rerun file pointers under `round_files` (removed `round_1_file` mismatch).
- **#safety** Added universal privacy constraint (no real personal data; hypothetical examples only).
- **#limits** Clarified what is strictly validated vs best-effort (LLM self-check) in a Skill-only runtime.

---

## 1. Concept

An automated Pre-Mortem analysis system: before implementation begins, specialized
critic agents run three rounds of adversarial review, surface risks with severity
ratings, and propose solutions. The Orchestrator manages the process, synthesizes
findings, and keeps the user in the loop at every checkpoint.

**Agent execution model:** All critics run as a single generic subagent type with the
full expert persona injected inline. Agent `.md` files in `.claude/agents/` serve as the
human-readable library and documentation — they are written on first use and refined
over time — but routing never depends on them being loaded at session start. This
choice is forced by a known Claude Code bug where file-based agent discovery is
unreliable across versions.

---

## 2. Project File Structure

```
{project_root}/
├── .claude/
│   ├── agents/                         ← expert library (docs + future optimization)
│   │   ├── tech-critic.md              ← written on first use, refined over time
│   │   ├── security-critic.md
│   │   └── ...                         ← accumulates across sessions
│   │
│   └── skills/
│       └── pre-mortem/
│           ├── SKILL.md                ← orchestrator logic + /pre-mortem entry point
│           ├── agent-template.md       ← template for generating new agent files
│           ├── domains.md              ← curated domain catalog (manually approved)
│           └── domains.generated.md   ← auto-generated new domains (pending approval)
│
└── discussions/
    └── {session_id}/
        ├── input.md                    ← original spec (read by all agents)
        ├── state.json                  ← deterministic state + risk register
        ├── round1.md                   ← Round 1 Markdown log (rendered from JSON)
        ├── round1.json                 ← Round 1 machine-parseable output
        ├── round2.md
        ├── round2.jsonl                ← Round 2 JSONL (append-safe)
        ├── round2.json                 ← Round 2 compiled JSON array (written at end)
        ├── round3.md / round3.json
        ├── round1_run2.md / round1_run2.json  ← versioned reruns (if any)
        └── FINAL_PLAN.md
```

---

## 3. Role Architecture

### 3.1 Permission Separation

| Role | Tools | Rationale |
|------|-------|-----------|
| **Orchestrator** (SKILL.md) | `Read, Write, Glob, Grep, AskUserQuestion` | Manages state, writes all files, asks user at gates |
| **Critic agents** | `Read, Glob, Grep` | Read-only: spec + round logs, never write |

**Why AskUserQuestion is in the orchestrator's toolset:** It is the only mechanism
for blocking user confirmation at checkpoints. Without it the orchestrator would have
to continue or halt based on LLM judgment alone, which is non-deterministic.

**Why critics do not write:** The orchestrator receives each critic's JSON response
and writes it to both `.json` (machine) and `.md` (human) files with correct
separators. This eliminates race conditions in parallel rounds, and ensures the
Markdown log is always well-formed.

### 3.2 Agent Execution Model

**There is one execution path for all agents, always.**

#### 3.2.1 Pseudocode (`Task(...)`)

This spec uses `Task(...)` as *pseudocode* for “launch a subagent with a prompt”.

```
Task(
  subagent_type: "general-purpose",
  description:   "{domain}-critic: pre-mortem round {N}",
  prompt:        "{CANONICAL_PROMPT_BODY}\n\n{ROUND_TASK_INSTRUCTIONS}"
)
```

`CANONICAL_PROMPT_BODY` is the body text of the agent's `.md` file (after the YAML
block), normalized and stored in state.json as a sha256 hash for consistency tracking.

#### 3.2.2 Mapping to Claude Code runtime (this environment)

In this Claude Code environment, the actual callable primitive is the **`Agent` tool**.
So the orchestrator must implement the above pseudocode as:

```
Agent({
  subagent_type: "general-purpose",
  description: "{domain}-critic: pre-mortem round {N}",
  prompt: "{CANONICAL_PROMPT_BODY}\n\n{ROUND_TASK_INSTRUCTIONS}",
  model: "sonnet"|"opus"|"haiku",
  resume: "",
  run_in_background: false,
  name: "",
  team_name: "",
  mode: "default",
  isolation: "worktree"
})
```

Named routing (`subagent_type: "security-critic"`) is **not used** because Claude Code's
file-based agent discovery is unreliable across versions (confirmed open bug). Agent
files are written for the library value, not for routing.

---

## 4. Agent Output Format (Hybrid JSON + Markdown)

### 4.1 What agents return

Every agent returns a single JSON object. No free-form text. No preamble.

```json
{
  "agent": "security-critic",
  "round": 1,
  "risks": [
    {
      "id": "sec-r1-001",
      "name": "JWT secret stored in environment variable",
      "severity": "High",
      "description": "The deployment pipeline writes JWT_SECRET to .env. A compromised CI runner exfiltrates it, causing arbitrary token forgery.",
      "scenario": { "when": "...", "happens": "...", "impact": "..." },
      "solution": "Use a secrets manager (Vault, AWS Secrets Manager). Inject at runtime via sidecar, never persisted to disk or logs.",
      "tradeoff": "Adds infra dependency and ~50ms cold-start latency per service restart.",
      "blocking_question": null,
      "updates_risk_id": null,
      "references": []
    }
  ],
  "contradictions_noted": []
}
```

**Field rules:**
- `id`: `{domain-prefix}-r{round}-{seq}` e.g. `sec-r1-001`
- `severity`: exactly one of `"High"`, `"Med"`, `"Low"`
- `description`: **style rule**: aim for “X happens when Y, causing Z” (not hard-validated)
- `scenario` (optional): `{ when, happens, impact }` (strings). Use if it clarifies the narrative.
- `blocking_question`: string or `null`
- `updates_risk_id` (optional): string risk id from an earlier round that this item updates
- `references` (optional): array of earlier risk ids that this item relates to (supports cross-domain linkage)
- `contradictions_noted`: array of **canonical contradiction objects** (below) — used in Round 2+

**Canonical contradiction object (used everywhere):**
```json
{
  "from_agent": "tech-critic",
  "against_agent": "security-critic",
  "risk_id": "sec-r1-002",
  "summary": "Tech suggests caching auth decisions; security says it breaks revocation guarantees."
}
```

### 4.2 How the orchestrator renders to Markdown

After receiving all JSON responses for a round, the orchestrator writes two files:

**`roundN.json`** — raw array of all agent JSON objects (source of truth for parsing)

**`roundN.md`** — human-readable log, rendered from JSON.

### 4.3 Parsing rules (orchestrator)

These are the extraction rules the orchestrator must follow — not approximations:

- **Risk count:** `risks.length` across all agent JSON objects in the round file
- **Top N by severity:** sort by `severity` (High > Med > Low), break ties by order
  of appearance; take first N
- **Blocking questions:** all items where `blocking_question !== null`
- **Contradictions:** all items in `contradictions_noted` arrays across all agents
- **Malformed response:** if an agent returns text that cannot be parsed as JSON,
  log a FAILED entry (see Section 10 — Failure Handling) and continue

---

## 5. State File `state.json`

The deterministic source of truth. The LLM never counts rounds or tracks risks in memory.

```json
{
  "session_id": "oauth-mobile_2025-03-15",
  "topic_summary": "OAuth2 with JWT for a mobile app",
  "created_at": "2025-03-15T10:00:00Z",
  "status": "round_1_in_progress",
  "max_rounds": 3,
  "selected_agents": ["security-critic", "tech-critic", "product-critic"],
  "round_order": {
    "2": ["tech-critic", "product-critic", "security-critic"]
  },
  "agent_prompt_sha256": {
    "security-critic": "a3f8...",
    "tech-critic": "b91c...",
    "product-critic": "d44e..."
  },
  "round_files": {
    "1": { "run": 1, "md": "round1.md", "json": "round1.json" },
    "2": { "run": 1, "md": "round2.md", "jsonl": "round2.jsonl", "json": "round2.json" },
    "3": { "run": 1, "md": "round3.md", "json": "round3.json" }
  },
  "rounds_completed": [],
  "round_responses": {
    "1": {},
    "2": {},
    "3": {}
  },
  "risk_register": [],
  "contradictions": [],
  "blocking_issues": [],
  "user_decisions": {}
}
```

**`round_responses`** tracks per-agent completion:
```json
"round_responses": {
  "1": {
    "security-critic": "completed",
    "tech-critic": "completed",
    "product-critic": "failed"
  }
}
```

### 5.1 `risk_register` identity + merge rules

`risk_register` is a cross-round register. Risks keep their original ids (`sec-r1-002` etc).
New risks introduced in later rounds get their own ids.

Each agent risk item may optionally set:
- `updates_risk_id`: points to an existing risk that is being updated (solution/tradeoff/status)
- `references`: points to related risks (cross-links) without claiming to update them

**Merge rules into `risk_register`:**
- If `updates_risk_id` is set:
  - Find that risk in `risk_register`.
  - Update mutable fields: `severity` (can increase/decrease), `solution`, `tradeoff`, `status`.
  - Append `update_history` entry: `{ round, agent, applied_from_id, timestamp? }` (timestamp optional).
- Else (no `updates_risk_id`):
  - Treat as a new risk and add to `risk_register`.
- Always persist `references` as a field on the stored risk entry.

**Minimal stored risk entry:**
```json
{
  "id": "sec-r1-001",
  "domain": "security-critic",
  "round_introduced": 1,
  "name": "JWT secret stored in env var",
  "severity": "High",
  "status": "open",
  "solution": null,
  "tradeoff": null,
  "references": [],
  "update_history": []
}
```

Status values: `"open"` → `"resolved"` | `"compromise"` | `"blocking"`

### 5.2 Status lifecycle

```
round_1_in_progress → awaiting_user_r1 →
round_2_in_progress → awaiting_user_r2 →
round_3_in_progress → awaiting_final_approval → done

stopped_r1 / stopped_r2 / stopped_r3

prompt_drift_detected
```

---

## 6. Round Order Rotation

Round 2 is sequential — the order determines who has last-mover advantage. To prevent
any single agent from systematically dominating the synthesis, the order rotates each
round using a deterministic left-shift.

**Important:** `round_order` is only meaningful for **sequential** rounds. For parallel
rounds, ordering is irrelevant; do not treat `round_order[1]`/`round_order[3]` as normative.

Rotation rule (for sequential rounds): for N agents, `round_order[k]` = agents rotated
left by (k-1).

---

## 7. Agent Selection: Deterministic Heuristic

"Analyze and select" is too vague. The orchestrator follows this algorithm:

### Step 1 — Trigger signal scoring
For each domain in `domains.md`, count how many of its trigger signals appear in the spec.

**Matching rule:** token/word-boundary match (case-insensitive). Avoid substring false
positives (e.g., `auth` must not match `author`).

Acceptable implementations in Skill-only context:
- Regex with word boundaries where safe: `\btoken\b`
- Tokenize the spec text into words and match exact tokens/phrases

### Step 2 — Threshold filter
Keep only domains with **≥ 2 trigger signal hits**, OR where the user explicitly
named the domain (e.g. "check security").

### Step 3 — Mandatory inclusion
Always include `tech-critic` regardless of score, for any technical spec.

### Step 4 — Cap at 5
If more than 5 domains pass the threshold, keep the top 5 by score.

### Step 5 — User confirmation gate
Present the proposed list to the user before proceeding. This gate is non-optional.

---

## 8. Human-in-the-Loop Gates

All checkpoints use `AskUserQuestion`. No round begins without explicit approval.

**Gate 0 — Expert selection (Phase 0, mandatory)**

**Gate 1 — After Round 1**

**Gate 2 — After Round 2**

**Gate 3 — After Round 3**

(Exact copy text is defined in SKILL.md; this spec defines the required semantics.)

---

## 9. Prompt Canonicalization + Drift Handling

Agent prompts are stored in `.claude/agents/{name}.md` and treated as the canonical source.
The orchestrator stores `sha256(normalized_body)` per agent in `state.json`.

**Normalization:**
- extract body after YAML header
- normalize line endings to `\n`
- no other rewriting

**Prompt drift rule (deterministic):**
- If current file body hash != `state.json.agent_prompt_sha256[agent]`:
  - set `state.status = "prompt_drift_detected"`
  - block on `AskUserQuestion`:
    - Use updated prompt (store new sha256; continue), OR
    - Keep prior prompt for reproducibility (abort run unless prior prompt body is available in logs)

Rationale: silent prompt drift breaks reproducibility; automatic overwrite is also risky.

---

## 10. Resume and Idempotency

On `/pre-mortem resume {session_id}`:

1. Read `state.json`. It is the **source of truth**.
2. Check `status` to determine which phase to re-enter.
3. For each round, check `round_responses[N]` for per-agent status.
4. Use `round_files[N]` to locate the current files for that run.

**Conflict resolution rules:**

| Scenario | Rule |
|----------|------|
| state says round N completed, file exists | Trust state, skip re-running |
| state says round N completed, file missing | Re-run round N, create versioned file pointers under `round_files[N]` |
| state says round N in_progress, file partially written | Re-run only agents with status != "completed" in `round_responses` |
| state says round N in_progress, file missing | Re-run entire round |
| agent list in state differs from current `.claude/agents/` | Use agent list from state; warn user |

**Versioned reruns:**
- When a round must be re-run, increment `round_files[N].run` and write new file names:
  - e.g. `round1_run2.md`, `round1_run2.json`
- Orchestrator always reads/writes the file paths recorded in `round_files`.

---

## 11. Skill File: `.claude/skills/pre-mortem/SKILL.md` (normative outline)

This section describes required behavior; implementation must map to the actual runtime
tools available.

### Runtime constraints (Skill-only)

Some checks are inherently hard to enforce strictly in a pure prompt orchestration layer.
Define which are strict vs best-effort:

**Strict (must be enforced by the orchestrator):**
- JSON parseability (round outputs)
- required fields present
- severity value in {High, Med, Low}
- file naming + state transitions
- prompt hash drift check + gate

**Best-effort (LLM self-check; do not fail the run on these):**
- narrative phrasing pattern in `description`
- perfect schema conformance beyond the strict checks above

---

## 12. Failure Handling

**Agent returns unparseable JSON:**
- Record in round JSON (or JSONL) as a FAILED stub object.
- Render a FAILED block in Markdown.
- Mark `round_responses[N][agent] = "failed"` in state.json.
- Continue.

**Round 2 persistence rule (robust):**
- Append each agent JSON object as one line to `round2.jsonl`.
- At end of the round, compile JSONL → `round2.json` array for downstream parsing.

**User requests extra round:**
- Increment `max_rounds` in state.json.
- Default behavior: run an **extra parallel filter** round (same as Round 3 semantics).
- If user explicitly chooses sequential, then compute a rotated sequential order and store it under `round_order[roundN]`.

---

## 13. Supporting File: `.claude/skills/pre-mortem/agent-template.md`

Add universal constraints:
- Do not invent real personal data.
- Keep examples hypothetical.

(Template content otherwise unchanged.)

---

## 14. Supporting File: `.claude/skills/pre-mortem/domains.md`

No change: curated catalog; new domains go to `domains.generated.md` only.

---

## 15. What Not to Do

- Never use `subagent_type: "{agent-name}"` — file-based routing is unreliable.
- Never auto-edit `domains.md` — curated; new domains go to `domains.generated.md`.
- Never silently diverge the inline prompt from the file body — sha256 exists to detect drift; drift requires a user gate.
- Never store round counter or risk tracking in LLM memory — state.json only.
- Never give critic agents Write access — orchestrator owns all file writes.
- Never run Round 2 in parallel — sequential chain is the discussion.
- Never skip checkpoint gates — user must approve each transition via AskUserQuestion.
- Never regenerate/overwrite an existing agent file.
- Never rely on Agent Teams — experimental instability.
