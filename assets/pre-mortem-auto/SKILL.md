# /pre-mortem-auto — Multi-Agent Pre-Mortem (Automatic Mode, Spec v5.1)

This skill orchestrates a structured multi-agent pre-mortem with minimal user interruption.
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

## Orchestrator modes
The orchestrator has TWO distinct modes:

**Mode A: Debate Moderator** (during rounds)
- Neutral facilitator
- No opinions on technical decisions
- Synthesizes critic outputs
- Manages round flow

**Mode B: Chief Architect** (post-debate)
- Forms positions and makes decisions
- Resolves all open risks and contradictions autonomously
- Only escalates truly blocking items (require external knowledge)
- Produces final artifact

Transition happens after all debate rounds complete. Print separator:
```
─────────────────────────────────────────
  DEBATE CLOSED — ARCHITECT MODE ACTIVE
─────────────────────────────────────────
```

## File layout (normative)
Skill assets live under:
- `.claude/skills/pre-mortem-auto/*`

Session artifacts live under:
- `discussions/{session_id}/*` including:
  - `debates/` (subfolder for all raw JSON data)
    - `{agent}-round{N}.json` (per-critic output, written by critic)
    - `round{N}.json` (compiled array, written by orchestrator)
    - `round{N}.jsonl` (incremental log, written by orchestrator)
  - `state.json` (execution state, risk register, current step)
  - `input.md` (original spec)
  - `round{N}.md` (human-readable round logs)
  - `debate-summary.md` (raw debate outcome, written after rounds)

## Session folder naming
Use slugified topic names instead of timestamps:

1. Extract first ~5 meaningful words from spec/topic
2. Slugify: lowercase, spaces→hyphens, strip special chars (keep only `a-z0-9-`)
3. Append 4-digit suffix: last 4 digits of unix timestamp (milliseconds)
4. Example: `discussions/oauth-jwt-mobile-app-3847/`

Store `session_id` in `state.json` matching folder name.

## state.json Schema (normative)

Session state file `discussions/{session_id}/state.json` structure:

**Core fields:**
- `session_id` (string): matches folder name
- `selected_domains` (array of strings): approved critic domains
- `current_step` (string): execution phase for resume capability

**Round tracking:**
- `round_responses` (object): nested structure `{1: {agent: status}, 2: {...}, ...}`
  - Status values: `"pending"`, `"completed"`, `"failed"`
- `round_order` (object): `{1: [agents], 2: [agents], 3: [agents], 4: [agents], 5: [agents]}`
  - Rounds 1,3,5: original domain order
  - Rounds 2,4: left-shifted rotation (see Round ordering section)

**Risk management:**
- `risk_register` (array): all risks with status, needs_verification, confidence
- `user_decisions` (object): blocking question resolutions (informational)
- `contradictions` (array): contradiction objects with resolution status

**Prompt tracking:**
- `agent_prompt_sha256` (object): `{agent: hash}` for drift detection
- `prompt_drift_log` (array): history of prompt changes

**current_step values:**
- `domain_selection` - selecting critic domains
- `agent_file_generation` - writing agent files
- `round_1_in_progress` through `round_5_in_progress` - debate rounds
- `debate_summary_write` - writing debate summary
- `architect_mode_active` - architect analyzing
- `architect_resolving` - architect making decisions
- `final_artifact_write` - generating output
- `done` - session complete

## Human gates (minimal)
This is the **automatic mode** — minimize user interruption.

**No gates during debate:**
- No Gate 0 (domain selection is automatic)
- No gates between rounds (runs automatically)
- No consensus check gate (automatic early stop)

**Only escalate when truly blocked:**
- Architect mode: only ask user for decisions requiring external knowledge
- Examples of escalation-worthy items:
  - "Which third-party auth provider should we use?" (business decision)
  - "What is the budget for infrastructure?" (external constraint)
  - "Does the team have Kubernetes expertise?" (team capability)
- Examples of NON-escalation items (architect decides):
  - "Should we use JWT or sessions?" (technical decision)
  - "How should we handle rate limiting?" (technical decision)
  - "What caching strategy?" (technical decision)

