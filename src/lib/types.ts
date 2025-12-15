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
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export interface ExchangeRate {
  rate: number;
  lastUpdated: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface SearchHistoryItem {
  symbol: string;
  name: string;
  timestamp: number;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: number;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}
