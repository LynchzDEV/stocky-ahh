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
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    trend: "Bullish" | "Bearish" | "Neutral";
  } | null;
}

// Calculate EMA (Exponential Moving Average)
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);

  // Calculate EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    const value = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(value);
  }

  return ema;
}

// Calculate MACD
function calculateMACD(closePrices: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closePrices.length < 35) { // Need at least 26 + 9 days for proper MACD
    return null;
  }

  // Calculate 12-day and 26-day EMAs
  const ema12 = calculateEMA(closePrices, 12);
  const ema26 = calculateEMA(closePrices, 26);

  // MACD Line = 12-day EMA - 26-day EMA
  // We need to align the arrays (ema26 starts later)
  const macdLine: number[] = [];
  const offset = 26 - 12; // 14 days offset

  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }

  if (macdLine.length < 9) {
    return null;
  }

  // Signal Line = 9-day EMA of MACD Line
  const signalLine = calculateEMA(macdLine, 9);

  // Get the latest values
  const latestMACD = macdLine[macdLine.length - 1];
  const latestSignal = signalLine[signalLine.length - 1];
  const histogram = latestMACD - latestSignal;

  return {
    macd: Math.round(latestMACD * 10000) / 10000,
    signal: Math.round(latestSignal * 10000) / 10000,
    histogram: Math.round(histogram * 10000) / 10000,
  };
}

function getMACDTrend(histogram: number, macd: number, signal: number): "Bullish" | "Bearish" | "Neutral" {
  if (histogram > 0 && macd > signal) return "Bullish";
  if (histogram < 0 && macd < signal) return "Bearish";
  return "Neutral";
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

    // Fetch price data from Yahoo Finance (need at least 2 months for proper MACD)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; stocky-ahh/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Yahoo Finance API returned ${response.status} for symbol: ${symbol}`);
      return NextResponse.json(
        { error: "Failed to fetch data", message: "Unable to fetch price data for indicators" },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
      return NextResponse.json({ rsi: null, macd: null, cached: false });
    }

    // Get closing prices (filter out null values)
    const closePrices: number[] = data.chart.result[0].indicators.quote[0].close
      .filter((price: number | null) => price !== null);

    // Calculate RSI
    const rsiValue = calculateRSI(closePrices);

    // Calculate MACD
    const macdData = calculateMACD(closePrices);

    const indicators: TechnicalIndicators = {
      rsi: rsiValue !== null ? {
        value: rsiValue,
        signal: getRSISignal(rsiValue),
      } : null,
      macd: macdData !== null ? {
        ...macdData,
        trend: getMACDTrend(macdData.histogram, macdData.macd, macdData.signal),
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
