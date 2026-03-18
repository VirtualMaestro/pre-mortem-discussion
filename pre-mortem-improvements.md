# Pre-Mortem Tool — Improvement Spec

**Type:** Delta spec (changes to existing tool, not a rewrite)
**Applies to:** current SKILL.md + supporting assets
**Status:** Ready for implementation

---

## Change 1: Session folder naming

**Current behavior:** folder named by timestamp, e.g. `discussions/20260317-221110/`

**New behavior:** folder named by slugified topic + short numeric suffix for uniqueness.

Rules:
- Take the first ~5 meaningful words from the spec/topic input
- Slugify: lowercase, spaces → hyphens, strip special chars
- Append a 4-digit suffix (e.g. last 4 digits of unix timestamp, or a random number)
- Example: `discussions/oauth-jwt-mobile-app-3847/`
- The session_id stored in `state.json` must match the folder name exactly

---

## Change 2: Architect role clarification

The orchestrator has two distinct modes during a session. This must be reflected in
the system prompt and in how the orchestrator describes its own behavior.

**Mode A — Debate Moderator** (during rounds)
Active during Phases 1–3 (rounds). The orchestrator is neutral. It does not contribute
opinions. It only: launches critics, collects JSON responses, writes round files, and
presents synthesis summaries to the user at gates. It does not editorialize.

**Mode B — Chief Architect** (post-debate)
Active after all rounds are complete. The orchestrator switches role explicitly.
It reads the full debate output, forms its own positions, and makes decisions.

The transition must be visible in console output. When switching to Mode B, the
orchestrator prints:

```
─────────────────────────────────────────
  DEBATE CLOSED — ARCHITECT MODE ACTIVE
─────────────────────────────────────────
```

---

## Change 3: Two skills instead of one

Replace the single `/pre-mortem` skill with two skills. They share all infrastructure
(agent library, state.json schema, round mechanics, file layout) but differ in
flow control and the degree of human involvement.

---

### Skill A: `/pre-mortem` (manual, human-gated)

**Flow:**

1. User runs `/pre-mortem <topic or file path>`
2. Orchestrator scores domains, proposes expert panel with rationale. User confirms
   or modifies (Gate 0).
3. Debate runs automatically for up to 3 rounds (existing round mechanics unchanged).
4. After Round 3, orchestrator checks consensus criterion (see Change 4).
   - If consensus reached → go to step 6.
   - If not → Gate: "Consensus not reached on N issues. Run 2 more rounds?"
     - Yes → run up to 2 more rounds (max total = 5), then go to step 6 regardless.
     - No → go to step 6.
5. (Step 4 continuation path)
6. **Switch to Architect Mode.** Orchestrator reads full debate output and produces
   its own resolution for every open item. For each High/Med severity unresolved risk:
   - Proposes a concrete decision (accept risk / mitigation / reject feature)
   - Reports it in console with one-line reasoning (see Change 5)
   - User reviews the architect's proposals. If user objects to any, they say so and
     architect revises. This conversation continues until user approves.
7. Write the final output artifact (see Change 6).
8. Offer to delete the `discussions/{session_id}/` folder. User may decline.

---

### Skill B: `/pre-mortem-auto` (automatic, minimal human interruption)

**Flow:**

1. User runs `/pre-mortem-auto <topic or file path>`
2. Orchestrator scores domains and selects experts automatically (no Gate 0).
   Prints selected experts to console with signal-hit counts.
3. Debate runs automatically for up to 5 rounds. Stops early if consensus reached.
4. Write debate summary file.
5. **Switch to Architect Mode.** Orchestrator reads full debate output and resolves
   all open items autonomously:
   - For non-critical unresolved items: architect decides and logs decision.
   - For truly blocking items (require external knowledge: budget, business priorities,
     stakeholder decisions): architect asks the user. Keep these interruptions minimal —
     only escalate if the item genuinely cannot be resolved without human input.
   - Reports all High/Med decisions in console with reasoning (see Change 5).
6. Write the final output artifact (see Change 6).
7. Offer to delete the `discussions/{session_id}/` folder. User may decline.

---

## Change 4: Consensus criterion (formal definition)

Consensus is reached when ALL of the following are true after a round completes:

1. Zero risks in `risk_register` have status `"open"` with severity `"High"`
2. All `blocking_question` fields across all round JSON files are either `null` or
   have a corresponding entry in `state.json.user_decisions`
3. The `contradictions` array in `state.json` has no unresolved entries
   (resolved = at least one agent proposed a solution accepted by another in a
   subsequent round)

If any of these conditions is false → consensus not reached.

The orchestrator evaluates this programmatically from `state.json` after each round.
It does not use LLM judgment to determine consensus.

---

## Change 5: Architect decision reporting (console only, not in files)

When the architect resolves an item, it must print to console before writing the
final artifact. Format:

```
[ARCHITECT] {severity} · {risk_id} · {risk_name}
  Decision : {one of: ACCEPT RISK / MITIGATE / REJECT FEATURE / DEFER / ESCALATE}
  Reasoning: {one sentence}
```

Example:
```
[ARCHITECT] High · sec-r1-002 · No token revocation mechanism
  Decision : MITIGATE
  Reasoning: Stateless JWT is incompatible with immediate revocation; Redis blocklist
             adds one network hop but is standard practice for this threat model.

[ARCHITECT] Med · prod-r2-005 · Self-hosted deployment abandoned mid-spec
  Decision : DEFER
  Reasoning: Out of scope for v1; document as known gap in final spec.
```

Print all decisions before asking user for approval (in `/pre-mortem`) or before
writing the final file (in `/pre-mortem-auto`).

---

## Change 6: Output artifact — genre-matching

The final output file is not always `FINAL_PLAN.md`. The architect determines the
appropriate genre based on the input and writes the corresponding file.

Detection rules (in order, first match wins):

| Input characteristics | Output file | Output genre |
|----------------------|-------------|--------------|
| Contains requirements, user stories, acceptance criteria | `REQUIREMENTS.md` | Refined product requirements |
| Contains architecture diagrams, component descriptions, system design | `ARCHITECTURE.md` | Refined architecture document |
| Contains implementation steps, API contracts, data models, technical detail | `TECHNICAL_SPEC.md` | Implementation-ready technical spec |
| Describes an idea, goal, or problem without formal structure | `VISION.md` | Final vision and approach |
| None of the above match clearly | `FINAL_PLAN.md` | General plan (existing format) |

Content of output artifact:
- The same content structure as the input, but improved and extended
- All decisions from the debate incorporated
- Sections added where the debate identified gaps
- A `## Known Issues` section at the end listing anything explicitly deferred or
  accepted as known risk, each with one-line rationale
- A `## Debate Summary` section (brief: N risks found, N resolved, N deferred,
  link to session folder if it was kept)

The output file lives at project root or next to the input file (not inside
`discussions/`), so it's immediately usable.

---

## Non-changes (explicitly out of scope for this iteration)

- Round mechanics (parallel/sequential strategy) — unchanged
- Agent library and `.claude/agents/` management — unchanged
- `state.json` schema additions beyond what consensus tracking requires — unchanged
- `domains.md` and domain selection scoring — unchanged
- Agent output JSON schema — unchanged
