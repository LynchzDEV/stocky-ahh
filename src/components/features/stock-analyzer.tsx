"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, TrendingUp, TrendingDown, Minus, Info, BarChart3, Lightbulb, Sparkles, X, Star, History, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CandlestickChart } from "./candlestick-chart";
import { validateSymbol, RateLimiter } from "@/lib/validation";
import type { StockData } from "@/lib/types";
import { Spinner } from "@/components/ui/spinner";
import { useSearchHistory } from "@/hooks/use-search-history";
import { useWatchlist } from "@/hooks/use-watchlist";

const POPULAR_STOCKS = ["AAPL", "GOOGL", "TSLA", "MSFT", "AMZN", "NVDA"];

const rateLimiter = new RateLimiter(1000);

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return (volume / 1_000_000_000).toFixed(2) + "B";
  }
  if (volume >= 1_000_000) {
    return (volume / 1_000_000).toFixed(2) + "M";
  }
  if (volume >= 1_000) {
    return (volume / 1_000).toFixed(2) + "K";
  }
  return volume.toString();
}

function getSharpeInterpretation(sharpe: number): {
  label: string;
  color: string;
  description: string;
} {
  if (sharpe > 1.0) {
    return {
      label: "Excellent",
      color: "#22c55e",
      description: "Strong risk-adjusted returns. The investment is generating significant returns relative to its risk.",
    };
  }
  if (sharpe >= 0.5) {
    return {
      label: "Good",
      color: "#3b82f6",
      description: "Decent risk-adjusted returns. The investment is performing reasonably well for its risk level.",
    };
  }
  if (sharpe >= 0) {
    return {
      label: "Neutral",
      color: "#eab308",
      description: "Average risk-adjusted returns. Returns are roughly in line with the risk taken.",
    };
  }
  return {
    label: "Poor",
    color: "#ef4444",
    description: "Negative risk-adjusted returns. The investment is underperforming relative to its risk.",
  };
}

