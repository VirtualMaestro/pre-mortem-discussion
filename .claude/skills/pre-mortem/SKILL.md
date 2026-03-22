# /pre-mortem — Multi-Agent Pre-Mortem (Spec v6.0)

This skill orchestrates a structured multi-agent pre-mortem with minimal user gates.
Scaffolded by `npx pre-mortem-discussion`.

**Major changes in v6.0:**
- Rounds 1-3 run automatically (no gates between rounds)
- Two output files: debate summary + final solution
- Context overflow protection with resume capability
- Files-first architecture for crash recovery

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
- `discussions/{session_id}/*` including:
  - `state.json` (execution state, risk register, current step)
  - `input.md` (original spec)
  - `round*.md`, `round*.json`, `round*.jsonl` (round outputs)
  - `DEBATE_SUMMARY.md` (raw debate outcome, written after rounds)

## Session folder naming
Use slugified topic names instead of timestamps:
1. Extract first ~5 meaningful words from spec/topic
2. Slugify: lowercase, spaces→hyphens, strip special chars (keep only `a-z0-9-`)
3. Append 4-digit suffix: last 4 digits of unix timestamp (milliseconds)
4. Example: `discussions/oauth-jwt-mobile-app-3847/`

Store `session_id` in `state.json` matching folder name.

## Human gates (MUST use AskUserQuestion)
**Rounds 1, 2, and 3 run automatically with no user approval between them.**

Only 3 gates in the entire flow:
- **Gate 0:** Domain selection (before Round 1) — user confirms or modifies expert panel
- **Gate 4 (conditional):** Extra rounds offer (only if consensus NOT reached after Round 3)
- **Gate 5:** Cleanup offer (delete discussions folder at end)

No gates between rounds. No approve/reject for architect decisions.

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
- `domain_assessment` (string, 1-2 sentences, required even if risks is empty)
- `risks` (array, may be empty)
- `contradictions_noted` (array)

Each risk item must include:
- `id` (e.g. `sec-r1-001`)
- `name`
- `severity` in `{High, Med, Low}`
- `confidence` in `{High, Med, Low}` (optional, defaults to `Med`)
- `description` (style rule: “X happens when Y, causing Z”)
- `solution`, `tradeoff`
- `blocking_question` (string or null)
Optional:
- `spec_reference` (string, direct quote or specific reference from spec)
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
- Required fields present: `agent`, `round`, `domain_assessment`, `risks`, `contradictions_noted`
- `domain_assessment` must be non-empty string
- `risks` must be array (empty array is valid)
- Severity in `{High, Med, Low}` (if invalid, skip that risk)
- Confidence: if missing or invalid, default to `Med` and log warning
- File naming + state transitions
- Prompt drift check + user gate

Best-effort only (do not fail run): narrative phrasing pattern, perfect schema conformance beyond strict checks.

## Orchestrator behavior for new fields

### domain_assessment rendering
When `risks` is empty:
```markdown
## {agent} — Round {N}
✅ No risks identified in this domain.
Assessment: {domain_assessment}
---
```

When `risks` is non-empty:
```markdown
## {agent} — Round {N}
Assessment: {domain_assessment}

🚩 **[{severity} / {confidence}-conf] {risk_name}**
...
---
```

### spec_reference flagging
For each risk where `spec_reference` is absent or generic:
- Set `needs_verification: true` in state.json risk_register
- Add warning to .md log: `⚠️  {risk_id}: no spec reference — flagged for architect review`

A spec_reference is **generic** if it contains only phrases like "based on the overall approach", "given the architecture described", "the system as designed", "implied by the tech stack". When in doubt, treat as generic.

A spec_reference is **specific** if it:
- Contains a verbatim quote from the spec (any length), OR
- Names a concrete design decision, component, or section by exact name

### confidence rendering
Render confidence inline in .md logs:
```
🚩 **[High / High-conf] JWT secret stored in env var**
🚩 **[Med / Low-conf] Missing rate limiting**
```

Include in Gate summaries:
```
Round 1: 12 risks — High-conf: 7, Med-conf: 4, Low-conf: 1
```

Store `confidence` in each risk_register entry in state.json.

## Failure handling (STRICT)

