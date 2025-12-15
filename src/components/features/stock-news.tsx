"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { NewsItem } from "@/lib/types";

interface StockNewsProps {
  symbol: string;
}

export function StockNews({ symbol }: StockNewsProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  const fetchNews = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stock/${encodeURIComponent(symbol)}/news`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch news");
      }

      const data = await response.json();
      setNews(data.news || []);
      setIsCached(data.cached || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch news");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (symbol) {
      fetchNews();
    }
  }, [symbol, fetchNews]);

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "Bullish":
        return <TrendingUp className="h-3 w-3" />;
      case "Bearish":
        return <TrendingDown className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "Bullish":
        return "border-green-500/50 text-green-500 bg-green-500/10";
      case "Bearish":
        return "border-red-500/50 text-red-500 bg-red-500/10";
      default:
        return "border-yellow-500/50 text-yellow-500 bg-yellow-500/10";
    }
  };

  // Always show top 5 news items
  const displayedNews = news.slice(0, 5);

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Newspaper className="h-5 w-5 text-blue-500" />
            Stock News
            {isCached && (
              <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-500">
                Cached
              </Badge>
            )}
          </CardTitle>
          {!loading && (
            <Button
              variant="outline"
              size="sm"
              onClick={fetchNews}
              className="h-8 text-xs gap-1.5 border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/10 text-blue-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" className="text-blue-500" />
              <p className="text-sm text-muted-foreground">Loading news for {symbol}...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && news.length === 0 && (
          <div className="text-center py-8">
            <Newspaper className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No recent news for {symbol}</p>
          </div>
        )}

        {!loading && !error && news.length > 0 && (
          <div className="space-y-3">
            {displayedNews.map((item, index) => (
              <motion.a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="block rounded-lg border border-border/50 p-4 hover:bg-muted/50 hover:border-border transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${getSentimentColor(item.sentiment)}`}
                      >
                        {getSentimentIcon(item.sentiment)}
                        <span className="ml-1">{item.sentiment}</span>
                      </Badge>
                      <span className="text-xs text-muted-foreground">{item.source}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{item.publishedAt}</span>
                    </div>
                    <h4 className="font-medium text-sm text-foreground group-hover:text-blue-500 transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {item.summary}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-blue-500 transition-colors flex-shrink-0 mt-1" />
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
