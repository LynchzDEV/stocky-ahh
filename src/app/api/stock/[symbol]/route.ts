import { NextRequest, NextResponse } from "next/server";
import { validateSymbol, validateYahooResponse } from "@/lib/validation";
import type { StockData, OHLCData } from "@/lib/types";

// Rate limiting map (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

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

function calculateSharpeRatio(prices: number[]): number {
  if (prices.length < 2) return 0;

  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(dailyReturn);
  }

  if (returns.length === 0) return 0;

  // Calculate average return
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  // Calculate standard deviation
  const squaredDiffs = returns.map((r) => Math.pow(r - avgReturn, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Risk-free rate (0.02% daily ≈ 5% annual)
  const riskFreeRate = 0.0002;

  // Sharpe Ratio (annualized with sqrt(252))
  if (stdDev === 0) return 0;
  const sharpeRatio = ((avgReturn - riskFreeRate) / stdDev) * Math.sqrt(252);

  return Math.round(sharpeRatio * 100) / 100;
}

function determineTrend(sharpeRatio: number): "bullish" | "bearish" | "neutral" {
  if (sharpeRatio > 0.5) return "bullish";
  if (sharpeRatio < 0) return "bearish";
  return "neutral";
}

function formatVolume(volume: number): number {
  return volume;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    // Get client IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0] : "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded", message: "Please wait before making another request" },
        { status: 429 }
      );
    }

    const { symbol: rawSymbol } = await params;

    // Validate symbol
    const symbol = validateSymbol(rawSymbol);
    if (!symbol) {
      return NextResponse.json(
        { error: "Invalid symbol", message: "Stock symbol must be 1-10 alphanumeric characters" },
        { status: 400 }
      );
    }

    // Fetch from Yahoo Finance
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Stockify/1.0)",
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      console.log(`Yahoo API returned ${response.status} for symbol: ${symbol}`);
      return NextResponse.json(
        { error: "Stock not found", message: `Unable to find stock data for "${symbol}"` },
        { status: 404 }
      );
    }

    const data = await response.json();

    // Validate response structure
    if (!validateYahooResponse(data)) {
      console.log(`Invalid Yahoo response structure for symbol: ${symbol}`);
      return NextResponse.json(
        { error: "Stock not found", message: `Unable to find stock data for "${symbol}"` },
        { status: 404 }
      );
    }

    const result = data.chart.result[0];
    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    // Extract OHLC data
    const ohlc: OHLCData[] = [];
    const closePrices: number[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i];

      if (open != null && high != null && low != null && close != null) {
        ohlc.push({
          date: formatDate(timestamps[i]),
          open: Math.round(open * 100) / 100,
          high: Math.round(high * 100) / 100,
          low: Math.round(low * 100) / 100,
          close: Math.round(close * 100) / 100,
          volume: volume || 0,
        });
        closePrices.push(close);
      }
    }

    if (ohlc.length === 0) {
      return NextResponse.json(
        { error: "No data available", message: `No price data available for "${symbol}"` },
        { status: 404 }
      );
    }

    const currentPrice = meta.regularMarketPrice || closePrices[closePrices.length - 1];
    const previousClose = meta.chartPreviousClose || meta.previousClose || closePrices[closePrices.length - 2] || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    const sharpeRatio = calculateSharpeRatio(closePrices);

    const stockData: StockData = {
      symbol: symbol,
      name: meta.longName || meta.shortName || symbol,
      currentPrice: Math.round(currentPrice * 100) / 100,
      previousClose: Math.round(previousClose * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      dayHigh: Math.round((meta.regularMarketDayHigh || ohlc[ohlc.length - 1]?.high || currentPrice) * 100) / 100,
      dayLow: Math.round((meta.regularMarketDayLow || ohlc[ohlc.length - 1]?.low || currentPrice) * 100) / 100,
      volume: formatVolume(meta.regularMarketVolume || ohlc[ohlc.length - 1]?.volume || 0),
      ohlc,
      sharpeRatio,
      trend: determineTrend(sharpeRatio),
      fiftyTwoWeekHigh: Math.round((meta.fiftyTwoWeekHigh || currentPrice) * 100) / 100,
      fiftyTwoWeekLow: Math.round((meta.fiftyTwoWeekLow || currentPrice) * 100) / 100,
    };

    return NextResponse.json(stockData);
  } catch (error) {
    console.error("Stock API error:", error);
    return NextResponse.json(
      { error: "Server error", message: "Failed to fetch stock data. Please try again later." },
      { status: 500 }
    );
  }
}