**Final gate:**
- Cleanup offer: "Delete discussions/{session_id}/ folder?"

## Automatic domain selection
1) Read `.claude/skills/pre-mortem-auto/domains.md`.
2) Score each domain by trigger hits in the user spec.
   - Tokens: exact token match after tokenization (preferred)
   - Phrases: exact phrase match
   - Case-insensitive
   - Avoid substring matches (`auth` must not match `author`).
3) Keep domains with score >= 2 OR explicitly requested by the user.
4) Always include `tech-critic` for technical specs.
5) Cap at 5 (highest scores).
6) **Print selected experts with signal counts** (no user approval required):
   ```
   Selected experts (auto):
   - security-critic (8 signals)
   - tech-critic (12 signals)
   - scalability-critic (5 signals)
   - ux-critic (3 signals)
   - cost-critic (4 signals)
   ```
7) Store approved domains in `state.json.selected_domains` and proceed.

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
- `description` (style rule: "X happens when Y, causing Z")
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
- Prompt drift check (auto-resolve: use updated prompt)

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

Include in round summaries:
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

## Prompt canonicalization + drift handling (automatic)
- Agent prompts live in `.claude/agents/{name}.md` and are treated as canonical.
- Store `sha256(normalized_body_after_yaml)` per agent in `state.json.agent_prompt_sha256`.
- If current hash != stored hash:
  - Automatically use updated prompt (store new hash; continue)
  - Log the drift in `state.json.prompt_drift_log`
  - No user gate required (automatic mode)

## Consensus criterion (formal definition)
Consensus is reached when ALL of the following are true:
1. Zero `"High"` severity risks with status `"open"` in `state.json`
2. No unresolved contradictions in `state.json.contradictions`

Evaluate programmatically from state.json after each round (not LLM judgment).

**Note:** `blocking_question` fields are informational only and do not block consensus. The architect resolves all blocking questions autonomously in Step 8.

## Resume command

Syntax: `/pre-mortem-auto resume {session_id}`

**Behavior:**
1. Read `discussions/{session_id}/state.json`
2. Check `current_step` field
3. Jump to appropriate phase based on step value
4. Only re-run incomplete work (where `round_responses[N][agent] != "completed"`)

**Resume jump table:**

| current_step | Resume action |
|--------------|---------------|
| `domain_selection` | Re-run Step 2 (domain selection) |
| `agent_file_generation` | Re-run Step 3 (agent file generation) |
| `round_N_in_progress` | Resume round N, skip completed agents |
| `debate_summary_write` | Re-run Step 5 (debate summary) |
| `architect_mode_active` | Re-run Step 7 (architect filter) |
| `architect_resolving` | Re-run Step 8 (architect decisions) |
| `final_artifact_write` | Re-run Step 10 (output artifact) |
| `done` | Print "Session already complete" and exit |

**Round resume logic:**

For `round_N_in_progress`:
1. Read `round_responses[N]` from state.json
2. Identify agents where status != `"completed"`
3. Re-run only those agents
4. For Round 2 (sequential): resume from first incomplete agent, maintaining order
5. For Rounds 1,3,4,5 (parallel): re-run incomplete agents in parallel

**Error handling:**
- Missing state.json: print error, exit
- Invalid current_step: print error, exit
- Corrupted round_responses: print warning, re-run entire round

## Execution flow (Automatic Mode)

### Step 1: Parse input and create session
- User runs: `/pre-mortem-auto <topic or file path>`
- If file path: read file content as spec
- If topic: use topic text as spec
- Generate slugified session_id from spec
- Define SESSION_DIR = "discussions/{session_id}"
- Create SESSION_DIR directory
- Create SESSION_DIR + "/debates/" directory
- Write original spec to SESSION_DIR + "/input.md"
- Initialize state.json at SESSION_DIR + "/state.json" with session_id
- Set current_step: "domain_selection" in state.json

### Step 2: Automatic domain selection
- Score domains from `.claude/skills/pre-mortem-auto/domains.md`
- Auto-select top 5 domains (score >= 2)
- Print selected experts with signal counts (no user approval)
- Store in `state.json.selected_domains`
- Compute round_order with rotation (see Round ordering section)
- Store round_order in state.json
- Set `current_step: "agent_file_generation"`
- Proceed to Step 3

