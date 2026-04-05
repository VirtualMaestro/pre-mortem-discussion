# /pre-mortem — Multi-Agent Pre-Mortem (Spec v7.0)

This skill orchestrates a structured multi-agent pre-mortem with minimal user gates.
Scaffolded by `npx pre-mortem-discussion`.

**Major changes in v7.0:**
- Single unified skill with optional --experts flag (Mode A: auto, Mode B: manual)
- Exactly 3 rounds (no extra rounds)
- Expanded domain catalog (15 domains)
- 4-step finalization process (approved.md, rename, adr.md, cleanup)
- Direct updates to domains.md (no domains.generated.md)

## Command Syntax

/pre-mortem <file_or_topic>
/pre-mortem <file_or_topic> --experts <e1>, <e2>, ..., <eN>

**Mode A (no --experts flag):** Automatic expert selection
- Scores all domains by trigger hits in spec
- Selects top 5 (score ≥ 2)
- Always includes tech-critic
- Prints selected experts with signal counts
- Proceeds immediately to debate (no gate)

**Mode B (with --experts flag):** Manual override
- Uses user-specified experts
- Creates new agent files if not found
- Architect fills remaining slots (up to 5 total)
- Prints final panel
- Proceeds to debate

**Examples:**
```
/pre-mortem proposal.md
/pre-mortem proposal.md --experts security, database, frontend
/pre-mortem "OAuth2 with JWT for mobile"
/pre-mortem "OAuth2 with JWT for mobile" --experts security, api
```

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
- `discussions/{name}/*` including:
  - `debates/` (subfolder for all raw JSON data)
    - `{agent}-round{N}.json` (per-critic output, written by critic)
    - `round{N}.json` (compiled array, written by orchestrator)
    - `round{N}.jsonl` (incremental log, written by orchestrator)
  - `state.json` (execution state, risk register, current step)
  - `input.md` (original spec)
  - `round{N}.md` (human-readable round logs)
  - `debate-summary.md` (raw debate outcome, written after rounds)

## Session folder naming

session_id = {name}

**File input:** {name} = basename without extension
Example: `proposal.md` → `discussions/proposal/`

**Text input:** {name} = slugified topic (first ~5 words) + 4-digit suffix
Example: `"OAuth JWT mobile"` → `discussions/oauth-jwt-mobile-3847/`

Store `session_id` in `state.json` matching folder name.

## Human gates (MUST use AskUserQuestion)

**Rounds 1, 2, and 3 run automatically with no user approval between them.**

Only 1 gate in the entire flow:
- **Gate 5:** Cleanup offer (delete discussions folder at end)

No gates for:
- Domain selection (Mode A prints and proceeds; Mode B proceeds after resolution)
- Between rounds (automatic flow)
- Extra rounds (removed — exactly 3 rounds)
- Architect decisions (open dialogue, not approve/reject)

## Expert Selection

### Mode A — Automatic (no --experts flag)

1. Read `.claude/skills/pre-mortem/domains.md`
2. Score each domain by trigger hits in the spec:
   - Token match: exact token after tokenization (avoid substring: `auth` ≠ `author`)
   - Phrase match: exact phrase match
   - Case-insensitive
3. Keep domains with score ≥ 2
4. Always include `tech-critic` for technical specs
5. Cap at 5 (highest scores)
6. Print selected experts with signal counts — **no user approval needed**:
   ```
   Selected experts (auto):
   - security-critic (8 signals)
   - tech-critic (12 signals)
   - database-critic (5 signals)
   ```
7. Proceed immediately to Round 1

### Mode B — Manual Override (with --experts flag)

For each name in `--experts`:

1. Search `.claude/agents/` for a file matching `{name}-critic.md`
   - Use glob: `.claude/agents/*{name}*` (case-insensitive)
   - If found: use that agent file
   - If not found: create `.claude/agents/{name}-critic.md` using
     `agent-template.md`, tailored to the domain described by `{name}`

2. After resolving all user-specified experts:
   - If count < 5: architect scores remaining domains from `domains.md`
     and adds up to `(5 - count)` additional experts
   - If count = 5: no additions, proceed with exactly those 5

3. Print final expert list (user-specified + architect additions):
   ```
   Expert panel:
   - security-critic    (specified by user)
   - database-critic    (specified by user)
   - tech-critic        (added by architect — 9 signals)
   - api-critic         (added by architect — 4 signals)
   ```
