# AI Council Structured Debate — Design Spec

Date: 2026-04-29

## Overview

Replace the current parallel-analysis + average-summarize council flow with a structured multi-round debate. Models analyze, challenge each other, and a user-selected Chair model moderates — stopping early when debate converges or after a maximum of 3 rounds.

---

## Architecture

### Flow

```
User triggers "Council Debate"
         │
         ▼
Round Manager (client-side)
- tracks round number (1–3)
- holds full transcript
- checks stop rules after each round
         │
    ┌────▼─────────────────────────┐
    │  Round N  (repeats up to 3x) │
    │                              │
    │  POST /api/ai/debate-round   │
    │  Fan-out to all analysts     │
    │  (parallel, role-aware)      │
    │  Each sees full transcript   │
    │  + their per-role directive  │
    └────┬─────────────────────────┘
         │
         ▼
    POST /api/ai/chair
    Chair returns:
      { stopRuleEvaluation, verdict | analystDirectives }
         │
         ├── shouldStop → emit verdict, done
         └── continue   → increment round, repeat
```

### New API Routes

| Route | Purpose |
|---|---|
| `POST /api/ai/debate-round` | Single analyst analysis for one round (replaces `/api/ai` in council mode) |
| `POST /api/ai/chair` | Chair evaluation after each round |

Existing `/api/ai/summarize` is **deprecated** for debate mode (kept for legacy single-model summary).

---

## Data Structures

### DebateEntry

```ts
interface DebateEntry {
  round: number;
  modelId: string;
  role: CouncilRole;
  analysis: ModelAnalysis;
}
```

### DebateState (client)

```ts
interface DebateState {
  phase: 'idle' | 'round' | 'chair' | 'verdict' | 'error';
  currentRound: number;
  maxRounds: 3;
  transcript: DebateEntry[];
  analystStates: Record<string, {
    loading: boolean;
    rounds: Array<ModelAnalysis | null>;
    error: string | null;
  }>;
  chairStates: Array<{
    loading: boolean;
    stopRuleEvaluation: StopRuleEvaluation | null;
    analystDirectives: Record<CouncilRole, string | null> | null;
    chairJudgmentRationale: string | null;
  }>;
  verdict: ModelAnalysis | null;
  stopReason: 'unanimous' | 'converged' | 'chair' | 'max_rounds' | null;
  dissenters: CouncilRole[];
}
```

### StopRuleEvaluation

```ts
interface StopRuleEvaluation {
  unanimous: boolean;
  converged: boolean;
  chairJudgment: boolean;
  chairJudgmentRationale: string;
}
```

---

## Chair Model

### System Prompt

```
You are a demanding Council Chair with a bias toward rigorous debate. You distrust premature consensus.

Before calling convergence, you must identify:
(a) The strongest unaddressed counterargument in the transcript
(b) Which analyst's reasoning is weakest and why
(c) Whether confidence levels reflect actual evidence or role-playing certainty

Only stop early when disagreement is genuinely resolved, not merely absent.

Your job is NOT to analyze the stock yourself. Identify unresolved disagreements, probe weak reasoning, and when debate is settled, synthesize a verdict that accurately reflects the council's collective judgment.
```

### Output Schema (rounds 1–2)

```json
{
  "shouldStop": boolean,
  "stopRuleEvaluation": {
    "unanimous": boolean,
    "converged": boolean,
    "chairJudgment": boolean,
    "chairJudgmentRationale": string
  },
  "verdict": ModelAnalysis | null,
  "analystDirectives": {
    "technical": string | null,
    "fundamental": string | null,
    "sentiment": string | null,
    "contrarian": string | null,
    "risk": string | null
  } | null
}
```

**Mutual exclusion rules (enforced in prompt):**
- `analystDirectives` MUST be null when `shouldStop: true`
- `verdict` MUST be null when `shouldStop: false`
- `stopRuleEvaluation` always present and fully populated

### Output Schema (round 3 — forced close)

Same schema but `shouldStop` always `true`, `verdict` always populated, `analystDirectives` always null.

