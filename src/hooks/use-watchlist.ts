"use client";

import { useState, useEffect, useCallback } from "react";
import type { WatchlistItem } from "@/lib/types";

const STORAGE_KEY = "stockify-watchlist";
const MAX_ITEMS = 20;

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWatchlist(JSON.parse(stored));
      }
    } catch {
      console.error("Failed to load watchlist");
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever watchlist changes
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
      } catch {
        console.error("Failed to save watchlist");
      }
    }
  }, [watchlist, isLoaded]);

  const addToWatchlist = useCallback((symbol: string, name: string) => {
    setWatchlist((prev) => {
      // Check if already in watchlist
      if (prev.some((item) => item.symbol === symbol)) {
        return prev;
      }
      // Add new entry
      const newWatchlist = [
        ...prev,
        { symbol, name, addedAt: Date.now() },
      ].slice(0, MAX_ITEMS);
      return newWatchlist;
    });
  }, []);

  const removeFromWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) => prev.filter((item) => item.symbol !== symbol));
  }, []);

  const isInWatchlist = useCallback(
    (symbol: string) => {
      return watchlist.some((item) => item.symbol === symbol);
    },
    [watchlist]
  );

  const clearWatchlist = useCallback(() => {
    setWatchlist([]);
  }, []);

  return {
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    clearWatchlist,
    isLoaded,
  };
}