4. Proceed to Round 1

### New Agent File Creation

When an expert name is not found in `.claude/agents/`:
- Generate `{name}-critic.md` using `agent-template.md`
- Tailor focus areas to the domain implied by `{name}`
- Add a new entry to `domains.md` for this domain
- Print: `✓ Created .claude/agents/{name}-critic.md`

**`domains.md` is always updated directly** — no intermediate
`domains.md`. The file grows organically as new experts are created.

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

Round 2 persistence (robust): append each critic response as a line to `debates/round2.jsonl`; at end compile to `debates/round2.json` array.

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
- `"debate_summary_write"` — Writing debate-summary.md
- `"architect_mode_active"` — Architect analyzing debate
- `"human_architect_dialogue"` — Open conversation with user
- `"generating_final_output"` — Writing approved + adr + open-questions files, then cleanup
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

## Resume command: /pre-mortem resume {name}

If a session crashes (context overflow, network issue, etc.), resume with:
```
/pre-mortem resume {name}
```

**Resume logic by current_step:**

| current_step | Resume action |
|--------------|---------------|
| `round_1_in_progress` | Re-run Round 1 for agents where status != "completed" |
| `round_2_in_progress` | Re-run Round 2 for incomplete agents |
| `round_3_in_progress` | Re-run Round 3 for incomplete agents |
| `debate_summary_write` | Write debate summary (skip if file exists) |
| `architect_mode_active` | Print transition, reload context from files, start analysis |
| `human_architect_dialogue` | Reload from debate summary, continue conversation |
| `generating_final_output` | Re-run Steps 1-5 of Step 11, skip files that already exist |
| `done` | Session already complete. Show file locations. |

**Idempotency rules:**

| File/operation | Rule |
|----------------|------|
| debates/roundN.jsonl | Append only; never overwrite |
| debates/roundN.json | Recompile from `.jsonl`; safe to overwrite |
| debates/{agent}-roundN.json | Written by critic; never overwrite |
| roundN.md | Recompile from debates/roundN.json; safe to overwrite |
| debate-summary.md | Skip if exists; log "already exists, skipping" |
| `state.json` | Always writable; never skip |
| {name}-approved.md | Skip if exists; overwrite if user resolved open questions |
| {name}-adr.md | Skip if exists; append if user resolved open questions |
| {name}-open-questions.md | Skip if exists; delete once all questions answered |

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
- discussions/{name}/input.md (original spec)
- discussions/{name}/debates/round1.json through debates/round{N}.json
- discussions/{name}/state.json (risk_register, contradictions)

Build analysis from these files. Do not rely on conversation history that may have been compacted.

**Rule E — Resume is always possible:**
At any point in the flow, if the session dies and is resumed, the orchestrator must be able to reconstruct full working state from disk alone. If this is not possible at any step, that step is not correctly implemented.

## Output files

The skill generates three final artifacts at Step 11 (Finalization). They are
intermediate files that are consumed during the session and deleted at cleanup:

**Intermediate (deleted during cleanup):**
- `debate-summary.md` — Written after all rounds complete (before architect mode).
  Raw debate outcome, risks by severity/confidence, contradictions, transcript link.

**Final artifacts (kept after cleanup):**
- `{name}-approved.md` — Approved document with implementation plan. Path depends on input type.
- `{name}-adr.md` — Decision record, always in `discussions/{name}/`.
- `{name}-open-questions.md` — Conditional. Only created if unresolved questions remain.
  Always in `discussions/{name}/`.

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
- Define SESSION_DIR = "discussions/{name}"
- Create SESSION_DIR directory
- Create SESSION_DIR + "/debates/" directory
- Write original spec to SESSION_DIR + "/input.md"
- Initialize state.json at SESSION_DIR + "/state.json" with session_id
- Set current_step: "domain_selection" in state.json

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

**Pre-launch:**
- Write current_step: "round_1_in_progress" to discussions/{name}/state.json
- Write round_responses["1"]: { agent: "pending" for each } to state.json
- **Context overflow warning:** If `selected_domains.length >= 5`, print:
  ```
  Note: Running {N} agents in parallel at opus level will use significant context.
  If the session stops unexpectedly, resume with:
    /pre-mortem resume {name}
  All progress is saved continuously to discussions/{name}/state.json
  ```

