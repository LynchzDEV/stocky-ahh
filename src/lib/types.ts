export interface OHLCData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  symbol: string;
  name: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  ohlc: OHLCData[];
  sharpeRatio: number;
  trend: "bullish" | "bearish" | "neutral";
}

export interface ExchangeRate {
  rate: number;
  lastUpdated: string;
}

export interface ApiError {
  error: string;
  message: string;
}
