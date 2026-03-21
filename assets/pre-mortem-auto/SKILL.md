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
- `discussions/{session_id}/*` including `state.json`, `round*.md`, `round*.json`, and `round2.jsonl`.

## Session folder naming
Use slugified topic names instead of timestamps:

1. Extract first ~5 meaningful words from spec/topic
2. Slugify: lowercase, spaces→hyphens, strip special chars (keep only `a-z0-9-`)
3. Append 4-digit suffix: last 4 digits of unix timestamp (milliseconds)
4. Example: `discussions/oauth-jwt-mobile-app-3847/`

Store `session_id` in `state.json` matching folder name.

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

Round 2 persistence (robust): append each critic response as a line to `round2.jsonl`; at end compile to `round2.json` array.

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
2. All `blocking_question` fields resolved in `state.json.user_decisions`
3. No unresolved contradictions in `state.json.contradictions`

Evaluate programmatically from state.json after each round (not LLM judgment).

## Execution flow (Automatic Mode)

### Step 1: Parse input and create session
- User runs: `/pre-mortem-auto <topic or file path>`
- If file path: read file content as spec
- If topic: use topic text as spec
- Generate slugified session_id from spec
- Create `discussions/{session_id}/` directory
- Initialize `state.json` with session_id

### Step 2: Automatic domain selection
- Score domains from `.claude/skills/pre-mortem-auto/domains.md`
- Auto-select top 5 domains (score >= 2)
- Print selected experts with signal counts (no user approval)
- Store in `state.json.selected_domains`
- Proceed immediately

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

### Step 4: Run rounds automatically (up to 5)
Run rounds in sequence until consensus reached OR 5 rounds completed:

**Round 1: Parallel discovery**
- Launch all critics in parallel
- Each critic identifies risks independently
- Collect JSON outputs
- Validate and write `round1.json` and `round1.md`
- Update `state.json`
- Check consensus → if reached, go to Step 5; else continue

**Round 2: Sequential debate**
- Critics run sequentially, each sees prior outputs
- Focus on contradictions and refinement
- Append to `round2.jsonl` as each completes
- Compile to `round2.json` at end
- Write `round2.md`
- Update `state.json`
- Check consensus → if reached, go to Step 5; else continue

**Round 3: Parallel filter**
- Critics run in parallel
- Focus on High/Med risks only
- Validate solutions and tradeoffs
- Write `round3.json` and `round3.md`
- Update `state.json`
- Check consensus → if reached, go to Step 5; else continue

**Round 4: Parallel filter**
- Same semantics as Round 3
- Write `round4.json` and `round4.md`
- Update `state.json`
- Check consensus → if reached, go to Step 5; else continue

**Round 5: Parallel filter (final)**
- Same semantics as Round 3
- Write `round5.json` and `round5.md`
- Update `state.json`
- Proceed to Step 5 regardless of consensus

### Step 5: Write debate summary
- Write `debate-summary.md` to session folder
- Include:
  - Total rounds run
  - Consensus status
  - Risk counts by severity
  - Key contradictions
  - Unresolved items

### Step 6: Switch to Architect Mode
- Print separator:
  ```
  ─────────────────────────────────────────
    DEBATE CLOSED — ARCHITECT MODE ACTIVE
  ─────────────────────────────────────────
  ```
- Orchestrator now operates as Chief Architect

### Step 7: Architect filter (Mode B)
**Pass A: Verify unanchored risks (needs_verification: true)**
For each risk where `needs_verification: true`:
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

**Pass A always executes before Pass B. Risks dismissed in Pass A are excluded from Pass B processing.**

### Step 8: Architect resolves all open items autonomously
For each High/Med unresolved risk (after Pass A/B filtering):
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
- Detect appropriate file type (see Genre-matching section)
- Write artifact to project root or next to input file
- Include:
  - Same structure as input, improved and extended
  - All debate decisions incorporated
  - `## Known Issues` section (deferred/accepted risks)
  - Low-confidence risks in separate `## Low-Confidence Risks` section
  - `## Debate Summary` section (brief stats + session folder link)

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