### Step 3: Generate agent files
For each domain in `selected_domains`:
1. Check if `.claude/agents/{domain}-critic.md` exists
2. If exists:
   - Print: `✓ .claude/agents/{domain}-critic.md already exists, skipping`
   - Continue to next domain
3. If not exists:
   - Read `.claude/skills/pre-mortem-auto/agent-template.md`
   - Generate full agent file with frontmatter:
     ```yaml
     ---
     name: {domain}-critic
     description: {domain} domain expert for pre-mortem analysis
     model: opus
     ---
     {AGENT_TEMPLATE_BODY}
     ```
   - Write to `.claude/agents/{domain}-critic.md`
   - Print: `✓ Wrote .claude/agents/{domain}-critic.md`
4. If write fails:
   - Print warning: `⚠ Failed to write .claude/agents/{domain}-critic.md, will use inline prompt`
   - Continue (fallback to inline prompt injection)

**Important:** This step ensures agent prompts are persisted for reuse and manual refinement. The orchestrator can still function if writes fail (inline prompt fallback).

After all agent files processed:
- Set `current_step: "round_1_in_progress"`

### Step 4: Run rounds automatically (up to 5)

Run rounds in sequence until consensus reached OR 5 rounds completed.

**Context overflow protection:**

Before launching parallel rounds with 5+ agents, print:
```
⚠️ CONTEXT OVERFLOW WARNING
This round will launch N agents in parallel. If the session times out or loses context:
  /pre-mortem-auto resume {session_id}
Progress is saved continuously to state.json and debates/roundN.jsonl files.
```

**Round execution pattern (all rounds):**

For each round N:

**Pre-launch (before each round N):**
1. Write current_step: "round_N_in_progress" to discussions/{session_id}/state.json
2. Write round_responses[N]: { agent: "pending" } for each agent to state.json

**Agent task instructions (injected into each critic prompt):**

The orchestrator must inject these instructions at the end of every critic prompt:

```
## Output Instructions

Write your complete JSON response to exactly this path:
  discussions/{session_id}/debates/{agent_name}-round{N}.json

The file must contain exactly one valid JSON object matching the required schema.
Do not create any other files.

After writing the file, return only this minimal JSON to the orchestrator
(do not return your full analysis — it is already on disk):
  { "agent": "{agent_name}", "round": {N}, "status": "done", "risk_count": <number of risks> }
```

**Per-agent completion (orchestrator side):**

When the orchestrator receives the minimal completion signal:
1. Verify file exists at discussions/{session_id}/debates/{agent_name}-round{N}.json
2. Update round_responses[N][agent] = "completed" in state.json
3. Write state.json to disk
4. Do NOT read the full response into orchestrator context

On failure (status != "done" or file missing):
1. Update round_responses[N][agent] = "failed" in state.json
2. Log warning: ⚠ {agent_name} round {N} failed or file missing
3. Continue

**Post-round compilation (orchestrator side):**

After all agents complete:
1. Read all discussions/{session_id}/debates/{agent}-round{N}.json files
2. Compile into discussions/{session_id}/debates/round{N}.json (array)
3. Write discussions/{session_id}/debates/round{N}.jsonl (one object per line)
4. Generate discussions/{session_id}/round{N}.md from the compiled JSON
5. Update risk_register and contradictions in state.json from compiled data
6. **Discard the compiled data from context** — it is on disk, not needed in memory

**Launch pattern:**
- Rounds 1,3,5: launch all agents in parallel using round_order[N]
- Rounds 2,4: launch sequentially using round_order[N]

**Consensus check:**
- Evaluate consensus criterion from state.json
- If reached: print "Consensus reached after round N", proceed to Step 5
- If not reached and N < 5: continue to round N+1
- If not reached and N == 5: proceed to Step 5

**Round 1: Parallel discovery**
- Launch all critics in parallel using round_order[1]
- Each critic identifies risks independently
- No visibility into other critics' outputs
- Goal: comprehensive risk catalog