### FAILED response (unparseable JSON or missing top-level required fields)
If a critic returns unparseable JSON or missing `agent`, `round`, `domain_assessment`, or `risks`:
- Record a FAILED stub entry into the round output
- Render FAILED in the Markdown log: `## {agent} — FAILED: unparseable or missing required fields`
- Mark `round_responses[N][agent] = "failed"` in `state.json`
- Continue without retry

### Malformed risk object (within valid response)
If a single risk object is missing required fields (`id`, `name`, `severity`, `description`):
- Skip that risk only
- Log in .md: `⚠️ 1 malformed risk object skipped in {agent} Round {N} response`
- Count valid risks only toward round totals
- Do not fail the entire agent response

### Field-level defaults
- `contradictions_noted`: if absent, default to `[]` and log warning
- `confidence`: if missing or invalid, default to `"Med"` and log warning
- `severity`: if invalid, skip the containing risk (do not default)

Rationale: `severity` is a core routing field — invalid severity would silently miscategorize the risk. `confidence` is supplementary signal — defaulting to `Med` is safe.

Round 2 persistence (robust): append each critic response as a line to `round2.jsonl`; at end compile to `round2.json` array.

## Prompt canonicalization + drift handling (STRICT)
- Agent prompts live in `.claude/agents/{name}.md` and are treated as canonical.
- Store `sha256(normalized_body_after_yaml)` per agent in `state.json.agent_prompt_sha256`.
- If current hash != stored hash:
  - set `state.status = "prompt_drift_detected"`
  - AskUserQuestion:
    - Use updated prompt (store new hash; continue), OR
    - Keep prior prompt for reproducibility (abort unless prior body is available in logs)

## Architect Mode B filter (post-debate)

After all debate rounds complete, the orchestrator switches to Architect Mode and makes two distinct passes over the risk_register before writing the final output artifact.

### Pass A: Verify unanchored risks (needs_verification: true)
For each risk where `needs_verification: true`:
- Architect reads the spec and checks whether the risk is actually grounded
- **If grounded:** remove `needs_verification` flag, keep risk as-is
- **If not grounded:** set `status: "dismissed"`, log to console:
  ```
  [ARCHITECT] Dismissed · {risk_id} · {risk_name}
    Reason: {one-line explanation}
  ```

### Pass B: Label low-confidence risks (confidence: "Low")
For each risk where `confidence: "Low"` and `status != "dismissed"`:
- Include in output artifact with `⚠️ Low confidence` label
- Add to dedicated `## Low-Confidence Risks` subsection in output artifact
- Add note: "These risks may become relevant depending on implementation choices not yet specified in the spec."

### Final output artifact content
- All `High` and `Med` confidence risks with `status != "dismissed"` → main risk register
- All `Low` confidence risks with `status != "dismissed"` → separate subsection with label
- All `dismissed` risks → not in artifact, preserved in round JSON for audit

**Pass A always executes before Pass B. Risks dismissed in Pass A are excluded from Pass B processing.**

## state.json Schema

The `state.json` file is the single source of truth for session state. It must include:

**Required fields:**
- `session_id` (string) — matches folder name
- `current_step` (string) — current execution step (see below)
- `selected_domains` (array) — approved expert panel
- `round_responses` (object) — per-round, per-agent completion status
- `risk_register` (array) — all risks with metadata
- `contradictions` (array) — all contradictions noted
- `agent_prompt_sha256` (object) — prompt hashes for drift detection

**current_step values (written BEFORE each step begins):**
- `"domain_selection"` — scoring domains, awaiting user approval
- `"agent_file_generation"` — writing agent files to `.claude/agents/`
- `"round_1_in_progress"` — Round 1 executing
- `"round_2_in_progress"` — Round 2 executing
- `"round_3_in_progress"` — Round 3 executing
- `"extra_rounds_in_progress"` — Extra rounds executing
- `"post_round3_consensus_check"` — Evaluating consensus
- `"debate_summary_write"` — Writing DEBATE_SUMMARY.md
- `"architect_mode_active"` — Architect analyzing debate
- `"human_architect_dialogue"` — Open conversation with user
- `"final_artifact_write"` — Writing final solution file
- `"done"` — Session complete

**round_responses structure:**
```json
{
  "1": {
    "security-critic": "completed",
    "tech-critic": "completed",
    "ux-critic": "pending"
  },
  "2": { ... }
}
```

