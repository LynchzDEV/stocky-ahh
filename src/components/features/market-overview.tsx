"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import type { MarketIndex } from "@/lib/types";

interface MarketData {
  indices: MarketIndex[];
  lastUpdated: string;
}

export function MarketOverview() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/market");
      if (!response.ok) {
        throw new Error("Failed to fetch market data");
      }
      const result = await response.json();
      setData(result);
      setError(null);
    } catch {
      setError("Unable to load market data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-4 px-4 py-2 overflow-x-auto">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 animate-pulse"
          >
            <div className="h-4 w-16 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto scrollbar-hide">
      {data.indices.map((index, i) => {
        const isPositive = index.change >= 0;
        const isNeutral = index.change === 0;
        const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
        const colorClass = isNeutral
          ? "text-muted-foreground"
          : isPositive
          ? "text-green-500"
          : "text-red-500";

        return (
          <motion.div
            key={index.symbol}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-card/50 border border-border/50 whitespace-nowrap"
          >
            <span className="text-xs font-medium text-foreground">
              {index.name}
            </span>
            <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
              {index.price.toLocaleString()}
            </span>
            <div className={`flex items-center gap-0.5 ${colorClass}`}>
              <Icon className="h-3 w-3" />
              <span className="text-xs font-mono">
                {isPositive ? "+" : ""}
                {index.changePercent.toFixed(2)}%
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