**Agent task instructions (injected into each critic prompt):**

The orchestrator must inject these instructions at the end of every critic prompt:

```
## Output Instructions

Write your complete JSON response to exactly this path:
  discussions/{name}/debates/{agent_name}-round1.json

The file must contain exactly one valid JSON object matching the required schema.
Do not create any other files.

After writing the file, return only this minimal JSON to the orchestrator
(do not return your full analysis — it is already on disk):
  { "agent": "{agent_name}", "round": 1, "status": "done", "risk_count": <number of risks> }
```

**Launch agents:**
- Launch all critics in parallel using Agent tool

**Per-agent completion (orchestrator side):**

When the orchestrator receives the minimal completion signal:
1. Verify file exists at discussions/{name}/debates/{agent_name}-round1.json
2. Update round_responses["1"][agent] = "completed" in state.json
3. Write state.json to disk
4. Do NOT read the full response into orchestrator context

On failure (status != "done" or file missing):
1. Update round_responses["1"][agent] = "failed" in state.json
2. Log warning: ⚠ {agent_name} round 1 failed or file missing
3. Continue

**Post-round compilation:**

After all agents complete:
1. Read all discussions/{name}/debates/{agent}-round1.json files
2. Compile into discussions/{name}/debates/round1.json (array)
3. Write discussions/{name}/debates/round1.jsonl (one object per line)
4. Generate discussions/{name}/round1.md from the compiled JSON
5. Update risk_register and contradictions in state.json from compiled data
6. **Discard the compiled data from context** — it is on disk, not needed in memory

### Step 5: Run Round 2 (sequential debate)

**Pre-launch:**
- Write current_step: "round_2_in_progress" to discussions/{name}/state.json
- Write round_responses["2"]: { agent: "pending" for each } to state.json

**Agent task instructions (injected into each critic prompt):**

```
## Output Instructions

Write your complete JSON response to exactly this path:
  discussions/{name}/debates/{agent_name}-round2.json

The file must contain exactly one valid JSON object matching the required schema.
Do not create any other files.

After writing the file, return only this minimal JSON to the orchestrator
(do not return your full analysis — it is already on disk):
  { "agent": "{agent_name}", "round": 2, "status": "done", "risk_count": <number of risks> }
```

**Launch agents:**
- Critics run sequentially (one at a time, in order)
- Each critic sees all Round 1 outputs + earlier Round 2 responses

**Per-agent completion (orchestrator side):**

When the orchestrator receives the minimal completion signal:
1. Verify file exists at discussions/{name}/debates/{agent_name}-round2.json
2. Update round_responses["2"][agent] = "completed" in state.json
3. Write state.json to disk
4. Do NOT read the full response into orchestrator context

On failure:
1. Update round_responses["2"][agent] = "failed" in state.json
2. Log warning: ⚠ {agent_name} round 2 failed or file missing
3. Continue

**Post-round compilation:**

After all agents complete:
1. Read all discussions/{name}/debates/{agent}-round2.json files
2. Compile into discussions/{name}/debates/round2.json (array)
3. Write discussions/{name}/debates/round2.jsonl (one object per line)
4. Generate discussions/{name}/round2.md from the compiled JSON
5. Update risk_register and contradictions in state.json from compiled data
6. **Discard the compiled data from context** — it is on disk, not needed in memory

### Step 6: Run Round 3 (parallel filter)

**Pre-launch:**
- Write current_step: "round_3_in_progress" to discussions/{name}/state.json
- Write round_responses["3"]: { agent: "pending" for each } to state.json

**Agent task instructions (injected into each critic prompt):**

```
## Output Instructions

Write your complete JSON response to exactly this path:
  discussions/{name}/debates/{agent_name}-round3.json

The file must contain exactly one valid JSON object matching the required schema.
Do not create any other files.

After writing the file, return only this minimal JSON to the orchestrator
(do not return your full analysis — it is already on disk):
  { "agent": "{agent_name}", "round": 3, "status": "done", "risk_count": <number of risks> }
```

**Launch agents:**
- Critics run in parallel
- Focus ONLY on High/Med severity risks (Low risks filtered out)

**Per-agent completion (orchestrator side):**

When the orchestrator receives the minimal completion signal:
1. Verify file exists at discussions/{name}/debates/{agent_name}-round3.json
2. Update round_responses["3"][agent] = "completed" in state.json
3. Write state.json to disk
4. Do NOT read the full response into orchestrator context