---

## Stop Rules

Evaluated client-side as fast path, then confirmed by Chair. Stop if **any** of:

1. **Unanimous** — all analyst predictions same direction
2. **Converged** — `max(confidence) − min(confidence) < 15`
3. **Chair judgment** — Chair decides reasoning is resolved (`chairJudgment: true`)
4. **Max rounds** — round 3 complete, always stop

---

## Round Execution Flow

```
1. Fan-out: call /api/ai/debate-round per analyst (parallel)
   - payload: role, full transcript, analystDirective for this role (if any from prior Chair call)
   - update analystStates as each resolves

2. When all analysts done (or timed out):
   - client checks unanimous/converged fast path
   - if triggered: skip Chair, emit verdict from averaging

3. Call /api/ai/chair with full transcript + round number
   - Chair returns stopRuleEvaluation + directive or verdict

4. If shouldStop → render verdict + dissenters
   If continue → increment round, pass analystDirectives into next fan-out
   If round === 3 → force Chair verdict mode
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Single analyst fails | Mark error, exclude from Chair input, debate continues |
| Chair fails | Retry once → fall back to averaging (legacy summarize route) |
| All analysts fail | Abort, show error state |
| Partial round (≥2 analysts succeed) | Chair runs, notes missing analysts |

---

## UI — Debate Theater

### Layout

```
┌──────────────────────────────────────────────┐
│  COUNCIL DEBATE            [Round 2 of 3] ●  │
│  Chair: GPT-4o ─────────────────────── live  │
├──────────────────────────────────────────────┤
│  Round 1 ─────────────────────────complete   │
│  [Tech 7 BUY] [Fund 5 HOLD] [Sent 8 BUY]   │
│  [Contra 3 SELL] [Risk 4 SELL]              │
│                                              │
│  Chair after R1: ──────────────────────────  │
│  "Technical and Contrarian disagree on RSI.  │
│   Fundamental has not addressed macro risks" │
│  ▸ 3 directives issued                      │
│                                              │
│  Round 2 ──────────────────── in progress    │
│  [Tech ●] [Fund ✓ 6 HOLD] [Sent ●]         │
│  [Contra ✓ 4 SELL] [Risk ●]                │
├──────────────────────────────────────────────┤
│  [Expand analyst →]         [Final Verdict]  │
└──────────────────────────────────────────────┘
```

### Chair Model Selection

Added to existing council setup UI (where analyst models are picked). Separate dropdown labeled "Chair Model" — defaults to the user's `defaultAI` model. Any OpenRouter model ID accepted. Chair model is excluded from analyst roles (cannot be both Chair and analyst).

### UI Components

| Component | Description |
|---|---|
| Round progress bar | R1/R2/R3 steps, current highlighted, stops at verdict |
| Analyst tile | Score + prediction per round, spinner loading, checkmark done, error state |
| Position delta | Arrow if model changed position round-over-round (e.g. HOLD→BUY) |
| Chair commentary strip | Shows `chairJudgmentRationale` + directive summary, collapsible |
| Final Verdict card | Amber glow, full ModelAnalysis display, stopReason badge |
| Dissent note | Under verdict — lists any analysts who voted opposite direction |

### Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| Mobile `< 640px` | Analyst tiles stack vertically, Chair strip collapsed by default, compact round pill |
| Tablet `640–1024px` | 2-col analyst grid, Chair strip visible |
| Desktop `> 1024px` | Full theater layout |

### Client State Machine

```
idle → running_round_N → running_chair →
  ├── stop  → verdict
  └── continue → running_round_N+1 (max 3)
```

---

## Testing

| Type | Coverage |
|---|---|
| Unit | Stop-rule evaluation (unanimous/converged as pure functions) |
| Unit | Chair output schema validation |
| Integration | Mock analyst + Chair responses, verify state transitions |
| E2E | Full 3-round debate with real models on known ticker |

---

## Out of Scope

- Persistent debate history across sessions
- User ability to inject comments into debate
- More than 5 analyst models
- Custom role assignment (roles stay round-robin)
