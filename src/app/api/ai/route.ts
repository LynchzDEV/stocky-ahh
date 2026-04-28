import { NextRequest, NextResponse } from "next/server";
import { validateSymbol } from "@/lib/validation";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

// Cache configuration
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour for AI analysis
const ALPHA_VANTAGE_CACHE_MS = 15 * 60 * 1000; // 15 minutes for Alpha Vantage data
const FUNDAMENTALS_CACHE_MS = 60 * 60 * 1000; // 1 hour for fundamentals (changes less often)

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

// In-memory caches
const analysisCache = new Map<string, CacheEntry>();
const alphaVantageCache = new Map<string, { data: unknown; timestamp: number }>();

type CouncilRole = 'technical' | 'fundamental' | 'sentiment' | 'contrarian' | 'risk';

interface AIRequestBody {
  symbol: string;
  forceRefresh?: boolean;
  model?: string;
  councilRole?: CouncilRole;
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

// Alpha Vantage data interfaces
interface RSIData {
  value: number;
  signal: string;
}

interface MACDData {
  macd: number;
  signal: number;
  histogram: number;
  trend: string;
}

interface CompanyOverview {
  marketCap: string;
  peRatio: string;
  eps: string;
  fiftyTwoWeekHigh: string;
  fiftyTwoWeekLow: string;
  dividendYield: string;
  sector: string;
  industry: string;
}

interface NewsSentiment {
  title: string;
  sentiment: string;
  score: number;
  source: string;
  timeAgo: string;
}

// Helper to get cached Alpha Vantage data
function getCachedData<T>(key: string, maxAge: number): T | null {
  const cached = alphaVantageCache.get(key);
  if (cached && Date.now() - cached.timestamp < maxAge) {
    return cached.data as T;
  }
  return null;
}

// Helper to set cached data
function setCachedData(key: string, data: unknown): void {
  alphaVantageCache.set(key, { data, timestamp: Date.now() });
}

// Fetch RSI from Alpha Vantage
async function fetchRSI(symbol: string, apiKey: string): Promise<RSIData | null> {
  const cacheKey = `rsi_${symbol}`;
  const cached = getCachedData<RSIData>(cacheKey, ALPHA_VANTAGE_CACHE_MS);
  if (cached) return cached;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note || data.Information || !data["Technical Analysis: RSI"]) {
      return null;
    }

    const rsiData = data["Technical Analysis: RSI"];
    const latestDate = Object.keys(rsiData)[0];
    const rsiValue = parseFloat(rsiData[latestDate].RSI);

    let signal = "Neutral";
    if (rsiValue >= 70) signal = "Overbought";
    else if (rsiValue >= 60) signal = "Bullish";
    else if (rsiValue <= 30) signal = "Oversold";
    else if (rsiValue <= 40) signal = "Bearish";

    const result: RSIData = { value: rsiValue, signal };
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Failed to fetch RSI:", error);
    return null;
  }
}

// Fetch MACD from Alpha Vantage
async function fetchMACD(symbol: string, apiKey: string): Promise<MACDData | null> {
  const cacheKey = `macd_${symbol}`;
  const cached = getCachedData<MACDData>(cacheKey, ALPHA_VANTAGE_CACHE_MS);
  if (cached) return cached;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note || data.Information || !data["Technical Analysis: MACD"]) {
      return null;
    }

    const macdData = data["Technical Analysis: MACD"];
    const latestDate = Object.keys(macdData)[0];
    const latest = macdData[latestDate];

    const macd = parseFloat(latest.MACD);
    const signal = parseFloat(latest.MACD_Signal);
    const histogram = parseFloat(latest.MACD_Hist);

    let trend = "Neutral";
    if (histogram > 0 && macd > signal) trend = "Bullish";
    else if (histogram < 0 && macd < signal) trend = "Bearish";

    const result: MACDData = { macd, signal, histogram, trend };
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Failed to fetch MACD:", error);
    return null;
  }
}