**Round 2: Sequential debate**
- Launch critics sequentially using round_order[2] (left-shifted rotation)
- Each sees all prior outputs (Round 1 + earlier Round 2 responses)
- Focus on contradictions and refinement
- Goal: challenge assumptions, identify contradictions

**Round 3: Parallel filter**
- Launch all critics in parallel using round_order[3]
- Focus ONLY on High/Med severity risks
- Goal: validate solutions, assess tradeoffs

**Round 4: Parallel filter**
- Launch all critics in parallel using round_order[4] (left-shifted rotation)
- Same semantics as Round 3

**Round 5: Parallel filter (final)**
- Launch all critics in parallel using round_order[5]
- Same semantics as Round 3
- Proceed to Step 5 regardless of consensus

### Step 5: Write debate summary
- Set `current_step: "debate_summary_write"` in state.json
- Read all round files from discussions/{session_id}/debates/round{N}.json
- Write debate-summary.md to discussions/{session_id}/debate-summary.md
- Include:
  - Total rounds run
  - Consensus status
  - Risk counts by severity
  - Key contradictions
  - Unresolved items

### Step 6: Switch to Architect Mode
- Set `current_step: "architect_mode_active"` in state.json
- Print separator:
  ```
  ─────────────────────────────────────────
    DEBATE CLOSED — ARCHITECT MODE ACTIVE
  ─────────────────────────────────────────
  ```
- Orchestrator now operates as Chief Architect

### Step 7: Architect filter (Mode B)

**Context reload:**

Before analysis, architect must reload all context from disk:
- Read discussions/{session_id}/input.md
- Read all discussions/{session_id}/debates/round{N}.json files (N=1 to last round)
- Read discussions/{session_id}/state.json
- Do NOT rely on conversation history (may be truncated)

**Pass 0: Review resolved items**

For each risk where `status: "resolved"` OR `status: "compromise"`:
- Architect reviews the resolution decision
- **If architect disagrees:**
  - Set `status: "open"` in state.json
  - Log to console:
    ```
    [ARCHITECT] Reopened · {risk_id} · {risk_name}
      Reason: {one-line explanation}
    ```
- **If architect agrees:** no action, keep status as-is

**Pass A: Verify unanchored risks (needs_verification: true)**

For each risk where `needs_verification: true` AND `status: "open"`:
- Architect reads the spec and checks whether the risk is actually grounded
- **If grounded:** remove `needs_verification` flag, keep risk as-is
- **If not grounded:** set `status: "dismissed"`, log to console:
  ```
  [ARCHITECT] Dismissed · {risk_id} · {risk_name}
    Reason: {one-line explanation}
  ```

**Pass B: Label low-confidence risks (confidence: "Low")**

For each risk where `confidence: "Low"` and `status != "dismissed"`:
- Include in output artifact with `⚠️ Low confidence` label
- Add to dedicated `## Low-Confidence Risks` subsection in output artifact
- Add note: "These risks may become relevant depending on implementation choices not yet specified in the spec."

**Execution order: Pass 0 → Pass A → Pass B**

Risks dismissed in Pass A are excluded from Pass B processing.

### Step 8: Architect resolves all open items autonomously

Set `current_step: "architect_resolving"` in state.json.

For each High/Med risk with `status: "open"` (after Pass 0/A/B filtering):
- Decide: ACCEPT RISK | MITIGATE | REJECT FEATURE | DEFER | ESCALATE
- If decision requires external knowledge → escalate to user via AskUserQuestion
- Otherwise → decide autonomously and log reasoning

For each unresolved contradiction:
- Resolve autonomously based on technical merit
- Log resolution reasoning

**Escalation criteria (ask user):**
- Requires business decision (budget, priorities, vendor choice)
- Requires external constraint knowledge (team skills, timeline, compliance)
- Requires stakeholder input (user preferences, product direction)

**Non-escalation (decide autonomously):**
- Technical architecture decisions
- Implementation approach choices
- Technology stack selections (within reasonable defaults)
- Performance/security tradeoffs (favor security by default)

### Step 9: Print architect decisions
For each High/Med decision, print:
```
[ARCHITECT] {severity} · {risk_id} · {risk_name}
  Decision : {ACCEPT RISK | MITIGATE | REJECT FEATURE | DEFER | ESCALATE}
  Reasoning: {one sentence}
```

