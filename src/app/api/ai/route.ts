import { NextRequest, NextResponse } from "next/server";
import { validateSymbol } from "@/lib/validation";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface AIRequestBody {
  symbol: string;
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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured", message: "OpenRouter API key is not set" },
        { status: 500 }
      );
    }

    const body: AIRequestBody = await request.json();

    // Validate symbol
    const symbol = validateSymbol(body.symbol);
    if (!symbol) {
      return NextResponse.json(
        { error: "Invalid symbol", message: "Stock symbol is invalid" },
        { status: 400 }
      );
    }

    const { stockData } = body;

    // Create the analysis prompt - requesting JSON format
    const systemPrompt = `You are an expert financial analyst. Analyze stocks and respond ONLY with valid JSON in this exact format:

{
  "score": <number 1-10>,
  "reasons": ["<short bullet 1>", "<short bullet 2>", "<short bullet 3>"],
  "factors": ["<short bullet 1>", "<short bullet 2>", "<short bullet 3>"]
}

Rules:
- score: 8-10 = Strong Buy (green), 5-7 = Hold (yellow), 1-4 = Caution (red)
- reasons: exactly 3 SHORT bullet points (max 15 words each) explaining the score
- factors: exactly 3 SHORT bullet points (max 15 words each) for things to watch

Be extremely concise. No long sentences. Just key points.

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks.`;

    const userPrompt = `Analyze this stock and provide your investment assessment:

Stock: ${symbol} (${stockData.name})
Current Price: $${stockData.currentPrice.toFixed(2)}
Daily Change: ${stockData.change >= 0 ? "+" : ""}$${stockData.change.toFixed(2)} (${stockData.changePercent >= 0 ? "+" : ""}${stockData.changePercent.toFixed(2)}%)
Day High: $${stockData.dayHigh.toFixed(2)}
Day Low: $${stockData.dayLow.toFixed(2)}
Volume: ${formatVolume(stockData.volume)}
5-Day Sharpe Ratio: ${stockData.sharpeRatio.toFixed(2)}
Current Trend: ${stockData.trend.charAt(0).toUpperCase() + stockData.trend.slice(1)}

Provide your JSON response:`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stocky-ahh - Stock Trend Analyzer",
      },
      body: JSON.stringify({
        model: "x-ai/grok-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenRouter API error:", errorData);
      return NextResponse.json(
        { error: "AI service error", message: "Failed to get AI analysis" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      return NextResponse.json(
        { error: "Empty response", message: "AI returned no analysis" },
        { status: 500 }
      );
    }

    // Parse the JSON response from AI
    let parsedAnalysis;
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.slice(7);
      } else if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith("```")) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      cleanedResponse = cleanedResponse.trim();

      parsedAnalysis = JSON.parse(cleanedResponse);

      // Validate the structure
      if (typeof parsedAnalysis.score !== "number" || parsedAnalysis.score < 1 || parsedAnalysis.score > 10) {
        throw new Error("Invalid score");
      }
      if (!Array.isArray(parsedAnalysis.reasons) || !Array.isArray(parsedAnalysis.factors)) {
        throw new Error("Invalid structure");
      }
    } catch {
      console.error("Failed to parse AI response:", aiResponse);
      // Fallback response if parsing fails
      parsedAnalysis = {
        score: 5,
        reasons: [
          "Unable to fully analyze at this moment",
          "Data suggests a neutral position",
          "Consider additional research before investing"
        ],
        factors: [
          "Monitor price volatility and volume",
          "Watch for upcoming earnings reports",
          "Track overall market conditions"
        ],
      };
    }

    return NextResponse.json({
      analysis: parsedAnalysis,
      model: data.model || "x-ai/grok-4",
      usage: data.usage,
    });
  } catch (error) {
    console.error("AI API error:", error);
    return NextResponse.json(
      { error: "Server error", message: "Failed to process AI request" },
      { status: 500 }
    );
  }
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return (volume / 1_000_000_000).toFixed(2) + "B";
  }
  if (volume >= 1_000_000) {
    return (volume / 1_000_000).toFixed(2) + "M";
  }
  if (volume >= 1_000) {
    return (volume / 1_000).toFixed(2) + "K";
  }
  return volume.toString();
}