export function StockAnalyzer() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockData, setStockData] = useState<StockData | null>(null);

  // Search history and watchlist hooks
  const { history, addToHistory, clearHistory } = useSearchHistory();
  const { watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();

  // AI Analysis states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    score: number;
    reasons: string[];
    factors: string[];
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 8) return { bg: "bg-green-500", text: "text-green-500", label: "Strong Buy" };
    if (score >= 5) return { bg: "bg-yellow-500", text: "text-yellow-500", label: "Hold/Neutral" };
    return { bg: "bg-red-500", text: "text-red-500", label: "Caution" };
  };

  const fetchAiAnalysis = useCallback(async () => {
    if (!stockData) return;

    setAiLoading(true);
    setAiError(null);
    setShowAiPanel(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: stockData.symbol,
          stockData: {
            name: stockData.name,
            currentPrice: stockData.currentPrice,
            change: stockData.change,
            changePercent: stockData.changePercent,
            dayHigh: stockData.dayHigh,
            dayLow: stockData.dayLow,
            volume: stockData.volume,
            sharpeRatio: stockData.sharpeRatio,
            trend: stockData.trend,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to get AI analysis");
      }

      const data = await response.json();
      setAiAnalysis(data.analysis);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Unable to get AI analysis");
    } finally {
      setAiLoading(false);
    }
  }, [stockData]);

  const fetchStockData = useCallback(async (searchSymbol: string) => {
    const validSymbol = validateSymbol(searchSymbol);
    if (!validSymbol) {
      setError("Invalid symbol. Please enter 1-10 alphanumeric characters.");
      return;
    }

    if (!rateLimiter.canCall()) {
      setError("Please wait a moment before searching again.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stock/${encodeURIComponent(validSymbol)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch stock data");
      }

      const data: StockData = await response.json();
      setStockData(data);
      // Add to search history on successful fetch
      addToHistory(data.symbol, data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [addToHistory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      fetchStockData(symbol);
    }
  };

  const handleQuickSelect = (stock: string) => {
    setSymbol(stock);
    fetchStockData(stock);
  };

  const TrendIcon = stockData?.trend === "bullish" ? TrendingUp : stockData?.trend === "bearish" ? TrendingDown : Minus;
  const sharpeInfo = stockData ? getSharpeInterpretation(stockData.sharpeRatio) : null;

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter stock symbol (e.g., AAPL)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="pl-10 font-mono bg-background/50"
                maxLength={10}
              />
            </div>
            <Button type="submit" disabled={loading || !symbol.trim()}>
              {loading ? <Spinner size="sm" /> : "Analyze"}
            </Button>
          </form>

          {/* Search History */}
          {history.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <div className="flex items-center gap-1 text-sm text-muted-foreground mr-1">
                <History className="h-3.5 w-3.5" />
                <span>Recent:</span>
              </div>
              {history.slice(0, 5).map((item) => (
                <Button
                  key={item.symbol}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickSelect(item.symbol)}
                  disabled={loading}
                  className="font-mono text-xs"
                >
                  {item.symbol}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <div className="flex items-center gap-1 text-sm text-muted-foreground mr-1">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                <span>Watchlist:</span>
              </div>
              {watchlist.map((item) => (
                <Button
                  key={item.symbol}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickSelect(item.symbol)}
                  disabled={loading}
                  className="font-mono text-xs border-yellow-500/30 hover:border-yellow-500/50"
                >
                  {item.symbol}
                </Button>
              ))}
            </div>
          )}

          {/* Quick Select Buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/30">
            <span className="text-sm text-muted-foreground mr-2">Popular:</span>
            {POPULAR_STOCKS.map((stock) => (
              <Button
                key={stock}
                variant="outline"
                size="sm"
                onClick={() => handleQuickSelect(stock)}
                disabled={loading}
                className="font-mono text-xs"
              >
                {stock}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="bg-destructive/10 border-destructive/50">
              <CardContent className="py-3">
                <p className="text-destructive text-sm">{error}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex justify-center py-12"
          >
            <Spinner size="lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stock Data Display */}
      <AnimatePresence>
        {stockData && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="space-y-6"
          >
            {/* Header Section */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold">{stockData.symbol}</h2>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          isInWatchlist(stockData.symbol)
                            ? removeFromWatchlist(stockData.symbol)
                            : addToWatchlist(stockData.symbol, stockData.name)
                        }
                        className={`h-8 w-8 ${
                          isInWatchlist(stockData.symbol)
                            ? "text-yellow-500 hover:text-yellow-600"
                            : "text-muted-foreground hover:text-yellow-500"
                        }`}
                      >
                        <Star className={`h-5 w-5 ${isInWatchlist(stockData.symbol) ? "fill-current" : ""}`} />
                      </Button>
                      <Badge
                        variant="outline"
                        className={`${
                          stockData.trend === "bullish"
                            ? "border-[#22c55e] text-[#22c55e]"
                            : stockData.trend === "bearish"
                            ? "border-[#ef4444] text-[#ef4444]"
                            : "border-[#eab308] text-[#eab308]"
                        }`}
                      >
                        <TrendIcon className="h-3 w-3 mr-1" />
                        {stockData.trend.charAt(0).toUpperCase() + stockData.trend.slice(1)}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchAiAnalysis}
                        disabled={aiLoading}
                        className="ml-2 gap-1.5 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/20 text-amber-500"
                      >
                        {aiLoading ? (
                          <Spinner size="sm" className="text-amber-500" />
                        ) : (
                          <Lightbulb className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">AI Insight</span>
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-sm mt-1">{stockData.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold font-mono">${stockData.currentPrice.toFixed(2)}</p>
                    <p
                      className={`text-sm font-mono ${
                        stockData.change >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                      }`}
                    >
                      {stockData.change >= 0 ? "+" : ""}
                      {stockData.change.toFixed(2)} ({stockData.changePercent >= 0 ? "+" : ""}
                      {stockData.changePercent.toFixed(2)}%)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Analysis Panel */}
            <AnimatePresence>
              {showAiPanel && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Card className="bg-gradient-to-br from-amber-500/5 to-yellow-500/5 border-amber-500/30">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Sparkles className="h-5 w-5 text-amber-500" />
                          AI Investment Analysis
                          <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-500">
                            Grok-4
                          </Badge>
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowAiPanel(false)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {aiLoading && (
                        <div className="flex items-center justify-center py-8">
                          <div className="flex flex-col items-center gap-3">
                            <Spinner size="lg" className="text-amber-500" />
                            <p className="text-sm text-muted-foreground">Analyzing {stockData.symbol}...</p>
                          </div>
                        </div>
                      )}
                      {aiError && (
                        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                          <p className="text-destructive text-sm">{aiError}</p>
                        </div>
                      )}
                      {aiAnalysis && !aiLoading && (
                        <div className="space-y-5">
                          {/* Score */}
                          <div className="flex items-center gap-4">
                            <div className={`relative flex items-center justify-center w-20 h-20 rounded-full ${getScoreColor(aiAnalysis.score).bg}/20 border-2 ${getScoreColor(aiAnalysis.score).text.replace('text-', 'border-')}`}>
                              <span className={`text-3xl font-bold font-mono ${getScoreColor(aiAnalysis.score).text}`}>
                                {aiAnalysis.score}
                              </span>
                              <span className={`absolute -bottom-1 text-xs font-medium ${getScoreColor(aiAnalysis.score).text}`}>/10</span>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Investment Score</p>
                              <p className={`text-lg font-semibold ${getScoreColor(aiAnalysis.score).text}`}>
                                {getScoreColor(aiAnalysis.score).label}
                              </p>
                            </div>
                          </div>

                          {/* Reasons */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <p className="text-sm font-medium text-foreground">Analysis & Reasoning</p>
                            </div>
                            <ul className="space-y-1.5 pl-4">
                              {aiAnalysis.reasons.map((reason, index) => (
                                <li key={index} className="text-sm text-foreground/80 flex items-start gap-2">
                                  <span className="text-amber-500 mt-1">•</span>
                                  <span>{reason}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Factors */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <p className="text-sm font-medium text-foreground">Factors to Watch</p>
                            </div>
                            <ul className="space-y-1.5 pl-4">
                              {aiAnalysis.factors.map((factor, index) => (
                                <li key={index} className="text-sm text-foreground/80 flex items-start gap-2">
                                  <span className="text-amber-500 mt-1">•</span>
                                  <span>{factor}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/30">
                        This analysis is generated by AI and should not be considered financial advice.
                        Always do your own research before making investment decisions.
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Candlestick Chart */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" />
                  5-Day Price Chart
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CandlestickChart data={stockData.ohlc} />
              </CardContent>
            </Card>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Day High</p>
                  <p className="text-xl font-bold font-mono text-[#22c55e]">
                    ${stockData.dayHigh.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Day Low</p>
                  <p className="text-xl font-bold font-mono text-[#ef4444]">
                    ${stockData.dayLow.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Volume</p>
                  <p className="text-xl font-bold font-mono">{formatVolume(stockData.volume)}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">52W High</p>
                  <p className="text-xl font-bold font-mono text-[#22c55e]">
                    ${stockData.fiftyTwoWeekHigh.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">52W Low</p>
                  <p className="text-xl font-bold font-mono text-[#ef4444]">
                    ${stockData.fiftyTwoWeekLow.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">52W Range</p>
                  <div className="mt-2">
                    <div className="h-2 bg-muted/20 rounded-full overflow-hidden relative">
                      <div
                        className="absolute h-full bg-gradient-to-r from-[#ef4444] via-[#eab308] to-[#22c55e] rounded-full"
                        style={{ width: "100%" }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-white rounded-full border-2 border-foreground"
                        style={{
                          left: `${Math.min(Math.max(((stockData.currentPrice - stockData.fiftyTwoWeekLow) / (stockData.fiftyTwoWeekHigh - stockData.fiftyTwoWeekLow)) * 100, 0), 100)}%`,
                          transform: "translateX(-50%) translateY(-50%)",
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sharpe Ratio Section */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5" />
                  5-Day Sharpe Ratio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold font-mono" style={{ color: sharpeInfo?.color }}>
                      {stockData.sharpeRatio.toFixed(2)}
                    </p>
                    <Badge
                      variant="outline"
                      className="mt-2"
                      style={{ borderColor: sharpeInfo?.color, color: sharpeInfo?.color }}
                    >
                      {sharpeInfo?.label}
                    </Badge>
                  </div>
                  <div className="w-32 h-32">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted/20"
                      />
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={sharpeInfo?.color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${Math.min(Math.max((stockData.sharpeRatio + 1) / 3, 0), 1) * 251.2} 251.2`}
                        initial={{ strokeDasharray: "0 251.2" }}
                        animate={{ strokeDasharray: `${Math.min(Math.max((stockData.sharpeRatio + 1) / 3, 0), 1) * 251.2} 251.2` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </svg>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>-1.0</span>
                    <span>0</span>
                    <span>0.5</span>
                    <span>1.0</span>
                    <span>2.0+</span>
                  </div>
                  <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: sharpeInfo?.color }}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(Math.max(((stockData.sharpeRatio + 1) / 3) * 100, 0), 100)}%`,
                      }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{sharpeInfo?.description}</p>
              </CardContent>
            </Card>

            {/* Info Section */}
            <Card className="bg-muted/20 border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">About Sharpe Ratio</p>
                    <p>
                      The Sharpe Ratio measures risk-adjusted return. It&apos;s calculated as:
                      (Average Return - Risk Free Rate) / Standard Deviation &times; &radic;252.
                      A higher ratio indicates better risk-adjusted performance. The 5-day calculation
                      provides a short-term trend indicator.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
