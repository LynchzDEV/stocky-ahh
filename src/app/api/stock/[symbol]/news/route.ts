import { NextRequest, NextResponse } from "next/server";
import { validateSymbol } from "@/lib/validation";
import type { NewsItem } from "@/lib/types";

// Rate limiting map
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

// Cache for news data (5 minutes)
const newsCache = new Map<string, { data: NewsItem[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

function formatTimeAgo(dateString: string): string {
  // Alpha Vantage format: "20231215T143000"
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

function mapSentiment(label: string): "Bullish" | "Bearish" | "Neutral" {
  const lower = label.toLowerCase();
  if (lower.includes("bullish") || lower.includes("positive")) {
    return "Bullish";
  } else if (lower.includes("bearish") || lower.includes("negative")) {
    return "Bearish";
  }
  return "Neutral";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0] : "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded", message: "Please wait before making another request" },
        { status: 429 }
      );
    }

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

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured", message: "Alpha Vantage API key is not set" },
        { status: 500 }
      );
    }

    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=10&apikey=${apiKey}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; stocky-ahh/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      console.error(`Alpha Vantage API returned ${response.status} for symbol: ${symbol}`);
      return NextResponse.json(
        { error: "News fetch failed", message: "Unable to fetch news data" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check for API error responses
    if (data.Note || data.Information) {
      console.error("Alpha Vantage API limit:", data.Note || data.Information);
      return NextResponse.json(
        { error: "API limit", message: "News API rate limit reached. Please try again later." },
        { status: 429 }
      );
    }

    if (!data.feed || !Array.isArray(data.feed)) {
      return NextResponse.json({ news: [], cached: false });
    }

    // Transform Alpha Vantage response to our NewsItem format
    const newsItems: NewsItem[] = data.feed
      .filter((item: Record<string, unknown>) => {
        // Filter to only include news that mentions our symbol with decent relevance
        const tickerSentiment = item.ticker_sentiment as Array<{ ticker: string; relevance_score: string }> | undefined;
        if (!tickerSentiment) return true;
        const relevant = tickerSentiment.find(
          (t) => t.ticker === symbol && parseFloat(t.relevance_score) > 0.1
        );
        return relevant !== undefined;
      })
      .slice(0, 10)
      .map((item: Record<string, unknown>) => {
        const tickerSentiment = item.ticker_sentiment as Array<{ ticker: string; ticker_sentiment_label: string; ticker_sentiment_score: string }> | undefined;
        const symbolSentiment = tickerSentiment?.find((t) => t.ticker === symbol);

        return {
          title: item.title as string,
          url: item.url as string,
          summary: (item.summary as string)?.slice(0, 200) + ((item.summary as string)?.length > 200 ? "..." : ""),
          source: item.source as string,
          publishedAt: formatTimeAgo(item.time_published as string),
          sentiment: mapSentiment(
            symbolSentiment?.ticker_sentiment_label || (item.overall_sentiment_label as string) || "Neutral"
          ),
          sentimentScore: parseFloat(
            symbolSentiment?.ticker_sentiment_score || (item.overall_sentiment_score as string) || "0"
          ),
          image: (item.banner_image as string) || undefined,
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
