# AI Council Structured Debate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat parallel-analysis council flow with a structured multi-round debate where analyst models challenge each other and a user-selected Chair model moderates, stopping early when debate converges or after 3 rounds maximum.

**Architecture:** Client-side `useDebate` hook manages round-loop state and orchestrates two new API routes: `/api/ai/debate-round` (one analyst per call, parallel fan-out) and `/api/ai/chair` (Chair model evaluates after each round). Alpha Vantage helpers are extracted to a shared lib so both routes share the same in-memory cache. A new `DebateTheater` UI component replaces `AiCouncilPanel` for council mode.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Framer Motion, Tailwind CSS v4, OpenRouter via `@openrouter/ai-sdk-provider`, `ai` SDK `generateText`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/debate-types.ts` | Create | All shared TypeScript interfaces for debate |
| `src/lib/alpha-vantage.ts` | Create | Alpha Vantage fetch helpers + shared in-memory cache |
| `src/lib/debate-utils.ts` | Create | Pure functions: stop-rule checks, transcript builder, average fallback |
| `src/app/api/ai/route.ts` | Modify | Import AV helpers from shared lib (remove duplicated code) |
| `src/app/api/ai/debate-round/route.ts` | Create | Analyst endpoint for debate rounds (accepts transcript + directive) |
| `src/app/api/ai/chair/route.ts` | Create | Chair model endpoint — evaluates transcript, returns stop/continue |
| `src/hooks/useDebate.ts` | Create | All debate state + multi-round orchestration logic |
| `src/components/features/debate-theater.tsx` | Create | Responsive debate UI: round progress, analyst tiles, chair strip, verdict |
| `src/components/features/stock-analyzer.tsx` | Modify | Add Chair model selector, wire `useDebate`, show `DebateTheater` |

---

## Task 1: Define Shared Debate Types

**Files:**
- Create: `src/lib/debate-types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/debate-types.ts

import type { ModelAnalysis, CouncilRole } from '@/components/features/ai-council-panel';

export type { ModelAnalysis, CouncilRole };

export interface DebateEntry {
  round: number;
  modelId: string;
  modelName: string;
  role: CouncilRole;
  analysis: ModelAnalysis;
}

export interface StopRuleEvaluation {
  unanimous: boolean;
  converged: boolean;
  chairJudgment: boolean;
  chairJudgmentRationale: string;
}

export interface AnalystDirectives {
  technical: string | null;
  fundamental: string | null;
  sentiment: string | null;
  contrarian: string | null;
  risk: string | null;
}

export interface ChairResponse {
  shouldStop: boolean;
  stopRuleEvaluation: StopRuleEvaluation;
  verdict: ModelAnalysis | null;
  analystDirectives: AnalystDirectives | null;
}

export interface AnalystDebateState {
  loading: boolean;
  rounds: Array<ModelAnalysis | null>;
  error: string | null;
}

export interface ChairRoundState {
  loading: boolean;
  stopRuleEvaluation: StopRuleEvaluation | null;
  analystDirectives: AnalystDirectives | null;
  chairJudgmentRationale: string | null;
}

export type DebatePhase = 'idle' | 'round' | 'chair' | 'verdict' | 'error';

export interface DebateState {
  phase: DebatePhase;
  currentRound: number;
  maxRounds: number;
  transcript: DebateEntry[];
  analystStates: Record<string, AnalystDebateState>;
  chairStates: ChairRoundState[];
  verdict: ModelAnalysis | null;
  stopReason: 'unanimous' | 'converged' | 'chair' | 'max_rounds' | null;
  dissenters: CouncilRole[];
  error: string | null;
}

export interface DebateAnalystModel {
  id: string;
  name: string;
  role: CouncilRole;
}

export interface StockDataPayload {
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  sharpeRatio: number;
  trend: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build 2>&1 | head -30`
Expected: No errors related to `debate-types.ts` (other pre-existing errors are fine)

- [ ] **Step 3: Commit**

```bash
git add src/lib/debate-types.ts
git commit -m "feat: add shared debate TypeScript interfaces"
```

---

## Task 2: Extract Alpha Vantage Helpers to Shared Lib

The existing `/api/ai/route.ts` has AV fetch functions and cache inline. The new debate-round route needs the same data. Extract to a shared module so both routes share the same in-memory cache.

**Files:**
- Create: `src/lib/alpha-vantage.ts`
- Modify: `src/app/api/ai/route.ts`

- [ ] **Step 1: Create the shared Alpha Vantage lib**

```typescript
// src/lib/alpha-vantage.ts

const BASE_URL = 'https://www.alphavantage.co/query';
const CACHE_MS = 15 * 60 * 1000;
const FUNDAMENTALS_CACHE_MS = 60 * 60 * 1000;

export interface RSIData {
  value: number;
  signal: string;
}

export interface MACDData {
  macd: number;
  signal: number;
  histogram: number;
  trend: string;
}

export interface CompanyOverview {
  marketCap: string;
  peRatio: string;
  eps: string;
  fiftyTwoWeekHigh: string;
  fiftyTwoWeekLow: string;
  dividendYield: string;
  sector: string;
  industry: string;
}

export interface NewsSentimentItem {
  title: string;
  sentiment: string;
  score: number;
  source: string;
  timeAgo: string;
}

export interface NewsSentimentResult {
  items: NewsSentimentItem[];
  overall: number;
}

const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string, maxAge: number): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < maxAge) return entry.data as T;
  return null;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function mapSentimentLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('bullish')) return 'Bullish';
  if (l.includes('bearish')) return 'Bearish';
  return 'Neutral';
}

