// src/app/api/ai/debate-round/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { jsonrepair } from 'jsonrepair';
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

  const openrouter = createOpenRouter({ apiKey: openRouterKey });

  async function callModel() {
    const { text } = await generateText({
      model: openrouter(model),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxOutputTokens: 1500,
      temperature: 0.7,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');

    const analysis = JSON.parse(jsonrepair(jsonMatch[0]));

    if (
      typeof analysis.score !== 'number' ||
      !['UP', 'DOWN', 'HOLD'].includes(analysis.prediction) ||
      !Array.isArray(analysis.reasons)
    ) {
      throw new Error('Invalid analysis structure');
    }

    return analysis;
  }

  try {
    let analysis;
    try {
      analysis = await callModel();
    } catch {
      analysis = await callModel();
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