Status values: `"pending"`, `"completed"`, `"failed"`

## Resume command: /pre-mortem resume {session_id}

If a session crashes (context overflow, network issue, etc.), resume with:
```
/pre-mortem resume {session_id}
```

**Resume logic by current_step:**

| current_step | Resume action |
|--------------|---------------|
| `round_1_in_progress` | Re-run Round 1 for agents where status != "completed" |
| `round_2_in_progress` | Re-run Round 2 for incomplete agents |
| `round_3_in_progress` | Re-run Round 3 for incomplete agents |
| `extra_rounds_in_progress` | Re-run current extra round for incomplete agents |
| `post_round3_consensus_check` | Run consensus check from state.json data |
| `debate_summary_write` | Write debate summary (skip if file exists) |
| `architect_mode_active` | Print transition, reload context from files, start analysis |
| `human_architect_dialogue` | Reload from debate summary, continue conversation |
| `final_artifact_write` | Re-generate final artifact (ask before overwriting) |
| `done` | Tell user session complete, show file locations |

**Idempotency rules:**

| File/operation | Rule |
|----------------|------|
| `roundN.jsonl` | Append only; never overwrite |
| `roundN.json` | Recompile from `.jsonl`; safe to overwrite |
| `roundN.md` | Recompile from `.json`; safe to overwrite |
| `DEBATE_SUMMARY.md` | Skip if exists; log "already exists, skipping" |
| Final artifact | Ask user before overwriting |
| `state.json` | Always writable; never skip |

## Files-First Principle (Critical Architecture)

**The orchestrator must treat its context window as a working scratchpad, not as storage. All data lives on disk. Context is reconstructed from disk when needed.**

This principle prevents context overflow and enables crash recovery.

**Five concrete rules:**

**Rule A — Write immediately, discard from context:**
When an agent returns a response, write it to disk immediately and do not keep the full response in context. Keep only a one-line summary (agent name + risk count) for gate summaries.

**Rule B — Read from disk when needed, not from memory:**
Before any step that requires debate data (consensus check, architect analysis, final artifact generation), read the relevant files from disk. Do not assume data is in context.

**Rule C — state.json is the single source of truth:**
Never make decisions based on what the orchestrator "remembers". Read state.json before every decision point. The only exception is the current active step, which can be held in context while executing.

**Rule D — Architect mode always reloads from disk:**
When switching to Architect Mode, explicitly read:
- `discussions/{session_id}/input.md` (original spec)
- `discussions/{session_id}/round1.json` through `roundN.json`
- `discussions/{session_id}/state.json` (risk_register, contradictions)

Build analysis from these files. Do not rely on conversation history that may have been compacted.

**Rule E — Resume is always possible:**
At any point in the flow, if the session dies and is resumed, the orchestrator must be able to reconstruct full working state from disk alone. If this is not possible at any step, that step is not correctly implemented.

## Two output files

The skill generates two separate files at different points:

**File 1 — Debate Summary (DEBATE_SUMMARY.md)**
- **Location:** Inside `discussions/{session_id}/`
- **Timing:** Written immediately after all rounds complete (before architect mode)
- **Content:**
  - Raw outcome of debate
  - All risks by severity and confidence
  - Contradictions noted
  - What was/wasn't resolved by experts
  - Link to full transcript
- **No user input required** — written automatically

**File 2 — Final Solution (genre-matched filename)**
- **Location:** Project root or next to input file
- **Timing:** Written after human-architect dialogue concludes
- **Filename:** Genre-matched (TECHNICAL_SPEC.md, VISION.md, REQUIREMENTS.md, ARCHITECTURE.md, or FINAL_PLAN.md)
- **Content:**
  - Complete resolution with architect decisions
  - User input incorporated
  - All items closed
  - `## Known Issues` section (deferred/accepted risks)
  - `## Low-Confidence Risks` section (separate subsection)
  - `## Debate Summary` section (brief stats + link to discussions folder)

## Consensus criterion (formal definition)

Consensus is reached when ALL of the following are true:
1. Zero `"High"` severity risks with status `"open"` in `state.json`
2. All `blocking_question` fields resolved in `state.json.user_decisions`
3. No unresolved contradictions in `state.json.contradictions`

Evaluate programmatically from state.json after Round 3 (not LLM judgment).