On failure:
1. Update round_responses["3"][agent] = "failed" in state.json
2. Log warning: ⚠ {agent_name} round 3 failed or file missing
3. Continue

**Post-round compilation:**

After all agents complete:
1. Read all discussions/{name}/debates/{agent}-round3.json files
2. Compile into discussions/{name}/debates/round3.json (array)
3. Write discussions/{name}/debates/round3.jsonl (one object per line)
4. Generate discussions/{name}/round3.md from the compiled JSON
5. Update risk_register and contradictions in state.json from compiled data
6. **Discard the compiled data from context** — it is on disk, not needed in memory

### Step 7: Write debate summary file
- Write `current_step: "debate_summary_write"` to state.json
- Read all round files from discussions/{name}/debates/round{N}.json
- Write debate-summary.md to discussions/{name}/debate-summary.md
- Content: raw debate outcome, all risks by severity/confidence, contradictions, unresolved items, link to transcript
- **No user input required** — automatic

### Step 8: Switch to Architect Mode
- Write `current_step: "architect_mode_active"` to state.json
- Print separator to console:
  ```
  ─────────────────────────────────────────
    DEBATE CLOSED — ARCHITECT MODE ACTIVE
  ─────────────────────────────────────────
  ```
- **Reload context from disk** (Files-First Rule D):
  - Read discussions/{name}/input.md
  - Read discussions/{name}/debates/round1.json through debates/round{N}.json
  - Read discussions/{name}/state.json

### Step 9: Architect filter (Pass A and Pass B)
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

### Step 10: Architect analysis and open dialogue
- Write `current_step: "human_architect_dialogue"` to state.json
- Architect forms positions on all unresolved items
- Architect presents analysis in natural language (not as approval request)
- **Open-ended conversation:**
  - User responds freely (agrees, disagrees, asks questions, provides context)
  - Architect incorporates feedback and revises positions
  - Continues until both agree on every item
  - No fixed number of turns, no approve/reject buttons
  - Ends naturally when agreement is reached
- **Architect creates `discussions/{name}/{name}-temp.md`** with current working document
- **After each meaningful exchange: overwrite temp file**
- **Prints each High/Med decision to console:**
  ```
  [ARCHITECT] High · sec-r1-002 · No token revocation
    Decision: MITIGATE
    Reasoning: Stateless JWT incompatible with immediate revocation;
               Redis blocklist adds one hop but is standard practice.
  ```
- **Auto-close behavior:** After the architect presents the analysis, open questions,
  and console output for each High/Med decision, the orchestrator immediately proceeds
  to Step 11 (Finalization). **No user gate required.** The debate is considered closed
  — further rounds produce no new signal.
- The user can continue the discussion in the same chat to resolve open questions.
  If open questions are resolved, the agent updates the `-approved.md` and `-adr.md`
  files accordingly. The user may also stop the discussion and handle open questions
  independently.

### Step 11: Finalization

Execute in exact order. Step 1 failure aborts everything.
Steps 2, 3, 4, 5 log warnings and continue on failure.

Write `current_step: "generating_final_output"` to state.json before Step 1 begins.

#### Step 1: Create {name}-approved.md

**If input was a file:**
Path: `{input_file_directory}/{name}-approved.md`

**If input was plain text:**
Path: `discussions/{name}/{name}-approved.md`
(User moves this wherever needed. The Review link remains useful after the move.)

**Content structure:**
```markdown
# {Document Title}

> This document was reviewed in a pre-mortem session and the approved sections are final.
> Open questions remain — see `{name}-open-questions.md` in the session folder.
> Reviewed by: {comma-separated list of participating critic domains}
> Pre-mortem session: discussions/{name}/

## Summary
{2-3 sentences: what we are building and why}

## Approved Implementation Plan
{full technical plan — mirrors and extends the original input structure.
 Include all resolved decisions with spec rule drafts from Round 3.}

## Open Questions
> The following decisions require user input.
{List each open question with ID, title, and a one-line description of the decision needed.
 Reference `{name}-open-questions.md` for full details.}

## Known Issues
{risks deferred or accepted; each: name, decision (DEFER/ACCEPT RISK),
one-line rationale}

## Low-Confidence Risks
{risks flagged Low confidence — may apply depending on implementation
choices not yet specified}
```