### Step 10: Generate output artifact

Set `current_step: "final_artifact_write"` in state.json.

- Detect appropriate file type (see Genre-matching section)
- Write artifact to project root or next to input file
- Include:
  - Same structure as input, improved and extended
  - All debate decisions incorporated
  - `## Known Issues` section (deferred/accepted risks)
  - Low-confidence risks in separate `## Low-Confidence Risks` section
  - `## Debate Summary` section (brief stats + session folder link)

After artifact written:
- Set `current_step: "done"` in state.json

### Step 11: Cleanup offer
- AskUserQuestion: "Delete discussions/{session_id}/ folder?"
- If yes: delete folder
- If no: keep folder

## Round semantics

### Round 1: Parallel discovery
- All critics run simultaneously
- No visibility into other critics' outputs
- Goal: independent risk identification
- Output: comprehensive risk catalog

### Round 2: Sequential debate
- Critics run one at a time in order
- Each sees all prior outputs (Round 1 + earlier Round 2 responses)
- Goal: challenge assumptions, identify contradictions
- Output: refined risks + contradiction list

### Round 3-5: Parallel filter
- All critics run simultaneously
- Focus ONLY on High/Med severity risks
- Goal: validate solutions, assess tradeoffs
- Output: actionable risk mitigation strategies

## Round ordering

**Computation (at session init, Step 2):**

Given `selected_domains = [A, B, C, D, E]`:

```
round_order[1] = [A, B, C, D, E]  // original order
round_order[2] = [B, C, D, E, A]  // left-shift by 1
round_order[3] = [C, D, E, A, B]  // left-shift by 1 again
round_order[4] = [D, E, A, B, C]  // left-shift by 1 again
round_order[5] = [E, A, B, C, D]  // left-shift by 1 again
```

**Left-shift rotation:**
- Take first element, move to end
- Example: `[A,B,C,D,E]` → `[B,C,D,E,A]`

**Storage:**
Store complete `round_order` object in state.json at session init.

**Usage:**
- Rounds 1,3,5: parallel execution (order stored for audit, doesn't affect execution)
- Rounds 2,4: sequential execution using specified order

**Rationale:**
Rounds 2 and 4 are sequential debate rounds. Rotation ensures:
- Different agent speaks first in each sequential round
- Reduces first-mover bias
- All agents get opportunity to lead debate

## Output artifact genre-matching

Detect appropriate output file based on input characteristics:

**Priority order (first match wins):**

1. **REQUIREMENTS.md** — if input contains:
   - User stories, acceptance criteria
   - "As a user", "Given/When/Then"
   - Requirements list, feature requests

2. **ARCHITECTURE.md** — if input contains:
   - Architecture diagrams, component descriptions
   - "Component", "Service", "Layer", "Module"
   - System design, data flow

3. **TECHNICAL_SPEC.md** — if input contains:
   - API contracts, implementation steps
   - "Endpoint", "Schema", "Interface", "Protocol"
   - Technical implementation details

4. **VISION.md** — if input contains:
   - Problem statement, goals, vision
   - "Why", "Goal", "Mission", "Problem"
   - High-level idea or direction

5. **FINAL_PLAN.md** — default fallback

**File location:**
- If input was a file: write next to input file
- If input was text topic: write to project root

**Content structure:**
- Mirror input structure (headings, sections)
- Extend with debate insights
- Add `## Known Issues` section at end
- Add `## Debate Summary` section at end

Example debate summary:
```markdown
## Debate Summary

Pre-mortem completed: 3 rounds (consensus reached early), 5 experts, 47 risks identified.
- High severity: 2 (all resolved)
- Med severity: 8 (6 mitigated, 2 accepted)
- Low severity: 37 (documented)

Full debate transcript: `discussions/oauth-jwt-mobile-app-3847/`
```

## Automatic consensus checking
After each round (1-5), evaluate consensus criterion:
- If consensus reached: print "Consensus reached after round N" and proceed to architect mode
- If not reached and rounds remain: continue to next round
- If not reached and at round 5: proceed to architect mode anyway

No user gate required — fully automatic.
