import { NextRequest, NextResponse } from "next/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

interface AnalysisEntry {
  modelId: string;
  modelName: string;
  analysis: {
    score: number;
    prediction: string;
    confidence: number;
    reasons: string[];
    bottomFishing: { targetPrice: number | null; timing: string };
    priceTarget: { targetPrice: number; expectedRise: number; timeframe: string; exitStrategy: string };
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
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  let body: SummarizeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { symbol, currentPrice, analyses, defaultModel } = body;

  if (!analyses || analyses.length === 0) {
    return NextResponse.json({ error: "No analyses provided" }, { status: 400 });
  }

  const analysisText = analyses
    .map(
      (a) =>
        `[${a.modelName}] Score: ${a.analysis.score}/10 | ${a.analysis.prediction} (${a.analysis.confidence}% confidence)
Entry: $${a.analysis.bottomFishing.targetPrice?.toFixed(2) ?? "N/A"} | Target: $${a.analysis.priceTarget.targetPrice.toFixed(2)} (+${a.analysis.priceTarget.expectedRise.toFixed(1)}%) | ${a.analysis.priceTarget.timeframe}
Reasons: ${a.analysis.reasons.join("; ")}
Risks: ${a.analysis.riskFactors.join("; ")}`
    )
    .join("\n\n");

  const prompt = `You are a senior financial analyst synthesizing ${analyses.length} independent AI analyses for ${symbol} at $${currentPrice}.

${analysisText}

Write a 3-4 sentence council summary covering:
1. Key points of agreement between models
2. Notable disagreements and which view is stronger
3. Final recommendation (Buy / Hold / Sell) with one-sentence rationale

Plain text only, no JSON, no markdown headers, no bullet points.`;

  try {
    const openrouter = createOpenRouter({ apiKey: openRouterKey });
    const { text } = await generateText({
      model: openrouter(defaultModel),
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: 400,
      temperature: 0.5,
    });

    return NextResponse.json({ summary: text });
  } catch (err) {
    console.error("Summarize error:", err);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