Do NOT include `## Debate Summary` with round statistics.
That belongs in the ADR only.

**Failure:** Abort all finalization, preserve all session files, inform user.

#### Step 2: Rename original input file

**File input only. Skip for text input.**

Execute only after Step 1 succeeded and file exists on disk.

Rename: `{name}.md` → `{name}_old.md`

Marks original as superseded. User deletes manually if no longer needed.

**Failure:** Log warning, continue.

#### Step 3: Create {name}-adr.md

Path: `discussions/{name}/{name}-adr.md`

Answers "why did we decide this way". Extract from round JSON files and
`state.json` — key decisions, not debate statistics.

**Content structure:**
```markdown
# ADR: {Document Title}

**Date:** {iso date}
**Status:** Approved (with open questions)
**Session:** discussions/{name}/
**Participants:** {list of critic domains}

## Context
{1 paragraph: what problem we were solving and what the input proposed}

## Key Decisions

### {Decision title}
**Decision:** {what was decided}
**Alternatives considered:** {what else was on the table}
**Reason:** {why this option was chosen}

## Accepted Risks
| Risk | Reason accepted | Trade-off |
|------|-----------------|-----------|

## Rejected Approaches
{things explicitly ruled out and why}

## Open Items
{anything deferred, with rationale. Reference `{name}-open-questions.md` if file exists.}
```

Data sources: `state.json` risk_register, contradictions, user_decisions,
architect Step 10 console output.

**Failure:** Log warning, continue to Step 4.

#### Step 4: Create {name}-open-questions.md (conditional)

Path: `discussions/{name}/{name}-open-questions.md`

**Only create this file if open questions remain.** Open questions include:
- Any risk with `recommendation: "DEFER"` in Round 3
- Any unresolved High/Med risk from the architect analysis
- Any `blocking_question` not yet answered by the user
- Any structural decision the architect flagged as needing user input

If no open questions exist, skip this step entirely.

**Content structure:**
```markdown
# Open Questions — {Document Title}

> These decisions were not resolved during the pre-mortem session.
> The user can continue the discussion in this chat, or handle them independently.
> The `{name}-approved.md` and `{name}-adr.md` files reflect the current state —
> decisions here will update those files when resolved.

## Q1: {Question Title}
**Related risks:** {risk IDs}
**Decision needed:** {one-line description of what the user must decide}
**Context:** {background from the debate — what experts said, what the architect recommended}
**Options:** {if options were discussed, list them}
**Recommended:** {architect's recommendation if one was given}
**Status:** UNANSWERED

## Q2: {Question Title}
...
```

**Post-creation behavior:** After the open-questions file is written, the user may
continue the discussion in the same chat to resolve questions. When a question is
resolved:
1. The agent updates the `{name}-open-questions.md` file — change status from
   `UNANSWERED` to `RESOLVED` and add the decision
2. The agent updates the `{name}-approved.md` file — add the decision to the
   implementation plan and remove the question from the Open Questions section
3. The agent updates the `{name}-adr.md` file — add a new Key Decision entry
4. When all questions are answered, delete the `{name}-open-questions.md` file

**Failure:** Log warning, continue to Step 5.

#### Step 5: Clean up session folder

Delete from `discussions/{name}/`:
- `debates/` and all contents
- `round*.md`, `round*.json`, `round*.jsonl`
- `input.md`, `state.json`, `debate-summary.md`
- `{name}-temp.md`

**Keep:**
- `{name}-adr.md`
- `{name}-open-questions.md` (if exists)
- `{name}.md` or `{name}_old.md` if user wants to keep reference

After cleanup: `discussions/{name}/` contains `{name}-adr.md` and optionally `{name}-open-questions.md`.

**Failure:** Log warning, inform user of leftover files.

**Final filesystem state:**

File input:
```
{input_directory}/
  {name}_old.md          ← original, superseded
  {name}-approved.md     ← final approved document with resolved decisions

discussions/{name}/
  {name}-adr.md          ← decision record
  {name}-open-questions.md  ← (if unresolved questions remain)
```

Text input:
```
discussions/{name}/
  {name}-approved.md     ← final document (user moves this where needed)
  {name}-adr.md          ← decision record
  {name}-open-questions.md  ← (if unresolved questions remain)
```

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