function formatMarketCap(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function formatTimeAgo(dateString: string): string {
  const year = dateString.slice(0, 4);
  const month = dateString.slice(4, 6);
  const day = dateString.slice(6, 8);
  const hour = dateString.slice(9, 11);
  const minute = dateString.slice(11, 13);
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export async function fetchRSI(symbol: string, apiKey: string): Promise<RSIData | null> {
  const key = `rsi_${symbol}`;
  const cached = getCached<RSIData>(key, CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data['Technical Analysis: RSI']) return null;
    const rsiData = data['Technical Analysis: RSI'];
    const latestDate = Object.keys(rsiData)[0];
    const value = parseFloat(rsiData[latestDate].RSI);
    let signal = 'Neutral';
    if (value >= 70) signal = 'Overbought';
    else if (value >= 60) signal = 'Bullish';
    else if (value <= 30) signal = 'Oversold';
    else if (value <= 40) signal = 'Bearish';
    const result: RSIData = { value, signal };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export async function fetchMACD(symbol: string, apiKey: string): Promise<MACDData | null> {
  const key = `macd_${symbol}`;
  const cached = getCached<MACDData>(key, CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data['Technical Analysis: MACD']) return null;
    const macdData = data['Technical Analysis: MACD'];
    const latestDate = Object.keys(macdData)[0];
    const latest = macdData[latestDate];
    const macd = parseFloat(latest.MACD);
    const signal = parseFloat(latest.MACD_Signal);
    const histogram = parseFloat(latest.MACD_Hist);
    let trend = 'Neutral';
    if (histogram > 0 && macd > signal) trend = 'Bullish';
    else if (histogram < 0 && macd < signal) trend = 'Bearish';
    const result: MACDData = { macd, signal, histogram, trend };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export async function fetchCompanyOverview(symbol: string, apiKey: string): Promise<CompanyOverview | null> {
  const key = `overview_${symbol}`;
  const cached = getCached<CompanyOverview>(key, FUNDAMENTALS_CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data.Symbol) return null;
    const result: CompanyOverview = {
      marketCap: formatMarketCap(data.MarketCapitalization),
      peRatio: data.PERatio || 'N/A',
      eps: data.EPS || 'N/A',
      fiftyTwoWeekHigh: data['52WeekHigh'] || 'N/A',
      fiftyTwoWeekLow: data['52WeekLow'] || 'N/A',
      dividendYield: data.DividendYield ? `${(parseFloat(data.DividendYield) * 100).toFixed(2)}%` : 'N/A',
      sector: data.Sector || 'N/A',
      industry: data.Industry || 'N/A',
    };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export async function fetchNewsSentiment(symbol: string, apiKey: string): Promise<NewsSentimentResult | null> {
  const key = `news_${symbol}`;
  const cached = getCached<NewsSentimentResult>(key, CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=NEWS_SENTIMENT&tickers=${symbol}&limit=5&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data.feed) return null;
    let totalScore = 0;
    const items: NewsSentimentItem[] = data.feed.slice(0, 3).map((item: Record<string, unknown>) => {
      const tickerSentiment = (item.ticker_sentiment as Array<{ ticker: string; ticker_sentiment_score: string; ticker_sentiment_label: string }>) || [];
      const symbolSentiment = tickerSentiment.find(t => t.ticker === symbol);
      const score = parseFloat(symbolSentiment?.ticker_sentiment_score || item.overall_sentiment_score as string || '0');
      totalScore += score;
      const title = item.title as string;
      return {
        title: title?.length > 80 ? title.slice(0, 80) + '...' : title,
        sentiment: mapSentimentLabel(symbolSentiment?.ticker_sentiment_label || item.overall_sentiment_label as string || 'Neutral'),
        score,
        source: item.source as string,
        timeAgo: formatTimeAgo(item.time_published as string),
      };
    });
    const result: NewsSentimentResult = { items, overall: items.length > 0 ? totalScore / items.length : 0 };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export function buildTechnicalSection(rsi: RSIData | null, macd: MACDData | null): string {
  if (!rsi && !macd) return '';
  let section = '\n\n=== TECHNICAL INDICATORS (Real-time from Alpha Vantage) ===';
  if (rsi) section += `\nRSI (14-day): ${rsi.value.toFixed(2)} (${rsi.signal})`;
  if (macd) section += `\nMACD: ${macd.macd.toFixed(4)}, Signal: ${macd.signal.toFixed(4)}, Histogram: ${macd.histogram.toFixed(4)} (${macd.trend})`;
  return section;
}

export function buildFundamentalsSection(overview: CompanyOverview | null): string {
  if (!overview) return '';
  return `\n\n=== FUNDAMENTALS ===
Market Cap: ${overview.marketCap}
P/E Ratio: ${overview.peRatio}
EPS: $${overview.eps}
52-Week High: $${overview.fiftyTwoWeekHigh}
52-Week Low: $${overview.fiftyTwoWeekLow}
Dividend Yield: ${overview.dividendYield}
Sector: ${overview.sector}
Industry: ${overview.industry}`;
}

export function buildNewsSection(newsSentiment: NewsSentimentResult | null): string {
  if (!newsSentiment || newsSentiment.items.length === 0) return '';
  let section = '\n\n=== RECENT NEWS SENTIMENT (Real-time) ===';
  newsSentiment.items.forEach((item, i) => {
    const scoreStr = item.score >= 0 ? `+${item.score.toFixed(2)}` : item.score.toFixed(2);
    section += `\n${i + 1}. [${item.sentiment} ${scoreStr}] "${item.title}" - ${item.source}, ${item.timeAgo}`;
  });
  const overallStr = newsSentiment.overall >= 0 ? `+${newsSentiment.overall.toFixed(2)}` : newsSentiment.overall.toFixed(2);
  const overallLabel = newsSentiment.overall > 0.15 ? 'Bullish' : newsSentiment.overall < -0.15 ? 'Bearish' : 'Neutral';
  section += `\nOverall News Sentiment: ${overallLabel} (${overallStr})`;
  return section;
}
```

- [ ] **Step 2: Update `/api/ai/route.ts` to import from shared lib**

At the top of `src/app/api/ai/route.ts`, replace the local interface definitions and helper functions with imports. Remove lines 122–344 (all the Alpha Vantage interfaces and functions) and replace with:

```typescript
import {
  fetchRSI,
  fetchMACD,
  fetchCompanyOverview,
  fetchNewsSentiment,
  buildTechnicalSection,
  buildFundamentalsSection,
  buildNewsSection,
  type RSIData,
  type MACDData,
  type CompanyOverview,
  type NewsSentimentResult,
} from '@/lib/alpha-vantage';
```

Also remove the local `alphaVantageCache` map and `getCachedData`/`setCachedData` helpers (lines 41–44 and 155–166), and the `formatMarketCap`, `formatTimeAgo`, `mapSentimentLabel` helpers (lines 311–344).

Replace the four local fetch calls in the `POST` handler (lines 408–419) with the imported versions:

```typescript
if (alphaVantageKey) {
  const results = await Promise.allSettled([
    fetchRSI(symbol, alphaVantageKey),
    fetchMACD(symbol, alphaVantageKey),
    fetchCompanyOverview(symbol, alphaVantageKey),
    fetchNewsSentiment(symbol, alphaVantageKey),
  ]);
  rsiData = results[0].status === 'fulfilled' ? results[0].value : null;
  macdData = results[1].status === 'fulfilled' ? results[1].value : null;
  overview = results[2].status === 'fulfilled' ? results[2].value : null;
  newsSentiment = results[3].status === 'fulfilled' ? results[3].value : null;
}
```

Replace the three local section-builder calls with:

```typescript
const technicalSection = buildTechnicalSection(rsiData, macdData);
const fundamentalsSection = buildFundamentalsSection(overview);
const newsSection = buildNewsSection(newsSentiment);
```

Update local variable declarations at top of POST handler to use imported types:

```typescript
let rsiData: RSIData | null = null;
let macdData: MACDData | null = null;
let overview: CompanyOverview | null = null;
let newsSentiment: NewsSentimentResult | null = null;
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -20`
Expected: No new errors from the refactored route

- [ ] **Step 4: Commit**

```bash
git add src/lib/alpha-vantage.ts src/app/api/ai/route.ts
git commit -m "refactor: extract Alpha Vantage helpers to shared lib"
```

---

## Task 3: Debate Utility Pure Functions

**Files:**
- Create: `src/lib/debate-utils.ts`

- [ ] **Step 1: Create the utils file**

```typescript
// src/lib/debate-utils.ts

import type { DebateEntry, ModelAnalysis, CouncilRole } from './debate-types';

export function checkUnanimous(entries: DebateEntry[]): boolean {
  if (entries.length === 0) return false;
  const preds = entries.map(e => e.analysis.prediction);
  return preds.every(p => p === preds[0]);
}

export function checkConverged(entries: DebateEntry[], threshold = 15): boolean {
  if (entries.length < 2) return false;
  const confidences = entries.map(e => e.analysis.confidence);
  return Math.max(...confidences) - Math.min(...confidences) < threshold;
}

export function computeDissenters(
  entries: DebateEntry[],
  verdict: ModelAnalysis,
): CouncilRole[] {
  return entries
    .filter(e => e.analysis.prediction !== verdict.prediction)
    .map(e => e.role);
}

export function buildTranscriptText(transcript: DebateEntry[]): string {
  const byRound = transcript.reduce<Record<number, DebateEntry[]>>((acc, e) => {
    if (!acc[e.round]) acc[e.round] = [];
    acc[e.round].push(e);
    return acc;
  }, {});

  return Object.entries(byRound)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([round, entries]) => {
      const lines = entries.map(
        e =>
          `[${e.role.toUpperCase()} - ${e.modelName}]\nScore: ${e.analysis.score}/10 | ${e.analysis.prediction} (${e.analysis.confidence}% conf)\nReasons: ${e.analysis.reasons.join('; ')}\nRisks: ${e.analysis.riskFactors.join('; ')}`,
      );
      return `=== ROUND ${round} ===\n${lines.join('\n\n')}`;
    })
    .join('\n\n');
}

export function averageAnalyses(
  analyses: ModelAnalysis[],
  currentPrice: number,
): ModelAnalysis {
  const n = analyses.length;
  const avgScore = Math.round(analyses.reduce((s, a) => s + a.score, 0) / n);
  const avgConf = Math.round(analyses.reduce((s, a) => s + a.confidence, 0) / n);
  const votes: Record<string, number> = { UP: 0, DOWN: 0, HOLD: 0 };
  analyses.forEach(a => { votes[a.prediction] = (votes[a.prediction] ?? 0) + 1; });
  const prediction = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  const avgTarget =
    analyses.reduce((s, a) => s + (a.priceTarget.targetPrice || currentPrice), 0) / n;
  const avgRise =
    analyses.reduce((s, a) => s + (a.priceTarget.expectedRise || 0), 0) / n;
  const avgEntry =
    analyses.reduce((s, a) => s + (a.bottomFishing.targetPrice || currentPrice), 0) / n;
  return {
    score: avgScore,
    prediction,
    confidence: avgConf,
    reasons: [...new Set(analyses.flatMap(a => a.reasons))].slice(0, 3),
    bottomFishing: {
      recommended: analyses.filter(a => a.bottomFishing.recommended).length > n / 2,
      targetPrice: avgEntry,
      timing: 'Consensus timing',
      rationale: 'Council average — debate did not reach Chair verdict',
    },
    priceTarget: {
      expectedRise: avgRise,
      targetPrice: avgTarget,
      timeframe: 'Consensus timeframe',
      exitStrategy: 'Monitor council consensus',
    },
    riskFactors: [...new Set(analyses.flatMap(a => a.riskFactors))].slice(0, 3),
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/debate-utils.ts
git commit -m "feat: add debate utility pure functions"
```

---

## Task 4: Debate-Round API Route

Each analyst call during a debate round. Accepts a transcript of prior rounds and a per-role directive from the Chair. Same Alpha Vantage enrichment as the existing `/api/ai` route but no response caching (debates are always fresh).

**Files:**
- Create: `src/app/api/ai/debate-round/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/ai/debate-round/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import {
  fetchRSI,
  fetchMACD,
  fetchCompanyOverview,
  fetchNewsSentiment,
  buildTechnicalSection,
  buildFundamentalsSection,
  buildNewsSection,
} from '@/lib/alpha-vantage';
import { validateSymbol } from '@/lib/validation';
import type { DebateEntry, CouncilRole } from '@/lib/debate-types';

const COUNCIL_ROLE_PROMPTS: Record<CouncilRole, string> = {
  technical: `You are a TECHNICAL ANALYST on the AI Investment Council. Your mandate: analyze ONLY technical indicators and price action. Ignore fundamentals and news entirely.

Focus on:
- RSI levels (overbought >70, oversold <30) and divergence signals
- MACD crossovers and histogram momentum
- Price relative to 52-week range (support/resistance)
- Volume trends confirming or rejecting price moves
- Day High/Low range and intraday momentum

Base every conclusion on the numbers provided. Ignore company quality, news, or macro — that is another analyst's job.`,

  fundamental: `You are a FUNDAMENTAL ANALYST on the AI Investment Council. Your mandate: analyze ONLY valuation metrics and company financials. Ignore price charts and technicals.

Focus on:
- P/E ratio vs sector average (is the stock cheap or expensive?)
- EPS growth trajectory and quality
- Market cap relative to fundamentals
- Dividend yield attractiveness
- 52-week range as a valuation anchor (not a technical signal)
- Sector and industry tailwinds/headwinds

If P/E is N/A or data is missing, state it clearly and reason conservatively. Do not extrapolate.`,

  sentiment: `You are a MARKET SENTIMENT ANALYST on the AI Investment Council. Your mandate: analyze ONLY news sentiment, market psychology, and momentum signals. Ignore charts and fundamentals.

Focus on:
- Recent news sentiment scores (bullish/bearish bias in media)
- Sentiment momentum (improving or deteriorating?)
- Volume as a proxy for retail/institutional conviction
- Current trend (bullish/bearish) as a crowd psychology indicator
- Short-term price change as a sentiment gauge

Sentiment drives short-term price more than fundamentals. Make your recommendation based on near-term sentiment dynamics.`,

  contrarian: `You are the CONTRARIAN ANALYST on the AI Investment Council. Your mandate: argue the OPPOSITE of what the obvious data suggests. Devil's advocate.

Your role:
- If RSI is oversold and price is down, argue why it could fall further
- If fundamentals look cheap, argue why the discount is deserved
- If news sentiment is positive, find the hidden risks being ignored
- Challenge the consensus view with specific data points from the provided figures
- Identify what the bulls are overlooking and what the bears might be missing

Be intellectually honest — base your contrarian case on the actual data, not random pessimism.`,

  risk: `You are the RISK MANAGER on the AI Investment Council. Your mandate: assess downside scenarios and position risk. You are the most conservative voice on the council.

Focus on:
- Maximum realistic downside from current price (worst-case target)
- Risk/reward ratio (how much to gain vs how much to lose)
- Stop-loss placement based on technical levels
- Position sizing implications
- Tail risks: what single event could cause >20% decline?
- Current Sharpe Ratio interpretation for risk-adjusted returns

Your buy target price should be the price that offers acceptable risk/reward. Your sell target should be where risk/reward deteriorates.`,
};

interface DebateRoundRequest {
  symbol: string;
  model: string;
  councilRole: CouncilRole;
  round: number;
  directive: string | null;
  transcript: DebateEntry[];
  stockData: {
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    dayHigh: number;
    dayLow: number;
    volume: number;
    sharpeRatio: number;
    trend: string;
  };
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return (volume / 1_000_000_000).toFixed(2) + 'B';
  if (volume >= 1_000_000) return (volume / 1_000_000).toFixed(2) + 'M';
  if (volume >= 1_000) return (volume / 1_000).toFixed(2) + 'K';
  return volume.toString();
}

function buildTranscriptSection(transcript: DebateEntry[]): string {
  if (transcript.length === 0) return '';
  const byRound = transcript.reduce<Record<number, DebateEntry[]>>((acc, e) => {
    if (!acc[e.round]) acc[e.round] = [];
    acc[e.round].push(e);
    return acc;
  }, {});

  const lines = Object.entries(byRound)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([round, entries]) => {
      const entryLines = entries.map(
        e =>
          `[${e.role.toUpperCase()} - ${e.modelName}] ${e.analysis.prediction} (score ${e.analysis.score}/10, ${e.analysis.confidence}% conf)\nReasons: ${e.analysis.reasons.join('; ')}`,
      );
      return `=== ROUND ${round} ===\n${entryLines.join('\n\n')}`;
    })
    .join('\n\n');

  return `\n\n=== PRIOR DEBATE TRANSCRIPT ===\n${lines}`;
}

export async function POST(request: NextRequest) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!openRouterKey) {
    return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
  }

  let body: DebateRoundRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const symbol = validateSymbol(body.symbol);
  if (!symbol) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  const { stockData, model, councilRole, round, directive, transcript } = body;

  // Fetch Alpha Vantage data (shared cache with /api/ai)
  let rsiData = null;
  let macdData = null;
  let overview = null;
  let newsSentiment = null;

  if (alphaVantageKey) {
    const results = await Promise.allSettled([
      fetchRSI(symbol, alphaVantageKey),
      fetchMACD(symbol, alphaVantageKey),
      fetchCompanyOverview(symbol, alphaVantageKey),
      fetchNewsSentiment(symbol, alphaVantageKey),
    ]);
    rsiData = results[0].status === 'fulfilled' ? results[0].value : null;
    macdData = results[1].status === 'fulfilled' ? results[1].value : null;
    overview = results[2].status === 'fulfilled' ? results[2].value : null;
    newsSentiment = results[3].status === 'fulfilled' ? results[3].value : null;
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const technicalSection = buildTechnicalSection(rsiData, macdData);
  const fundamentalsSection = buildFundamentalsSection(overview);
  const newsSection = buildNewsSection(newsSentiment);
  const transcriptSection = buildTranscriptSection(transcript);

  const directiveSection = directive
    ? `\n\n=== CHAIR DIRECTIVE FOR YOU (Round ${round}) ===\n${directive}\nYou MUST address this directive in your reasoning.`
    : '';

  const rolePrompt = COUNCIL_ROLE_PROMPTS[councilRole];
  const isRebuttalRound = round > 1;

  const systemPrompt = `${rolePrompt}

Today is ${today}. You have access to REAL-TIME market data and the debate transcript from prior rounds.

${isRebuttalRound ? `This is Round ${round}. You have seen other analysts' positions. You may revise your position based on compelling arguments, but you must stay true to your analytical role. Do not abandon your mandate to please consensus.` : `This is Round 1. Provide your initial independent analysis based solely on your role's mandate.`}

Respond ONLY with valid JSON (no markdown, no code blocks):

{
  "score": <number 1-10>,
  "prediction": "<UP or DOWN or HOLD>",
  "confidence": <number 1-100>,
  "reasons": ["<role-specific point 1>", "<role-specific point 2>", "<role-specific point 3>"],
  "bottomFishing": {
    "recommended": <boolean>,
    "targetPrice": <number>,
    "timing": "<when to buy from your role's perspective>",
    "rationale": "<one sentence>"
  },
  "priceTarget": {
    "expectedRise": <percentage>,
    "targetPrice": <number>,
    "timeframe": "<e.g., '1-2 weeks'>",
    "exitStrategy": "<when to sell from your role's perspective>"
  },
  "riskFactors": ["<risk 1>", "<risk 2>", "<risk 3>"]
}

Rules:
- score 8-10 = Strong Buy, 5-7 = Hold, 1-4 = Caution
- All reasons must reflect your specific analytical role
- Return ONLY the JSON object`;

  const userPrompt = `Stock: ${symbol} (${stockData.name})
Current Price: $${stockData.currentPrice.toFixed(2)}
Daily Change: ${stockData.change >= 0 ? '+' : ''}$${stockData.change.toFixed(2)} (${stockData.changePercent >= 0 ? '+' : ''}${stockData.changePercent.toFixed(2)}%)
Day High: $${stockData.dayHigh.toFixed(2)} | Day Low: $${stockData.dayLow.toFixed(2)}
Volume: ${formatVolume(stockData.volume)} | Sharpe: ${stockData.sharpeRatio.toFixed(2)} | Trend: ${stockData.trend}${technicalSection}${fundamentalsSection}${newsSection}${transcriptSection}${directiveSection}

Provide your Round ${round} JSON analysis:`;

  try {
    const openrouter = createOpenRouter({ apiKey: openRouterKey });
    const { text } = await generateText({
      model: openrouter(model),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxOutputTokens: 800,
      temperature: 0.7,
    });

    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const analysis = JSON.parse(cleaned);

    if (
      typeof analysis.score !== 'number' ||
      !['UP', 'DOWN', 'HOLD'].includes(analysis.prediction) ||
      !Array.isArray(analysis.reasons)
    ) {
      throw new Error('Invalid analysis structure');
    }

    return NextResponse.json({ analysis, model, councilRole, round });
  } catch (err) {
    console.error('Debate round error:', err);
    return NextResponse.json(
      { error: 'Analysis failed', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -20`
Expected: No errors from new route

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/debate-round/route.ts
git commit -m "feat: add debate-round API route for analyst debate calls"
```

---

## Task 5: Chair API Route

The Chair model reads the full transcript after each round, evaluates stop rules, and either issues per-analyst directives or a final verdict.

**Files:**
- Create: `src/app/api/ai/chair/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/ai/chair/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { buildTranscriptText } from '@/lib/debate-utils';
import type { DebateEntry, ChairResponse } from '@/lib/debate-types';

interface ChairRequest {
  symbol: string;
  currentPrice: number;
  transcript: DebateEntry[];
  round: number;
  chairModelId: string;
  forced: boolean;
}

const CHAIR_SYSTEM_PROMPT = `You are a demanding Council Chair with a bias toward rigorous debate. You distrust premature consensus.

Before calling convergence, you must identify:
(a) The strongest unaddressed counterargument in the transcript
(b) Which analyst's reasoning is weakest and why  
(c) Whether confidence levels reflect actual evidence or role-playing certainty

Only stop early when disagreement is genuinely resolved, not merely absent. Your job is NOT to analyze the stock yourself — identify unresolved disagreements, probe weak reasoning, and when debate is settled, synthesize a verdict that accurately reflects the council's collective judgment.

CRITICAL OUTPUT RULES:
- When shouldStop is true: verdict must be populated, analystDirectives must be null
- When shouldStop is false: verdict must be null, analystDirectives must be populated
- stopRuleEvaluation must always be fully populated
- Return ONLY valid JSON, no markdown, no code blocks`;

function buildChairPrompt(
  symbol: string,
  currentPrice: number,
  transcript: DebateEntry[],
  round: number,
  forced: boolean,
): string {
  const transcriptText = buildTranscriptText(transcript);
  const latestRound = transcript.filter(e => e.round === round);
  const predictions = latestRound.map(e => e.analysis.prediction);
  const confidences = latestRound.map(e => e.analysis.confidence);
  const isUnanimous = predictions.length > 0 && predictions.every(p => p === predictions[0]);
  const spread = confidences.length >= 2
    ? Math.max(...confidences) - Math.min(...confidences)
    : 999;

  const schema = forced
    ? `{
  "shouldStop": true,
  "stopRuleEvaluation": {
    "unanimous": <boolean>,
    "converged": <boolean>,
    "chairJudgment": true,
    "chairJudgmentRationale": "<why debate is resolved>"
  },
  "verdict": {
    "score": <number 1-10>,
    "prediction": "<UP or DOWN or HOLD>",
    "confidence": <number 1-100>,
    "reasons": ["<consensus point 1>", "<consensus point 2>", "<consensus point 3>"],
    "bottomFishing": {
      "recommended": <boolean>,
      "targetPrice": <number>,
      "timing": "<consensus timing>",
      "rationale": "<one sentence consensus buy rationale>"
    },
    "priceTarget": {
      "expectedRise": <percentage>,
      "targetPrice": <number>,
      "timeframe": "<consensus timeframe>",
      "exitStrategy": "<one sentence consensus exit strategy>"
    },
    "riskFactors": ["<consensus risk 1>", "<consensus risk 2>", "<consensus risk 3>"]
  },
  "analystDirectives": null
}`
    : `{
  "shouldStop": <boolean>,
  "stopRuleEvaluation": {
    "unanimous": <boolean — are ALL analysts predicting the same direction?>,
    "converged": <boolean — is the confidence spread less than 15 points?>,
    "chairJudgment": <boolean — do you judge the debate resolved?>,
    "chairJudgmentRationale": "<one sentence explaining your judgment>"
  },
  "verdict": <populated ModelAnalysis object if shouldStop is true, otherwise null>,
  "analystDirectives": <null if shouldStop is true, otherwise object with per-role directives:> {
    "technical": "<specific challenge or null>",
    "fundamental": "<specific challenge or null>",
    "sentiment": "<specific challenge or null>",
    "contrarian": "<specific challenge or null>",
    "risk": "<specific challenge or null>"
  }
}

If shouldStop is true, verdict must contain:
{
  "score": <number 1-10>,
  "prediction": "<UP or DOWN or HOLD>",
  "confidence": <number 1-100>,
  "reasons": ["<3 consensus points>"],
  "bottomFishing": { "recommended": <boolean>, "targetPrice": <number>, "timing": "<string>", "rationale": "<string>" },
  "priceTarget": { "expectedRise": <number>, "targetPrice": <number>, "timeframe": "<string>", "exitStrategy": "<string>" },
  "riskFactors": ["<3 consensus risks>"]
}`;

  return `You are chairing an AI Investment Council debate for ${symbol} at $${currentPrice}.

This is after Round ${round}. ${forced ? 'This is the final round — you MUST issue a verdict.' : ''}

Current round stats (fast-path checks for your reference):
- Unanimous predictions: ${isUnanimous ? 'YES' : 'NO'} (${[...new Set(predictions)].join(', ')})
- Confidence spread: ${spread === 999 ? 'N/A' : spread.toFixed(0)} points ${spread < 15 ? '(converged)' : '(spread)'}

=== FULL DEBATE TRANSCRIPT ===
${transcriptText}

Evaluate the debate and respond with ONLY valid JSON matching this schema:

${schema}`;
}

export async function POST(request: NextRequest) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
  }

  let body: ChairRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { symbol, currentPrice, transcript, round, chairModelId, forced } = body;

  if (!symbol || typeof currentPrice !== 'number' || !transcript || !chairModelId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userPrompt = buildChairPrompt(symbol, currentPrice, transcript, round, forced);

  try {
    const openrouter = createOpenRouter({ apiKey: openRouterKey });
    const { text } = await generateText({
      model: openrouter(chairModelId),
      messages: [
        { role: 'system', content: CHAIR_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      maxOutputTokens: 1000,
      temperature: 0.3,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse Chair response' }, { status: 500 });
    }

    const chairResponse: ChairResponse = JSON.parse(jsonMatch[0]);

    // Enforce mutual exclusion
    if (chairResponse.shouldStop) {
      chairResponse.analystDirectives = null;
    } else {
      chairResponse.verdict = null;
    }
    if (forced) {
      chairResponse.shouldStop = true;
      chairResponse.analystDirectives = null;
    }

    return NextResponse.json(chairResponse);
  } catch (err) {
    console.error('Chair error:', err);
    return NextResponse.json(
      { error: 'Chair failed', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -20`
Expected: No errors from chair route

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/chair/route.ts
git commit -m "feat: add chair API route for debate moderation"
```

---

## Task 6: useDebate Hook

Manages all debate state and orchestrates the multi-round loop. Exported from this hook: `state`, `runDebate`, `reset`.

**Files:**
- Create: `src/hooks/useDebate.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useDebate.ts

'use client';

import { useState, useCallback } from 'react';
import type {
  DebateState,
  DebateAnalystModel,
  DebateEntry,
  ModelAnalysis,
  AnalystDirectives,
  CouncilRole,
  StockDataPayload,
} from '@/lib/debate-types';
import {
  checkUnanimous,
  checkConverged,
  computeDissenters,
  averageAnalyses,
} from '@/lib/debate-utils';

const MAX_ROUNDS = 3;

const INITIAL_STATE: DebateState = {
  phase: 'idle',
  currentRound: 0,
  maxRounds: MAX_ROUNDS,
  transcript: [],
  analystStates: {},
  chairStates: [],
  verdict: null,
  stopReason: null,
  dissenters: [],
  error: null,
};

export function useDebate() {
  const [state, setState] = useState<DebateState>(INITIAL_STATE);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const runDebate = useCallback(
    async (
      analysts: DebateAnalystModel[],
      stockData: StockDataPayload,
      symbol: string,
      chairModelId: string,
    ) => {
      if (analysts.length === 0) return;

      const initialAnalystStates = Object.fromEntries(
        analysts.map(a => [a.id, { loading: false, rounds: [], error: null }]),
      );

      setState({
        ...INITIAL_STATE,
        phase: 'round',
        currentRound: 1,
        analystStates: initialAnalystStates,
      });

      let transcript: DebateEntry[] = [];
      let currentDirectives: AnalystDirectives | null = null;

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        // Mark all analysts loading for this round
        setState(prev => ({
          ...prev,
          phase: 'round',
          currentRound: round,
          analystStates: Object.fromEntries(
            analysts.map(a => [
              a.id,
              { ...prev.analystStates[a.id], loading: true, error: null },
            ]),
          ),
        }));

        // Fan-out analyst calls in parallel
        const roundEntries: DebateEntry[] = [];
        const analystPromises = analysts.map(async analyst => {
          const directive = currentDirectives
            ? currentDirectives[analyst.role as CouncilRole]
            : null;
          try {
            const res = await fetch('/api/ai/debate-round', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol,
                model: analyst.id,
                councilRole: analyst.role,
                round,
                directive,
                transcript,
                stockData,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Analysis failed');

            const analysis = data.analysis as ModelAnalysis;
            const entry: DebateEntry = {
              round,
              modelId: analyst.id,
              modelName: analyst.name,
              role: analyst.role,
              analysis,
            };
            roundEntries.push(entry);

            setState(prev => ({
              ...prev,
              analystStates: {
                ...prev.analystStates,
                [analyst.id]: {
                  loading: false,
                  rounds: [...(prev.analystStates[analyst.id]?.rounds ?? []), analysis],
                  error: null,
                },
              },
            }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setState(prev => ({
              ...prev,
              analystStates: {
                ...prev.analystStates,
                [analyst.id]: {
                  ...(prev.analystStates[analyst.id] ?? { rounds: [] }),
                  loading: false,
                  error: msg,
                },
              },
            }));
          }
        });

        await Promise.all(analystPromises);

        if (roundEntries.length === 0) {
          setState(prev => ({
            ...prev,
            phase: 'error',
            error: 'All analysts failed in this round',
          }));
          return;
        }

        transcript = [...transcript, ...roundEntries];

        setState(prev => ({
          ...prev,
          transcript,
        }));

        // Fast-path stop checks
        const latestRoundEntries = transcript.filter(e => e.round === round);
        const isUnanimous = checkUnanimous(latestRoundEntries);
        const isConverged = checkConverged(latestRoundEntries);

        if (isUnanimous || isConverged) {
          const verdict = averageAnalyses(
            latestRoundEntries.map(e => e.analysis),
            stockData.currentPrice,
          );
          const dissenters = computeDissenters(transcript, verdict);
          setState(prev => ({
            ...prev,
            phase: 'verdict',
            verdict,
            stopReason: isUnanimous ? 'unanimous' : 'converged',
            dissenters,
          }));
          return;
        }

        // Call Chair
        const forced = round === MAX_ROUNDS;
        setState(prev => ({
          ...prev,
          phase: 'chair',
          chairStates: [
            ...prev.chairStates,
            { loading: true, stopRuleEvaluation: null, analystDirectives: null, chairJudgmentRationale: null },
          ],
        }));

        try {
          const chairRes = await fetch('/api/ai/chair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol,
              currentPrice: stockData.currentPrice,
              transcript,
              round,
              chairModelId,
              forced,
            }),
          });
          const chairData = await chairRes.json();
          if (!chairRes.ok) throw new Error(chairData.message || 'Chair failed');

          const chairRoundState = {
            loading: false,
            stopRuleEvaluation: chairData.stopRuleEvaluation,
            analystDirectives: chairData.analystDirectives,
            chairJudgmentRationale: chairData.stopRuleEvaluation?.chairJudgmentRationale ?? null,
          };

          setState(prev => ({
            ...prev,
            chairStates: [...prev.chairStates.slice(0, -1), chairRoundState],
          }));

          if (chairData.shouldStop && chairData.verdict) {
            const dissenters = computeDissenters(transcript, chairData.verdict);
            setState(prev => ({
              ...prev,
              phase: 'verdict',
              verdict: chairData.verdict,
              stopReason: forced ? 'max_rounds' : (chairData.stopRuleEvaluation?.unanimous ? 'unanimous' : chairData.stopRuleEvaluation?.converged ? 'converged' : 'chair'),
              dissenters,
            }));
            return;
          }

          currentDirectives = chairData.analystDirectives;
          setState(prev => ({ ...prev, phase: 'round' }));
        } catch (err) {
          // Chair failed — fall back to averaging last round
          const fallbackVerdict = averageAnalyses(
            latestRoundEntries.map(e => e.analysis),
            stockData.currentPrice,
          );
          const dissenters = computeDissenters(transcript, fallbackVerdict);
          setState(prev => ({
            ...prev,
            phase: 'verdict',
            verdict: fallbackVerdict,
            stopReason: 'max_rounds',
            dissenters,
            chairStates: prev.chairStates.map((s, i) =>
              i === prev.chairStates.length - 1
                ? { ...s, loading: false }
                : s,
            ),
          }));
          console.error('Chair failed, using fallback:', err);
          return;
        }
      }

      // Exhausted max rounds without Chair verdict (shouldn't happen but guard)
      const lastRoundEntries = transcript.filter(e => e.round === MAX_ROUNDS);
      if (lastRoundEntries.length > 0) {
        const fallback = averageAnalyses(
          lastRoundEntries.map(e => e.analysis),
          stockData.currentPrice,
        );
        setState(prev => ({
          ...prev,
          phase: 'verdict',
          verdict: fallback,
          stopReason: 'max_rounds',
          dissenters: computeDissenters(transcript, fallback),
        }));
      }
    },
    [],
  );

  return { state, runDebate, reset };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -20`
Expected: No errors from hook

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDebate.ts
git commit -m "feat: add useDebate hook for multi-round debate orchestration"
```

---

## Task 7: DebateTheater UI Component

Replaces `AiCouncilPanel` for debate mode. Shows round progress, analyst tiles (with position deltas), Chair commentary strip, and final verdict. Fully responsive.

**Files:**
- Create: `src/components/features/debate-theater.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/features/debate-theater.tsx

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  Minus,
  ChevronDown,
  ChevronUp,
  Check,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { COUNCIL_ROLE_LABELS } from './ai-council-panel';
import type { DebateState, DebateAnalystModel, ModelAnalysis, CouncilRole } from '@/lib/debate-types';

interface DebateTheaterProps {
  state: DebateState;
  analysts: DebateAnalystModel[];
  chairModelName: string;
}

function getPredictionLabel(p: string) {
  if (p === 'UP') return 'BUY';
  if (p === 'DOWN') return 'SELL';
  return 'HOLD';
}

function getPredictionColor(p: string) {
  if (p === 'UP') return 'text-green-400';
  if (p === 'DOWN') return 'text-red-400';
  return 'text-yellow-400';
}

function getScoreColor(score: number) {
  if (score >= 8) return 'text-green-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
}

function PositionDelta({ prev, curr }: { prev: string; curr: string }) {
  if (!prev || prev === curr) return null;
  return (
    <span className="text-[9px] text-amber-400 font-semibold ml-1">
      {getPredictionLabel(prev)}→{getPredictionLabel(curr)}
    </span>
  );
}

function RoundSteps({ currentRound, maxRounds, phase }: { currentRound: number; maxRounds: number; phase: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: maxRounds }, (_, i) => i + 1).map(r => {
        const done = r < currentRound || phase === 'verdict';
        const active = r === currentRound && phase !== 'verdict';
        return (
          <div key={r} className="flex items-center gap-1">
            <div
              className={cn(
                'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border',
                done
                  ? 'bg-purple-500/30 border-purple-500 text-purple-300'
                  : active
                  ? 'bg-purple-500/20 border-purple-500 text-purple-300 ring-1 ring-purple-500/50'
                  : 'bg-muted/20 border-border/40 text-muted-foreground',
              )}
            >
              {done ? <Check className="h-2.5 w-2.5" /> : r}
            </div>
            {r < maxRounds && (
              <div
                className={cn(
                  'h-px w-4',
                  r < currentRound || phase === 'verdict'
                    ? 'bg-purple-500/50'
                    : 'bg-border/30',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnalystTile({
  analyst,
  analystState,
  currentRound,
}: {
  analyst: DebateAnalystModel;
  analystState: DebateState['analystStates'][string];
  currentRound: number;
}) {
  const roleInfo = COUNCIL_ROLE_LABELS[analyst.role as CouncilRole];
  const rounds = analystState?.rounds ?? [];
  const current = rounds[rounds.length - 1];
  const prev = rounds.length >= 2 ? rounds[rounds.length - 2] : null;

  return (
    <div
      className={cn(
        'p-2.5 rounded-lg border transition-colors',
        analystState?.loading
          ? 'border-purple-500/30 bg-purple-500/5'
          : analystState?.error
          ? 'border-red-500/20 bg-red-500/5'
          : current
          ? 'border-border/40 bg-muted/10'
          : 'border-border/20 bg-muted/5',
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-foreground/80 truncate">
            {analyst.name.split(' ').slice(0, 2).join(' ')}
          </p>
          <p className={cn('text-[9px]', roleInfo?.color ?? 'text-muted-foreground')}>
            {roleInfo?.short ?? analyst.role}
          </p>
        </div>
        {analystState?.loading && <Spinner size="sm" />}
        {!analystState?.loading && current && (
          <Check className="h-3 w-3 text-green-400 shrink-0" />
        )}
        {analystState?.error && (
          <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
        )}
      </div>

      {current && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-xs font-bold font-mono', getScoreColor(current.score))}>
            {current.score}
          </span>
          <span className={cn('text-[10px] font-semibold', getPredictionColor(current.prediction))}>
            {getPredictionLabel(current.prediction)}
          </span>
          <span className="text-[10px] text-muted-foreground">{current.confidence}%</span>
          {prev && <PositionDelta prev={prev.prediction} curr={current.prediction} />}
        </div>
      )}

      {!current && !analystState?.loading && !analystState?.error && (
        <p className="text-[10px] text-muted-foreground">Waiting…</p>
      )}
      {analystState?.error && (
        <p className="text-[10px] text-red-400 truncate">{analystState.error}</p>
      )}
    </div>
  );
}

function ChairStrip({ chairState, round }: { chairState: DebateState['chairStates'][0]; round: number }) {
  const [open, setOpen] = useState(false);

  if (!chairState) return null;

  const rationale = chairState.chairJudgmentRationale;
  const directives = chairState.analystDirectives;
  const directiveCount = directives
    ? Object.values(directives).filter(Boolean).length
    : 0;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-amber-300">
            Chair after Round {round}
          </span>
          {chairState.loading && <Spinner size="sm" />}
          {!chairState.loading && directiveCount > 0 && (
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 py-0">
              {directiveCount} directive{directiveCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {open && !chairState.loading && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {rationale && (
                <p className="text-xs text-amber-200/70 italic">{rationale}</p>
              )}
              {directives && directiveCount > 0 && (
                <div className="space-y-1">
                  {(Object.entries(directives) as [CouncilRole, string | null][])
                    .filter(([, d]) => d)
                    .map(([role, directive]) => (
                      <div key={role} className="flex gap-1.5">
                        <span
                          className={cn(
                            'text-[9px] font-semibold shrink-0 mt-0.5',
                            COUNCIL_ROLE_LABELS[role]?.color ?? 'text-muted-foreground',
                          )}
                        >
                          {COUNCIL_ROLE_LABELS[role]?.short ?? role}:
                        </span>
                        <p className="text-[11px] text-foreground/70">{directive}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VerdictCard({ verdict, stopReason, dissenters }: {
  verdict: ModelAnalysis;
  stopReason: DebateState['stopReason'];
  dissenters: CouncilRole[];
}) {
  const scoreColor = getScoreColor(verdict.score);
  const predColor = getPredictionColor(verdict.prediction);
  const predLabel = getPredictionLabel(verdict.prediction);

  const stopLabels: Record<NonNullable<DebateState['stopReason']>, string> = {
    unanimous: 'Unanimous',
    converged: 'Converged',
    chair: 'Chair Verdict',
    max_rounds: 'Final Round',
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-300">Council Verdict</span>
          {stopReason && (
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 py-0">
              {stopLabels[stopReason]}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className={cn('relative flex items-center justify-center w-12 h-12 rounded-full border-2',
            verdict.score >= 8 ? 'bg-green-500/20 border-green-500' : verdict.score >= 5 ? 'bg-yellow-500/20 border-yellow-500' : 'bg-red-500/20 border-red-500',
          )}>
            <span className={cn('text-lg font-bold font-mono', scoreColor)}>{verdict.score}</span>
            <span className={cn('absolute -bottom-1 text-[9px] font-medium', scoreColor)}>/10</span>
          </div>
          <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border',
            verdict.prediction === 'UP' ? 'bg-green-500/10 border-green-500/30' : verdict.prediction === 'DOWN' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30',
          )}>
            {verdict.prediction === 'UP' ? <ArrowUpCircle className="h-4 w-4 text-green-400" /> : verdict.prediction === 'DOWN' ? <ArrowDownCircle className="h-4 w-4 text-red-400" /> : <Minus className="h-4 w-4 text-yellow-400" />}
            <span className={cn('text-base font-bold', predColor)}>{predLabel}</span>
          </div>
        </div>
      </div>

      <ul className="space-y-1 pl-3">
        {verdict.reasons.map((r, i) => (
          <li key={i} className="text-xs text-foreground/80 flex gap-2">
            <span className="text-amber-400 shrink-0">•</span>
            {r}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className={cn('p-2.5 rounded-lg border space-y-1',
          verdict.bottomFishing.recommended ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-muted/10 border-border/30',
        )}>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-cyan-400" />
            <span className="text-[10px] font-semibold text-cyan-400">BUY ENTRY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-mono">
              {verdict.bottomFishing.targetPrice ? `$${verdict.bottomFishing.targetPrice.toFixed(2)}` : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{verdict.bottomFishing.timing}</span>
          </div>
          {verdict.bottomFishing.rationale && (
            <p className="text-[10px] text-muted-foreground italic">{verdict.bottomFishing.rationale}</p>
          )}
        </div>
        <div className="p-2.5 rounded-lg border bg-green-500/5 border-green-500/20 space-y-1">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-green-400" />
            <span className="text-[10px] font-semibold text-green-400">SELL TARGET</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-mono text-green-400">
              ${verdict.priceTarget.targetPrice.toFixed(2)}
            </span>
            <span className="text-[10px] text-green-500/70">
              (+{verdict.priceTarget.expectedRise.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{verdict.priceTarget.timeframe}</span>
          </div>
          {verdict.priceTarget.exitStrategy && (
            <p className="text-[10px] text-muted-foreground italic">{verdict.priceTarget.exitStrategy}</p>
          )}
        </div>
      </div>

      {verdict.riskFactors.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <span className="text-xs font-medium">Risk Factors</span>
          </div>
          <ul className="pl-3 space-y-0.5">
            {verdict.riskFactors.map((f, i) => (
              <li key={i} className="text-xs text-foreground/70 flex gap-1.5">
                <span className="text-red-400 shrink-0">•</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dissenters.length > 0 && (
        <div className="pt-1 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold text-orange-400">Dissent:</span>{' '}
            {dissenters.map(r => COUNCIL_ROLE_LABELS[r]?.short ?? r).join(', ')} voted opposite
          </p>
        </div>
      )}
    </div>
  );
}

export function DebateTheater({ state, analysts, chairModelName }: DebateTheaterProps) {
  const { phase, currentRound, maxRounds, analystStates, chairStates, verdict, stopReason, dissenters } = state;

  const roundsToShow = phase === 'idle' ? [] : Array.from(
    { length: phase === 'verdict' ? maxRounds : currentRound },
    (_, i) => i + 1,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-foreground/80">Council Debate</span>
          <RoundSteps currentRound={currentRound} maxRounds={maxRounds} phase={phase} />
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-amber-400" />
          <span className="text-[10px] text-muted-foreground">
            Chair: {chairModelName.split('/').pop()?.split('-').slice(0, 2).join('-') ?? chairModelName}
          </span>
          {(phase === 'round' || phase === 'chair') && (
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
      </div>

      {/* Rounds */}
      {roundsToShow.map(round => {
        const chairState = chairStates[round - 1];
        const isCurrentRound = round === currentRound;
        const isComplete = round < currentRound || phase === 'verdict';

        return (
          <div key={round} className="space-y-2">
            {/* Round label */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Round {round}
              </span>
              <div className="flex-1 h-px bg-border/20" />
              <span className={cn(
                'text-[10px]',
                isComplete ? 'text-green-400' : isCurrentRound && phase === 'round' ? 'text-purple-400' : 'text-muted-foreground',
              )}>
                {isComplete ? 'complete' : phase === 'chair' && isCurrentRound ? 'chair evaluating…' : 'in progress'}
              </span>
            </div>

            {/* Analyst tiles — responsive grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {analysts.map(analyst => (
                <AnalystTile
                  key={analyst.id}
                  analyst={analyst}
                  analystState={analystStates[analyst.id]}
                  currentRound={round}
                />
              ))}
            </div>

            {/* Chair strip for this round */}
            {chairState && <ChairStrip chairState={chairState} round={round} />}
          </div>
        );
      })}

      {/* Verdict */}
      <AnimatePresence>
        {phase === 'verdict' && verdict && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <VerdictCard verdict={verdict} stopReason={stopReason} dissenters={dissenters} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {phase === 'error' && state.error && (
        <p className="text-sm text-red-400 text-center py-4">{state.error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -20`
Expected: No errors from DebateTheater

- [ ] **Step 3: Commit**

```bash
git add src/components/features/debate-theater.tsx
git commit -m "feat: add DebateTheater UI component"
```

---

## Task 8: Wire Debate into StockAnalyzer

Add Chair model selector to the council setup UI, wire `useDebate` hook, replace `runCouncil` call with `runDebate`, show `DebateTheater` instead of `AiCouncilPanel` for council results.

**Files:**
- Modify: `src/components/features/stock-analyzer.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/features/stock-analyzer.tsx`, add these imports after the existing ones:

```typescript
import { useDebate } from '@/hooks/useDebate';
import { DebateTheater } from './debate-theater';
import type { DebateAnalystModel } from '@/lib/debate-types';
```

- [ ] **Step 2: Add Chair model state and useDebate hook**

In the component body, after the line `const [customCouncilInput, setCustomCouncilInput] = useState('');` (around line 163), add:

```typescript
const [chairModelId, setChairModelId] = useState<string>('');
const [customChairInput, setCustomChairInput] = useState('');
const { state: debateState, runDebate, reset: resetDebate } = useDebate();
```

The `chairModelId` defaults to empty string — in the `runDebate` call we'll fall back to `defaultAI.id` when empty.

- [ ] **Step 3: Add runDebate handler**

After the existing `retryCouncilModel` callback (around line 496), add:

```typescript
const handleRunDebate = useCallback(async () => {
  if (!stockData || selectedCouncilModels.length === 0) return;

  const ROLES: import('./ai-council-panel').CouncilRole[] = [
    'technical', 'fundamental', 'sentiment', 'contrarian', 'risk',
  ];

  const analysts: DebateAnalystModel[] = selectedCouncilModels.map((id, idx) => {
    const known = AI_MODELS.find(m => m.id === id);
    return {
      id,
      name: known?.name ?? id,
      role: ROLES[idx % ROLES.length],
    };
  });

  setShowCouncilPanel(true);
  setAiActiveTab('council');

  await runDebate(
    analysts,
    {
      name: stockData.name,
      currentPrice: stockData.currentPrice,
      change: stockData.change,
      changePercent: stockData.changePercent,
      dayHigh: stockData.dayHigh,
      dayLow: stockData.dayLow,
      volume: stockData.volume,
      sharpeRatio: stockData.sharpeRatio,
      trend: stockData.trend,
    },
    stockData.symbol,
    chairModelId || defaultAI.id,
  );
}, [stockData, selectedCouncilModels, chairModelId, defaultAI.id, runDebate, AI_MODELS]);
```

- [ ] **Step 4: Reset debate state when stock changes**

Find the `fetchStockData` function. After `setCouncilSummaryAnalysis(null);` (around line 516), add:

```typescript
resetDebate();
```

- [ ] **Step 5: Add Chair model selector to council setup UI**

Find the "Run Council" button block in the JSX (around line 1094). After the custom council model input block and before the Run Council Button, add this Chair selector:

```tsx
{/* Chair model selector */}
<div className="space-y-1 pt-1 border-t border-border/20">
  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
    Chair Model
  </p>
  <div className="flex gap-1">
    <Input
      placeholder={`default: ${defaultAI.name.split(' ').slice(0, 2).join(' ')}`}
      value={customChairInput}
      onChange={e => setCustomChairInput(e.target.value)}
      onBlur={() => setChairModelId(customChairInput.trim())}
      className="h-7 text-xs flex-1 border-amber-500/20 bg-transparent placeholder:text-muted-foreground/50"
    />
  </div>
  <p className="text-[9px] text-muted-foreground">
    Any OpenRouter model ID. Cannot be an analyst model.
  </p>
</div>
```

- [ ] **Step 6: Replace Run Council button with Run Debate button**

Find the existing Run Council button (around line 1094):

```tsx
<Button
  size="sm"
  className="w-full h-7 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30"
  variant="outline"
  disabled={selectedCouncilModels.length < 2}
  onClick={() => {
    runCouncil();
    setShowAiDropdown(false);
  }}
>
  <Users className="h-3.5 w-3.5 mr-1" />
  Run Council ({selectedCouncilModels.length}/5)
</Button>
```

Replace with:

```tsx
<Button
  size="sm"
  className="w-full h-7 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30"
  variant="outline"
  disabled={selectedCouncilModels.length < 2 || debateState.phase === 'round' || debateState.phase === 'chair'}
  onClick={() => {
    handleRunDebate();
    setShowAiDropdown(false);
  }}
>
  <Users className="h-3.5 w-3.5 mr-1" />
  {debateState.phase === 'round' || debateState.phase === 'chair'
    ? 'Debating…'
    : `Run Debate (${selectedCouncilModels.length}/5)`}
</Button>
```

- [ ] **Step 7: Replace AiCouncilPanel with DebateTheater in the results section**

Find the council results section in the JSX. Search for `{aiActiveTab === 'council' && showCouncilPanel && (` and the `<AiCouncilPanel` that follows it.

Replace the entire `AiCouncilPanel` usage block with:

```tsx
{aiActiveTab === 'council' && showCouncilPanel && (
  <DebateTheater
    state={debateState}
    analysts={selectedCouncilModels.map((id, idx) => {
      const ROLES: import('./ai-council-panel').CouncilRole[] = [
        'technical', 'fundamental', 'sentiment', 'contrarian', 'risk',
      ];
      const known = AI_MODELS.find(m => m.id === id);
      return {
        id,
        name: known?.name ?? id,
        role: ROLES[idx % ROLES.length],
      };
    })}
    chairModelName={chairModelId || defaultAI.name}
  />
)}
```

- [ ] **Step 8: Verify full build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -30`
Expected: Clean build (no TypeScript errors)

- [ ] **Step 9: Start dev server and test**

Run: `npm run dev`

Test the following manually:
1. Search for `AAPL`
2. Open AI dropdown → select 2-3 council analyst models
3. Leave Chair model blank (defaults to defaultAI)
4. Click "Run Debate"
5. Verify: analyst tiles appear, spinners show per analyst, tiles update as each completes
6. Verify: Chair commentary strip appears after round 1 with rationale + directives
7. Verify: If debate continues to round 2, round 2 tiles appear
8. Verify: Final Verdict card appears with amber glow when debate ends
9. Verify: Dissent note shows if any analyst voted opposite
10. Verify: Mobile layout stacks tiles vertically (resize browser to < 640px)

- [ ] **Step 10: Commit**

```bash
git add src/components/features/stock-analyzer.tsx
git commit -m "feat: wire debate mode into StockAnalyzer with Chair selector"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Dynamic rounds, max 3 | Task 6 (useDebate loop) |
| Stop on unanimous | Task 3 + Task 6 (checkUnanimous fast-path) |
| Stop on converged (spread < 15) | Task 3 + Task 6 (checkConverged fast-path) |
| Stop on Chair judgment | Task 5 (chair route) + Task 6 |
| Stop on max_rounds (forced verdict) | Task 5 (`forced: true`) + Task 6 |
| Per-analyst directives (not shared challenge) | Task 5 (`analystDirectives` per role) |
| stopRuleEvaluation chain-of-thought | Task 5 (required in schema) |
| Chair bias toward rigor | Task 5 (system prompt) |
| Mutual exclusion enforcement | Task 5 (server-side enforcement after parse) |
| Chair excluded from analyst pool | Task 8 (separate selector, Chair ID not in analyst array) |
| Alpha Vantage shared cache | Task 2 (extracted to shared lib) |
| Transcript passed each round | Task 4 + Task 6 |
| Analyst sees directive in round 2+ | Task 4 (`directiveSection`) + Task 6 |
| Position delta UI | Task 7 (`PositionDelta` component) |
| Chair commentary strip (collapsible) | Task 7 (`ChairStrip`) |
| Responsive: mobile stack | Task 7 (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`) |
| Responsive: tablet 2-col | Task 7 (sm breakpoint) |
| Responsive: desktop theater | Task 7 (lg breakpoint) |
| Fallback to averaging if Chair fails | Task 6 (catch block) |
| Analyst error = excluded, debate continues | Task 6 (errors don't stop loop) |
| Verdict card with stopReason badge | Task 7 (`VerdictCard`) |
| Dissent note | Task 7 (dissenters list under verdict) |
