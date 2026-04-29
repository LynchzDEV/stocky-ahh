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
