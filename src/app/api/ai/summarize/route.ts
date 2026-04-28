import { NextRequest, NextResponse } from 'next/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

interface AnalysisEntry {
  modelId: string;
  modelName: string;
  analysis: {
    score: number;
    prediction: string;
    confidence: number;
    reasons: string[];
    bottomFishing: { targetPrice: number | null; timing: string };
    priceTarget: {
      targetPrice: number;
      expectedRise: number;
      timeframe: string;
      exitStrategy: string;
    };
    riskFactors: string[];
  };
}

interface SummarizeRequest {
  symbol: string;
  currentPrice: number;
  analyses: AnalysisEntry[];
  defaultModel: string;
}

export async function POST(request: NextRequest) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return NextResponse.json(
      { error: 'No API key configured' },
      { status: 500 },
    );
  }

  let body: SummarizeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const { symbol, currentPrice, analyses, defaultModel } = body;

  if (!symbol || typeof currentPrice !== 'number' || !defaultModel) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    );
  }

  if (!analyses || analyses.length === 0) {
    return NextResponse.json(
      { error: 'No analyses provided' },
      { status: 400 },
    );
  }

  const analysisText = analyses
    .map(
      a =>
        `[${a.modelName}] Score: ${a.analysis.score}/10 | ${a.analysis.prediction} (${a.analysis.confidence}% confidence)
Entry: $${a.analysis.bottomFishing.targetPrice?.toFixed(2) ?? 'N/A'} | Target: $${a.analysis.priceTarget.targetPrice.toFixed(2)} (+${a.analysis.priceTarget.expectedRise.toFixed(1)}%) | ${a.analysis.priceTarget.timeframe}
Reasons: ${a.analysis.reasons.join('; ')}
Risks: ${a.analysis.riskFactors.join('; ')}`,
    )
    .join('\n\n');

  const avgScore =
    analyses.reduce((sum, a) => sum + a.analysis.score, 0) / analyses.length;
  const avgPrice =
    analyses.reduce(
      (sum, a) => sum + (a.analysis.priceTarget.targetPrice || currentPrice),
      0,
    ) / analyses.length;
  const avgRise =
    analyses.reduce(
      (sum, a) => sum + (a.analysis.priceTarget.expectedRise || 0),
      0,
    ) / analyses.length;
  const avgEntry =
    analyses.reduce(
      (sum, a) => sum + (a.analysis.bottomFishing.targetPrice || currentPrice),
      0,
    ) / analyses.length;

  const prompt = `You are a senior financial analyst synthesizing ${analyses.length} independent AI analyses for ${symbol} at $${currentPrice}.

${analysisText}

Synthesize these analyses into a consensus view. Return ONLY valid JSON (no markdown, no explanation):
{
  "score": ${Math.round(avgScore)},
  "prediction": "<UP or DOWN or HOLD — pick the majority view>",
  "confidence": <weighted average confidence 0-100>,
  "reasons": ["<consensus point 1>", "<consensus point 2>", "<consensus point 3>"],
  "bottomFishing": {
    "recommended": <true if majority recommend buying>,
    "targetPrice": ${avgEntry.toFixed(2)},
    "timing": "<consensus timing e.g. 'Near-term' or 'Wait for dip'>",
    "rationale": "<one sentence consensus buy rationale>"
  },
  "priceTarget": {
    "expectedRise": ${avgRise.toFixed(1)},
    "targetPrice": ${avgPrice.toFixed(2)},
    "timeframe": "<consensus timeframe>",
    "exitStrategy": "<one sentence consensus exit strategy>"
  },
  "riskFactors": ["<consensus risk 1>", "<consensus risk 2>", "<consensus risk 3>"]
}`;

  try {
    const openrouter = createOpenRouter({ apiKey: openRouterKey });
    const { text } = await generateText({
      model: openrouter(defaultModel),
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 600,
      temperature: 0.3,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Failed to parse council summary' },
        { status: 500 },
      );
    }
    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error('Summarize error:', err);
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 },
    );
  }
}