## Execution flow (complete)

Gates marked with **[GATE]**. Everything else is automatic.

### Step 1: Parse input and create session
- User runs: `/pre-mortem <topic or file path>`
- If file path: read file content as spec
- If topic: use topic text as spec
- Generate slugified session_id from spec
- Create `discussions/{session_id}/` directory
- Write `input.md` with original spec
- Initialize `state.json` with session_id
- Write `current_step: "domain_selection"` to state.json

### Step 2: Domain selection
- Read `.claude/skills/pre-mortem/domains.md`
- Score each domain by trigger hits in user spec (tokens + phrases, case-insensitive)
- Keep domains with score >= 2 OR explicitly requested by user
- Always include `tech-critic` for technical specs
- Cap at 5 (highest scores)
- **[GATE 0]** Present scored list to user via AskUserQuestion
- User approves or modifies expert panel
- Store approved domains in `state.json.selected_domains`

### Step 3: Generate agent files
- Write `current_step: "agent_file_generation"` to state.json
- For each domain in `selected_domains`:
  1. Check if `.claude/agents/{domain}-critic.md` exists
  2. If exists: print `✓ already exists, skipping`, continue
  3. If not exists: read agent-template.md, generate file with frontmatter, write to `.claude/agents/`
  4. If write fails: print warning, continue (fallback to inline prompt)

### Step 4: Run Round 1 (parallel discovery)
- Write `current_step: "round_1_in_progress"` to state.json
- Write `round_responses["1"]: { agent: "pending" for each }` to state.json
- **Context overflow warning:** If `selected_domains.length >= 5`, print:
  ```
  Note: Running {N} agents in parallel at opus level will use significant context.
  If the session stops unexpectedly, resume with:
    /pre-mortem resume {session_id}
  All progress is saved continuously to discussions/{session_id}/state.json
  ```
- Launch all critics in parallel using Agent tool
- **As each agent completes:**
  - Immediately append response to `round1.jsonl`
  - Immediately update `round_responses["1"][agent] = "completed"` in state.json
- After all complete:
  - Compile `round1.jsonl` → `round1.json`
  - Write `round1.md` (formatted markdown)
  - Update state.json with risks, contradictions

### Step 5: Run Round 2 (sequential debate)
- Write `current_step: "round_2_in_progress"` to state.json
- Write `round_responses["2"]: { agent: "pending" for each }` to state.json
- Critics run sequentially (one at a time, in order)
- Each critic sees all Round 1 outputs + earlier Round 2 responses
- **As each agent completes:**
  - Immediately append response to `round2.jsonl`
  - Immediately update `round_responses["2"][agent] = "completed"` in state.json
- After all complete:
  - Compile `round2.jsonl` → `round2.json`
  - Write `round2.md`
  - Update state.json

### Step 6: Run Round 3 (parallel filter)
- Write `current_step: "round_3_in_progress"` to state.json
- Write `round_responses["3"]: { agent: "pending" for each }` to state.json
- Critics run in parallel
- Focus ONLY on High/Med severity risks (Low risks filtered out)
- **As each agent completes:**
  - Immediately append response to `round3.jsonl`
  - Immediately update `round_responses["3"][agent] = "completed"` in state.json
- After all complete:
  - Compile `round3.jsonl` → `round3.json`
  - Write `round3.md`
  - Update state.json

### Step 7: Consensus check (automatic)
- Write `current_step: "post_round3_consensus_check"` to state.json
- Evaluate consensus criterion programmatically from state.json:
  - Count High severity risks with status "open"
  - Check if all blocking_question fields resolved
  - Check if all contradictions resolved
- **If consensus reached:** proceed to Step 9
- **If NOT reached:**
  - Count unresolved items (N)
  - **[GATE 4 - conditional]** AskUserQuestion: "Consensus not reached on {N} issues. Run 2 more rounds?"
    - **Yes:** run up to 2 more rounds (parallel filter semantics, stop early if consensus reached mid-way), then proceed to Step 9
    - **No:** proceed to Step 9

### Step 8: Extra rounds (if requested)
- Write `current_step: "extra_rounds_in_progress"` to state.json
- Run up to 2 more rounds with same mechanics as Round 3
- Check consensus after each round
- Stop early if consensus reached

