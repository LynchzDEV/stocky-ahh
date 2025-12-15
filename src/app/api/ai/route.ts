import { NextRequest, NextResponse } from "next/server";
import { validateSymbol } from "@/lib/validation";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Cache configuration
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour in milliseconds

interface CacheEntry {
  analysis: AIAnalysis;
  timestamp: number;
  stockPrice: number;
}

interface AIAnalysis {
  score: number;
  prediction: string;
  confidence: number;
  reasons: string[];
  bottomFishing: {
    recommended: boolean;
    targetPrice: number | null;
    timing: string;
    rationale: string;
  };
  priceTarget: {
    expectedRise: number;
    targetPrice: number;
    timeframe: string;
    exitStrategy: string;
  };
  riskFactors: string[];
}

// In-memory cache (will reset on server restart)
const analysisCache = new Map<string, CacheEntry>();

interface AIRequestBody {
  symbol: string;
  forceRefresh?: boolean;
  model?: string;
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

    const { stockData, forceRefresh, model } = body;

    // Default to Gemini 2.5 Flash if no model specified
    const selectedModel = model || "google/gemini-2.5-flash";

    // Check cache (unless force refresh is requested)
    if (!forceRefresh) {
      const cached = analysisCache.get(symbol);
      if (cached) {
        const now = Date.now();
        const age = now - cached.timestamp;

        // Return cached if within 1 hour
        if (age < CACHE_DURATION_MS) {
          const cachedAt = new Date(cached.timestamp);
          return NextResponse.json({
            analysis: cached.analysis,
            model: selectedModel,
            cached: true,
            cachedAt: cachedAt.toISOString(),
            expiresIn: Math.round((CACHE_DURATION_MS - age) / 1000 / 60), // minutes remaining
          });
        }
      }
    }

    // Get today's date for context
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create the analysis prompt - requesting JSON format
    const systemPrompt = `You are an expert financial analyst and market predictor with access to current market data. Today is ${today}.

IMPORTANT: Base your analysis on:
1. CURRENT real-time price data provided
2. RECENT news and events affecting this stock (last 24-48 hours)
3. Current market sentiment and sector trends
4. Recent earnings reports, analyst ratings, and institutional activity
5. Technical indicators and price patterns

Analyze stocks using the provided current data AND your knowledge of recent market news/events to provide actionable investment predictions. Respond ONLY with valid JSON in this exact format:

{
  "score": <number 1-10>,
  "prediction": "<UP or DOWN>",
  "confidence": <number 1-100>,
  "reasons": ["<short bullet 1>", "<short bullet 2>", "<short bullet 3>"],
  "bottomFishing": {
    "recommended": <boolean>,
    "targetPrice": <number - ALWAYS provide a specific price, use current price minus 3-10% as entry target>,
    "timing": "<description of when to buy, e.g., 'Now', 'Wait for pullback to $XX', 'Within 1-2 weeks'>",
    "rationale": "<short explanation>"
  },
  "priceTarget": {
    "expectedRise": <percentage number>,
    "targetPrice": <number>,
    "timeframe": "<e.g., '1-2 weeks', '1 month', '3 months'>",
    "exitStrategy": "<when to sell, e.g., 'Sell at $XXX or if drops below $XXX'>"
  },
  "riskFactors": ["<risk 1>", "<risk 2>", "<risk 3>"]
}

Rules:
- score: 8-10 = Strong Buy (green), 5-7 = Hold (yellow), 1-4 = Caution (red)
- prediction: Based on current data, recent news, and market trends, predict if this stock will go UP or DOWN in the near term
- confidence: How confident you are in the prediction (1-100%)
- reasons: exactly 3 SHORT bullet points (max 15 words each) - MUST reference recent news/events when relevant
- bottomFishing: 
  * ALWAYS provide a specific targetPrice number (never null)
  * Calculate entry price based on current price: suggest 3-10% below current price for optimal entry
  * If stock is in uptrend, suggest waiting for pullback to specific price level
  * If stock is near bottom, recommend buying now or soon at current levels
- priceTarget: Predict how much the stock will rise, target price, timeframe, and when to exit
- riskFactors: exactly 3 SHORT bullet points about key risks including any current market concerns

Be specific with numbers. Reference recent news/catalysts. Give actionable advice based on TODAY's market conditions.

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks.`;

    const userPrompt = `Analysis Date: ${today}

Analyze this stock using current market data and recent news. Provide your investment prediction with bottom fishing and exit timing:

Stock: ${symbol} (${stockData.name})
Current Price: $${stockData.currentPrice.toFixed(2)}
Daily Change: ${stockData.change >= 0 ? "+" : ""}$${stockData.change.toFixed(2)} (${stockData.changePercent >= 0 ? "+" : ""}${stockData.changePercent.toFixed(2)}%)
Day High: $${stockData.dayHigh.toFixed(2)}
Day Low: $${stockData.dayLow.toFixed(2)}
Volume: ${formatVolume(stockData.volume)}
5-Day Sharpe Ratio: ${stockData.sharpeRatio.toFixed(2)}
Current Trend: ${stockData.trend.charAt(0).toUpperCase() + stockData.trend.slice(1)}

Consider any recent news, earnings, analyst ratings, or market events affecting ${symbol}. Provide your JSON response:`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stocky-ahh - Stock Trend Analyzer",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenRouter API error:", errorData);

      // Handle specific error cases
      if (response.status === 403) {
        const errorMessage = errorData?.error?.message || "";
        if (errorMessage.includes("limit exceeded")) {
          return NextResponse.json(
            { error: "Rate limit exceeded", message: "AI API daily limit reached. Please try again tomorrow or upgrade your API plan." },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: "Access denied", message: "AI API access denied. Please check your API key configuration." },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: "AI service error", message: "Failed to get AI analysis. Please try again later." },
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
      if (!Array.isArray(parsedAnalysis.reasons) || !Array.isArray(parsedAnalysis.riskFactors)) {
        throw new Error("Invalid structure");
      }
      if (!parsedAnalysis.prediction || !parsedAnalysis.bottomFishing || !parsedAnalysis.priceTarget) {
        throw new Error("Missing prediction data");
      }
    } catch {
      console.error("Failed to parse AI response:", aiResponse);
      // Fallback response if parsing fails
      parsedAnalysis = {
        score: 5,
        prediction: "HOLD",
        confidence: 50,
        reasons: [
          "Unable to fully analyze at this moment",
          "Data suggests a neutral position",
          "Consider additional research before investing"
        ],
        bottomFishing: {
          recommended: false,
          targetPrice: stockData.currentPrice * 0.95, // 5% below current price as entry target
          timing: "Wait for pullback",
          rationale: "Consider entry at lower price levels"
        },
        priceTarget: {
          expectedRise: 0,
          targetPrice: stockData.currentPrice,
          timeframe: "Unknown",
          exitStrategy: "Monitor and reassess based on market conditions"
        },
        riskFactors: [
          "Monitor price volatility and volume",
          "Watch for upcoming earnings reports",
          "Track overall market conditions"
        ],
      };
    }

    // Save to cache
    analysisCache.set(symbol, {
      analysis: parsedAnalysis,
      timestamp: Date.now(),
      stockPrice: stockData.currentPrice,
    });

    return NextResponse.json({
      analysis: parsedAnalysis,
      model: data.model || selectedModel,
      usage: data.usage,
      cached: false,
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