// Fetch Company Overview from Alpha Vantage
async function fetchCompanyOverview(symbol: string, apiKey: string): Promise<CompanyOverview | null> {
  const cacheKey = `overview_${symbol}`;
  const cached = getCachedData<CompanyOverview>(cacheKey, FUNDAMENTALS_CACHE_MS);
  if (cached) return cached;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note || data.Information || !data.Symbol) {
      return null;
    }

    const result: CompanyOverview = {
      marketCap: formatMarketCap(data.MarketCapitalization),
      peRatio: data.PERatio || "N/A",
      eps: data.EPS || "N/A",
      fiftyTwoWeekHigh: data["52WeekHigh"] || "N/A",
      fiftyTwoWeekLow: data["52WeekLow"] || "N/A",
      dividendYield: data.DividendYield ? `${(parseFloat(data.DividendYield) * 100).toFixed(2)}%` : "N/A",
      sector: data.Sector || "N/A",
      industry: data.Industry || "N/A",
    };
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Failed to fetch company overview:", error);
    return null;
  }
}

// Fetch News Sentiment from Alpha Vantage
async function fetchNewsSentiment(symbol: string, apiKey: string): Promise<{ items: NewsSentiment[]; overall: number } | null> {
  const cacheKey = `news_${symbol}`;
  const cached = getCachedData<{ items: NewsSentiment[]; overall: number }>(cacheKey, ALPHA_VANTAGE_CACHE_MS);
  if (cached) return cached;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=NEWS_SENTIMENT&tickers=${symbol}&limit=5&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Note || data.Information || !data.feed) {
      return null;
    }

    let totalScore = 0;
    const items: NewsSentiment[] = data.feed.slice(0, 3).map((item: Record<string, unknown>) => {
      const tickerSentiment = (item.ticker_sentiment as Array<{ ticker: string; ticker_sentiment_score: string; ticker_sentiment_label: string }>) || [];
      const symbolSentiment = tickerSentiment.find(t => t.ticker === symbol);
      const score = parseFloat(symbolSentiment?.ticker_sentiment_score || item.overall_sentiment_score as string || "0");
      totalScore += score;

      return {
        title: (item.title as string)?.slice(0, 80) + ((item.title as string)?.length > 80 ? "..." : ""),
        sentiment: mapSentimentLabel(symbolSentiment?.ticker_sentiment_label || item.overall_sentiment_label as string || "Neutral"),
        score,
        source: item.source as string,
        timeAgo: formatTimeAgo(item.time_published as string),
      };
    });

    const result = { items, overall: items.length > 0 ? totalScore / items.length : 0 };
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Failed to fetch news sentiment:", error);
    return null;
  }
}

function mapSentimentLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("bullish")) return "Bullish";
  if (lower.includes("bearish")) return "Bearish";
  return "Neutral";
}

function formatMarketCap(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "N/A";
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
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return (volume / 1_000_000_000).toFixed(2) + "B";
  if (volume >= 1_000_000) return (volume / 1_000_000).toFixed(2) + "M";
  if (volume >= 1_000) return (volume / 1_000).toFixed(2) + "K";
  return volume.toString();
}

