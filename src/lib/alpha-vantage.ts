// src/lib/alpha-vantage.ts

const BASE_URL = 'https://www.alphavantage.co/query';
const CACHE_MS = 15 * 60 * 1000;
const FUNDAMENTALS_CACHE_MS = 60 * 60 * 1000;

export interface RSIData {
  value: number;
  signal: string;
}

export interface MACDData {
  macd: number;
  signal: number;
  histogram: number;
  trend: string;
}

export interface CompanyOverview {
  marketCap: string;
  peRatio: string;
  eps: string;
  fiftyTwoWeekHigh: string;
  fiftyTwoWeekLow: string;
  dividendYield: string;
  sector: string;
  industry: string;
}

export interface NewsSentimentItem {
  title: string;
  sentiment: string;
  score: number;
  source: string;
  timeAgo: string;
}

export interface NewsSentimentResult {
  items: NewsSentimentItem[];
  overall: number;
}

const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string, maxAge: number): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < maxAge) return entry.data as T;
  return null;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function mapSentimentLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('bullish')) return 'Bullish';
  if (l.includes('bearish')) return 'Bearish';
  return 'Neutral';
}

function formatMarketCap(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function formatTimeAgo(dateString: string): string {
  const year = dateString.slice(0, 4);
  const month = dateString.slice(4, 6);
  const day = dateString.slice(6, 8);
  const hour = dateString.slice(9, 11);
  const minute = dateString.slice(11, 13);
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export async function fetchRSI(symbol: string, apiKey: string): Promise<RSIData | null> {
  const key = `rsi_${symbol}`;
  const cached = getCached<RSIData>(key, CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data['Technical Analysis: RSI']) return null;
    const rsiData = data['Technical Analysis: RSI'];
    const latestDate = Object.keys(rsiData)[0];
    const value = parseFloat(rsiData[latestDate].RSI);
    let signal = 'Neutral';
    if (value >= 70) signal = 'Overbought';
    else if (value >= 60) signal = 'Bullish';
    else if (value <= 30) signal = 'Oversold';
    else if (value <= 40) signal = 'Bearish';
    const result: RSIData = { value, signal };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export async function fetchMACD(symbol: string, apiKey: string): Promise<MACDData | null> {
  const key = `macd_${symbol}`;
  const cached = getCached<MACDData>(key, CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data['Technical Analysis: MACD']) return null;
    const macdData = data['Technical Analysis: MACD'];
    const latestDate = Object.keys(macdData)[0];
    const latest = macdData[latestDate];
    const macd = parseFloat(latest.MACD);
    const signal = parseFloat(latest.MACD_Signal);
    const histogram = parseFloat(latest.MACD_Hist);
    let trend = 'Neutral';
    if (histogram > 0 && macd > signal) trend = 'Bullish';
    else if (histogram < 0 && macd < signal) trend = 'Bearish';
    const result: MACDData = { macd, signal, histogram, trend };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export async function fetchCompanyOverview(symbol: string, apiKey: string): Promise<CompanyOverview | null> {
  const key = `overview_${symbol}`;
  const cached = getCached<CompanyOverview>(key, FUNDAMENTALS_CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data.Symbol) return null;
    const result: CompanyOverview = {
      marketCap: formatMarketCap(data.MarketCapitalization),
      peRatio: data.PERatio || 'N/A',
      eps: data.EPS || 'N/A',
      fiftyTwoWeekHigh: data['52WeekHigh'] || 'N/A',
      fiftyTwoWeekLow: data['52WeekLow'] || 'N/A',
      dividendYield: data.DividendYield ? `${(parseFloat(data.DividendYield) * 100).toFixed(2)}%` : 'N/A',
      sector: data.Sector || 'N/A',
      industry: data.Industry || 'N/A',
    };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export async function fetchNewsSentiment(symbol: string, apiKey: string): Promise<NewsSentimentResult | null> {
  const key = `news_${symbol}`;
  const cached = getCached<NewsSentimentResult>(key, CACHE_MS);
  if (cached) return cached;
  try {
    const url = `${BASE_URL}?function=NEWS_SENTIMENT&tickers=${symbol}&limit=5&apikey=${apiKey}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Note || data.Information || !data.feed) return null;
    let totalScore = 0;
    const items: NewsSentimentItem[] = data.feed.slice(0, 3).map((item: Record<string, unknown>) => {
      const tickerSentiment = (item.ticker_sentiment as Array<{ ticker: string; ticker_sentiment_score: string; ticker_sentiment_label: string }>) || [];
      const symbolSentiment = tickerSentiment.find(t => t.ticker === symbol);
      const score = parseFloat(symbolSentiment?.ticker_sentiment_score || item.overall_sentiment_score as string || '0');
      totalScore += score;
      const title = item.title as string;
      return {
        title: title?.length > 80 ? title.slice(0, 80) + '...' : title,
        sentiment: mapSentimentLabel(symbolSentiment?.ticker_sentiment_label || item.overall_sentiment_label as string || 'Neutral'),
        score,
        source: item.source as string,
        timeAgo: formatTimeAgo(item.time_published as string),
      };
    });
    const result: NewsSentimentResult = { items, overall: items.length > 0 ? totalScore / items.length : 0 };
    setCached(key, result);
    return result;
  } catch { return null; }
}

export function buildTechnicalSection(rsi: RSIData | null, macd: MACDData | null): string {
  if (!rsi && !macd) return '';
  let section = '\n\n=== TECHNICAL INDICATORS (Real-time from Alpha Vantage) ===';
  if (rsi) section += `\nRSI (14-day): ${rsi.value.toFixed(2)} (${rsi.signal})`;
  if (macd) section += `\nMACD: ${macd.macd.toFixed(4)}, Signal: ${macd.signal.toFixed(4)}, Histogram: ${macd.histogram.toFixed(4)} (${macd.trend})`;
  return section;
}

export function buildFundamentalsSection(overview: CompanyOverview | null): string {
  if (!overview) return '';
  return `\n\n=== FUNDAMENTALS ===
Market Cap: ${overview.marketCap}
P/E Ratio: ${overview.peRatio}
EPS: $${overview.eps}
52-Week High: $${overview.fiftyTwoWeekHigh}
52-Week Low: $${overview.fiftyTwoWeekLow}
Dividend Yield: ${overview.dividendYield}
Sector: ${overview.sector}
Industry: ${overview.industry}`;
}

export function buildNewsSection(newsSentiment: NewsSentimentResult | null): string {
  if (!newsSentiment || newsSentiment.items.length === 0) return '';
  let section = '\n\n=== RECENT NEWS SENTIMENT (Real-time) ===';
  newsSentiment.items.forEach((item, i) => {
    const scoreStr = item.score >= 0 ? `+${item.score.toFixed(2)}` : item.score.toFixed(2);
    section += `\n${i + 1}. [${item.sentiment} ${scoreStr}] "${item.title}" - ${item.source}, ${item.timeAgo}`;
  });
  const overallStr = newsSentiment.overall >= 0 ? `+${newsSentiment.overall.toFixed(2)}` : newsSentiment.overall.toFixed(2);
  const overallLabel = newsSentiment.overall > 0.15 ? 'Bullish' : newsSentiment.overall < -0.15 ? 'Bearish' : 'Neutral';
  section += `\nOverall News Sentiment: ${overallLabel} (${overallStr})`;
  return section;
}
