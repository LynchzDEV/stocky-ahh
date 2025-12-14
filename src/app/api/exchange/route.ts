import { NextRequest, NextResponse } from "next/server";
import { validateExchangeResponse } from "@/lib/validation";
import type { ExchangeRate } from "@/lib/types";

// Cache the exchange rate (in production, use Redis)
let cachedRate: ExchangeRate | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fallback rate if API fails
const FALLBACK_RATE = 33.5;

export async function GET(request: NextRequest) {
  try {
    // Check cache
    const now = Date.now();
    if (cachedRate && now - cacheTime < CACHE_DURATION) {
      return NextResponse.json(cachedRate);
    }

    // Fetch from Exchange Rate API
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Stockify/1.0)",
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.log(`Exchange API returned ${response.status}, using fallback`);
      const fallbackData: ExchangeRate = {
        rate: FALLBACK_RATE,
        lastUpdated: new Date().toISOString(),
      };
      return NextResponse.json(fallbackData);
    }

    const data = await response.json();

    // Validate response
    if (!validateExchangeResponse(data)) {
      console.log("Invalid exchange response, using fallback");
      const fallbackData: ExchangeRate = {
        rate: FALLBACK_RATE,
        lastUpdated: new Date().toISOString(),
      };
      return NextResponse.json(fallbackData);
    }

    const exchangeData: ExchangeRate = {
      rate: Math.round(data.rates.THB * 10000) / 10000,
      lastUpdated: data.time_last_updated
        ? new Date(data.time_last_updated * 1000).toISOString()
        : new Date().toISOString(),
    };

    // Update cache
    cachedRate = exchangeData;
    cacheTime = now;

    return NextResponse.json(exchangeData);
  } catch (error) {
    console.error("Exchange API error:", error);

    // Return fallback on error
    const fallbackData: ExchangeRate = {
      rate: FALLBACK_RATE,
      lastUpdated: new Date().toISOString(),
    };
    return NextResponse.json(fallbackData);
  }
}
