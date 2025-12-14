// Security: Input validation utilities

/**
 * Validates and sanitizes stock symbol input
 * Only allows alphanumeric characters, dots, and hyphens
 * Max length: 10 characters
 */
export function validateSymbol(input: string): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const sanitized = input.replace(/[^a-zA-Z0-9.-]/g, "").toUpperCase().trim();

  if (sanitized.length === 0 || sanitized.length > 10) {
    return null;
  }

  return sanitized;
}

/**
 * Validates currency amount input
 * Must be a positive number less than 1 billion
 */
export function validateAmount(input: string | number): number {
  const num = typeof input === "string" ? parseFloat(input) : input;

  if (isNaN(num) || num < 0 || num > 999999999) {
    return 0;
  }

  // Round to 2 decimal places
  return Math.round(num * 100) / 100;
}

/**
 * Validates Yahoo Finance API response structure
 */
export function validateYahooResponse(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }

  const response = data as Record<string, unknown>;

  if (!response.chart || typeof response.chart !== "object") {
    return false;
  }

  const chart = response.chart as Record<string, unknown>;

  if (!Array.isArray(chart.result) || chart.result.length === 0) {
    return false;
  }

  const result = chart.result[0] as Record<string, unknown>;

  if (!result.meta || typeof result.meta !== "object") {
    return false;
  }

  return true;
}

/**
 * Validates exchange rate API response
 */
export function validateExchangeResponse(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }

  const response = data as Record<string, unknown>;

  if (!response.rates || typeof response.rates !== "object") {
    return false;
  }

  const rates = response.rates as Record<string, unknown>;

  return typeof rates.THB === "number" && rates.THB > 0;
}

/**
 * Rate limiter for client-side API calls
 */
export class RateLimiter {
  private lastCall: number = 0;
  private minInterval: number;

  constructor(minIntervalMs: number = 1000) {
    this.minInterval = minIntervalMs;
  }

  canCall(): boolean {
    const now = Date.now();
    if (now - this.lastCall < this.minInterval) {
      return false;
    }
    this.lastCall = now;
    return true;
  }

  getRemainingTime(): number {
    const elapsed = Date.now() - this.lastCall;
    return Math.max(0, this.minInterval - elapsed);
  }
}

/**
 * Sanitizes HTML to prevent XSS
 */
export function sanitizeText(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
