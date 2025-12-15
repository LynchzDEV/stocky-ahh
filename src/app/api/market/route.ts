import { NextResponse } from "next/server";
import type { MarketIndex } from "@/lib/types";

interface MarketData {
  indices: MarketIndex[];
  lastUpdated: string;
}

// Cache for market data
let cachedData: MarketData | null = null;
let cacheTime = 0;
const CACHE_DURATION = 60000; // 1 minute

const INDICES = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^DJI", name: "DOW" },
  { symbol: "^IXIC", name: "NASDAQ" },
];

async function fetchIndexData(symbol: string, name: string): Promise<MarketIndex | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; stocky-ahh/1.0)",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta) {
      return null;
    }

    const currentPrice = meta.regularMarketPrice || 0;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;

    return {
      symbol,
      name,
      price: Math.round(currentPrice * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached data if valid
    if (cachedData && now - cacheTime < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    // Fetch all indices in parallel
    const results = await Promise.all(
      INDICES.map((idx) => fetchIndexData(idx.symbol, idx.name))
    );

    const indices = results.filter((r): r is MarketIndex => r !== null);

    if (indices.length === 0) {
      return NextResponse.json(
        { error: "Unable to fetch market data", message: "Market data temporarily unavailable" },
        { status: 503 }
      );
    }

    const marketData: MarketData = {
      indices,
      lastUpdated: new Date().toISOString(),
    };

    // Update cache
    cachedData = marketData;
    cacheTime = now;

    return NextResponse.json(marketData);
  } catch (error) {
    console.error("Market API error:", error);
    return NextResponse.json(
      { error: "Server error", message: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
