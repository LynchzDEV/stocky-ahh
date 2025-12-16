import { NextRequest, NextResponse } from "next/server";
import { validateSymbol } from "@/lib/validation";
import type { NewsItem } from "@/lib/types";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

// Keyword-based sentiment analysis
const POSITIVE_WORDS = [
  "surge", "surges", "surging", "soar", "soars", "soaring",
  "jump", "jumps", "jumping", "rise", "rises", "rising",
  "gain", "gains", "gaining", "beat", "beats", "beating",
  "upgrade", "upgraded", "bullish", "rally", "rallies",
  "record", "high", "profit", "profits", "growth",
  "strong", "strength", "positive", "boost", "boosts",
  "breakthrough", "success", "win", "wins", "winning",
  "outperform", "buy", "optimistic", "recovery", "boom"
];

const NEGATIVE_WORDS = [
  "fall", "falls", "falling", "drop", "drops", "dropping",
  "plunge", "plunges", "plunging", "decline", "declines",
  "lose", "loses", "losing", "loss", "losses", "miss", "misses",
  "downgrade", "downgraded", "bearish", "crash", "crashes",
  "low", "weak", "weakness", "negative", "concern", "concerns",
  "fear", "fears", "warning", "risk", "risks", "cut", "cuts",
  "layoff", "layoffs", "lawsuit", "investigation", "fraud",
  "underperform", "sell", "pessimistic", "recession", "slump"
];

function analyzeSentiment(text: string): { sentiment: "Bullish" | "Bearish" | "Neutral"; score: number } {
  const lowerText = text.toLowerCase();

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of POSITIVE_WORDS) {
    if (lowerText.includes(word)) positiveCount++;
  }

  for (const word of NEGATIVE_WORDS) {
    if (lowerText.includes(word)) negativeCount++;
  }

  const score = (positiveCount - negativeCount) / Math.max(positiveCount + negativeCount, 1);

  if (positiveCount > negativeCount && positiveCount >= 1) {
    return { sentiment: "Bullish", score: Math.min(score, 1) };
  } else if (negativeCount > positiveCount && negativeCount >= 1) {
    return { sentiment: "Bearish", score: Math.max(score, -1) };
  }

  return { sentiment: "Neutral", score: 0 };
}

// Cache for news data (10 minutes - Finnhub has generous limits)
const newsCache = new Map<string, { data: NewsItem[]; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000;

function formatTimeAgo(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

function getDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7); // Last 7 days of news

  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = validateSymbol(rawSymbol);

    if (!symbol) {
      return NextResponse.json(
        { error: "Invalid symbol", message: "Stock symbol must be 1-10 alphanumeric characters" },
        { status: 400 }
      );
    }

    // Check cache
    const cached = newsCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json({ news: cached.data, cached: true });
    }

    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured", message: "Finnhub API key is not set" },
        { status: 500 }
      );
    }

    const { from, to } = getDateRange();
    const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${apiKey}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      next: { revalidate: 600 }, // 10 minutes
    });

    if (!response.ok) {
      console.error(`Finnhub API returned ${response.status} for symbol: ${symbol}`);

      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit", message: "News API rate limit reached. Please try again later." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "News fetch failed", message: "Unable to fetch news data" },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return NextResponse.json({ news: [], cached: false });
    }

    // Transform Finnhub response to our NewsItem format
    const newsItems: NewsItem[] = data
      .slice(0, 10)
      .map((item: {
        id: number;
        headline: string;
        summary: string;
        url: string;
        source: string;
        datetime: number;
        image: string;
      }) => {
        // Analyze sentiment from headline and summary
        const textToAnalyze = `${item.headline || ""} ${item.summary || ""}`;
        const { sentiment, score } = analyzeSentiment(textToAnalyze);

        return {
          title: item.headline,
          url: item.url,
          summary: item.summary?.slice(0, 200) + (item.summary?.length > 200 ? "..." : "") || "",
          source: item.source,
          publishedAt: formatTimeAgo(item.datetime),
          sentiment,
          sentimentScore: score,
          image: item.image || undefined,
        };
      });

    // Cache the results
    newsCache.set(symbol, { data: newsItems, timestamp: Date.now() });

    return NextResponse.json({ news: newsItems, cached: false });
  } catch (error) {
    console.error("News API error:", error);
    return NextResponse.json(
      { error: "Server error", message: "Failed to fetch news data. Please try again later." },
      { status: 500 }
    );
  }
}
