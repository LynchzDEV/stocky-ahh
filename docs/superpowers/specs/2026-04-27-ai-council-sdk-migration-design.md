# AI Council, SDK Migration & Model Settings — Design Spec

**Date:** 2026-04-27  
**Status:** Approved

---

## Context

The app currently queries OpenRouter via raw `fetch` in `/api/ai/route.ts`. The AI analysis UI shows `bottomFishing` and `priceTarget` sections styled as a "play fast" strategy. Model selection is a hardcoded dropdown with no custom input. There is no multi-AI comparison feature or persisted default-AI setting.

This spec covers four changes:
1. Migrate raw OpenRouter fetch to Vercel AI SDK (`@ai-sdk/openrouter` + `generateText`)
2. Rename strategy UI labels: bottomFishing → **BUY STRATEGY**, priceTarget → **SELL STRATEGY**
3. Add manual model input + persisted global default-AI setting (top-right)
4. Add **AI Council** — run 2–5 models in parallel, show results in fancy animated tabs, summarize with default AI

---

## 1. AI SDK Migration

### What changes
Replace `fetch(OPENROUTER_API_URL, {...})` with:
```ts
import { createOpenRouter } from '@ai-sdk/openrouter'
import { generateText } from 'ai'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })
const { text } = await generateText({
  model: openrouter(selectedModel),
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  maxTokens: 800,
  temperature: 0.7,
})
```

### Cache key
Change from `symbol` → `${symbol}:${modelId}` so each model is cached independently. This enables per-model-per-symbol caching required by AI Council.

### Install
```bash
npm install ai @ai-sdk/openrouter
```

### Files modified
- `src/app/api/ai/route.ts` — swap fetch for AI SDK, update cache key

---

## 2. Strategy Label Rename (UI only)

No JSON schema changes. Only UI display labels change in `stock-analyzer.tsx`:
- "Bottom Fishing Strategy" → **BUY STRATEGY**
- "Price Target & Exit Strategy" → **SELL STRATEGY**
- Anchor icon → ArrowDownToLine or similar buy icon
- DollarSign icon stays for sell section

Fields inside the sections (`targetPrice`, `timing`, `rationale`, `expectedRise`, `timeframe`, `exitStrategy`) remain unchanged.

---

## 3. Model Selector Enhancement + Default AI Setting

### Inline model selector (per-analysis)
Below the existing dropdown in the AI section, add a text input:
- Placeholder: `"or type any OpenRouter model ID..."`
- If non-empty, overrides dropdown selection
- State: `customModelInput: string` in StockAnalyzer

### Default AI setting (global, top-right)
**New hook:** `src/hooks/useDefaultAI.ts`
- Persists `{ modelId: string, modelName: string }` in localStorage key `"stockify:defaultAI"`
- Default: `google/gemini-2.5-flash`

**UI:** Settings icon (⚙) in top-right of the StockAnalyzer header area. Opens a Popover containing:
- Dropdown of known models (same `AI_MODELS` array)
- Text input: "Custom model ID"
- Save button

The selected default AI:
- Pre-selects the inline model dropdown on load
- Is used as the summarizer model in AI Council

---

## 4. AI Council

### User flow
1. User clicks **"AI Council"** button (next to existing "Get AI Analysis")
2. Modal/panel opens: select 2–5 models (checkboxes from known list + optional custom input)
3. Confirm → frontend fires N parallel `POST /api/ai` calls (one per model), with `forceRefresh: false` (uses per-model cache)
4. Results render progressively in animated tabs as they arrive
5. Once all done, auto-call `POST /api/ai/summarize` with default AI → renders summary below tabs

### Frontend: AI Council Panel
**New file:** `src/components/features/ai-council-panel.tsx`

Animated tabs built with Framer Motion (already in project):
- Tab bar: one tab per model name, with animated sliding indicator (layoutId="council-tab-indicator")
- Each tab panel: full AIAnalysis card (score, prediction, buy/sell sections, risks)
- Loading state per tab: spinner while that model is pending
- Error state per tab: inline error message

Summary section below tabs:
- "Council Summary" heading
- Calls default AI with prompt: "Here are N analyses for {symbol}. Synthesize key agreement/disagreement points and give one final recommendation."
- Shows as styled prose card

### Backend: Summarize endpoint
**New file:** `src/app/api/ai/summarize/route.ts`

```ts
POST /api/ai/summarize
Body: { symbol: string, analyses: AIAnalysis[], models: string[], defaultModel: string }
Returns: { summary: string }
```

Uses AI SDK `generateText` with default model. No caching (summary depends on which models ran). Prompt instructs AI to synthesize N analyses into one paragraph + final verdict.

### Council model selector UI
Small panel (not full modal) that appears below the AI Council button:
- Checkboxes for each known model (max 5 selectable)
- Text input for custom model ID (adds to selection)
- "Run Council" button

### Caching
Each `/api/ai` call uses `${symbol}:${modelId}` cache key (from migration in #1). Council reuses cached results automatically. Summarize endpoint has no cache.

---

## Component & File Map

| File | Change |
|------|--------|
| `src/app/api/ai/route.ts` | AI SDK migration, `symbol:model` cache key |
| `src/app/api/ai/summarize/route.ts` | **NEW** — council summarization |
| `src/components/features/stock-analyzer.tsx` | Label renames, custom model input, default AI settings icon, council button + selector |
| `src/components/features/ai-council-panel.tsx` | **NEW** — animated tabs + summary |
| `src/hooks/useDefaultAI.ts` | **NEW** — localStorage default AI |

---

## Verification

1. **AI SDK migration:** Run single AI analysis → should work identically. Check network tab: no direct call to `openrouter.ai`, call goes through Next.js API route.
2. **Strategy labels:** After analysis loads, BUY/SELL headings appear instead of Bottom Fishing/Price Target.
3. **Custom model input:** Type `anthropic/claude-3-haiku` in custom field → analysis runs with that model.
4. **Default AI setting:** Open settings, set custom default → refresh page → default persists in localStorage, pre-selected in dropdown.
5. **AI Council:** Select 3 models, click Run Council → 3 tabs appear progressively → summary appears below after all complete.
6. **Per-model cache:** Run council twice → second run faster (cached). Check: different model = different cache entry.