### Step 9: Write debate summary file
- Write `current_step: "debate_summary_write"` to state.json
- Read all round files from disk
- Write `DEBATE_SUMMARY.md` to `discussions/{session_id}/`
- Content: raw debate outcome, all risks by severity/confidence, contradictions, unresolved items, link to transcript
- **No user input required** — automatic

### Step 10: Switch to Architect Mode
- Write `current_step: "architect_mode_active"` to state.json
- Print separator to console:
  ```
  ─────────────────────────────────────────
    DEBATE CLOSED — ARCHITECT MODE ACTIVE
  ─────────────────────────────────────────
  ```
- **Reload context from disk** (Files-First Rule D):
  - Read `discussions/{session_id}/input.md`
  - Read `discussions/{session_id}/round1.json` through `roundN.json`
  - Read `discussions/{session_id}/state.json`

### Step 11: Architect filter (Pass A and Pass B)
**Pass A — Verify unanchored risks (needs_verification: true):**
- For each risk where `needs_verification: true`:
  - Architect reads spec and checks if risk is grounded
  - If grounded: remove flag, keep risk
  - If not grounded: set `status: "dismissed"`, log:
    ```
    [ARCHITECT] Dismissed · {risk_id} · {risk_name}
      Reason: {one-line explanation}
    ```

**Pass B — Label low-confidence risks (confidence: "Low"):**
- For each risk where `confidence: "Low"` and `status != "dismissed"`:
  - Include in output artifact with `⚠️ Low confidence` label
  - Add to dedicated `## Low-Confidence Risks` subsection

**Pass A always executes before Pass B. Risks dismissed in Pass A are excluded from Pass B.**

### Step 12: Architect analysis and open dialogue
- Write `current_step: "human_architect_dialogue"` to state.json
- Architect forms positions on all unresolved items
- Architect presents analysis in natural language (not as approval request)
- **Open-ended conversation:**
  - User responds freely (agrees, disagrees, asks questions, provides context)
  - Architect incorporates feedback and revises positions
  - Continues until both agree on every item
  - No fixed number of turns, no approve/reject buttons
  - Ends naturally when agreement is reached
- Architect confirms resolution

### Step 13: Write final solution file
- Write `current_step: "final_artifact_write"` to state.json
- Detect appropriate genre (TECHNICAL_SPEC.md, VISION.md, REQUIREMENTS.md, ARCHITECTURE.md, or FINAL_PLAN.md)
- Write to project root or next to input file
- Content: complete resolution, architect decisions, Known Issues section, Low-Confidence Risks section, Debate Summary section

### Step 14: Cleanup offer
- Write `current_step: "done"` to state.json
- **[GATE 5]** AskUserQuestion: "Delete discussions/{session_id}/ folder?"
  - Yes: delete folder
  - No: keep folder

## Round semantics

**Round 1 — Parallel discovery:**
- All critics run simultaneously
- No visibility into other critics' outputs
- Goal: independent risk identification
- Output: comprehensive risk catalog

**Round 2 — Sequential debate:**
- Critics run one at a time in order
- Each sees all prior outputs (Round 1 + earlier Round 2 responses)
- Goal: challenge assumptions, identify contradictions
- Output: refined risks + contradiction list

**Round 3 — Parallel filter:**
- All critics run simultaneously
- Focus ONLY on High/Med severity risks
- Goal: validate solutions, assess tradeoffs
- Output: actionable risk mitigation strategies

**Extra rounds (if needed) — Parallel filter:**
- Same semantics as Round 3
- Only run if consensus not reached after Round 3

## Output artifact genre-matching

Detect appropriate output file based on input characteristics (priority order, first match wins):

1. **REQUIREMENTS.md** — if input contains user stories, acceptance criteria, "As a user", "Given/When/Then"
2. **ARCHITECTURE.md** — if input contains architecture diagrams, "Component", "Service", "Layer", "Module"
3. **TECHNICAL_SPEC.md** — if input contains API contracts, "Endpoint", "Schema", "Interface", "Protocol"
4. **VISION.md** — if input contains problem statement, "Why", "Goal", "Mission", "Problem"
5. **FINAL_PLAN.md** — default fallback

## Extra rounds
Default: extra rounds are **parallel filter** rounds (Round 3 semantics) unless user explicitly requests sequential.