export async function POST(request: NextRequest) {
  try {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;

    if (!openRouterKey) {
      return NextResponse.json(
        { error: "API key not configured", message: "OpenRouter API key is not set" },
        { status: 500 }
      );
    }

    const body: AIRequestBody = await request.json();

    const symbol = validateSymbol(body.symbol);
    if (!symbol) {
      return NextResponse.json(
        { error: "Invalid symbol", message: "Stock symbol is invalid" },
        { status: 400 }
      );
    }

    const { stockData, forceRefresh, model, councilRole } = body;
    const selectedModel = model || "google/gemini-2.5-flash";
    const cacheKey = councilRole
      ? `${symbol}:${selectedModel}:${councilRole}`
      : `${symbol}:${selectedModel}`;

    // Check cache (unless force refresh is requested)
    if (!forceRefresh) {
      const cached = analysisCache.get(cacheKey);
      if (cached) {
        const now = Date.now();
        const age = now - cached.timestamp;

        if (age < CACHE_DURATION_MS) {
          const cachedAt = new Date(cached.timestamp);
          return NextResponse.json({
            analysis: cached.analysis,
            model: selectedModel,
            cached: true,
            cachedAt: cachedAt.toISOString(),
            expiresIn: Math.round((CACHE_DURATION_MS - age) / 1000 / 60),
          });
        }
      }
    }

    // Fetch Alpha Vantage data in parallel (if API key is available)
    let rsiData: RSIData | null = null;
    let macdData: MACDData | null = null;
    let overview: CompanyOverview | null = null;
    let newsSentiment: { items: NewsSentiment[]; overall: number } | null = null;

    if (alphaVantageKey) {
      const results = await Promise.allSettled([
        fetchRSI(symbol, alphaVantageKey),
        fetchMACD(symbol, alphaVantageKey),
        fetchCompanyOverview(symbol, alphaVantageKey),
        fetchNewsSentiment(symbol, alphaVantageKey),
      ]);

      rsiData = results[0].status === "fulfilled" ? results[0].value : null;
      macdData = results[1].status === "fulfilled" ? results[1].value : null;
      overview = results[2].status === "fulfilled" ? results[2].value : null;
      newsSentiment = results[3].status === "fulfilled" ? results[3].value : null;
    }

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Build enhanced prompt with Alpha Vantage data
    let technicalSection = "";
    if (rsiData || macdData) {
      technicalSection = "\n\n=== TECHNICAL INDICATORS (Real-time from Alpha Vantage) ===";
      if (rsiData) {
        technicalSection += `\nRSI (14-day): ${rsiData.value.toFixed(2)} (${rsiData.signal})`;
      }
      if (macdData) {
        technicalSection += `\nMACD: ${macdData.macd.toFixed(4)}, Signal: ${macdData.signal.toFixed(4)}, Histogram: ${macdData.histogram.toFixed(4)} (${macdData.trend})`;
      }
    }

    let fundamentalsSection = "";
    if (overview) {
      fundamentalsSection = `\n\n=== FUNDAMENTALS ===
Market Cap: ${overview.marketCap}
P/E Ratio: ${overview.peRatio}
EPS: $${overview.eps}
52-Week High: $${overview.fiftyTwoWeekHigh}
52-Week Low: $${overview.fiftyTwoWeekLow}
Dividend Yield: ${overview.dividendYield}
Sector: ${overview.sector}
Industry: ${overview.industry}`;
    }

    let newsSection = "";
    if (newsSentiment && newsSentiment.items.length > 0) {
      newsSection = "\n\n=== RECENT NEWS SENTIMENT (Real-time) ===";
      newsSentiment.items.forEach((item, i) => {
        const scoreStr = item.score >= 0 ? `+${item.score.toFixed(2)}` : item.score.toFixed(2);
        newsSection += `\n${i + 1}. [${item.sentiment} ${scoreStr}] "${item.title}" - ${item.source}, ${item.timeAgo}`;
      });
      const overallStr = newsSentiment.overall >= 0 ? `+${newsSentiment.overall.toFixed(2)}` : newsSentiment.overall.toFixed(2);
      const overallLabel = newsSentiment.overall > 0.15 ? "Bullish" : newsSentiment.overall < -0.15 ? "Bearish" : "Neutral";
      newsSection += `\nOverall News Sentiment: ${overallLabel} (${overallStr})`;
    }

    const rolePersona = councilRole ? COUNCIL_ROLE_PROMPTS[councilRole] : null;

    const systemPrompt = rolePersona
      ? `${rolePersona}

Today is ${today}. You have access to REAL-TIME market data provided below.

Technical indicator guide:
- RSI: >70 = overbought, <30 = oversold
- MACD: positive histogram + MACD above signal = bullish momentum
- P/E: compare to sector average
- News sentiment: -1 (very bearish) to +1 (very bullish)

Stay true to your assigned role. Respond ONLY with valid JSON:

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
- Return ONLY the JSON object, no markdown, no code blocks.`
      : `You are an expert financial analyst and market predictor with access to REAL-TIME market data. Today is ${today}.

IMPORTANT: You are provided with REAL technical indicators, fundamentals, and news sentiment from Alpha Vantage. Use this DATA-DRIVEN analysis:

1. RSI: >70 = overbought (potential reversal down), <30 = oversold (potential reversal up)
2. MACD: Positive histogram + MACD above signal = bullish momentum
3. P/E Ratio: Compare to sector average for valuation
4. News Sentiment: Scores range from -1 (very bearish) to +1 (very bullish)

Analyze using the PROVIDED DATA to give actionable investment predictions. Respond ONLY with valid JSON:

{
  "score": <number 1-10>,
  "prediction": "<UP or DOWN>",
  "confidence": <number 1-100>,
  "reasons": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "bottomFishing": {
    "recommended": <boolean>,
    "targetPrice": <number>,
    "timing": "<when to buy>",
    "rationale": "<explanation>"
  },
  "priceTarget": {
    "expectedRise": <percentage>,
    "targetPrice": <number>,
    "timeframe": "<e.g., '1-2 weeks'>",
    "exitStrategy": "<when to sell>"
  },
  "riskFactors": ["<risk 1>", "<risk 2>", "<risk 3>"]
}

Rules:
- score: 8-10 = Strong Buy, 5-7 = Hold, 1-4 = Caution
- Use RSI/MACD signals to determine entry timing
- Reference the actual technical indicator values in your reasons
- Consider news sentiment when assessing short-term momentum
- Be specific with price targets based on technical levels

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks.`;

    const userPrompt = `Analysis Date: ${today}

Analyze this stock using the provided real-time data:

Stock: ${symbol} (${stockData.name})
Current Price: $${stockData.currentPrice.toFixed(2)}
Daily Change: ${stockData.change >= 0 ? "+" : ""}$${stockData.change.toFixed(2)} (${stockData.changePercent >= 0 ? "+" : ""}${stockData.changePercent.toFixed(2)}%)
Day High: $${stockData.dayHigh.toFixed(2)}
Day Low: $${stockData.dayLow.toFixed(2)}
Volume: ${formatVolume(stockData.volume)}
5-Day Sharpe Ratio: ${stockData.sharpeRatio.toFixed(2)}
Current Trend: ${stockData.trend.charAt(0).toUpperCase() + stockData.trend.slice(1)}${technicalSection}${fundamentalsSection}${newsSection}

Provide your JSON analysis:`;

    let aiResponse: string;
    try {
      const openrouter = createOpenRouter({ apiKey: openRouterKey });
      const { text } = await generateText({
        model: openrouter(selectedModel),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxOutputTokens: 800,
        temperature: 0.7,
      });
      aiResponse = text;
    } catch (err) {
      console.error("AI SDK error:", err);
      return NextResponse.json(
        { error: "AI service error", message: "Failed to get AI analysis. Please try again later." },
        { status: 500 }
      );
    }

    if (!aiResponse) {
      return NextResponse.json(
        { error: "Empty response", message: "AI returned no analysis" },
        { status: 500 }
      );
    }

    let parsedAnalysis;
    try {
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
          targetPrice: stockData.currentPrice * 0.95,
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

    analysisCache.set(cacheKey, {
      analysis: parsedAnalysis,
      timestamp: Date.now(),
      stockPrice: stockData.currentPrice,
    });

    return NextResponse.json({
      analysis: parsedAnalysis,
      model: selectedModel,
      councilRole: councilRole ?? null,
      cached: false,
      enhancedData: {
        hasRSI: !!rsiData,
        hasMACD: !!macdData,
        hasFundamentals: !!overview,
        hasNews: !!newsSentiment,
      },
    });
  } catch (error) {
    console.error("AI API error:", error);
    return NextResponse.json(
      { error: "Server error", message: "Failed to process AI request" },
      { status: 500 }
    );
  }
}
