import { NextRequest, NextResponse } from "next/server";
import { validateSymbol } from "@/lib/validation";

// Cache for 5 minutes
const indicatorsCache = new Map<string, { data: TechnicalIndicators; timestamp: number }>();
const CACHE_DURATION_MS = 5 * 60 * 1000;

interface TechnicalIndicators {
  rsi: {
    value: number;
    signal: "Overbought" | "Bullish" | "Neutral" | "Bearish" | "Oversold";
  } | null;
}

// Calculate RSI from price data
function calculateRSI(closePrices: number[], period: number = 14): number | null {
  if (closePrices.length < period + 1) {
    return null;
  }

  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    changes.push(closePrices[i] - closePrices[i - 1]);
  }

  // Separate gains and losses
  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);

  // Calculate initial average gain and loss (SMA)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Use Wilder's smoothing method for subsequent values
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  // Calculate RS and RSI
  if (avgLoss === 0) {
    return 100; // No losses means RSI is 100
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi * 100) / 100; // Round to 2 decimal places
}

function getRSISignal(rsi: number): "Overbought" | "Bullish" | "Neutral" | "Bearish" | "Oversold" {
  if (rsi >= 70) return "Overbought";
  if (rsi >= 60) return "Bullish";
  if (rsi <= 30) return "Oversold";
  if (rsi <= 40) return "Bearish";
  return "Neutral";
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
    const cached = indicatorsCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return NextResponse.json({ ...cached.data, cached: true });
    }

    // Fetch price data from Yahoo Finance (need at least 20 days for 14-day RSI)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; stocky-ahh/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Yahoo Finance API returned ${response.status} for symbol: ${symbol}`);
      return NextResponse.json(
        { error: "Failed to fetch data", message: "Unable to fetch price data for RSI calculation" },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
      return NextResponse.json({ rsi: null, cached: false });
    }

    // Get closing prices (filter out null values)
    const closePrices: number[] = data.chart.result[0].indicators.quote[0].close
      .filter((price: number | null) => price !== null);

    if (closePrices.length < 15) {
      console.log("Not enough price data for RSI calculation");
      return NextResponse.json({ rsi: null, cached: false });
    }

    // Calculate RSI
    const rsiValue = calculateRSI(closePrices);

    const indicators: TechnicalIndicators = {
      rsi: rsiValue !== null ? {
        value: rsiValue,
        signal: getRSISignal(rsiValue),
      } : null,
    };

    // Cache the results
    indicatorsCache.set(symbol, { data: indicators, timestamp: Date.now() });

    return NextResponse.json({ ...indicators, cached: false });
  } catch (error) {
    console.error("Indicators API error:", error);
    return NextResponse.json(
      { error: "Server error", message: "Failed to calculate technical indicators" },
      { status: 500 }
    );
  }
}
